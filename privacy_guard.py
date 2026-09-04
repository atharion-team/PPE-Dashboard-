import os
import cv2
import numpy as np
from datetime import datetime
from insightface.app import FaceAnalysis

# Initialize RetinaFace detection model once on CPU
app = FaceAnalysis(allowed_modules=['detection'], providers=['CPUExecutionProvider'])
app.prepare(ctx_id=0, det_size=(640, 640))

def blur_facial_features(
    input_image, 
    output_dir: str = "./anonymized_snaps", 
    blur_intensity: int = 55
) -> str:
    """
    Receives an image (OpenCV frame or file path), blurs all facial features, 
    and saves ONLY the anonymized image with a timestamped filename (DD-MM-YYYY_HH-MM-SS.jpg).
    
    Parameters:
      - input_image: Raw OpenCV image frame (np.ndarray) OR file path (str).
      - output_dir: Destination folder for anonymized snapshots.
      - blur_intensity: Kernel size for Gaussian blur.
      
    Returns:
      - str: File path of the saved anonymized image.
    """
    # 1. Handle Input Type (Path string vs Raw OpenCV Frame)
    if isinstance(input_image, str):
        img = cv2.imread(input_image)
        if img is None:
            print(f"[Error] Could not load image from path: {input_image}")
            return ""
    elif isinstance(input_image, np.ndarray):
        img = input_image.copy()
    else:
        print("[Error] Unsupported input type. Pass a frame (np.ndarray) or file path (str).")
        return ""

    h, w = img.shape[:2]

    # 2. Fast Scaling Pass for High-Precision Detection
    target_size = 640
    scale = target_size / float(max(h, w)) if max(h, w) > target_size else 1.0
    detect_img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_LINEAR) if scale != 1.0 else img

    # 3. Detect Facial Features
    faces = app.get(detect_img)
    ksize = (blur_intensity, blur_intensity) if blur_intensity % 2 != 0 else (blur_intensity + 1, blur_intensity + 1)

    # 4. Apply Blur strictly on Feature Areas (Eyes, Nose, Mouth)
    for face in faces:
        landmarks = face.kps / scale
        fx, fy = landmarks[:, 0], landmarks[:, 1]
        
        f_x1, f_y1 = int(min(fx)), int(min(fy))
        f_x2, f_y2 = int(max(fx)), int(max(fy))
        
        margin_w = int((f_x2 - f_x1) * 0.20)
        margin_h = int((f_y2 - f_y1) * 0.25)
        
        f_x1, f_y1 = max(0, f_x1 - margin_w), max(0, f_y1 - margin_h)
        f_x2, f_y2 = min(w, f_x2 + margin_w), min(h, f_y2 + margin_h)
        
        if f_x2 > f_x1 and f_y2 > f_y1:
            roi = img[f_y1:f_y2, f_x1:f_x2]
            if roi.size > 0:
                img[f_y1:f_y2, f_x1:f_x2] = cv2.GaussianBlur(roi, ksize, 30)

    # 5. Generate Timestamped Destination Path (DD-MM-YYYY_HH-MM-SS.jpg)
    os.makedirs(output_dir, exist_ok=True)
    timestamp_str = datetime.now().strftime("%d-%m-%Y_%H-%M-%S")
    final_output_path = os.path.join(output_dir, f"snap_{timestamp_str}.jpg")

    # 6. Save ONLY the Anonymized Image
    cv2.imwrite(final_output_path, img)
    print(f"[Success] Anonymized snapshot saved to: {final_output_path}")

    return final_output_path


# Aliases for convenience
facial_blur = blur_facial_features
blur_face = blur_facial_features


if __name__ == "__main__":
    # Independent Test 1: Testing with an image file
    blur_facial_features("test.png", output_dir="./anonymized_snaps")

    # Independent Test 2: Testing with a direct frame array (simulating snapped frame)
    sample_frame = cv2.imread("test.png")
    if sample_frame is not None:
        blur_facial_features(sample_frame, output_dir="./anonymized_snaps")