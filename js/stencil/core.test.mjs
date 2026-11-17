import { test } from "node:test";
import assert from "node:assert/strict";

import {
  addBridges, binaryStl, buildShapes, buildStencil, dilate, erode, labelComponents, open,
  removeSmall, ringArea, shapesToSvg, traceContours,
} from "./core.mjs";

/** A w*h grid with `fn(x, y)` deciding each pixel. */
function grid(w, h, fn) {
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = fn(x, y) ? 1 : 0;
  return m;
}

const disc = (cx, cy, r) => (x, y) => (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r;
/** An O: cut ring between radius r1 and r2. Its middle is an island. */
const ringO = (cx, cy, r1, r2) => (x, y) => disc(cx, cy, r2)(x, y) && !disc(cx, cy, r1)(x, y);

function islandsOf(cut, w, h) {
  const plate = Uint8Array.from(cut, (v) => (v ? 0 : 1));
  const c = labelComponents(plate, w, h, 1, 4);
  return c.sizes.length - 1 - c.edge.size;
}

test("components: diagonal-only contact is two parts", () => {
  const m = grid(4, 4, (x, y) => (x === 1 && y === 1) || (x === 2 && y === 2));
  assert.equal(labelComponents(m, 4, 4, 1, 4).sizes.length - 1, 2);
  assert.equal(labelComponents(m, 4, 4, 1, 8).sizes.length - 1, 1);
});

test("removeSmall drops specks and keeps shapes", () => {
  const m = grid(40, 40, (x, y) => disc(20, 20, 8)(x, y) || (x === 2 && y === 2));
  const out = removeSmall(m, 40, 40, 5);
  assert.equal(out[2 * 40 + 2], 0);
  assert.equal(out[20 * 40 + 20], 1);
});

test("erode / dilate / open behave and ignore the frame", () => {
  const w = 60;
  const h = 60;
  const thick = grid(w, h, (x, y) => x >= 10 && x < 30 && y >= 10 && y < 30);
  const thinLine = grid(w, h, (x, y) => y === 45 && x > 5 && x < 55);
  const both = Uint8Array.from(thick, (v, i) => v | thinLine[i]);
  const opened = open(both, w, h, 1.5);
  assert.equal(opened[45 * w + 30], 0, "a 1px line does not survive opening");
  assert.equal(opened[20 * w + 20], 1, "a 20px square does");
  assert.equal(erode(thick, w, h, 3)[11 * w + 11], 0);
  // Dilation near the frame must not invent pixels from outside the grid.
  const empty = new Uint8Array(w * h);
  assert.equal(dilate(empty, w, h, 5).reduce((a, v) => a + v, 0), 0);
});

test("an O gets one bridge and no island remains", () => {
  const w = 120;
  const h = 120;
  const cut = grid(w, h, ringO(60, 60, 20, 40));
  assert.equal(islandsOf(cut, w, h), 1);
  const { cut: bridged, bridges, islands } = addBridges(cut, w, h, { width: 6 });
  assert.equal(islands, 1);
  assert.equal(bridges.length, 1);
  assert.equal(islandsOf(bridged, w, h), 0);
  // The bar is short: it crosses the 20px ring, not the whole plate.
  const b = bridges[0];
  assert.ok(Math.hypot(b.x1 - b.x0, b.y1 - b.y0) < 25);
});

test("two bridges per island when asked", () => {
  const w = 160;
  const h = 160;
  const cut = grid(w, h, ringO(80, 80, 40, 55));
  const { bridges, cut: bridged } = addBridges(cut, w, h, { width: 6, perIsland: 2 });
  assert.equal(bridges.length, 2);
  assert.equal(islandsOf(bridged, w, h), 0);
  // ...on roughly opposite sides of the island.
  const [a, b] = bridges;
  assert.ok(Math.hypot(a.x0 - b.x0, a.y0 - b.y0) > 40);
});

test("nested islands bridge inward-out, including one walled in by a smaller one", () => {
  const w = 200;
  const h = 200;
  // Frame | cut ring | plate ring (thin) | cut ring | big plate disc.
  const fn = (x, y) => (disc(100, 100, 90)(x, y) && !disc(100, 100, 80)(x, y)) || (disc(100, 100, 76)(x, y) && !disc(100, 100, 60)(x, y));
  const cut = grid(w, h, fn);
  assert.equal(islandsOf(cut, w, h), 2);
  const { cut: bridged, bridges } = addBridges(cut, w, h, { width: 4 });
  assert.equal(islandsOf(bridged, w, h), 0);
  assert.equal(bridges.length, 2);
});

test("contours: a square is one outer ring, a hole has opposite orientation", () => {
  const w = 20;
  const h = 20;
  const square = grid(w, h, (x, y) => x >= 2 && x < 18 && y >= 2 && y < 18 && !(x >= 8 && x < 12 && y >= 8 && y < 12));
  const rings = traceContours(square, w, h);
  assert.equal(rings.length, 2);
  const areas = rings.map(ringArea).sort((a, b) => a - b);
  assert.equal(areas[0], -(16 * 16));
  assert.equal(areas[1], 16);
  const shapes = buildShapes(rings);
  assert.equal(shapes.length, 1);
  assert.equal(shapes[0].holes.length, 1);
});

test("contours keep diagonal-touching pixels apart", () => {
  const m = grid(4, 4, (x, y) => (x === 1 && y === 1) || (x === 2 && y === 2));
  const rings = traceContours(m, 4, 4);
  assert.equal(rings.length, 2);
  assert.ok(rings.every((r) => ringArea(r) === -1));
});

test("simplified rings stay close to the pixel boundary and get much shorter", () => {
  const w = 200;
  const h = 200;
  const m = grid(w, h, disc(100, 100, 80));
  const [shape] = buildShapes(traceContours(m, w, h));
  assert.ok(shape.outer.length < 200, `${shape.outer.length} vertices`);
  for (const [x, y] of shape.outer) {
    const r = Math.hypot(x - 100, y - 100);
    assert.ok(Math.abs(r - 80) < 1.5, `vertex at radius ${r}`);
  }
});

test("buildStencil: plate in mm, frame always plate, islands bridged", () => {
  const w = 300;
  const h = 200;
  // Fill the left edge with cut too: the frame must still come out plate.
  const cut = grid(w, h, (x, y) => ringO(150, 100, 30, 60)(x, y) || x < 3);
  const result = buildStencil(cut, w, h, { mmPerPx: 0.2, bridgeWidth: 1.6 });
  assert.equal(result.stats.widthMm, 60);
  assert.equal(result.stats.heightMm, 40);
  assert.equal(result.stats.islands, 1);
  assert.equal(result.stats.bridges, 1);
  assert.equal(result.stats.loose, 0);
  assert.equal(result.shapes.length, 1);
  // The ring minus its bridge is one hole; the left strip is another.
  assert.equal(result.stats.holes, 2);
  for (const [x, y] of result.shapes[0].outer) {
    assert.ok(x >= 0 && x <= 60 && y >= 0 && y <= 40);
  }
  assert.equal(result.cut[100 * w], 0, "frame column is plate");
});

test("buildStencil without bridges reports the loose island", () => {
  const w = 120;
  const h = 120;
  const result = buildStencil(grid(w, h, ringO(60, 60, 20, 40)), w, h, { bridges: false });
  assert.equal(result.stats.loose, 1);
  assert.equal(result.shapes.length, 2);
});

test("thin plate is flagged", () => {
  const w = 100;
  const h = 100;
  // Two cut squares 2px apart: the plate between them is 0.4mm at 0.2mm/px.
  const cut = grid(w, h, (x, y) => y > 20 && y < 80 && ((x > 10 && x < 49) || (x > 50 && x < 90)));
  const result = buildStencil(cut, w, h, { mmPerPx: 0.2, minPlate: 0.8, minCut: 0 });
  assert.ok(result.stats.thinMm2 > 0);
  assert.equal(result.thin[50 * w + 49] || result.thin[50 * w + 50], 1);
});

test("binary STL: header, count and normals", () => {
  const tri = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const buf = binaryStl(tri);
  const view = new DataView(buf);
  assert.equal(buf.byteLength, 84 + 50);
  assert.equal(view.getUint32(80, true), 1);
  assert.equal(view.getFloat32(84 + 8, true), 1); // normal +z
});

test("outline SVG is a single even-odd path in millimetres", () => {
  const svg = shapesToSvg([{ outer: [[0, 0], [10, 0], [10, 10], [0, 10]], holes: [[[2, 2], [4, 2], [4, 4]]] }], 10, 10);
  assert.match(svg, /width="10mm"/);
  assert.match(svg, /fill-rule="evenodd"/);
  assert.equal((svg.match(/Z/g) || []).length, 2);
});

test("the extruded stencil is watertight (three.js ExtrudeGeometry, as the page uses)", async () => {
  const THREE = await import("../../assets/vendor/three-0.170.0/three.module.min.js");
  const w = 300;
  const h = 300;
  // Three nested rings: islands inside islands, two bridges each.
  const cut = grid(w, h, (x, y) => {
    const d = Math.hypot(x + 0.5 - 150, y + 0.5 - 150);
    return (d < 140 && d > 110) || (d < 90 && d > 60) || (d < 40 && d > 20);
  });
  const { shapes, stats } = buildStencil(cut, w, h, { mmPerPx: 0.2, bridgesPerIsland: 2 });
  assert.equal(stats.loose, 0);
  const geometry = new THREE.ExtrudeGeometry(shapes.map(({ outer, holes }) => {
    const s = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const hole of holes) s.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
    return s;
  }), { depth: 1.2, bevelEnabled: false, curveSegments: 1, steps: 1 });
  const pos = geometry.getAttribute("position").array;
  const key = (i) => `${pos[i].toFixed(4)},${pos[i + 1].toFixed(4)},${pos[i + 2].toFixed(4)}`;
  const edges = new Map();
  for (let t = 0; t < pos.length; t += 9) {
    const v = [key(t), key(t + 3), key(t + 6)];
    for (const [a, b] of [[v[0], v[1]], [v[1], v[2]], [v[2], v[0]]]) {
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      edges.set(k, (edges.get(k) ?? 0) + 1);
    }
  }
  const open = [...edges.values()].filter((n) => n !== 2).length;
  assert.equal(open, 0, `${open} edges not shared by exactly two triangles`);
  // And the plate keeps its exact outline.
  assert.equal(ringArea(shapes[0].outer.map(([x, y]) => [x, -y])), -60 * 60);
});
