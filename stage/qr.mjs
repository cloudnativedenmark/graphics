/**
 * A QR encoder for the wall's own links (the photographers' gallery), so a
 * link in the stage file is enough and nobody has to export a PNG for it.
 *
 *   qrRows("https://…")   → ["1111111010…", …], 1 = dark, no quiet zone
 *
 * Byte mode, error correction level M, versions 1–6 (up to 106 bytes), which
 * covers any short link. Follows ISO/IEC 18004 and Project Nayuki's reference
 * implementation. Its output is checked by decoding it in Chrome.
 */

// Per version at level M: [data codewords per block, number of blocks, EC codewords per block].
// Versions 1–6 have equal blocks.
const BLOCKS = [null, [16, 1, 10], [28, 1, 16], [44, 1, 26], [32, 2, 18], [43, 2, 24], [27, 4, 16]];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]];

function mul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

/** Reed–Solomon EC codewords for one block. */
function ecFor(data, degree) {
  const div = new Array(degree).fill(0);
  div[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      div[j] = mul(div[j], root);
      if (j + 1 < degree) div[j] ^= div[j + 1];
    }
    root = mul(root, 2);
  }
  const out = new Array(degree).fill(0);
  for (const b of data) {
    const f = b ^ out.shift();
    out.push(0);
    for (let i = 0; i < degree; i++) out[i] ^= mul(div[i], f);
  }
  return out;
}

/** Mode, length, data, terminator and padding, split into blocks and interleaved. */
function codewords(bytes, version) {
  const [perBlock, blocks, ec] = BLOCKS[version];
  const cap = perBlock * blocks;
  const bits = [];
  const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(0b0100, 4);
  put(bytes.length, 8);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, cap * 8 - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let pad = 0xec; data.length < cap; pad ^= 0xec ^ 0x11) data.push(pad);
  const split = Array.from({ length: blocks }, (_, b) => data.slice(b * perBlock, (b + 1) * perBlock));
  const ecs = split.map((d) => ecFor(d, ec));
  const out = [];
  for (let i = 0; i < perBlock; i++) for (const d of split) out.push(d[i]);
  for (let i = 0; i < ec; i++) for (const e of ecs) out.push(e[i]);
  return out;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** The fixed parts and the data, before masking; `fixed` marks what the mask skips. */
function base(version, words) {
  const n = 17 + 4 * version;
  const m = Array.from({ length: n }, () => new Array(n).fill(false));
  const fixed = Array.from({ length: n }, () => new Array(n).fill(false));
  const set = (x, y, v) => { m[y][x] = v; fixed[y][x] = true; };
  for (let i = 0; i < n; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]])
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < n && y >= 0 && y < n) set(x, y, d !== 2 && d !== 4);
      }
  const al = ALIGN[version];
  for (const ay of al)
    for (const ax of al) {
      if ((ax === 6 && ay === 6) || (ax === 6 && ay === al.at(-1)) || (ax === al.at(-1) && ay === 6)) continue;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  format(m, fixed, 0);
  let i = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? n - 1 - vert : vert;
        if (!fixed[y][x] && i < words.length * 8) {
          m[y][x] = ((words[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
          i++;
        }
      }
  }
  return { m, fixed };
}

/** Both copies of the format bits (level M, the mask), and the dark module. */
function format(m, fixed, mask) {
  const n = m.length;
  const data = (0b00 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const bit = (i) => ((bits >>> i) & 1) === 1;
  const set = (x, y, v) => { m[y][x] = v; fixed[y][x] = true; };
  for (let i = 0; i <= 5; i++) set(8, i, bit(i));
  set(8, 7, bit(6));
  set(8, 8, bit(7));
  set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) set(n - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) set(8, n - 15 + i, bit(i));
  set(8, n - 8, true);
}

/** The standard's penalty score; the lowest-scoring mask is used. */
function penalty(m) {
  const n = m.length;
  let p = 0;
  const lines = [...m, ...m[0].map((_, x) => m.map((row) => row[x]))];
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && line[i] === line[i - 1]) run++;
      else { if (run >= 5) p += run - 2; run = 1; }
    }
    const s = line.map((v) => (v ? "1" : "0")).join("");
    for (const pat of ["10111010000", "00001011101"]) for (let i = s.indexOf(pat); i >= 0; i = s.indexOf(pat, i + 1)) p += 40;
  }
  for (let y = 0; y < n - 1; y++)
    for (let x = 0; x < n - 1; x++) {
      const v = m[y][x];
      if (m[y][x + 1] === v && m[y + 1][x] === v && m[y + 1][x + 1] === v) p += 3;
    }
  const dark = m.flat().filter(Boolean).length;
  p += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
  return p;
}

export function qrRows(text) {
  const bytes = [...new TextEncoder().encode(text)];
  const version = BLOCKS.findIndex((b) => b && b[0] * b[1] * 8 >= 12 + bytes.length * 8);
  if (version < 0) throw new Error(`QR: ${bytes.length} bytes is too long for versions 1–6`);
  const words = codewords(bytes, version);
  let best;
  for (let mask = 0; mask < 8; mask++) {
    const { m, fixed } = base(version, words);
    for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) if (!fixed[y][x] && MASKS[mask](x, y)) m[y][x] = !m[y][x];
    format(m, fixed, mask);
    const score = penalty(m);
    if (!best || score < best.score) best = { m, score };
  }
  return best.m.map((row) => row.map((v) => (v ? "1" : "0")).join(""));
}
