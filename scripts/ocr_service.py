# File: d:/KHO_CITARES/scripts/ocr_service.py
import os
import cv2
import time
import re
import math
import torch
import numpy as np
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Vietnamese 2-Stage YOLO License Plate Recognition Microservice")

# Enable CORS for Web Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models")
DETECTOR_NANO_PATH = os.path.join(MODELS_DIR, "LP_detector_nano_61.pt")
DETECTOR_STD_PATH = os.path.join(MODELS_DIR, "LP_detector.pt")
OCR_NANO_PATH = os.path.join(MODELS_DIR, "LP_ocr_nano_62.pt")
OCR_STD_PATH = os.path.join(MODELS_DIR, "LP_ocr.pt")

detector_model = None
ocr_model = None

print("[INFO] Loading Vietnamese 2-Stage License Plate YOLO Models via torch.hub...")

det_path = DETECTOR_NANO_PATH if os.path.exists(DETECTOR_NANO_PATH) else DETECTOR_STD_PATH
ocr_path = OCR_NANO_PATH if os.path.exists(OCR_NANO_PATH) else OCR_STD_PATH

try:
    detector_model = torch.hub.load('ultralytics/yolov5', 'custom', path=det_path, trust_repo=True)
    detector_model.conf = 0.25
    print(f"[OK] Loaded Plate Detector model ({os.path.basename(det_path)}) successfully!")
except Exception as err:
    print(f"[ERROR] Error loading detector model: {err}")

try:
    ocr_model = torch.hub.load('ultralytics/yolov5', 'custom', path=ocr_path, trust_repo=True)
    ocr_model.conf = 0.50
    print(f"[OK] Loaded Character OCR model ({os.path.basename(ocr_path)}) successfully!")
except Exception as err:
    print(f"[ERROR] Error loading OCR model: {err}")

def format_vietnam_license_plate(raw_text: str) -> str:
    """Chuẩn hóa định dạng biển số xe Việt Nam (VD: 51C73892 -> 51C-738.92 hoặc 51C-73892)"""
    text = re.sub(r'[^A-Z0-9]', '', raw_text.upper())
    if not text:
        return ""
    if len(text) >= 7:
        if text[:2].isdigit() and text[2].isalpha():
            prefix = text[:3]
            suffix = text[3:]
            if len(suffix) == 5:
                return f"{prefix}-{suffix[:3]}.{suffix[3:]}"
            return f"{prefix}-{suffix}"
    return text

def recognize_plate(crop_img) -> str:
    """Đọc ký tự biển số từ ảnh crop bằng mô hình YOLO 2nd-stage & Sắp xếp tọa độ X, Y"""
    if ocr_model is None or crop_img is None or crop_img.size == 0:
        return ""

    results = ocr_model(crop_img)
    bb_list = results.pandas().xyxy[0].values.tolist()

    if len(bb_list) == 0:
        return ""

    center_list = []
    y_sum = 0
    for bb in bb_list:
        xc = (bb[0] + bb[2]) / 2.0
        yc = (bb[1] + bb[3]) / 2.0
        char_val = str(bb[-1])
        y_sum += yc
        center_list.append([xc, yc, char_val])

    y_mean = y_sum / len(bb_list)
    h, w = crop_img.shape[:2]

    # Kiểm tra biển 1 dòng hay 2 dòng dựa trên tỷ lệ chiều dài/rộng và độ lệch Y
    y_diff = max(c[1] for c in center_list) - min(c[1] for c in center_list)
    is_two_lines = (w / float(h) < 1.8) or (y_diff > h * 0.25)

    if is_two_lines:
        line_1 = [c for c in center_list if c[1] <= y_mean]
        line_2 = [c for c in center_list if c[1] > y_mean]

        line_1_sorted = sorted(line_1, key=lambda x: x[0])
        line_2_sorted = sorted(line_2, key=lambda x: x[0])

        str_line1 = "".join([c[2] for c in line_1_sorted])
        str_line2 = "".join([c[2] for c in line_2_sorted])

        raw_plate = f"{str_line1}-{str_line2}"
    else:
        line_sorted = sorted(center_list, key=lambda x: x[0])
        raw_plate = "".join([c[2] for c in line_sorted])

    return format_vietnam_license_plate(raw_plate) or raw_plate

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "detector": detector_model is not None,
        "ocr": ocr_model is not None
    }

@app.post("/scan-license-plate")
async def scan_plate(file: UploadFile = File(...)):
    t0 = time.time()
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        return {"success": False, "message": "Invalid image payload"}

    detected_box = False
    crop_img = img

    # Stage 1: Phát hiện vị trí biển số (Plate Detection)
    if detector_model is not None:
        results = detector_model(img, size=640)
        list_plates = results.pandas().xyxy[0].values.tolist()

        if len(list_plates) > 0:
            best_plate = list_plates[0]
            x1, y1 = int(best_plate[0]), int(best_plate[1])
            x2, y2 = int(best_plate[2]), int(best_plate[3])

            h, w, _ = img.shape
            x1, y1 = max(0, x1 - 5), max(0, y1 - 5)
            x2, y2 = min(w, x2 + 5), min(h, y2 + 5)

            if x2 > x1 and y2 > y1:
                crop_img = img[y1:y2, x1:x2]
                detected_box = True

    # Stage 2: Nhận diện từng chữ số & ký tự (Character Detection)
    plate_text = recognize_plate(crop_img)
    latency_ms = (time.time() - t0) * 1000

    print(f"[RESULT] Detected: {detected_box} | Plate: '{plate_text}' | Latency: {latency_ms:.1f} ms")

    return {
        "success": bool(plate_text),
        "license_plate": plate_text,
        "latency_ms": round(latency_ms, 2),
        "detected": detected_box
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
