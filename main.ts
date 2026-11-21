// AURELIA — The City That Floats Above the Clouds
// A travel poster for a place that isn't there.
// Pure Node 22 stdlib: procedural "3D" golden-hour scene rendered per-pixel,
// no dependencies, no network. Writes /output/entry.png (1024x1024).
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import * as crypto from "node:crypto";

const W = 1024;
const H = 1024;

// ---------------- utils ----------------
function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function sstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
function hash2(ix: number, iy: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >> 16)) >>> 0;
  return h / 4294967295;
}
function vnoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
}
function fbm(x: number, y: number): number {
  return (
    vnoise(x, y) * 0.55 +
    vnoise(x * 2.13 + 7.3, y * 2.13 + 3.1) * 0.3 +
    vnoise(x * 4.31 + 13.7, y * 4.31 + 9.2) * 0.15
  );
}

// ---------------- pixel buffer ----------------
const img = new Uint8Array(W * H * 3);
function setPx(x: number, y: number, r: number, g: number, b: number): void {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 3;
  img[i] = r;
  img[i + 1] = g;
  img[i + 2] = b;
}
function blend(x: number, y: number, r: number, g: number, b: number, a: number): void {
  if (x < 0 || x >= W || y < 0 || y >= H || a <= 0) return;
  const i = (y * W + x) * 3;
  if (a >= 1) {
    // NOTE: Uint8Array wraps out-of-range values modulo 256, so clamp first.
    img[i] = clamp(r, 0, 255);
    img[i + 1] = clamp(g, 0, 255);
    img[i + 2] = clamp(b, 0, 255);
    return;
  }
  img[i] = clamp(img[i] + (r - img[i]) * a, 0, 255);
  img[i + 1] = clamp(img[i + 1] + (g - img[i + 1]) * a, 0, 255);
  img[i + 2] = clamp(img[i + 2] + (b - img[i + 2]) * a, 0, 255);
}
function fillRect(x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number, a: number): void {
  const xa = Math.max(0, Math.floor(x0));
  const xb = Math.min(W - 1, Math.ceil(x1));
  const ya = Math.max(0, Math.floor(y0));
  const yb = Math.min(H - 1, Math.ceil(y1));
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) blend(x, y, r, g, b, a);
  }
}
function fillEllipse(cx: number, cy: number, rx: number, ry: number, r: number, g: number, b: number, a: number): void {
  const xa = Math.max(0, Math.floor(cx - rx - 1));
  const xb = Math.min(W - 1, Math.ceil(cx + rx + 1));
  const ya = Math.max(0, Math.floor(cy - ry - 1));
  const yb = Math.min(H - 1, Math.ceil(cy + ry + 1));
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d <= 1) {
        const edge = sstep(1, 0.86, d);
        blend(x, y, r, g, b, a * edge);
      }
    }
  }
}
function fillPoly(pts: number[][], r: number, g: number, b: number, a: number): void {
  let minY = H;
  let maxY = 0;
  for (const p of pts) {
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(H - 1, Math.ceil(maxY));
  for (let y = y0; y <= y1; y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % pts.length];
      if ((p1[1] <= y && p2[1] > y) || (p2[1] <= y && p1[1] > y)) {
        const t = (y - p1[1]) / (p2[1] - p1[1]);
        xs.push(p1[0] + t * (p2[0] - p1[0]));
      }
    }
    xs.sort((u, v) => u - v);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k]));
      const xb = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let x = xa; x <= xb; x++) blend(x, y, r, g, b, a);
    }
  }
}
function drawLine(x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number, a: number): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const n = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    blend(Math.round(x0 + dx * t), Math.round(y0 + dy * t), r, g, b, a);
  }
}

