/**
 * Stencil Lab page: source -> raster -> core.mjs -> plan view, 3D, STL.
 *
 * The geometry lives in core.mjs and is tested in Node; this file is the DOM:
 * rasterising the motif into plate space, drawing the plan, the three.js
 * view, the generate-by-prompt job, and the downloads.
 */

import * as THREE from "../../assets/vendor/three-0.170.0/three.module.min.js";
import { OrbitControls } from "../../assets/vendor/three-0.170.0/OrbitControls.js";

import { binaryStl, buildStencil, shapesToSvg } from "./core.mjs";
import { API_BASE } from "./config.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const MAX_PIXELS = 1_600_000;

const state = {
  source: null, // { url, name, revoke }
  result: null,
  params: null,
  building: false,
  pending: false,
};

const store = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // private mode: nothing to remember
    }
  },
};

// ---------------------------------------------------------------------------
// tabs
// ---------------------------------------------------------------------------

for (const tab of $$("[data-tab]")) {
  tab.addEventListener("click", () => {
    for (const t of $$("[data-tab]")) t.setAttribute("aria-selected", String(t === tab));
    for (const body of $$("[data-body]")) body.hidden = body.dataset.body !== tab.dataset.tab;
  });
}
for (const tab of $$("[data-view]")) {
  tab.addEventListener("click", () => {
    for (const t of $$("[data-view]")) t.setAttribute("aria-selected", String(t === tab));
    const is3d = tab.dataset.view === "3d";
    $("#plan").hidden = is3d;
    $("#three").hidden = !is3d;
    if (is3d) viewer.show(state.result, state.params);
  });
}

// ---------------------------------------------------------------------------
// settings
// ---------------------------------------------------------------------------

function readParams() {
  const f = $("#settings");
  const num = (name) => Number.parseFloat(f.elements[name].value);
  const nozzle = num("nozzle") || 0.4;
  const p = {
    plateW: num("plateW"),
    plateH: num("plateH"),
    margin: num("margin"),
    thickness: num("thickness"),
    threshold: num("threshold") / 100,
    invert: f.elements.invert.checked,
    mmPerPx: num("mmPerPx"),
    bridges: f.elements.bridges.checked,
    bridgeWidth: Math.max(num("bridgeWidth"), nozzle * 2),
    bridgesPerIsland: Number(f.elements.bridgesPerIsland.value),
    // A cut-out narrower than a nozzle width lets no paint through; plate
    // narrower than two line widths does not print as a solid wall.
    minCut: nozzle * 1.5,
    minPlate: nozzle * 2,
    speck: num("speck"),
  };
  // Keep the grid within budget: coarsen the resolution rather than freeze.
  while ((p.plateW / p.mmPerPx) * (p.plateH / p.mmPerPx) > MAX_PIXELS) p.mmPerPx = +(p.mmPerPx + 0.05).toFixed(2);
  return p;
}

let debounce = 0;
$("#settings").addEventListener("input", (event) => {
  const out = $(`output[data-for="${event.target.name}"]`);
  if (out) out.value = event.target.value;
  clearTimeout(debounce);
  debounce = setTimeout(rebuild, 250);
});

// ---------------------------------------------------------------------------
// sources
// ---------------------------------------------------------------------------

function setSource(url, name, revoke = false) {
  if (state.source?.revoke) URL.revokeObjectURL(state.source.url);
  state.source = { url, name, revoke };
  const preview = $("#source-preview");
  preview.replaceChildren();
  const img = new Image();
  img.alt = name;
  img.src = url;
  preview.append(img);
  rebuild();
}

/** SVG text -> blob URL with explicit pixel size, so <img> knows its aspect. */
function svgUrl(text) {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const svg = doc.documentElement;
  if (svg.nodeName !== "svg") throw new Error("not an SVG document");
  const box = (svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
  const [bw, bh] = box.length === 4 && box[2] > 0 && box[3] > 0
    ? [box[2], box[3]]
    : [parseFloat(svg.getAttribute("width")) || 512, parseFloat(svg.getAttribute("height")) || 512];
  if (box.length !== 4) svg.setAttribute("viewBox", `0 0 ${bw} ${bh}`);
  const scale = 1024 / Math.max(bw, bh);
  svg.setAttribute("width", String(Math.round(bw * scale)));
  svg.setAttribute("height", String(Math.round(bh * scale)));
  const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
  return URL.createObjectURL(blob);
}

async function loadFile(file) {
  try {
    if (file.type === "image/svg+xml" || /\.svg$/i.test(file.name)) {
      setSource(svgUrl(await file.text()), file.name, true);
    } else if (file.type.startsWith("image/")) {
      setSource(URL.createObjectURL(file), file.name, true);
    } else {
      throw new Error("Choose an SVG, PNG, JPEG or WebP file.");
    }
  } catch (error) {
    showEmpty(error.message);
  }
}

$("#file").addEventListener("change", (e) => e.target.files[0] && loadFile(e.target.files[0]));
const drop = $("#drop");
drop.addEventListener("dragover", (e) => {
  e.preventDefault();
  drop.classList.add("over");
});
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
});

