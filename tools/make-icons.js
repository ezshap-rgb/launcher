/* Generates the launcher's PWA icons — no dependencies, pure Node (fs + zlib).
 * Run once: node tools/make-icons.js   (outputs land in icons/) */
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// ---------- Minimal PNG encoder (RGBA, 8-bit, filter 0) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- Icon design (drawn in a 512-unit design space) ----------
// A 2x2 grid of rounded app tiles on the brand-blue gradient; the
// bottom-right tile is an outlined "empty slot" — room for your next app.
const BLUE = [26, 115, 232];
const BLUE_DARK = [21, 87, 176];
const WHITE = [255, 255, 255];

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

const TILE = 132; // tile edge in design units
const RADIUS = 30;
const RING = 16;  // outline thickness of the empty slot

/** Render one icon. contentScale < 1 shrinks artwork toward the center
 *  (used for the maskable icon's safe zone). */
function renderIcon(size, contentScale) {
  const SS = 3; // 3x3 supersampling for smooth edges
  const rgba = Buffer.alloc(size * size * 4);
  const inv = 512 / size / contentScale;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const sampleX = x + (sx + 0.5) / SS;
          const sampleY = y + (sy + 0.5) / SS;
          const dx = 256 + (sampleX - size / 2) * inv;
          const dy = 256 + (sampleY - size / 2) * inv;

          // Background: subtle vertical gradient on the brand blue.
          const t = sampleY / size;
          let cr = lerp(BLUE[0], BLUE_DARK[0], t);
          let cg = lerp(BLUE[1], BLUE_DARK[1], t);
          let cb = lerp(BLUE[2], BLUE_DARK[2], t);

          // 2x2 tile grid.
          const tiles = [
            [110, 110, true],
            [270, 110, true],
            [110, 270, true],
            [270, 270, false],
          ];
          for (const [tx, ty, filled] of tiles) {
            const x1 = tx + TILE;
            const y1 = ty + TILE;
            if (!filled) {
              // Empty slot: outline only (outer minus inner rounded rect).
              const outer = inRoundRect(dx, dy, tx, ty, x1, y1, RADIUS);
              const inner = inRoundRect(
                dx, dy, tx + RING, ty + RING, x1 - RING, y1 - RING, RADIUS - RING - 4
              );
              if (outer && !inner) {
                cr = WHITE[0];
                cg = WHITE[1];
                cb = WHITE[2];
              }
            } else if (inRoundRect(dx, dy, tx, ty, x1, y1, RADIUS)) {
              cr = WHITE[0];
              cg = WHITE[1];
              cb = WHITE[2];
            }
          }

          r += cr;
          g += cg;
          b += cb;
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r / n);
      rgba[i + 1] = Math.round(g / n);
      rgba[i + 2] = Math.round(b / n);
      rgba[i + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
}

const outDir = path.join(__dirname, "..", "icons");
fs.mkdirSync(outDir, { recursive: true });

const jobs = [
  ["icon-192.png", 192, 1],
  ["icon-512.png", 512, 1],
  ["icon-maskable-512.png", 512, 0.78],
  ["apple-touch-icon.png", 180, 1],
];

for (const [name, size, scale] of jobs) {
  const png = renderIcon(size, scale);
  fs.writeFileSync(path.join(outDir, name), png);
  console.log(`wrote icons/${name} (${png.length} bytes)`);
}
