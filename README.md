<div align="center">

# 🐦 Clue Bird

**A deep-learning image classifier for 200 North American bird species, wrapped in a naturalist's field-journal web app.**

Upload a photo → get the species name, confidence score, habitat, diet, physical characteristics, lifespan, and a fact — all in one scan.

</div>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Demo](#-demo)
- [Project Structure](#-project-structure)
- [Dataset](#-dataset)
- [Model & Training](#-model--training)
- [Results](#-results)
- [Web App](#-web-app)
- [Getting Started](#-getting-started)
- [API Reference](#-api-reference)
- [How the Reference Data Was Built](#-how-the-reference-data-was-built)
- [Known Limitations](#-known-limitations)
- [Roadmap / Ideas](#-roadmap--ideas)
- [Tech Stack](#-tech-stack)
- [Acknowledgments & Disclaimer](#-acknowledgments--disclaimer)
- [Demo Video](#-demo-video)
- [License](#-license)

---

## 🔍 Overview

This project trains an image classifier to recognize **200 North American bird species** from a photo, then serves it through a single-page Flask web app styled after a naturalist's field journal.

It has two parts:

1. **`training/`** — a training script/notebook that fine-tunes an ImageNet-pretrained EfficientNetV2-S backbone on the bird dataset, with automatic folder-layout detection since Kaggle exports of this dataset vary in structure.
2. **`webapp/`** — a Flask app ("Field Guide Scanner") that loads the trained model, accepts an uploaded image, runs inference, and displays a full field-guide-style entry for the prediction.

---

## 🎬 Demo

> _Add a screenshot or screen recording of the app here, e.g.:_
>
> ![demo](docs/demo.gif)

**What it looks like in action:**
- Drag & drop (or tap) a photo onto the binoculars-styled scanner
- A focus-blur animation plays while the model runs inference
- The field journal panel fills in: common + scientific name, a typewriter-revealed fact, habitat, diet, physical characteristics, and lifespan on a lined parchment page
- A confidence "stamp" and up to 4 runner-up guesses are shown alongside the top match
- Every entry is tagged as either **species-verified** or a **family-typical estimate** (see [below](#-how-the-reference-data-was-built))

---

## 📁 Project Structure

```
.
├── training/
│   └── train.py                    # auto-detects dataset layout, trains via transfer learning
│
├── webapp/
│   ├── app.py                      # Flask server + inference logic
│   ├── requirements.txt
│   ├── data/
│   │   ├── class_list.py           # the exact 200 class names, verified against the dataset
│   │   ├── build_bird_data.py      # generates bird_data.json from family patterns + overrides
│   │   └── bird_data.json          # habitat, diet, physical traits, lifespan, facts (all 200)
│   ├── model/
│   │   └── bird_classifier_effnetv2s.pt   # ⚠️ not included — see Setup
│   ├── static/
│   │   ├── css/style.css
│   │   └── js/script.js
│   └── templates/
│       └── index.html
│
└── README.md
```

---

## 🗂 Dataset

- **Source**: [Bird Species Classification – 220 Categories](https://www.kaggle.com/datasets/kedarsai/bird-species-classification-220-categories) (Kaggle), a CUB-200-2011-style dataset — despite the listing's name, the actual dataset ships **200 species folders**.
- **Classes**: 200 species, mostly North American songbirds plus seabirds, waterfowl, and raptors — folder names verified directly against the extracted dataset (e.g. `Acadian_Flycatcher`, `Cardinal`, `Yellow_Warbler`, …).
- **Size**: ~1GB of images across the 200 species folders.

> ⚠️ **Note on folder layout**: this dataset's structure varies by mirror/export — sometimes flat (`ClassA/`, `ClassB/`, …), sometimes pre-split (`train/valid/test/ClassA/`), sometimes wrapped in an extra `images/` folder. `training/train.py` **auto-detects** whichever shape it finds and pools everything into its own clean **stratified 70/15/15 split**, the same fix that was needed for a similar issue on a companion Pokémon-classifier project's dataset — pre-baked Kaggle splits frequently don't contain the same classes across train/valid/test.

---

## 🧠 Model & Training

| | |
|---|---|
| **Backbone** | `EfficientNetV2-S`, pretrained on ImageNet (`torchvision.models`) |
| **Head** | `Dropout(0.3)` → `Linear(→200)` |
| **Input size** | 224×224, ImageNet mean/std normalization |
| **Augmentation** | Random resized crop, horizontal flip, rotation, color jitter, Gaussian blur, random erasing |
| **Class imbalance** | `WeightedRandomSampler` over the training set |
| **Loss** | Cross-entropy with label smoothing (0.1) |
| **Training schedule** | Two-phase: (1) frozen backbone, train head only → (2) unfreeze everything, fine-tune at low LR with cosine annealing + early stopping on validation accuracy |
| **Precision** | Mixed precision (`torch.amp`) |
| **Hardware** | Free Google Colab GPU (T4) recommended — 200 classes is slow on CPU |

Run `training/train.py` with `--data-dir` pointing at your extracted dataset:

```bash
python train.py --data-dir /path/to/extracted/dataset --output-dir ./output
```

It auto-detects the folder layout, builds its own stratified split, trains both phases, evaluates on the held-out test set, and saves the final checkpoint plus training curves, a confusion matrix, and a full classification report.

---

## 📊 Results

**Test accuracy: 84.4%** across 200 species (1,769 held-out test images)

| Metric | Score |
|---|---|
| Accuracy | 0.844 |
| Macro avg F1 | 0.842 |
| Weighted avg F1 | 0.841 |

Context worth noting: fine-grained bird species classification from real-world photos is a meaningfully harder problem than the companion 150-Pokémon classifier (97.3% accuracy) built alongside this project. Reasons the gap makes sense:

- **200 classes vs. 150**, more room for confusion
- **Real photos vs. clean game art** — birds vary hugely in pose, lighting, background clutter, and distance, while the Pokémon set was consistent-style renders
- **Much higher inter-species similarity** — many species within the same genus (sparrows, warblers) differ only in subtle plumage details
- 80-90% test accuracy with a plainly fine-tuned CNN (no attention modules or part-based localization) is in line with published baselines on CUB-200-style benchmarks

Macro avg (0.854 precision / 0.844 recall / 0.842 F1) tracking close to the weighted avg means performance isn't propped up by a handful of common species — it holds up fairly evenly across all 200.

<details>
<summary>Full per-class classification report</summary>

Regenerate this from `training/train.py`'s output — it writes a full per-class precision/recall/F1 report and a confusion matrix heatmap to `--output-dir`.

</details>

---

## 🕹 Web App

A single-page Flask app (`webapp/`) that:

- Accepts an uploaded image (drag-and-drop or file picker), PNG/JPG/WEBP/BMP up to 8MB
- Runs it through the trained model and returns the **top-5 predictions** with confidence scores
- Looks up the top prediction in `data/bird_data.json` and displays:
  - Common name and scientific name
  - Habitat
  - Diet
  - Physical characteristics (length, wingspan, weight, coloring, beak type)
  - Lifespan
  - An interesting fact
  - A **data-confidence badge** — see [below](#-how-the-reference-data-was-built)
- Flags **low-confidence predictions** (top guess under 40%) with a visible warning, since a 200-way classifier will always output *something*
- Includes a searchable "Browse Field Guide" modal listing all 200 species

---

## 🚀 Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>
```

### 2. Train the model (or use a checkpoint you already have)

```bash
cd training
pip install -r requirements.txt   # or install torch/torchvision/pandas/sklearn/matplotlib/Pillow manually
python train.py --data-dir /path/to/extracted/dataset --output-dir ./output
```

This produces `bird_classifier_effnetv2s.pt` in `./output`.

### 3. Set up the web app

```bash
cd webapp
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Place the checkpoint from step 2 here:

```
webapp/model/bird_classifier_effnetv2s.pt
```

### 4. Run it

```bash
python3 app.py
```

Open **http://localhost:5001**.

> If the checkpoint is missing, the app still starts but shows a warning banner and disables scanning until you add it.

---

## 🔌 API Reference

### `POST /predict`

Runs inference on an uploaded image.

**Request**: `multipart/form-data` with an `image` field.

**Response**:
```json
{
  "ok": true,
  "image": "data:image/png;base64,...",
  "low_confidence": false,
  "predictions": [
    { "name": "Blue_Jay", "confidence": 91.42 },
    { "name": "Florida_Jay", "confidence": 3.11 },
    ...
  ],
  "bird": {
    "name": "Blue_Jay",
    "display_name": "Blue Jay",
    "scientific_name": "Cyanocitta cristata",
    "family_group": "Corvid/ground cuckoo",
    "habitat": "Forests, woodland edges, and open country (often near humans)",
    "diet": "Highly omnivorous — insects, seeds, nuts, small animals, and carrion",
    "physical": {
      "size_class": "Medium-Large",
      "length_cm": "22-30",
      "wingspan_cm": "34-43",
      "weight_g": "70-100",
      "colors": "Bright blue above with a white/gray underside, black necklace marking, and a prominent crest",
      "beak_type": "Strong, stout, all-purpose bill"
    },
    "lifespan": "7 years on average (up to 17)",
    "facts": ["Known to mimic the calls of hawks, possibly to scare off other birds from a food source."],
    "data_confidence": "species-verified"
  }
}
```

### `GET /birdlist`

Returns the full list of all 200 species with their field-guide info (used by the "Browse Field Guide" modal).

```json
{ "ok": true, "count": 200, "birds": [ { "display_name": "Acadian Flycatcher", ... }, ... ] }
```

---

## 📚 How the Reference Data Was Built

Researching all 200 species individually wasn't practical in one sitting, so `webapp/data/build_bird_data.py` uses a two-layer system instead:

1. **`FAMILY_PROFILES`** — habitat/diet/size/bill-type/lifespan patterns that hold true at the family or genus level (every warbler in this set is a small insectivorous woodland songbird with a thin pointed bill; every gull is an omnivorous coastal scavenger with a hooked bill; etc.). This is well-established ornithological knowledge and guarantees every one of the 200 species gets a complete, sensible entry.
2. **`SPECIES_OVERRIDES`** — specific facts for ~54 of the most common/iconic species (American Crow, Blue Jay, Cardinal, Mallard, Ruby-throated Hummingbird, …), where a precise number and a genuine species-specific fact were worth the extra research.

Every entry carries a `data_confidence` field (`species-verified` or `family-typical`), and the web app surfaces this with a visible badge rather than presenting an estimate as a verified fact.

**To add more species-specific data**: edit `SPECIES_OVERRIDES` in `webapp/data/build_bird_data.py`, then regenerate:

```bash
cd webapp/data
python3 build_bird_data.py
```

---

## ⚠️ Known Limitations

- **No "unknown" class.** The model is a 200-way softmax classifier — it always outputs *some* prediction, even for images that aren't birds at all. The app flags predictions under **40% confidence** with a warning banner, but a low-confidence guess is still shown rather than replaced with a hard "not recognized" response.
- **~146 of 200 species use family-typical (not species-specific) reference data.** See [above](#-how-the-reference-data-was-built) — these are accurate at the family/genus level but aren't a substitute for a real field guide if you need species-specific precision.
- **Class names were transcribed from folder screenshots**, not pulled programmatically from the dataset. Verified against a 200-item count, but a manual transcription of 200 names always carries some typo risk — if a species shows as unrecognized, check `webapp/data/class_list.py` against your actual dataset folders first.
- **Fine-grained visual similarity.** Species within the same genus (e.g. different sparrow species) are the most likely source of misclassification — check the "Other Possibilities" list when a prediction looks uncertain.
- **Small per-class sample size** relative to real-world photo diversity — performance on photos very different in style from the training set (heavy crops, unusual angles, poor lighting) may vary from the reported test accuracy.

---

## 🗺 Roadmap / Ideas

- [ ] Research and add more `SPECIES_OVERRIDES` entries to shrink the family-typical bucket
- [ ] Test-time augmentation (TTA) for a small accuracy boost at inference
- [ ] Higher input resolution (320px+) — fine-grained features like beak shape benefit more from resolution than coarse shapes do
- [ ] An explicit "not a bird" / out-of-distribution detector instead of a confidence-threshold heuristic
- [ ] Deploy to Render / Railway / Hugging Face Spaces
- [ ] Range maps or seasonal occurrence info per species

---

## 🧰 Tech Stack

- **Model**: PyTorch, torchvision (`EfficientNetV2-S`)
- **Training**: Google Colab (GPU), pandas, scikit-learn (stratified split, metrics)
- **Backend**: Flask
- **Frontend**: Vanilla HTML/CSS/JS (no framework), Google Fonts (Playfair Display, Nunito Sans, Space Mono)

---

## 🙏 Acknowledgments & Disclaimer

- Dataset: [Bird Species Classification – 220 Categories](https://www.kaggle.com/datasets/kedarsai/bird-species-classification-220-categories) on Kaggle, structurally similar to the Caltech-UCSD Birds-200-2011 (CUB-200-2011) benchmark.
- Reference data (habitat, diet, physical characteristics, lifespan, facts) is a mix of species-verified research and family-level ornithological patterns — see [How the Reference Data Was Built](#-how-the-reference-data-was-built). It's written for an educational/hobby project, not sourced from or intended to replace a professional field guide.

## 📄 License

Choose a license for your repo (e.g. MIT) and add a `LICENSE` file — this template assumes you'll add one before publishing.

---

## 🎥 Video Demo

> _Add a screen recording of the web app in action here._

<div align="center">

[![Field Guide Scanner Demo](docs/video_thumbnail.png)](https://your-video-link-here)

*Click to watch: uploading a bird photo, the scan animation, and the field-journal entry filling in with habitat, diet, physical characteristics, and lifespan.*

</div>

**How to add yours:**

1. Record a short screen capture (30-90 seconds is plenty) showing:
   - Dropping/selecting a bird photo onto the scanner
   - The scan/focus animation while it runs
   - The field-journal entry appearing with the prediction and details
   - (Optional) the "Browse Field Guide" modal and a low-confidence example
2. Either:
   - **Upload directly to GitHub**: drag the video file into a GitHub issue or this README while editing on github.com — GitHub hosts it and gives you an embeddable link automatically, or
   - **Host on YouTube/Loom** and embed a clickable thumbnail like the placeholder above (`[![thumbnail](path/to/thumbnail.png)](video-url)`), or
   - **Save as a GIF** (e.g. via `ffmpeg` or [Gifski](https://gif.ski/)) and embed it directly so it autoplays inline:
     ```markdown
     ![demo](docs/demo.gif)
     ```
3. Update the link/path above once your video is live.