for (const button of $$("[data-demo]")) {
  button.addEventListener("click", async () => {
    const text = await (await fetch(button.dataset.demo)).text();
    setSource(svgUrl(text), button.dataset.demo.split("/").pop());
  });
}

// ---------------------------------------------------------------------------
// rasterise: motif -> cut mask in plate space
// ---------------------------------------------------------------------------

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The motif could not be read as an image."));
    img.src = url;
  });
}

async function rasterise(url, p) {
  const img = await loadImage(url);
  const w = Math.round(p.plateW / p.mmPerPx);
  const h = Math.round(p.plateH / p.mmPerPx);
  const m = p.margin / p.mmPerPx;
  const boxW = Math.max(1, w - 2 * m);
  const boxH = Math.max(1, h - 2 * m);
  const scale = Math.min(boxW / img.naturalWidth, boxH / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, dx, dy, dw, dh);
  const data = ctx.getImageData(0, 0, w, h).data;
  const cut = new Uint8Array(w * h);
  const x0 = Math.floor(dx);
  const x1 = Math.ceil(dx + dw);
  const y0 = Math.floor(dy);
  const y1 = Math.ceil(dy + dh);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * w + x;
      const lum = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
      const dark = lum < p.threshold;
      cut[i] = (p.invert ? !dark : dark) ? 1 : 0;
    }
  }
  return { cut, w, h };
}

// ---------------------------------------------------------------------------
// build + plan view
// ---------------------------------------------------------------------------

function showEmpty(message) {
  const empty = $("#empty");
  empty.textContent = message;
  empty.hidden = !message;
}

async function rebuild() {
  if (!state.source) return;
  if (state.building) {
    state.pending = true;
    return;
  }
  state.building = true;
  showEmpty("Building…");
  try {
    const p = readParams();
    // Let the "Building…" paint before the synchronous work.
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    const { cut, w, h } = await rasterise(state.source.url, p);
    if (!cut.some((v) => v)) throw new Error("Nothing to cut: the motif is all light. Try a higher threshold or Invert.");
    const result = buildStencil(cut, w, h, p);
    result.w = w;
    result.h = h;
    state.result = result;
    state.params = p;
    drawPlan(result, p);
    renderStats(result, p);
    if (!$("#three").hidden) viewer.show(result, p);
    $("#dl-stl").disabled = !result.shapes.length;
    $("#dl-svg").disabled = !result.shapes.length;
    showEmpty("");
  } catch (error) {
    console.error(error);
    showEmpty(error.message);
  } finally {
    state.building = false;
    if (state.pending) {
      state.pending = false;
      rebuild();
    }
  }
}

function drawPlan({ cut, thin, bridges, w, h }, p, canvas = $("#plan")) {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(w, h);
  const PLATE = [205, 232, 240];
  const CUT = [9, 10, 30];
  const THIN = [255, 160, 40];
  for (let i = 0; i < w * h; i++) {
    const c = cut[i] ? CUT : thin[i] ? THIN : PLATE;
    img.data.set(c, i * 4);
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // The bars are plate already; tint them at their real width so they read
  // as bridges rather than as more plate.
  ctx.strokeStyle = "rgba(255, 56, 109, 0.8)";
  ctx.lineWidth = Math.max(1, p.bridgeWidth / p.mmPerPx);
  ctx.lineCap = "round";
  for (const b of bridges) {
    ctx.beginPath();
    ctx.moveTo(b.x0 + 0.5, b.y0 + 0.5);
    ctx.lineTo(b.x1 + 0.5, b.y1 + 0.5);
    ctx.stroke();
  }
}

function renderStats({ stats }, p) {
  const rows = [
    ["Plate", `${stats.widthMm.toFixed(0)} × ${stats.heightMm.toFixed(0)} × ${p.thickness} mm`],
    ["Cut-outs", String(stats.holes)],
    ["Islands", stats.islands ? `${stats.islands} found, ${stats.bridges} bridge${stats.bridges === 1 ? "" : "s"}` : "none"],
  ];
  if (stats.loose) rows.push(["Loose parts", `${stats.loose} — they will fall out`, "warn"]);
  if (stats.thinMm2 > 0.5) rows.push(["Thin plate", `${stats.thinMm2.toFixed(1)} mm² under ${p.minPlate} mm (orange)`, "warn"]);
  if (stats.removedMm2 > 0.5) rows.push(["Dropped", `${stats.removedMm2.toFixed(1)} mm² of slits/specks`]);
  rows.push(["Resolution", `${p.mmPerPx} mm`]);
  const dl = $("#stats");
  dl.replaceChildren();
  for (const [k, v, cls] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = v;
    if (cls) dd.className = cls;
    dl.append(dt, dd);
  }
}

// ---------------------------------------------------------------------------
// 3D
// ---------------------------------------------------------------------------

function toThreeShapes(shapes) {
  return shapes.map(({ outer, holes }) => {
    const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
    return shape;
  });
}

function stencilGeometry(result, p) {
  const geometry = new THREE.ExtrudeGeometry(toThreeShapes(result.shapes), {
    depth: p.thickness, bevelEnabled: false, curveSegments: 1, steps: 1,
  });
  return geometry.index ? geometry.toNonIndexed() : geometry;
}

const viewer = {
  renderer: null,
  scene: null,
  camera: null,
  controls: null,
  mesh: null,
  shown: null,
  init() {
    const host = $("#three");
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    host.append(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 1, 5000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-1, -2, 3);
    this.scene.add(sun);
    const loop = () => {
      requestAnimationFrame(loop);
      if (host.hidden) return;
      const { clientWidth: cw, clientHeight: ch } = host;
      const canvas = this.renderer.domElement;
      if (canvas.width !== Math.round(cw * this.renderer.getPixelRatio())) {
        this.renderer.setSize(cw, ch, false);
        this.camera.aspect = cw / ch;
        this.camera.updateProjectionMatrix();
      }
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  },
  show(result, p) {
    if (!result) return;
    if (!this.renderer) this.init();
    if (this.shown === result) return;
    this.shown = result;
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
    }
    const geometry = stencilGeometry(result, p);
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x5fe1ff, roughness: 0.55, metalness: 0.05 }));
    const cx = result.stats.widthMm / 2;
    const cy = result.stats.heightMm / 2;
    this.mesh.position.set(-cx, -cy, 0);
    this.scene.add(this.mesh);
    const size = Math.max(result.stats.widthMm, result.stats.heightMm);
    this.camera.position.set(0, -size * 1.25, size * 1.45);
    this.camera.up.set(0, 0, 1);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  },
};

