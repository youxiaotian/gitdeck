"use strict";

// @module make-icon
// 零依赖生成 GitDeck 应用图标：手写 PNG 编码（zlib + CRC32）+ ICO 容器。
// 输出：assets/gitdeck.ico（多尺寸）与 public/favicon.png（256px）。
// 运行：node tools/make-icon.js

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const ROOT = path.resolve(__dirname, "..");

// ---------- 配色（与 public/styles.css 设计 token 同源） ----------
const BG = [0x16, 0x24, 0x1f]; // --nav 深绿底
const GLYPH = [0x3f, 0xbf, 0x8a]; // 亮绿（在深底上保持对比）
const ACCENT = [0xf3, 0xf1, 0xeb]; // --canvas 米白

// ---------- 几何（256 设计坐标系） ----------
const RADIUS = 58;
const NODE_R = 23;
const RING_GAP = 7;
const LINE_W = 15;

// 主干：x=96，从顶部节点到分叉节点
const TRUNK = { x1: 96, y1: 64, x2: 96, y2: 176 };
// 节点：主干上端、主干下端（分叉点）、右上分支
const NODE_MAIN_TOP = { x: 96, y: 64, color: GLYPH };
const NODE_FORK = { x: 96, y: 176, color: GLYPH };
const NODE_BRANCH = { x: 172, y: 72, color: ACCENT };
// 分支弧：以 (172,176) 为圆心、半径 80 的四分之一圆，从 (96,176) 到 (172,96)
const ARC_CENTER = { x: 172, y: 176 };
const ARC_R = 80;
const ARC_SAMPLES = 96;

function arcPolyline() {
  const points = [];
  for (let i = 0; i <= ARC_SAMPLES; i += 1) {
    const angle = Math.PI + (Math.PI / 2) * (i / ARC_SAMPLES); // 180° -> 270°
    points.push({
      x: ARC_CENTER.x + ARC_R * Math.cos(angle),
      y: ARC_CENTER.y + ARC_R * Math.sin(angle)
    });
  }
  return points;
}

const ARC_POINTS = arcPolyline();

// ---------- SDF 工具 ----------
function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

// coverage：>0 在内部；抗锯齿宽度 1px
function roundedRectSdf(px, py, half, radius) {
  const qx = Math.abs(px) - (half - radius);
  const qy = Math.abs(py) - (half - radius);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - radius;
}

function segmentSdf(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : clamp01(((px - x1) * dx + (py - y1) * dy) / lengthSquared);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function polylineSdf(px, py, points) {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const d = segmentSdf(px, py, a.x, a.y, b.x, b.y);
    if (d < best) {
      best = d;
    }
  }
  return best;
}

function circleSdf(px, py, cx, cy, r) {
  return Math.hypot(px - cx, py - cy) - r;
}

function blend(pixel, color, coverage) {
  if (coverage <= 0) {
    return;
  }
  const a = clamp01(coverage);
  pixel[0] = pixel[0] * (1 - a) + color[0] * a;
  pixel[1] = pixel[1] * (1 - a) + color[1] * a;
  pixel[2] = pixel[2] * (1 - a) + color[2] * a;
  pixel[3] = pixel[3] * (1 - a) + 255 * a;
}

// ---------- 渲染 ----------
// 所有几何在 256 设计坐标系中定义；SDF 距离乘 scale 换算为屏幕像素，实现各尺寸一致的抗锯齿。
function renderIcon(size) {
  const scale = size / 256;
  const half = size / 2;
  const data = Buffer.alloc(size * size * 4, 0);
  const lineWidth = (LINE_W / 2) * scale;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5 - half; // 屏幕坐标（中心为原点）
      const py = y + 0.5 - half;
      const ux = px / scale + 128; // 设计坐标
      const uy = py / scale + 128;

      const offset = (y * size + x) * 4;
      const write = (color, coverage) => {
        const a = clamp01(coverage);
        if (a <= 0) {
          return;
        }
        for (let c = 0; c < 3; c += 1) {
          data[offset + c] = Math.round(
            data[offset + c] * (1 - a) + color[c] * a
          );
        }
        data[offset + 3] = Math.round(data[offset + 3] * (1 - a) + 255 * a);
      };

      // 1. 圆角深底
      const bg = roundedRectSdf(px, py, half - 0.5, RADIUS * scale);
      write(BG, 0.5 - bg);
      if (0.5 - bg <= 0) {
        continue;
      }

      // 2. 主干与分支弧（绿色线条）
      const trunk = segmentSdf(ux, uy, TRUNK.x1, TRUNK.y1, TRUNK.x2, TRUNK.y2);
      const arc = polylineSdf(ux, uy, ARC_POINTS);
      write(GLYPH, 0.5 - (Math.min(trunk, arc) * scale - lineWidth));

      // 3. 节点底色环（把线条从节点处隔开）
      for (const node of [NODE_MAIN_TOP, NODE_FORK, NODE_BRANCH]) {
        const ring = circleSdf(ux, uy, node.x, node.y, NODE_R + RING_GAP);
        write(BG, 0.5 - (Math.abs(ring * scale) - (RING_GAP / 2) * scale));
      }

      // 4. 节点本体
      for (const node of [NODE_MAIN_TOP, NODE_FORK, NODE_BRANCH]) {
        const disc = circleSdf(ux, uy, node.x, node.y, NODE_R);
        write(node.color, 0.5 - disc * scale);
      }
    }
  }

  return data;
}

// ---------- PNG 编码 ----------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(
      raw,
      y * (size * 4 + 1) + 1,
      y * size * 4,
      (y + 1) * size * 4
    );
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

// ---------- ICO 容器 ----------
function encodeIco(pngs) {
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const directory = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  pngs.forEach((entry, index) => {
    const base = index * 16;
    directory[base] = entry.size === 256 ? 0 : entry.size;
    directory[base + 1] = entry.size === 256 ? 0 : entry.size;
    directory[base + 2] = 0; // palette
    directory[base + 3] = 0; // reserved
    directory.writeUInt16LE(1, base + 4); // planes
    directory.writeUInt16LE(32, base + 6); // bpp
    directory.writeUInt32LE(entry.png.length, base + 8);
    directory.writeUInt32LE(offset, base + 12);
    offset += entry.png.length;
  });

  return Buffer.concat([
    header,
    directory,
    ...pngs.map((entry) => entry.png)
  ]);
}

// ---------- 主流程 ----------
const SIZES = [16, 24, 32, 48, 64, 128, 256];

fs.mkdirSync(path.join(ROOT, "assets"), { recursive: true });
const entries = SIZES.map((size) => {
  const png = encodePng(size, renderIcon(size));
  console.log(`rendered ${size}x${size} -> ${png.length} bytes`);
  return { size, png };
});

const icoPath = path.join(ROOT, "assets", "gitdeck.ico");
fs.writeFileSync(icoPath, encodeIco(entries));

const faviconPath = path.join(ROOT, "public", "favicon.png");
fs.writeFileSync(
  faviconPath,
  entries.find((entry) => entry.size === 256).png
);

console.log(`written: ${icoPath}`);
console.log(`written: ${faviconPath}`);