// ---------------- sky ----------------
// gradient stops: [yFraction, r, g, b]
const SKY: number[][] = [
  [0.0, 24, 16, 58],
  [0.22, 66, 36, 104],
  [0.42, 138, 60, 108],
  [0.58, 214, 104, 96],
  [0.7, 247, 164, 92],
  [0.82, 255, 208, 138],
  [1.0, 255, 232, 184],
];
function skyColor(y: number): number[] {
  const t = y / H;
  for (let i = 0; i < SKY.length - 1; i++) {
    const a = SKY[i];
    const b = SKY[i + 1];
    if (t >= a[0] && t <= b[0]) {
      const k = (t - a[0]) / (b[0] - a[0]);
      return [lerp(a[1], b[1], k), lerp(a[2], b[2], k), lerp(a[3], b[3], k)];
    }
  }
  const l = SKY[SKY.length - 1];
  return [l[1], l[2], l[3]];
}

const SUN_X = 305;
const SUN_Y = 238;

function renderBase(): void {
  for (let y = 0; y < H; y++) {
    const sc = skyColor(y);
    for (let x = 0; x < W; x++) {
      let r = sc[0];
      let g = sc[1];
      let b = sc[2];
      // sun glow
      const dx = x - SUN_X;
      const dy = y - SUN_Y;
      const d2 = dx * dx + dy * dy;
      const glow = Math.exp(-d2 / (2 * 95 * 95));
      r += (255 - r) * glow * 0.85;
      g += (214 - g) * glow * 0.8;
      b += (150 - b) * glow * 0.55;
      // sun disc
      const d = Math.sqrt(d2);
      if (d < 36) {
        const core = sstep(36, 30, d);
        r = lerp(r, 255, core);
        g = lerp(g, 244, core);
        b = lerp(b, 208, core);
      }
      // stars in the upper sky
      if (y < 300) {
        const s = hash2(x, y);
        if (s > 0.9986) {
          const tw = (s - 0.9986) / 0.0014;
          const fade = sstep(300, 60, y);
          r = lerp(r, 255, tw * fade * 0.9);
          g = lerp(g, 255, tw * fade * 0.9);
          b = lerp(b, 255, tw * fade * 0.9);
        }
      }
      // sea of clouds below y=600
      if (y > 600) {
        const n = fbm(x * 0.0055, y * 0.0075);
        const n2 = fbm(x * 0.0021 + 40, y * 0.0031 + 9);
        const cl = sstep(0.36, 0.64, n * 0.72 + n2 * 0.38);
        const depth = sstep(600, 980, y);
        // deep violet shadows, near-white peach lit tops: strong contrast vs sky
        const cr = lerp(66, 255, cl);
        const cg = lerp(46, 216, cl);
        const cb = lerp(96, 172, cl);
        const m = clamp(cl * (1 - depth * 0.12), 0, 1);
        r = lerp(r, cr, m);
        g = lerp(g, cg, m);
        b = lerp(b, cb, m);
      }
      const i = (y * W + x) * 3;
      img[i] = clamp(r, 0, 255);
      img[i + 1] = clamp(g, 0, 255);
      img[i + 2] = clamp(b, 0, 255);
    }
  }
}

// ---------------- god rays ----------------
function beam(x1: number, y1: number, x2: number, y2: number, width: number, alpha: number): void {
  const xa = Math.max(0, Math.floor(Math.min(x1, x2) - width));
  const xb = Math.min(W - 1, Math.ceil(Math.max(x1, x2) + width));
  const ya = Math.max(0, Math.floor(Math.min(y1, y2)));
  const yb = Math.min(H - 1, Math.ceil(Math.max(y1, y2)));
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      let t = ((x - x1) * dx + (y - y1) * dy) / len2;
      t = clamp(t, 0, 1);
      const px = x1 + dx * t;
      const py = y1 + dy * t;
      const d = Math.hypot(x - px, y - py);
      const a = sstep(width, width * 0.25, d) * alpha * (1 - t * 0.45);
      if (a > 0.003) blend(x, y, 255, 226, 170, a);
    }
  }
}

