const el = (id) => document.getElementById(id);

const fileInput = el("fileInput");
const pickBtn = el("pickBtn");
const lensGlassRight = el("lensGlassRight");
const lensGlassLeft = el("lensGlassLeft");
const previewImg = el("previewImg");
const statusLine = el("statusLine");
const journalEmpty = el("journalEmpty");
const journalContent = el("journalContent");
const journalError = el("journalError");
const idStamp = el("idStamp");

pickBtn.addEventListener("click", () => fileInput.click());
lensGlassRight.addEventListener("click", () => fileInput.click());
lensGlassLeft.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  if (fileInput.files.length) handleFile(fileInput.files[0]);
});

[lensGlassRight, lensGlassLeft].forEach((zone) => {
  ["dragover", "dragenter"].forEach((evt) =>
    zone.addEventListener(evt, (e) => {
      e.preventDefault();
      zone.style.outline = "3px dashed var(--sky)";
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    zone.addEventListener(evt, (e) => {
      e.preventDefault();
      zone.style.outline = "none";
    })
  );
  zone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
});

function handleFile(file) {
  if (!file.type.startsWith("image/")) {
    setStatus("That doesn't look like an image file.");
    return;
  }
  const localUrl = URL.createObjectURL(file);
  previewImg.src = localUrl;
  previewImg.classList.remove("hidden");
  runScan(file);
}

function setStatus(text) {
  statusLine.textContent = text;
}

async function runScan(file) {
  setStatus("Focusing…");
  idStamp.classList.remove("show");
  lensGlassRight.classList.remove("focusing");
  void lensGlassRight.offsetWidth;
  lensGlassRight.classList.add("focusing");

  const formData = new FormData();
  formData.append("image", file);

  try {
    const res = await fetch("/predict", { method: "POST", body: formData });
    const data = await res.json();

    await new Promise((r) => setTimeout(r, 450));

    if (!data.ok) {
      showError(data.error || "Couldn't identify that photo.");
      setStatus("Identification failed.");
      return;
    }
    renderResult(data);
    setStatus("Match logged in the field journal →");
  } catch (err) {
    showError("Couldn't reach the scanner backend. Is the Flask server running?");
    setStatus("Connection error.");
  }
}

function showError(msg) {
  journalEmpty.classList.add("hidden");
  journalContent.classList.add("hidden");
  journalError.classList.remove("hidden");
  journalError.textContent = msg;
}

function renderResult(data) {
  journalEmpty.classList.add("hidden");
  journalError.classList.add("hidden");
  journalContent.classList.remove("hidden");

  el("lowConfidenceBanner").classList.toggle("hidden", !data.low_confidence);

  const b = data.bird;
  const top = data.predictions[0];

  el("birdName").textContent = b.display_name;
  el("birdSciName").textContent = b.scientific_name;

  const tag = el("confidenceTag");
  if (b.data_confidence === "species-verified") {
    tag.textContent = "✓ Species-verified details";
    tag.className = "confidence-tag verified";
  } else {
    tag.textContent = `~ Typical ${b.family_group} profile (estimated)`;
    tag.className = "confidence-tag typical";
  }

  el("stampConfidence").textContent = top.confidence + "%";
  idStamp.classList.add("show");

  const fact = (b.facts && b.facts[0]) || "";
  typewrite(el("factLine"), fact);

  el("habitatText").textContent = b.habitat;
  el("dietText").textContent = b.diet;

  const p = b.physical;
  const physicalParts = [
    p.length_cm ? `Length ${p.length_cm} cm` : null,
    p.wingspan_cm ? `wingspan ${p.wingspan_cm} cm` : null,
    p.weight_g ? `weight ${p.weight_g} g` : null,
  ].filter(Boolean).join(" · ");
  el("physicalText").innerHTML = `${physicalParts}<br>${p.colors || ""}<br><em>Beak:</em> ${p.beak_type || ""}`;

  el("lifespanText").textContent = b.lifespan;

  const altList = el("altList");
  altList.innerHTML = "";
  data.predictions.slice(1).forEach((pred) => {
    const chip = document.createElement("span");
    chip.className = "alt-chip";
    const info = pred.name;
    chip.innerHTML = `${info.replace(/_/g, " ")} <b>${pred.confidence}%</b>`;
    altList.appendChild(chip);
  });
}

function typewrite(node, text) {
  node.textContent = "";
  if (!text) return;
  let i = 0;
  const speed = Math.max(6, Math.min(16, Math.floor(500 / text.length)));
  function step() {
    node.textContent += text[i];
    i++;
    if (i < text.length) setTimeout(step, speed);
  }
  step();
}

/* ---------------- Browse-all modal ---------------- */
const browseBtn = el("browseBtn");
const browseModal = el("browseModal");
const closeBrowse = el("closeBrowse");
const modalGrid = el("modalGrid");
const browseSearch = el("browseSearch");
let ALL_BIRDS = null;

browseBtn.addEventListener("click", async () => {
  browseModal.classList.remove("hidden");
  if (!ALL_BIRDS) {
    const res = await fetch("/birdlist");
    const data = await res.json();
    ALL_BIRDS = data.birds;
  }
  renderModalGrid(ALL_BIRDS);
});
closeBrowse.addEventListener("click", () => browseModal.classList.add("hidden"));
browseModal.addEventListener("click", (e) => {
  if (e.target === browseModal) browseModal.classList.add("hidden");
});
browseSearch.addEventListener("input", () => {
  const q = browseSearch.value.trim().toLowerCase();
  if (!ALL_BIRDS) return;
  const filtered = ALL_BIRDS.filter(
    (b) =>
      b.display_name.toLowerCase().includes(q) ||
      (b.scientific_name || "").toLowerCase().includes(q)
  );
  renderModalGrid(filtered);
});

function renderModalGrid(list) {
  modalGrid.innerHTML = "";
  list.forEach((b) => {
    const item = document.createElement("div");
    item.className = "modal-item";
    item.innerHTML = `
      <div class="mi-name">${b.display_name}</div>
      <div class="mi-sci">${b.scientific_name}</div>
    `;
    modalGrid.appendChild(item);
  });
}
