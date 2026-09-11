# Atharion PPE Dashboard

A safety-observation system that detects PPE violations (missing hardhat, missing vest) in videos and presents the results in a live web dashboard.

Team (Capstone Project):
- Abrar Fahad Alnwybt
- Abdulaziz Almuhaysh
- Rayan Saleh
- Dalal Bin Homed
- Njood Aldahlawi

---

## About

This dashboard is part of a larger PPE-compliance pipeline built by the Atharion team.

What the system does:

1. Upload a video of a construction or industrial site.
2. The pipeline detects people and PPE items in every frame.
3. It tracks each person across frames and binds PPE boxes to the correct worker.
4. A compliance layer converts per-frame detections into deduplicated violation events
   (missing hardhat, missing vest) with start and end times.
5. The dashboard shows an annotated video, a violation donut, a timeline chart, and
   a log of detections with anonymized snapshots.

Faces in snapshots are blurred automatically, so no personal identity is stored.

Other components of the project (detection, tracking, compliance, docs, notebooks)
are on the same organization page: https://github.com/atharion-team

---

## STEP 1 - Install These First

Install Python 3.10 or newer: https://www.python.org/downloads/
On Windows, tick "Add Python to PATH" during install.

Install Git: https://git-scm.com/downloads

Install ffmpeg (used to re-encode videos for the browser):
- Windows: open PowerShell and run: winget install ffmpeg
- Mac: open Terminal and run: brew install ffmpeg
- Linux: run: sudo apt install ffmpeg

Close and reopen your terminal after installing.

---

## STEP 2 - Download The Project

Open a terminal and run:

    git clone https://github.com/atharion-team/PPE-Dashboard-.git
    cd PPE-Dashboard-

---

## STEP 3 - Create a Virtual Environment

Run:

    python -m venv .venv

Activate it.

Windows:

    .venv\Scripts\activate

Mac or Linux:

    source .venv/bin/activate

You should now see (.venv) at the start of your terminal line.

---

## STEP 4 - Install Dependencies

Run:

    pip install -r requirements.txt

This installs torch, ultralytics, opencv, insightface, flask, and the rest.

If any package fails, install it manually and try again.

---

## STEP 5 - Check The Data Files

These files must exist in the repo before anything runs:

    data/vocabulary.yaml                   # PPE classes, zones, thresholds
    data/css-data.yaml                     # training config (dataset paths, class names)
    pipeline/trackers/bytetrack_ppe.yaml   # tracker config

If any of them are missing, ask the team for a copy.

---

## STEP 6 - Get The Dataset

Create a .env file first. Copy the example file.

Windows:

    copy .env.example .env

Mac or Linux:

    cp .env.example .env

Open .env and fill in the keys:

    ROBOFLOW_API_KEY=       <- required for downloading the dataset
    WANDB_API_KEY=          <- optional, only if you want to log training to Weights & Biases

For ROBOFLOW_API_KEY, go to https://app.roboflow.com/ then Settings then API Keys.

For WANDB_API_KEY, go to https://wandb.ai/authorize. You can leave it blank if you don't use W&B.

Then run:

    python pipeline/download_dataset.py

The script downloads the dataset, extracts it, and checks the class list against
your data/css-data.yaml. If they do not match, fix the config files before training.

.env is only needed for downloading the dataset and optional W&B logging.
The dashboard runs without it.

---

## STEP 7 - Train The Model

Run:

    python pipeline/train.py --name ppe_model --epochs 200 --imgsz 640

Use 200 epochs for best results. Fewer works if you are in a hurry. It is up to you.

The --name must be ppe_model. The dashboard looks for the weights at exactly:

    runs/train/ppe_model/weights/best.pt

If you use a different name, the dashboard falls back to a generic yolov8n.pt
and will not detect PPE properly.

Wait until training finishes. This can take hours on CPU, faster on GPU.

If you run out of memory, add --batch 4 to the command.