// ---------------- ringed planet ----------------
function ringedPlanet(cx: number, cy: number, rad: number): void {
  const tilt = -0.32;
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  // back half of ring
  const xa = Math.floor(cx - rad * 2.1);
  const xb = Math.ceil(cx + rad * 2.1);
  const ya = Math.floor(cy - rad * 0.9);
  const yb = Math.ceil(cy + rad * 0.9);
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const rx = (x - cx) * cos + (y - cy) * sin;
      const ry = -(x - cx) * sin + (y - cy) * cos;
      const rr = Math.hypot(rx, ry / 0.32);
      if (rr > rad * 1.25 && rr < rad * 2.05 && ry < 0) {
        blend(x, y, 238, 206, 150, 0.9);
      }
    }
  }
  // disc with soft gradient
  for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++) {
    for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
      const d = Math.hypot(x - cx, y - cy) / rad;
      if (d <= 1) {
        const lit = clamp(0.75 + 0.45 * ((cx - x) / rad) + 0.25 * ((cy - y) / rad), 0, 1.15);
        const edge = sstep(1, 0.94, d);
        blend(x, y, 236 * lit, 208 * lit, 152 * lit, edge);
      }
    }
  }
  // band across the disc
  for (let y = Math.floor(cy - rad * 0.3); y <= Math.ceil(cy + rad * 0.1); y++) {
    for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
      const d = Math.hypot(x - cx, y - cy) / rad;
      if (d <= 1 && Math.abs(y - cy + (x - cx) * 0.18) < 7) {
        blend(x, y, 196, 160, 108, 0.5 * sstep(1, 0.9, d));
      }
    }
  }
  // front half of ring
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const rx = (x - cx) * cos + (y - cy) * sin;
      const ry = -(x - cx) * sin + (y - cy) * cos;
      const rr = Math.hypot(rx, ry / 0.32);
      if (rr > rad * 1.25 && rr < rad * 2.05 && ry >= 0) {
        blend(x, y, 244, 216, 162, 0.92);
      }
    }
  }
}

