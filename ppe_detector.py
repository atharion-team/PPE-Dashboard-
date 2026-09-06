from pathlib import Path
from ultralytics import YOLO

from pipeline.detect import load_ppe_vocabulary
from pipeline.track import resolve_person_id, track_frame
from pipeline.associate import assign, draw_associations
from pipeline.compliance import LiveCompliance

WEIGHTS_PATH = Path("best.pt") if Path("best.pt").exists() else Path("yolov8n.pt")
VOCAB_PATH = Path("data/vocabulary.yaml")

model = None
vocab_data = None
live_pipeline = None


def normalized_label(value):
    """Compare model labels despite case, spaces, underscores, or hyphens."""
    return "".join(ch for ch in str(value).lower() if ch.isalnum())


class LivePPEPipeline:
    """One model session that tracks workers, associates PPE and emits events."""
    def __init__(self, detector, vocab):
        self.model = detector
        self.ppe_model = YOLO(str(WEIGHTS_PATH))
        self.vocab = vocab
        self.person_id = resolve_person_id(self.model, vocab["subject"])
        self.tracker = "pipeline/trackers/bytetrack_ppe.yaml"
        self.min_containment = vocab["min_containment"] or 0.5
        model_names = {normalized_label(name): idx for idx, name in self.ppe_model.names.items()}
        self.class_info = {}
        for name, entry in vocab["ppe"].items():
            self.class_info[normalized_label(name)] = {"name": name, **entry, "negative": False}
        violation_regions = {entry["violation"]: entry["region"] for entry in vocab["ppe"].values()}
        for name, violation in vocab["negative"].items():
            region = violation_regions.get(violation)
            if region:
                self.class_info[normalized_label(name)] = {
                    "name": name, "violation": violation, "region": region, "negative": True,
                }
        self.class_ids = [model_names[key] for key in self.class_info if key in model_names]
        self.compliance = LiveCompliance(vocab["compliance"])

    def process(self, frame, timestamp):
        tracks, _ = track_frame(self.model, frame, self.person_id, self.tracker, 0.35, 0.45, 640, "cpu")
        if not self.class_ids:
            # Do not pass classes=[] to Ultralytics: some versions interpret it
            # as no filter and would draw unrelated COCO detections as PPE.
            draw_associations(frame, tracks, [], {}, set(), self.vocab["zones"])
            return self.compliance.advance(timestamp, {track["track_id"] for track in tracks}, set())
        result = self.ppe_model.predict(frame, classes=self.class_ids, conf=0.35, iou=0.45, imgsz=640, device="cpu", verbose=False)[0]
        boxes = []
        for box in result.boxes:
            raw = result.names[int(box.cls)]
            info = self.class_info.get(normalized_label(raw))
            if info:
                boxes.append({"cls": info["name"], "conf": float(box.conf), "box": [float(v) for v in box.xyxy[0]], "info": info})

        scored, observed = {}, set()
        # A worker may have a positive and a NO-* box in the same zone.  Match
        # each class independently so one does not suppress the other.
        grouped = {}
        for index, box in enumerate(boxes):
            grouped.setdefault((box["info"]["region"], box["cls"]), []).append(index)
        for (region, _), indices in grouped.items():
            matches = assign([boxes[i] for i in indices], tracks, region, self.min_containment, self.vocab["zones"])
            for index, match in zip(indices, matches):
                scored[index] = match
                if match["associated"] and boxes[index]["info"]["negative"]:
                    observed.add((match["track_id"], boxes[index]["info"]["violation"]))
        negative_names = {entry["name"] for entry in self.class_info.values() if entry["negative"]}
        draw_associations(frame, tracks, boxes, scored, negative_names, self.vocab["zones"])
        return self.compliance.advance(timestamp, {track["track_id"] for track in tracks}, observed)

def init_detector():
    """Initializes the YOLO model and Annotator once when app starts."""
    global model, vocab_data, live_pipeline
    if model is None:
        try:
            vocab_data = load_ppe_vocabulary(VOCAB_PATH)
            model = YOLO(str(WEIGHTS_PATH))
            live_pipeline = LivePPEPipeline(model, vocab_data)
            print("[Success] YOLO PPE model and Annotator loaded successfully.")
        except Exception as e:
            print(f"[Warning] Could not initialize YOLO model: {e}")

init_detector()


def reset_live_pipeline():
    """Start a fresh tracker/compliance session for an uploaded video."""
    global live_pipeline
    if model is not None and vocab_data is not None:
        live_pipeline = LivePPEPipeline(model, vocab_data)


def detect_ppe(frame, timestamp=0.0):
    """
    Runs per-frame detection using YOLO on CPU, draws bounding boxes via Annotator,
    and returns detected violation flags to Flask.
    """
    if frame is None or live_pipeline is None:
        return []

    try:
        return live_pipeline.process(frame, timestamp)

    except Exception as e:
        print(f"[Detection Exception] {e}")

    return []
