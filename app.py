import os
import shutil
import json
import logging
import subprocess
from pathlib import Path

from flask import Flask, render_template, request, jsonify
from werkzeug.utils import secure_filename

# Import the real pipeline functions
from pipeline.associate import associate
from pipeline.compliance import compliance

# Configure logging
logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s in %(module)s: %(message)s")

app = Flask(__name__)

# Folder configuration
UPLOAD_FOLDER = os.path.join(app.root_path, 'static', 'uploads')
OUTPUT_FOLDER = os.path.join(app.root_path, 'static', 'outputs')
SNAPSHOT_FOLDER = os.path.join(app.root_path, 'static', 'snapshots')
PIPELINE_RUNS = os.path.join(app.root_path, 'runs')          # where associate/compliance write their outputs

ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov', 'mkv'}

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['OUTPUT_FOLDER'] = OUTPUT_FOLDER
app.config['SNAPSHOT_FOLDER'] = SNAPSHOT_FOLDER
app.config['PIPELINE_RUNS'] = PIPELINE_RUNS

for folder in [UPLOAD_FOLDER, OUTPUT_FOLDER, SNAPSHOT_FOLDER]:
    os.makedirs(folder, exist_ok=True)

# Model weights – adjust as needed
# Replace the static DEFAULT_WEIGHTS assignment with:
# After training, point to the best.pt
DEFAULT_WEIGHTS = "runs/train/ppe_model/weights/best.pt"
if not os.path.exists(DEFAULT_WEIGHTS) and os.path.exists("runs/detect/train/weights/best.pt"):
    DEFAULT_WEIGHTS = "runs/detect/train/weights/best.pt"
if not os.path.exists(DEFAULT_WEIGHTS):
    # If still missing, fall back to a pretrained YOLO model (ultralytics will download it)
    DEFAULT_WEIGHTS = "yolov8n.pt"

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def make_web_compatible(video_path):
    """Ensure the video has faststart for streaming."""
    temp_path = video_path.replace('.mp4', '_fast.mp4')
    cmd = [
        'ffmpeg', '-y',
        '-i', video_path,
        '-c', 'copy',
        '-movflags', '+faststart',
        temp_path
    ]
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if os.path.exists(temp_path):
            os.replace(temp_path, video_path)
    except Exception as e:
        logging.warning(f"Faststart optimization skipped: {e}")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload_video', methods=['POST'])
def upload_video():
    try:

        if 'video_file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
        
        file = request.files['video_file']
        if file.filename == '':
            return jsonify({'error': 'No selected file'}), 400

        filename = secure_filename(file.filename)
        input_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(input_path)

        # Prepare output directories for the pipeline
        # We'll create a unique run folder inside runs/ to avoid collisions
        run_id = os.path.splitext(filename)[0] + "_" + str(int(os.times().elapsed * 1000))  # rough unique ID
        associate_output = os.path.join(app.config['PIPELINE_RUNS'], 'associate', run_id)
        compliance_output = os.path.join(app.config['PIPELINE_RUNS'], 'compliance', run_id)

        try:
            # 1. Run associate.py – this does tracking, association, and generates an annotated video
            logging.info(f"Starting associate on {input_path}")
            associate_summary = associate(
                weights=DEFAULT_WEIGHTS,
                source=input_path,
                output=associate_output,
                show=False,
                device='cpu',   # or '0' for GPU, adjust as needed
                conf=0.15,
                iou=0.45,
                imgsz=640
            )
            logging.info(f"Associations found: {associate_summary.get('associations', 0)}")
            # associate returns a summary dict containing 'output' (video path) and 'records' (associations.jsonl)
            associated_video = associate_summary['output']
            associations_file = associate_summary['records']

            # 2. Run compliance.py on the associations.jsonl
            logging.info(f"Starting compliance on {associations_file}")
            compliance_summary = compliance(
                associations=associations_file,
                output=compliance_output,
                snapshots=True,
                # thresholds are read from vocabulary.yaml by default
            )

            # 3. Gather statistics and events
            by_violation = compliance_summary.get('by_violation', {})
            total_events = compliance_summary.get('events', 0)
            missing_hats = by_violation.get('hat', 0) + by_violation.get('helmet', 0)
            missing_vests = by_violation.get('vest', 0)

            # Load events from events.jsonl
            events_path = os.path.join(compliance_output, 'events.jsonl')
            events = []
            if os.path.exists(events_path):
                with open(events_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        if line.strip():
                            evt = json.loads(line)
                            # Build a display-friendly event
                            clean_violation = evt['violation'].replace('_', ' ').title()
                            snapshot_name = os.path.basename(evt.get('snapshot', '')) if evt.get('snapshot') else None
                            snapshot_url = f"/static/snapshots/{snapshot_name}" if snapshot_name else None
                            events.append({
                                'event_id': evt['event_id'],
                                'track_id': evt['track_id'],
                                'violation': evt['violation'],
                                'start': evt['start'],
                                'end': evt['end'],
                                'status': evt['status'],
                                'snapshot': snapshot_url,
                                'desc': f"Track #{evt['track_id']}: Missing {clean_violation}",
                                'time': f"{int(evt['start']//60):02d}:{int(evt['start']%60):02d}"
                            })
            # Sort events by start time for display
            events.sort(key=lambda e: e['start'])

            # 4. Copy the associated video to the static output folder (fixed name for frontend)
            final_video_path = os.path.join(app.config['OUTPUT_FOLDER'], 'processed_source_video.mp4')
            if os.path.exists(final_video_path):
                os.remove(final_video_path)
            shutil.copy2(associated_video, final_video_path)

            # Ensure the video is web-compatible (faststart)
            make_web_compatible(final_video_path)

            # Also copy snapshots to the static snapshot folder (compliance already saved them,
            # but they may be inside the runs/ folder – we can symlink or copy)
            # compliance saves snapshots in compliance_output/snapshots/
            snap_source = os.path.join(compliance_output, 'snapshots')
            if os.path.exists(snap_source):
                for snap_file in os.listdir(snap_source):
                    src = os.path.join(snap_source, snap_file)
                    dst = os.path.join(app.config['SNAPSHOT_FOLDER'], snap_file)
                    if not os.path.exists(dst):
                        shutil.copy2(src, dst)

            # 5. Return response
            return jsonify({
                'status': 'success',
                'video_url': '/static/outputs/processed_source_video.mp4',
                'stats': {
                    'total_violations': total_events,
                    'missing_hats': missing_hats,
                    'missing_vests': missing_vests
                },
                'events': events
            })

        except Exception as e:
            logging.error(f"Pipeline error: {e}", exc_info=True)
            return jsonify({'error': f'Pipeline processing failed: {str(e)}'}), 500
        
    except Exception as e:
        import traceback
        logging.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)