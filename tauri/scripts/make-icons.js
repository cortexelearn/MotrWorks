/* =====================================================================
   make-icons.js — regenerates tauri/src-tauri/icons/* from scratch.

   Deliberately dependency-free: draws the MotrWorks mark into a raw RGBA
   buffer and encodes PNG (zlib, both built into node) and ICO by hand.
   Run it only when the mark changes; the icons it produces are committed.

     node tauri/scripts/make-icons.js

   The mark is a stator lamination cross-section — the drawing the app
   renders all day — in the app's own palette: slate #0F172A field (DKINK),
   white stator yoke and teeth, amber #FCD34D rotor (the header's brand
   accent). Nine teeth, the classic 9-slot BLDC count from the presets.
   ===================================================================== */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SLATE = [0x0f, 0x17, 0x2a];
const SLATE_HI = [0x1e, 0x29, 0x3b];
const WHITE = [0xff, 0xff, 0xff];
const AMBER = [0xfc, 0xd3, 0x4d];

const OUT = path.join(__dirname, "..", "src-tauri", "icons");
const SS = 4; // supersample factor — draw big, box-filter down

/* ---------- drawing: radial lamination geometry, supersampled ---------- */
const TEETH = 9;
// radii as fractions of the icon edge, measured from centre
const YOKE_OUT = 0.385, YOKE_IN = 0.3, TOOTH_IN = 0.18, ROTOR = 0.148, SHAFT = 0.052;
const TOOTH_FRAC = 0.55; // angular fraction of each pitch that is tooth, not slot

function render(size) {
  const n = size * SS;
  const px = Buffer.alloc(n * n * 4, 0);
  const put = (x, y, c) => {
    const i = (y * n + x) * 4;
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
  };

  const R = n * 0.16; // corner radius of the slate field
  const inField = (x, y) => {
    const dx = Math.min(x, n - 1 - x), dy = Math.min(y, n - 1 - y);
    if (dx >= R || dy >= R) return true;
    const cx = dx < R ? R : dx, cy = dy < R ? R : dy;
    return (cx - dx) ** 2 + (cy - dy) ** 2 <= R * R;
  };

  const cc = (n - 1) / 2;
  for (let y = 0; y < n; y++) {
    // slate field with a soft vertical lift so the mark is not flat
    const t = y / (n - 1);
    const field = [0, 1, 2].map(k => Math.round(SLATE_HI[k] * (1 - t) + SLATE[k] * t));
    for (let x = 0; x < n; x++) {
      if (!inField(x, y)) continue;
      const dx = x - cc, dy = y - cc;
      const r = Math.hypot(dx, dy) / n;
      let c = field;
      if (r < SHAFT) c = field;                       // shaft bore — field shows through
      else if (r < ROTOR) c = AMBER;                  // rotor
      else if (r < TOOTH_IN) c = field;               // air gap
      else if (r < YOKE_IN) {                         // teeth / slots
        const a = Math.atan2(dy, dx) / (2 * Math.PI) * TEETH;
        const f = a - Math.floor(a);                  // position within one pitch, 0..1
        const inTooth = f < TOOTH_FRAC / 2 || f > 1 - TOOTH_FRAC / 2;
        c = inTooth ? WHITE : field;
      } else if (r < YOKE_OUT) c = WHITE;             // yoke ring
      put(x, y, c);
    }
  }

  return box(px, n, size);
}

/* box-filter n×n RGBA down to size×size */
function box(px, n, size) {
  const out = Buffer.alloc(size * size * 4);
  const f = n / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0, c = 0;
      for (let sy = y * f; sy < (y + 1) * f; sy++) {
        for (let sx = x * f; sx < (x + 1) * f; sx++) {
          const i = (sy * n + sx) * 4, al = px[i + 3] / 255;
          r += px[i] * al; g += px[i + 1] * al; b += px[i + 2] * al; a += al; c++;
        }
      }
      const o = (y * size + x) * 4;
      out[o] = a ? Math.round(r / a) : 0;
      out[o + 1] = a ? Math.round(g / a) : 0;
      out[o + 2] = a ? Math.round(b / a) : 0;
      out[o + 3] = Math.round((a / c) * 255);
    }
  }
  return out;
}

/* ---------- PNG ---------- */
function crc32(buf) {
  let c, t = [];
  for (let k = 0; k < 256; k++) {
    c = k;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[k] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = t[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(rgba, size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------- ICO ----------
   Classic BGRA DIB entries (bottom-up) plus the AND mask. Every consumer
   from Explorer to the Rust `ico` crate that tauri-build links through
   reads this form; PNG-in-ICO entries are the ones that trip older paths. */
function icoEntry(rgba, size) {
  const rowMask = Math.ceil(size / 32) * 4; // AND mask rows are dword-aligned
  const dib = Buffer.alloc(40 + size * size * 4 + rowMask * size);
  dib.writeUInt32LE(40, 0);
  dib.writeInt32LE(size, 4);
  dib.writeInt32LE(size * 2, 8); // height doubled: XOR + AND
  dib.writeUInt16LE(1, 12);
  dib.writeUInt16LE(32, 14);
  dib.writeUInt32LE(0, 16);
  dib.writeUInt32LE(size * size * 4, 20);
  for (let y = 0; y < size; y++) {
    const src = (size - 1 - y) * size * 4;
    for (let x = 0; x < size; x++) {
      const o = 40 + (y * size + x) * 4, i = src + x * 4;
      dib[o] = rgba[i + 2]; dib[o + 1] = rgba[i + 1]; dib[o + 2] = rgba[i]; dib[o + 3] = rgba[i + 3];
    }
  }
  return dib;
}
function ico(sizes, buffers) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
  const dirs = [], datas = [];
  let offset = 6 + sizes.length * 16;
  sizes.forEach((s, i) => {
    const data = icoEntry(buffers[i], s);
    const d = Buffer.alloc(16);
    d[0] = s >= 256 ? 0 : s; d[1] = s >= 256 ? 0 : s;
    d[2] = 0; d[3] = 0;
    d.writeUInt16LE(1, 4); d.writeUInt16LE(32, 6);
    d.writeUInt32LE(data.length, 8); d.writeUInt32LE(offset, 12);
    offset += data.length;
    dirs.push(d); datas.push(data);
  });
  return Buffer.concat([head, ...dirs, ...datas]);
}

/* ---------- emit ---------- */
fs.mkdirSync(OUT, { recursive: true });
const cache = new Map();
const at = s => { if (!cache.has(s)) cache.set(s, render(s)); return cache.get(s); };

const pngs = {
  "32x32.png": 32,
  "128x128.png": 128,
  "128x128@2x.png": 256,
  "icon.png": 512,
  "Square30x30Logo.png": 30,
  "Square44x44Logo.png": 44,
  "Square71x71Logo.png": 71,
  "Square89x89Logo.png": 89,
  "Square107x107Logo.png": 107,
  "Square142x142Logo.png": 142,
  "Square150x150Logo.png": 150,
  "Square284x284Logo.png": 284,
  "Square310x310Logo.png": 310,
  "StoreLogo.png": 50,
};
for (const [name, size] of Object.entries(pngs)) {
  fs.writeFileSync(path.join(OUT, name), png(at(size), size));
  console.log("  wrote", name, `(${size}px)`);
}
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
fs.writeFileSync(path.join(OUT, "icon.ico"), ico(icoSizes, icoSizes.map(at)));
console.log("  wrote icon.ico", `(${icoSizes.join(", ")})`);