If you want a quick smoke test first (1 minute, poor accuracy, just to check
nothing is broken), run:

    python pipeline/train.py --epochs 1 --fraction 0.05 --batch 2 --device cpu --workers 0 --name ppe_model

---

## STEP 8 - Evaluate The Model (Optional)

Run:

    python pipeline/evaluate.py --weights runs/train/ppe_model/weights/best.pt --split test

This prints mAP50-95, precision, recall, and per-class scores, and writes a
summary to runs/val/ppe/evaluation_summary.json.

---

## STEP 9 - Run The Dashboard

Run:

    python app.py

Open your browser and go to:

    http://localhost:5000

---

## STEP 10 - Use The Dashboard

1. Drag a video into the upload box, or click to browse.
2. Click Process.
3. Wait for the pipeline to finish (a few seconds per frame on CPU).
4. Watch the results: annotated video, donut chart, timeline, detections list.
5. Click the download icon in Recent Detections to get a ZIP of snapshots.
6. Click the reset button to start over with a new video.

---

## Folder Guide

    app.py                          Runs the web dashboard
    pipeline/train.py               Trains the model
    pipeline/evaluate.py            Evaluates trained weights
    pipeline/download_dataset.py    Downloads the dataset from Roboflow
    pipeline/detect.py              Per-frame detection baseline
    pipeline/track.py               Tracks persons across frames
    pipeline/associate.py           Binds PPE boxes to tracked persons
    pipeline/compliance.py          Turns associations into violation events
    pipeline/trackers/              ByteTrack and BoT-SORT configs
    data/vocabulary.yaml            Classes, zones, thresholds
    data/css-data.yaml              Dataset config for training
    privacy_guard.py                Blurs faces in snapshots
    templates/                      HTML pages
    static/                         CSS, JS, fonts, uploads, outputs, snapshots
    docs/                           Design docs and pipeline explanations
    notebooks/                      Starter notebooks for environment + training
    docker/                         Optional Docker configs for docs
    example/PPE.mp4                 Sample video for testing
    examples/                       Example outputs (JSON + snapshots)
    runs/                           Training and pipeline outputs (not on GitHub)
    datasets/                       Your dataset (not on GitHub)
    .env.example                    Template for your .env file
    requirements.txt                Python dependencies

---

## Pipeline Order

If you want to run everything by hand instead of through the dashboard:

    python pipeline/track.py --weights runs/train/ppe_model/weights/best.pt --source example/PPE.mp4
    python pipeline/associate.py --weights runs/train/ppe_model/weights/best.pt --source example/PPE.mp4
    python pipeline/compliance.py --associations runs/associate/associations.jsonl

The dashboard runs these for you in the right order.

---

## Common Problems

Cannot find module pipeline
    Make sure you are in the project root and .venv is activated.

ffmpeg not found
    Install ffmpeg and reopen the terminal.

insightface fails to install
    On Windows, install Visual C++ Build Tools first.
    On Mac, run: brew install cmake
    Then retry: pip install insightface onnxruntime

Video does not play in the browser
    The pipeline runs ffmpeg to add faststart. If that failed, re-encode manually
    with: ffmpeg -i input.mp4 -c copy -movflags +faststart output.mp4

Dashboard shows no violations
    Check that the weights file is at runs/train/ppe_model/weights/best.pt.
    If detections look too weak, edit the conf= value in app.py (currently 0.35)
    and retrain with more epochs if needed.

Out of memory while training
    Add --batch 4 to the train command.

Class mismatch after download_dataset
    Fix data/css-data.yaml names list to match the downloaded data.yaml, and
    update data/vocabulary.yaml too, then re-run download_dataset.

---

## Team

This work is done by the team of Atharion:
- Abrar Fahad Alnwybt
- Abdulaziz Almuhaysh
- Rayan Saleh
- Dalal Bin Homed
- Njood Aldahlawi

Other components of the project (detection, tracking, compliance, docs, notebooks)
are on the same organization page: https://github.com/atharion-team

For the Capstone Project.