// Color Palette Extractor — pure client-side.
// - Downscales image to max 320px, samples pixels
// - K-Means clusters to K colors (3..8)
// - Shows HEX swatches with copy buttons

const els = {
  drop: document.getElementById("drop"),
  file: document.getElementById("file"),
  k: document.getElementById("k"),
  kVal: document.getElementById("kVal"),
  extract: document.getElementById("extract"),
  copyAll: document.getElementById("copyAll"),
  preview: document.getElementById("preview"),
  palette: document.getElementById("palette"),
  canvas: document.getElementById("canvas"),
  status: document.getElementById("status"),
};

els.k.addEventListener("input", () => (els.kVal.textContent = els.k.value));

// --- loading image ---
let currentImage = null;
const MAX = 320;

function showToast(msg) {
  let t = document.querySelector(".toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 900);
}

function setPreview(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    currentImage = img;
    els.preview.innerHTML = "";
    els.preview.appendChild(img);
    els.status.textContent = `${file.name} — ${img.naturalWidth}×${img.naturalHeight}`;
    URL.revokeObjectURL(url);
  };
  img.onerror = () => {
    showToast("Could not load image");
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

["dragenter", "dragover"].forEach((evt) =>
  els.drop.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    els.drop.classList.add("drag");
  })
);
["dragleave", "drop"].forEach((evt) =>
  els.drop.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    els.drop.classList.remove("drag");
  })
);
els.drop.addEventListener("drop", (e) => setPreview(e.dataTransfer.files[0]));
els.file.addEventListener("change", (e) => setPreview(e.target.files[0]));

// --- core: palette extraction ---
function drawToCanvas(img) {
  const c = els.canvas,
    ctx = c.getContext("2d", { willReadFrequently: true });
  let { width: w, height: h } = img;
  const scale = Math.min(1, MAX / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));
  c.width = w;
  c.height = h;
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

function hex([r, g, b]) {
  return (
    "#" +
    [r, g, b]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}
const dist2 = (a, b) => {
  const dr = a[0] - b[0],
    dg = a[1] - b[1],
    db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
};

// K-Means on a sample of pixels
function kmeans(pixels, k, maxIter = 10, sampleStep = 4) {
  // build sample array of RGB tuples
  const sample = [];
  for (let i = 0; i < pixels.length; i += 4 * sampleStep) {
    const r = pixels[i],
      g = pixels[i + 1],
      b = pixels[i + 2],
      a = pixels[i + 3];
    if (a < 10) continue; // ignore almost-transparent
    sample.push([r, g, b]);
  }
  if (sample.length === 0) return [];

  // init centers with random samples
  const centers = Array.from({ length: k }, (_) =>
    sample[(Math.random() * sample.length) | 0].slice()
  );
  const assignments = new Array(sample.length).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    // assign
    for (let i = 0; i < sample.length; i++) {
      let best = 0,
        bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = dist2(sample[i], centers[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      assignments[i] = best;
    }
    // recompute
    const sums = Array.from({ length: k }, (_) => [0, 0, 0, 0]); // last = count
    for (let i = 0; i < sample.length; i++) {
      const c = assignments[i];
      const p = sample[i];
      sums[c][0] += p[0];
      sums[c][1] += p[1];
      sums[c][2] += p[2];
      sums[c][3]++;
    }
    let changed = false;
    for (let c = 0; c < k; c++) {
      if (sums[c][3] === 0) {
        centers[c] = sample[(Math.random() * sample.length) | 0].slice();
        continue;
      }
      const newC = [
        (sums[c][0] / sums[c][3]) | 0,
        (sums[c][1] / sums[c][3]) | 0,
        (sums[c][2] / sums[c][3]) | 0,
      ];
      if (dist2(newC, centers[c]) > 1) changed = true;
      centers[c] = newC;
    }
    if (!changed) break;
  }

  // rank centers by cluster size (desc)
  const counts = Array(k).fill(0);
  for (const c of assignments) counts[c]++;
  const palette = centers
    .map((rgb, i) => ({ rgb, count: counts[i] }))
    .sort((a, b) => b.count - a.count)
    .map((o) => o.rgb);
  return palette;
}

function renderPalette(colors) {
  els.palette.innerHTML = "";
  const frag = document.createDocumentFragment();
  const hexes = colors.map(hex);

  colors.forEach((rgb, i) => {
    const sw = document.createElement("div");
    sw.className = "swatch";
    const box = document.createElement("div");
    box.className = "color";
    box.style.background = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;

    const code = document.createElement("div");
    code.className = "hex";
    code.textContent = hex(rgb);

    const btn = document.createElement("button");
    btn.className = "copy";
    btn.textContent = "Copy";
    btn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(code.textContent);
      showToast(`${code.textContent} copied`);
    });

    sw.appendChild(box);
    sw.appendChild(code);
    sw.appendChild(btn);
    frag.appendChild(sw);
  });

  els.palette.appendChild(frag);

  // Copy all
  els.copyAll.onclick = async () => {
    await navigator.clipboard.writeText(hexes.join(" "));
    showToast("All HEX copied");
  };
}

async function extract() {
  if (!currentImage) {
    showToast("Choose an image first");
    return;
  }
  els.status.textContent = "Extracting…";
  await new Promise((r) => setTimeout(r)); // let UI update
  const pixels = drawToCanvas(currentImage);
  const k = parseInt(els.k.value, 10);
  const colors = kmeans(pixels, k);
  renderPalette(colors);
  els.status.textContent = `Found ${colors.length} colors`;
}

els.extract.addEventListener("click", extract);
