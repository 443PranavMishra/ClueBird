import os
import io
import json
import base64

from flask import Flask, request, jsonify, render_template

import torch
import torch.nn as nn
from torchvision import transforms
from torchvision.models import efficientnet_v2_s
from PIL import Image

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "model", "BIRDMODEL.pt")
DATA_PATH = os.path.join(BASE_DIR, "data", "bird_data.json")
ALLOWED_EXT = {"png", "jpg", "jpeg", "webp", "bmp"}

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024 

with open(DATA_PATH) as f:
    BIRD_DATA = json.load(f)

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

model = None
class_to_idx = {}
idx_to_class = {}
img_size = 224
img_mean = [0.485, 0.456, 0.406]
img_std = [0.229, 0.224, 0.225]
eval_tfms = None
MODEL_LOAD_ERROR = None


def build_model(num_classes):
    m = efficientnet_v2_s(weights=None)
    in_features = m.classifier[1].in_features
    m.classifier = nn.Sequential(
        nn.Dropout(p=0.3, inplace=True),
        nn.Linear(in_features, num_classes),
    )
    return m


def load_model():
    global model, class_to_idx, idx_to_class, img_size, img_mean, img_std, eval_tfms, MODEL_LOAD_ERROR
    if not os.path.exists(MODEL_PATH):
        MODEL_LOAD_ERROR = (
            f"No checkpoint found at model/{os.path.basename(MODEL_PATH)}. "
            "Train the model first and place the .pt file in the model/ folder."
        )
        return
    try:
        checkpoint = torch.load(MODEL_PATH, map_location=device)
        class_to_idx = checkpoint["class_to_idx"]
        idx_to_class = {v: k for k, v in class_to_idx.items()}
        img_size = checkpoint.get("img_size", 224)
        img_mean = checkpoint.get("mean", img_mean)
        img_std = checkpoint.get("std", img_std)

        m = build_model(len(class_to_idx))
        m.load_state_dict(checkpoint["model_state_dict"])
        m.to(device)
        m.eval()

        global model
        model = m
        global eval_tfms
        eval_tfms = transforms.Compose([
            transforms.Resize((img_size, img_size)),
            transforms.ToTensor(),
            transforms.Normalize(img_mean, img_std),
        ])
        print(f"Loaded model with {len(class_to_idx)} classes on {device}.")

        missing_data = [c for c in class_to_idx if c not in BIRD_DATA]
        if missing_data:
            print(f"WARNING: {len(missing_data)} model classes have no entry in bird_data.json: {missing_data}")
    except Exception as e: 
        MODEL_LOAD_ERROR = f"Failed to load checkpoint: {e}"
        print(MODEL_LOAD_ERROR)


load_model()


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXT


def get_bird_info(name):
    info = BIRD_DATA.get(name)
    if info is None:
        return None
    return {"name": name, **info}


@app.route("/")
def index():
    return render_template(
        "index.html",
        model_ready=model is not None,
        model_error=MODEL_LOAD_ERROR,
        total_classes=len(BIRD_DATA),
    )


@app.route("/predict", methods=["POST"])
def predict():
    if model is None:
        return jsonify({"ok": False, "error": MODEL_LOAD_ERROR or "Model not loaded."}), 503

    if "image" not in request.files:
        return jsonify({"ok": False, "error": "No image uploaded."}), 400

    file = request.files["image"]
    if file.filename == "" or not allowed_file(file.filename):
        return jsonify({"ok": False, "error": "Please upload a PNG/JPG/WEBP image."}), 400

    try:
        raw_bytes = file.read()
        img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
    except Exception:
        return jsonify({"ok": False, "error": "Couldn't read that image file."}), 400

    x = eval_tfms(img).unsqueeze(0).to(device)
    with torch.no_grad():
        logits = model(x)
        probs = torch.softmax(logits, dim=1)[0]
        top_probs, top_idxs = probs.topk(min(5, probs.shape[0]))

    predictions = []
    for p, i in zip(top_probs.tolist(), top_idxs.tolist()):
        cls_name = idx_to_class[i]
        predictions.append({"name": cls_name, "confidence": round(p * 100, 2)})

    top_name = predictions[0]["name"]
    top_confidence = predictions[0]["confidence"]
    bird_info = get_bird_info(top_name)

    LOW_CONFIDENCE_THRESHOLD = 40.0
    is_low_confidence = top_confidence < LOW_CONFIDENCE_THRESHOLD

    thumb = img.copy()
    thumb.thumbnail((480, 480))
    buf = io.BytesIO()
    thumb.save(buf, format="PNG")
    img_data_uri = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

    return jsonify({
        "ok": True,
        "image": img_data_uri,
        "predictions": predictions,
        "bird": bird_info,
        "low_confidence": is_low_confidence,
    })


@app.route("/birdlist")
def bird_list():
    """Returns the full list of classes with brief info (for a 'browse all' view)."""
    items = sorted(
        [get_bird_info(name) for name in BIRD_DATA.keys()],
        key=lambda d: d["display_name"],
    )
    return jsonify({"ok": True, "count": len(items), "birds": items})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
