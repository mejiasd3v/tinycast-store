/**
 * Draws assets/icon.png (512x512): a rounded square with a diagonal gradient and a
 * "download into a tray" glyph. Dependency-free; run `node scripts/make-icon.mjs`.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SIZE = 512;
const SUPERSAMPLE = 3; // samples per axis, for smooth edges
const TOP = [124, 92, 255];
const BOTTOM = [37, 99, 235];
const WHITE = [255, 255, 255];
const STROKE = 22;

/** Signed distance to a rounded box centred on the origin. Negative inside. */
function roundedBox(x, y, half, radius) {
  const dx = Math.abs(x) - (half - radius);
  const dy = Math.abs(y) - (half - radius);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - radius;
}

/** Distance from a point to a line segment. */
function segment(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

/** Signed distance to the glyph: a down arrow above an open tray. */
function glyph(x, y) {
  const c = SIZE / 2;
  const arrow = Math.min(
    segment(x, y, c, 120, c, 300),
    segment(x, y, c - 80, 220, c, 300),
    segment(x, y, c + 80, 220, c, 300),
  );
  const tray = Math.min(
    segment(x, y, c - 130, 340, c - 130, 392),
    segment(x, y, c - 130, 392, c + 130, 392),
    segment(x, y, c + 130, 392, c + 130, 340),
  );
  return Math.min(arrow, tray) - STROKE;
}

const stride = SIZE * 4 + 1;
const raw = Buffer.alloc(stride * SIZE); // each row starts with filter byte 0 (none)
for (let py = 0; py < SIZE; py++) {
  for (let px = 0; px < SIZE; px++) {
    const sum = [0, 0, 0];
    let covered = 0;
    for (let sy = 0; sy < SUPERSAMPLE; sy++) {
      for (let sx = 0; sx < SUPERSAMPLE; sx++) {
        const x = px + (sx + 0.5) / SUPERSAMPLE;
        const y = py + (sy + 0.5) / SUPERSAMPLE;
        if (roundedBox(x - SIZE / 2, y - SIZE / 2, SIZE / 2, 112) > 0) continue;
        const t = (x + y) / (2 * SIZE);
        const colour = glyph(x, y) <= 0 ? WHITE : TOP.map((v, i) => v + (BOTTOM[i] - v) * t);
        colour.forEach((v, i) => (sum[i] += v));
        covered++;
      }
    }
    const offset = py * stride + 1 + px * 4;
    if (covered > 0) sum.forEach((v, i) => (raw[offset + i] = Math.round(v / covered)));
    raw[offset + 3] = Math.round((covered / SUPERSAMPLE ** 2) * 255);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/icon.png");
writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