// ---------------- floating islands ----------------
function strata(cx: number, halfW: number, topY: number, depth: number, scale: number, alpha: number): void {
  // strata lines clipped to the island's tapering silhouette
  for (let y = topY + 34 * scale; y <= topY + depth * 0.8; y += 9) {
    const t = (y - topY) / depth;
    const hw = t <= 0.32 ? halfW * 0.8 : halfW * 0.8 * (1 - (t - 0.32) / 0.68);
    if (hw < 4) continue;
    const wob = Math.sin(y * 0.35) * 4;
    drawLine(cx - hw + wob, y, cx + hw - wob, y, 52, 30, 52, alpha);
  }
}
function island(cx: number, topY: number, halfW: number, depth: number, scale: number, detail: number): void {
  const pts: number[][] = [
    [cx - halfW, topY + 6],
    [cx - halfW * 0.86, topY],
    [cx + halfW * 0.86, topY],
    [cx + halfW, topY + 6],
    [cx + halfW * 0.82, topY + depth * 0.32],
    [cx + halfW * 0.5, topY + depth * 0.68],
    [cx + halfW * 0.2, topY + depth * 0.92],
    [cx, topY + depth],
    [cx - halfW * 0.2, topY + depth * 0.92],
    [cx - halfW * 0.5, topY + depth * 0.68],
    [cx - halfW * 0.82, topY + depth * 0.32],
  ];
  // rock body: warm shadowed mauve
  fillPoly(pts, 96, 58, 82, 1);
  // 3D shading: darker lower rock + warm sunlit rim on the left taper
  fillPoly(
    [
      [cx - halfW * 0.82, topY + depth * 0.3],
      [cx + halfW * 0.82, topY + depth * 0.3],
      [cx + halfW * 0.5, topY + depth * 0.68],
      [cx + halfW * 0.2, topY + depth * 0.92],
      [cx, topY + depth],
      [cx - halfW * 0.2, topY + depth * 0.92],
      [cx - halfW * 0.5, topY + depth * 0.68],
    ],
    44,
    26,
    50,
    0.5,
  );
  drawLine(cx - halfW * 0.86, topY + 4, cx - halfW * 0.2, topY + depth * 0.9, 255, 200, 130, 0.55);
  drawLine(cx - halfW * 0.86, topY + 4, cx - halfW * 0.2, topY + depth * 0.9, 255, 200, 130, 0.0);
  // lit upper rock band
  fillPoly(
    [
      [cx - halfW, topY + 6],
      [cx - halfW * 0.86, topY],
      [cx + halfW * 0.86, topY],
      [cx + halfW, topY + 6],
      [cx + halfW * 0.9, topY + 26 * scale],
      [cx - halfW * 0.9, topY + 26 * scale],
    ],
    168, 104, 108, 1,
  );
  // golden plateau top
  fillPoly(
    [
      [cx - halfW * 0.98, topY + 4],
      [cx - halfW * 0.86, topY],
      [cx + halfW * 0.86, topY],
      [cx + halfW * 0.98, topY + 4],
      [cx + halfW * 0.9, topY + 10 * scale],
      [cx - halfW * 0.9, topY + 10 * scale],
    ],
    216, 164, 96, 1,
  );
  // rim light on the plateau edge
  drawLine(cx - halfW * 0.9, topY + 1, cx + halfW * 0.9, topY + 1, 255, 226, 150, 0.9);
  if (detail > 0) strata(cx, halfW, topY, depth, scale, 0.35);
  // crystal glints on the rock
  for (let k = 0; k < 5; k++) {
    const gx = cx + (hash2(k * 7 + 3, 11) - 0.5) * halfW * 1.2;
    const gy = topY + depth * (0.25 + hash2(k * 7 + 5, 13) * 0.5);
    fillEllipse(gx, gy, 2.2, 3.4, 190, 230, 255, 0.85);
  }
}
function tower(x: number, baseY: number, w: number, h: number, dome: boolean): void {
  // lit left face / shadow right face for a 3D read
  fillRect(x, baseY - h, x + w * 0.55, baseY, 238, 196, 138, 1);
  fillRect(x + w * 0.55, baseY - h, x + w, baseY, 168, 116, 96, 1);
  // roof
  if (dome) {
    fillEllipse(x + w / 2, baseY - h, w * 0.62, w * 0.5, 250, 214, 150, 1);
    fillEllipse(x + w / 2, baseY - h, w * 0.3, w * 0.26, 255, 240, 200, 1);
  } else {
    fillPoly(
      [
        [x - 2, baseY - h],
        [x + w / 2, baseY - h - w * 0.75],
        [x + w + 2, baseY - h],
      ],
      214, 128, 96, 1,
    );
  }
  // glowing windows
  for (let wy = baseY - h + 8; wy < baseY - 6; wy += 12) {
    fillRect(x + w * 0.18, wy, x + w * 0.32, wy + 4, 255, 226, 150, 0.95);
  }
}
function waterfall(x: number, y0: number, y1: number, w: number): void {
  // continuous stream: overlapping bands, no gaps
  for (let y = y0; y <= y1; y += 2) {
    const t = (y - y0) / (y1 - y0);
    const wob = Math.sin(y * 0.09 + x) * 2.5;
    const a = 0.85 * (1 - t * 0.5);
    fillRect(x + wob - w / 2, y, x + wob + w / 2, y + 1, 168, 208, 232, a * 0.5);
    const core = 3.2 + Math.sin(y * 0.4) * 1.1;
    fillRect(x + wob - core, y, x + wob + core, y + 1, 216, 240, 250, a);
    fillRect(x + wob - 1.1, y, x + wob + 1.1, y + 1, 245, 252, 255, a * 0.95);
  }
  // mist where it lands
  fillEllipse(x, y1 + 6, w * 1.6, 10, 245, 238, 228, 0.5);
  fillEllipse(x, y1 + 12, w * 2.2, 8, 245, 238, 228, 0.32);
}
function airship(cx: number, cy: number, s: number): void {
  const rx = 74 * s;
  const ry = 23 * s;
  // envelope with vertical shading (3D balloon)
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d <= 1) {
        const lit = clamp(0.62 + 0.55 * (1 - (y - cy) / ry) * 0.7 + 0.3 * (1 - Math.abs(dx)), 0, 1.2);
        const edge = sstep(1, 0.9, d);
        blend(x, y, 248 * lit, 208 * lit, 150 * lit, edge);
      }
    }
  }
  // stripes
  for (let k = -1; k <= 1; k++) {
    const bx = cx + k * rx * 0.55;
    drawLine(bx, cy - ry * 0.82, bx, cy + ry * 0.82, 168, 96, 92, 0.55);
  }
  // gondola + fins
  fillRect(cx - 26 * s, cy + ry - 2, cx + 26 * s, cy + ry + 12 * s, 96, 52, 66, 1);
  fillPoly(
    [
      [cx - rx * 0.92, cy - 2],
      [cx - rx * 0.7, cy - 22 * s],
      [cx - rx * 0.62, cy - 2],
    ],
    214, 128, 96, 1,
  );
  fillPoly(
    [
      [cx + rx * 0.92, cy - 2],
      [cx + rx * 0.7, cy - 22 * s],
      [cx + rx * 0.62, cy - 2],
    ],
    214, 128, 96, 1,
  );
  // tiny lit windows on the gondola
  for (let k = 0; k < 5; k++) {
    fillRect(cx - 20 * s + k * 9 * s, cy + ry + 3, cx - 16 * s + k * 9 * s, cy + ry + 7, 255, 236, 170, 0.95);
  }
}
function bird(x: number, y: number, s: number): void {
  drawLine(x - 9 * s, y, x, y - 5 * s, 40, 24, 44, 0.9);
  drawLine(x, y - 5 * s, x + 9 * s, y, 40, 24, 44, 0.9);
}
function pine(x: number, baseY: number, s: number): void {
  fillPoly(
    [
      [x, baseY - 26 * s],
      [x - 9 * s, baseY],
      [x + 9 * s, baseY],
    ],
    52, 84, 62, 1,
  );
  fillRect(x - 1.5, baseY, x + 1.5, baseY + 5 * s, 70, 48, 40, 1);
}

