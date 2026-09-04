import os
import time
import cv2
from datetime import datetime
from flask import Flask, render_template, Response, jsonify

from privacy_guard import blur_facial_features
from ppe_detector import detect_ppe

app = Flask(__name__)

# Track session stats for Page 1 UI
session_stats = {
    "total_violations": 0,
    "missing_hats": 0,
    "missing_vests": 0,
    "timeline_data": []  # Holds time & count for Chart.js
}

VIDEO_SOURCE = "vidtest.mp4"
COOLDOWN_SECONDS = 3
last_snap_time = 0
start_time_ref = time.time()

def generate_video_stream():
    global last_snap_time, session_stats
    cap = cv2.VideoCapture(VIDEO_SOURCE)

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            # Loop video for continuous testing
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            continue

        current_time = time.time()
        elapsed_sec = int(current_time - start_time_ref)

        # 1. Query Backend AI Module (Mock/Real)
        detection = detect_ppe(frame)

        # 2. Process Violation & Anonymization Trigger
        if detection["violation_detected"] and (current_time - last_snap_time > COOLDOWN_SECONDS):
            last_snap_time = current_time
            session_stats["total_violations"] += 1

            if detection.get("no_hat"): 
                session_stats["missing_hats"] += 1
            if detection.get("no_vest"): 
                session_stats["missing_vests"] += 1

            # Send raw frame array directly to privacy engine
            saved_path = blur_facial_features(frame, output_dir="./ppe_violations")

            # Append data to timeline chart format (MM:SS)
            timestamp_label = time.strftime('%M:%S', time.gmtime(elapsed_sec))
            session_stats["timeline_data"].append({
                "time": timestamp_label, 
                "count": 1
            })

        # 3. Stream frame over HTTP
        _, buffer = cv2.imencode('.jpg', frame)
        frame_bytes = buffer.tobytes()

        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

    cap.release()

@app.route('/')
def index():
    """Render Page 1: Live Command Center"""
    return render_template('index.html')

@app.route('/video_feed')
def video_feed():
    """Video Feed Endpoint"""
    return Response(generate_video_stream(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/api/stats')
def api_stats():
    """JSON API Endpoint for live Javascript polling"""
    return jsonify(session_stats)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)