// ---------------------------------------------------------------------------
// downloads
// ---------------------------------------------------------------------------

function download(data, name, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function baseName() {
  return (state.source?.name || "stencil").replace(/\.[a-z]+$/i, "").replace(/[^a-z0-9-]+/gi, "-").slice(0, 40) || "stencil";
}

$("#dl-stl").addEventListener("click", () => {
  const geometry = stencilGeometry(state.result, state.params);
  const stl = binaryStl(geometry.getAttribute("position").array, `gdxlabs stencil ${baseName()}`);
  geometry.dispose();
  download(stl, `${baseName()}-stencil.stl`, "model/stl");
});
$("#dl-svg").addEventListener("click", () => {
  const { shapes, stats } = state.result;
  download(shapesToSvg(shapes, stats.widthMm, stats.heightMm), `${baseName()}-outline.svg`, "image/svg+xml");
});

// ---------------------------------------------------------------------------
// generate by prompt
// ---------------------------------------------------------------------------

const job = {
  id: null,
  timer: 0,
  started: 0,
  status(text, cls = "") {
    const el = $("#job");
    el.textContent = text;
    el.className = `job-status ${cls}`;
  },
  async submit(prompt) {
    $("#generate").disabled = true;
    this.status("Sending…");
    try {
      const response = await fetch(`${API_BASE}/api/stencil/jobs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `server answered ${response.status}`);
      this.started = Date.now();
      this.track(body);
    } catch (error) {
      this.status(error instanceof TypeError ? `The stencil server (${new URL(API_BASE).host}) is not reachable. It may not be deployed yet, or its address does not resolve.` : error.message, "warn");
      $("#generate").disabled = false;
    }
  },
  track(view) {
    this.id = view.id;
    store.set("stencil-job", view.id);
    this.apply(view);
  },
  apply(view) {
    clearTimeout(this.timer);
    if (view.status === "done") {
      store.set("stencil-job", null);
      this.status("Done.", "ok");
      $("#generate").disabled = false;
      setSource(svgUrl(view.svg), `${view.prompt.slice(0, 30)}.svg`, true);
      return;
    }
    if (view.status === "failed") {
      store.set("stencil-job", null);
      this.status(`The drawing failed: ${view.error}`, "warn");
      $("#generate").disabled = false;
      return;
    }
    const secs = this.started ? Math.round((Date.now() - this.started) / 1000) : 0;
    const where = view.status === "queued" ? `Waiting — ${view.position} ahead` : "Drawing";
    this.status(`${where}… ${secs ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` : ""}`);
    this.timer = setTimeout(() => this.poll(), 5000);
  },
  async poll() {
    try {
      const response = await fetch(`${API_BASE}/api/stencil/jobs/${this.id}`);
      if (response.status === 404) {
        store.set("stencil-job", null);
        this.status("That job is gone (the server restarted). Please try again.", "warn");
        $("#generate").disabled = false;
        return;
      }
      this.apply(await response.json());
    } catch {
      this.timer = setTimeout(() => this.poll(), 10000);
    }
  },
};

$("#generate").addEventListener("click", () => {
  const prompt = $("#prompt").value.trim();
  if (prompt.length < 3) {
    job.status("Describe the motif in a few words.", "warn");
    return;
  }
  job.submit(prompt);
});

// A job started before a reload keeps going on the server; pick it up.
const resumed = store.get("stencil-job");
if (resumed && /^[0-9a-f]{20}$/.test(resumed)) {
  job.id = resumed;
  job.status("Resuming…");
  $("#generate").disabled = true;
  job.poll();
}

showEmpty("Pick a motif to start: generate one, upload a file or try a demo.");
