import os
import shutil
import json
import logging
import subprocess
import zipfile
from pathlib import Path
from io import BytesIO

from flask import Flask, render_template, request, jsonify, send_file
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
DEFAULT_WEIGHTS = "runs/train/ppe_model/weights/best.pt"
if not os.path.exists(DEFAULT_WEIGHTS) and os.path.exists("runs/detect/train/weights/best.pt"):
    DEFAULT_WEIGHTS = "runs/detect/train/weights/best.pt"
if not os.path.exists(DEFAULT_WEIGHTS):
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

def clear_folder(folder_path):
    """Remove all files inside a folder, but keep the folder itself."""
    if not os.path.exists(folder_path):
        os.makedirs(folder_path, exist_ok=True)
        return
    for filename in os.listdir(folder_path):
        file_path = os.path.join(folder_path, filename)
        try:
            if os.path.isfile(file_path) or os.path.islink(file_path):
                os.unlink(file_path)
            elif os.path.isdir(file_path):
                shutil.rmtree(file_path)
        except Exception as e:
            logging.warning(f"Failed to delete {file_path}: {e}")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload_video', methods=['POST'])
def upload_video():
    try:
        # --- Clear snapshots folder BEFORE processing the new video ---
        clear_folder(app.config['SNAPSHOT_FOLDER'])

        if 'video_file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
        
        file = request.files['video_file']
        if file.filename == '':
            return jsonify({'error': 'No selected file'}), 400

        filename = secure_filename(file.filename)
        input_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(input_path)

        # Prepare output directories for the pipeline
        run_id = os.path.splitext(filename)[0] + "_" + str(int(os.times().elapsed * 1000))
        associate_output = os.path.join(app.config['PIPELINE_RUNS'], 'associate', run_id)
        compliance_output = os.path.join(app.config['PIPELINE_RUNS'], 'compliance', run_id)

        try:
            # 1. Run associate
            logging.info(f"Starting associate on {input_path}")
            associate_summary = associate(
                weights=DEFAULT_WEIGHTS,
                source=input_path,
                output=associate_output,
                show=False,
                device='cpu',
                conf=0.15,
                iou=0.45,
                imgsz=640
            )
            logging.info(f"Associations found: {associate_summary.get('associations', 0)}")
            associated_video = associate_summary['output']
            associations_file = associate_summary['records']

            # 2. Run compliance
            logging.info(f"Starting compliance on {associations_file}")
            compliance_summary = compliance(
                associations=associations_file,
                output=compliance_output,
                snapshots=True,
            )

            # 3. Gather statistics and events
            by_violation = compliance_summary.get('by_violation', {})
            total_events = compliance_summary.get('events', 0)
            missing_hats = by_violation.get('no_hardhat', 0)
            missing_vests = by_violation.get('no_vest', 0)

            events_path = os.path.join(compliance_output, 'events.jsonl')
            events = []
            if os.path.exists(events_path):
                with open(events_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        if line.strip():
                            evt = json.loads(line)
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
            events.sort(key=lambda e: e['start'])

            # 4. Copy the associated video to static output
            final_video_path = os.path.join(app.config['OUTPUT_FOLDER'], 'processed_source_video.mp4')
            if os.path.exists(final_video_path):
                os.remove(final_video_path)
            shutil.copy2(associated_video, final_video_path)
            make_web_compatible(final_video_path)

            # Copy snapshots to static snapshot folder (folder was cleared earlier)
            snap_source = os.path.join(compliance_output, 'snapshots')
            if os.path.exists(snap_source):
                for snap_file in os.listdir(snap_source):
                    src = os.path.join(snap_source, snap_file)
                    dst = os.path.join(app.config['SNAPSHOT_FOLDER'], snap_file)
                    if not os.path.exists(dst):
                        shutil.copy2(src, dst)

            # 5. Build timeline data
            timeline_data = []
            if events:
                import math
                interval = 5
                buckets = {}
                for e in events:
                    bucket = math.floor(e['start'] / interval) * interval
                    buckets[bucket] = buckets.get(bucket, 0) + 1
                for t in sorted(buckets.keys()):
                    timeline_data.append({
                        'time': f"{int(t//60):02d}:{int(t%60):02d}",
                        'count': buckets[t]
                    })

            return jsonify({
                'status': 'success',
                'video_url': '/static/outputs/processed_source_video.mp4',
                'stats': {
                    'total_violations': total_events,
                    'missing_hats': missing_hats,
                    'missing_vests': missing_vests
                },
                'timeline_data': timeline_data,
                'events': events
            })

        except Exception as e:
            logging.error(f"Pipeline error: {e}", exc_info=True)
            return jsonify({'error': f'Pipeline processing failed: {str(e)}'}), 500
        
    except Exception as e:
        import traceback
        logging.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/reset', methods=['POST'])
def reset():
    """Delete processed video and all snapshots."""
    try:
        video_path = os.path.join(app.config['OUTPUT_FOLDER'], 'processed_source_video.mp4')
        if os.path.exists(video_path):
            os.remove(video_path)

        # Clear snapshots folder
        clear_folder(app.config['SNAPSHOT_FOLDER'])

        return jsonify({'status': 'success'})
    except Exception as e:
        logging.error(f"Reset error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/download_snapshots')
def download_snapshots():
    """Serve a ZIP archive of all snapshot images."""
    snap_folder = app.config['SNAPSHOT_FOLDER']
    if not os.path.exists(snap_folder) or not os.listdir(snap_folder):
        return jsonify({'error': 'No snapshots available'}), 404

    # Create in-memory ZIP
    memory_file = BytesIO()
    with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(snap_folder):
            for file in files:
                if file.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.bmp')):
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, snap_folder)
                    zf.write(file_path, arcname)
    memory_file.seek(0)

    return send_file(
        memory_file,
        mimetype='application/zip',
        as_attachment=True,
        download_name='snapshots.zip'
    )

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)