// ---------------- 5x7 bitmap font ----------------
const FONT: Record<string, number[]> = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  "0": [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  "1": [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  "2": [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
  "3": [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  "4": [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  "5": [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  "6": [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  "7": [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  "8": [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  "9": [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  " ": [0, 0, 0, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 0x0c, 0x0c],
  "-": [0, 0, 0, 0x0e, 0, 0, 0],
  "\u2022": [0, 0x04, 0x0e, 0x0e, 0x0e, 0x04, 0],
  "!": [0x04, 0x04, 0x04, 0x04, 0x04, 0, 0x04],
  "'": [0x04, 0x04, 0x08, 0, 0, 0, 0],
  "/": [0x01, 0x02, 0x02, 0x04, 0x08, 0x08, 0x10],
};
function textWidth(s: string, scale: number): number {
  return s.length * 6 * scale - scale;
}
function drawText(s: string, cx: number, y: number, scale: number, r: number, g: number, b: number, a: number): void {
  const w = textWidth(s, scale);
  let x = Math.round(cx - w / 2);
  for (const ch of s.toUpperCase()) {
    const glyph = FONT[ch] ?? FONT[" "];
    for (let row = 0; row < 7; row++) {
      const bits = glyph[row];
      for (let col = 0; col < 5; col++) {
        if (bits & (0x10 >> col)) {
          fillRect(x + col * scale, y + row * scale, x + (col + 1) * scale - 1, y + (row + 1) * scale - 1, r, g, b, a);
        }
      }
    }
    x += 6 * scale;
  }
}
function drawTextShadowed(s: string, cx: number, y: number, scale: number): void {
  drawText(s, cx + 2, y + 2, scale, 30, 16, 40, 0.85);
  drawText(s, cx, y, scale, 255, 233, 196, 1);
}
function diamond(cx: number, cy: number, s: number, r: number, g: number, b: number, a: number): void {
  fillPoly(
    [
      [cx, cy - s],
      [cx + s, cy],
      [cx, cy + s],
      [cx - s, cy],
    ],
    r,
    g,
    b,
    a,
  );
}

// ---------------- PNG encode ----------------
const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, "ascii");
  data.copy(out, 8);
  const crc = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
  out.writeUInt32BE(crc, 8 + data.length);
  return out;
}
function encodePng(): Buffer {
  const stride = W * 3;
  const rows: Buffer[] = [];
  const prev = Buffer.alloc(stride);
  for (let y = 0; y < H; y++) {
    const raw = Buffer.from(img.buffer, y * stride, stride);
    // candidate filters: 0 none, 1 sub, 2 up, 3 avg, 4 paeth
    let best: Buffer | null = null;
    let bestScore = Infinity;
    for (let f = 0; f <= 4; f++) {
      const out = Buffer.alloc(stride + 1);
      out[0] = f;
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const v = raw[i];
        const left = i >= 3 ? raw[i - 3] : 0;
        const up = prev[i];
        const upLeft = i >= 3 ? prev[i - 3] : 0;
        let pred = 0;
        if (f === 1) pred = left;
        else if (f === 2) pred = up;
        else if (f === 3) pred = (left + up) >> 1;
        else if (f === 4) {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          pred = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        }
        const d = (v - pred) & 0xff;
        out[i + 1] = d;
        score += d < 128 ? d : 256 - d;
      }
      if (score < bestScore) {
        bestScore = score;
        best = out;
      }
    }
    rows.push(best as Buffer);
    raw.copy(prev);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = zlib.deflateSync(Buffer.concat(rows), { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------- compose ----------------
function compose(): void {
  renderBase();
  // billowing cloud puffs in the sea
  for (let k = 0; k < 16; k++) {
    const px = 40 + hash2(k * 3 + 1, 21) * 944;
    const py = 640 + hash2(k * 3 + 2, 22) * 190;
    const pr = 60 + hash2(k * 3 + 3, 23) * 120;
    fillEllipse(px, py, pr, pr * 0.32, 255, 224, 186, 0.28);
    fillEllipse(px, py - 6, pr * 0.6, pr * 0.22, 255, 238, 214, 0.3);
  }
  // god rays from the sun
  beam(SUN_X, SUN_Y, 560, 760, 46, 0.1);
  beam(SUN_X, SUN_Y, 700, 720, 30, 0.08);
  beam(SUN_X, SUN_Y, 430, 780, 26, 0.07);
  beam(SUN_X, SUN_Y, 830, 640, 22, 0.06);
  // ringed planet upper right
  ringedPlanet(798, 196, 76);
  // far faint isles
  fillPoly(
    [
      [300, 268],
      [330, 256],
      [430, 256],
      [458, 268],
      [420, 300],
      [392, 318],
      [368, 300],
      [330, 292],
    ],
    120,
    74,
    112,
    0.5,
  );
  fillPoly(
    [
      [640, 252],
      [668, 242],
      [742, 242],
      [768, 252],
      [736, 282],
      [712, 298],
      [690, 282],
      [664, 274],
    ],
    120,
    74,
    112,
    0.45,
  );
  // side isles
  island(168, 296, 92, 120, 0.62, 0);
  tower(150, 296, 16, 52, true);
  tower(186, 296, 12, 34, false);
  waterfall(92, 302, 420, 7);
  island(862, 316, 78, 104, 0.55, 0);
  tower(846, 316, 14, 44, false);
  tower(876, 316, 11, 30, true);
  waterfall(928, 322, 424, 6);
  // airships
  airship(694, 246, 0.9);
  airship(238, 178, 0.52);
  // hero island: the floating city
  island(512, 380, 258, 268, 1, 1);
  tower(330, 380, 26, 118, true);
  tower(392, 380, 20, 84, false);
  tower(452, 380, 30, 138, true);
  tower(540, 380, 22, 96, false);
  tower(606, 380, 26, 122, true);
  tower(668, 380, 18, 66, false);
  // beacon on the tallest spire
  fillEllipse(467, 380 - 138 - 22, 5, 5, 255, 240, 190, 1);
  fillEllipse(467, 380 - 138 - 22, 12, 12, 255, 226, 150, 0.35);
  // pines along the plateau
  pine(300, 380, 0.9);
  pine(716, 380, 0.8);
  pine(580, 380, 0.7);
  pine(420, 380, 0.75);
  // waterfalls off the hero isle
  waterfall(268, 388, 648, 12);
  waterfall(756, 388, 640, 11);
  // birds
  bird(620, 300, 1);
  bird(660, 322, 0.8);
  bird(360, 260, 0.9);
  bird(420, 300, 0.7);
  bird(760, 350, 0.8);
  // vignette
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x - W / 2) / (W / 2);
      const dy = (y - H / 2) / (H / 2);
      const r = Math.sqrt(dx * dx + dy * dy);
      const v = 1 - 0.2 * sstep(0.62, 1.05, r);
      if (v < 1) {
        const i = (y * W + x) * 3;
        img[i] = img[i] * v;
        img[i + 1] = img[i + 1] * v;
        img[i + 2] = img[i + 2] * v;
      }
    }
  }
  // ---- title ribbon ----
  for (let y = 852; y < H; y++) {
    const a = sstep(852, 940, y) * 0.62;
    for (let x = 0; x < W; x++) blend(x, y, 26, 14, 42, a);
  }
  drawLine(0, 852, W, 852, 242, 185, 92, 0.0);
  // tagline
  const tagY = 872;
  diamond(512 - textWidth("VISIT THE IMPOSSIBLE", 4) / 2 - 26, tagY + 14, 6, 242, 185, 92, 1);
  diamond(512 + textWidth("VISIT THE IMPOSSIBLE", 4) / 2 + 26, tagY + 14, 6, 242, 185, 92, 1);
  drawText("VISIT THE IMPOSSIBLE", 512, tagY, 4, 242, 185, 92, 1);
  drawLine(512 - 330, tagY + 14, 512 - textWidth("VISIT THE IMPOSSIBLE", 4) / 2 - 44, tagY + 14, 242, 185, 92, 0.7);
  drawLine(512 + textWidth("VISIT THE IMPOSSIBLE", 4) / 2 + 44, tagY + 14, 512 + 330, tagY + 14, 242, 185, 92, 0.7);
  // title
  drawTextShadowed("AURELIA", 512, 906, 12);
  // bottom line
  drawText("WHERE THE SKY FALLS UPWARD", 512, 1000, 3, 255, 233, 196, 0.95);
}

// ---------------- main ----------------
function main(): void {
  const outDir = process.env.OUTPUT_DIR || "/output";
  fs.mkdirSync(outDir, { recursive: true });
  compose();
  const png = encodePng();
  const outPath = path.join(outDir, "entry.png");
  fs.writeFileSync(outPath, png);
  fs.chmodSync(outPath, 0o644);
  const sha = crypto.createHash("sha256").update(png).digest("hex");
  console.log(`WROTE ${outPath} bytes=${png.length} sha256=${sha}`);
  if (png.length > 1048576) {
    console.error("ERROR: entry.png exceeds 1,048,576 bytes");
    process.exitCode = 1;
  }
}

main();
