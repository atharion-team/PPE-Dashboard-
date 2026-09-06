import os
import time
from datetime import datetime
import numpy as np
import cv2
from werkzeug.utils import secure_filename
from flask import Flask, render_template, Response, jsonify, request, send_from_directory

# Import custom detection & privacy modules
from ppe_detector import detect_ppe
from privacy_guard import blur_facial_features as blur_faces

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['SNAPSHOT_FOLDER'] = os.path.join('runs', 'compliance', 'ppe', 'snapshots')

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['SNAPSHOT_FOLDER'], exist_ok=True)

# Global State Variables
CURRENT_VIDEO_PATH = None
LAST_VIOLATION_TIME = 0
COOLDOWN_SECONDS = 3.0  # Cooldown between snapshot triggers
EVENT_COUNTER = 0

STATS = {
    "total_violations": 0,
    "missing_hats": 0,
    "missing_vests": 0,
    "timeline_data": [],
    "recent_events": []
}

def record_violation(frame, no_hat, no_vest):
    """Saves a violation snapshot frame and updates global STATS counters."""
    global EVENT_COUNTER
    EVENT_COUNTER += 1
    timestamp = datetime.now().strftime("%H:%M:%S")
    
    if no_hat:
        STATS["missing_hats"] += 1
    if no_vest:
        STATS["missing_vests"] += 1
        
    STATS["total_violations"] += 1

    # Save violation snapshot image frame
    snapshot_filename = f"event_{EVENT_COUNTER}.jpg"
    snapshot_path = os.path.join(app.config['SNAPSHOT_FOLDER'], snapshot_filename)
    cv2.imwrite(snapshot_path, frame)

    event_desc = []
    if no_hat: 
        event_desc.append("Missing Hardhat")
    if no_vest: 
        event_desc.append("Missing Safety Vest")
    desc_str = " & ".join(event_desc) if event_desc else "Safety Violation"

    # Push structured event object matching your schema
    event_entry = {
        "event_id": EVENT_COUNTER,
        "time": timestamp,
        "desc": desc_str,
        "type": "warning",
        "snapshot": f"/snapshots/{snapshot_filename}"
    }
    
    STATS["recent_events"].insert(0, event_entry)
    STATS["recent_events"] = STATS["recent_events"][:10]

    # Push to Timeline Data list
    STATS["timeline_data"].append({
        "time": timestamp,
        "count": STATS["total_violations"]
    })
    STATS["timeline_data"] = STATS["timeline_data"][-20:]


def generate_frames():
    """Video streaming generator function."""
    global CURRENT_VIDEO_PATH, LAST_VIOLATION_TIME
    if not CURRENT_VIDEO_PATH or not os.path.exists(CURRENT_VIDEO_PATH):
        return

    cap = cv2.VideoCapture(CURRENT_VIDEO_PATH)
    
    # Read actual video FPS to match real-time playback
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_delay = 1.0 / fps if fps and fps > 0 else 0.03

    while cap.isOpened():
        start_frame_time = time.time()
        success, frame = cap.read()
        
        # Stop streaming when the video reaches the end (no looping)
        if not success or frame is None:
            break

        # Convert to C-contiguous array to prevent OpenCV draw errors
        frame = np.ascontiguousarray(frame)

        # 1. Run Face Blurring / Anonymization
        try:
            blurred_frame = blur_faces(frame)
            if blurred_frame is not None and isinstance(blurred_frame, np.ndarray):
                frame = blurred_frame
        except Exception as e:
            print(f"[Privacy Guard Exception] {e}")

        # 2. Run PPE Detection & Draw Bounding Boxes
        detection_result = {}
        try:
            detection_result = detect_ppe(frame)
        except Exception as e:
            print(f"[PPE Detector Exception] {e}")

        # 3. Save snapshot & log stats with a cooldown timer if a violation occurs
        current_time = time.time()
        if detection_result.get("violation_detected"):
            if current_time - LAST_VIOLATION_TIME > COOLDOWN_SECONDS:
                LAST_VIOLATION_TIME = current_time
                record_violation(
                    frame=frame,
                    no_hat=detection_result.get("no_hat", False),
                    no_vest=detection_result.get("no_vest", False)
                )

        # 4. Validate array type before encoding
        if not isinstance(frame, np.ndarray) or frame.size == 0:
            continue

        ret, buffer = cv2.imencode('.jpg', frame)
        if not ret:
            continue

        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
        
        # Calculate dynamic delay to maintain accurate video playback speed
        processing_time = time.time() - start_frame_time
        sleep_time = max(0, frame_delay - processing_time)
        time.sleep(sleep_time)

    cap.release()


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/snapshots/<filename>')
def serve_snapshot(filename):
    """Route to serve saved compliance snapshot images to the front-end UI."""
    return send_from_directory(app.config['SNAPSHOT_FOLDER'], filename)


@app.route('/upload_video', methods=['POST'])
def upload_video():
    global CURRENT_VIDEO_PATH, STATS, LAST_VIOLATION_TIME, EVENT_COUNTER
    
    if 'video_file' not in request.files:
        return jsonify({"success": False, "error": "No video file provided"}), 400

    file = request.files['video_file']
    if file.filename == '':
        return jsonify({"success": False, "error": "No selected file"}), 400

    filename = secure_filename(file.filename)
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(file_path)

    # Reset video path and stats for new stream
    CURRENT_VIDEO_PATH = file_path
    LAST_VIOLATION_TIME = 0
    EVENT_COUNTER = 0
    STATS = {
        "total_violations": 0,
        "missing_hats": 0,
        "missing_vests": 0,
        "timeline_data": [],
        "recent_events": []
    }

    return jsonify({"success": True})


@app.route('/video_feed')
def video_feed():
    """Video streaming route for front-end img tag."""
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')


@app.route('/api/stats')
def get_stats():
    """API endpoint consumed by dashboard.js polling."""
    return jsonify(STATS)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)