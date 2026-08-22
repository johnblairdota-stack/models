/**
 * Minimal QR (byte mode, ECC M, versions 1–6). No dependency — the host view needs a
 * join URL as a scannable square, and this repo's gates cannot take an install.
 */

const EXP = new Uint8Array(256);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
}
const gfMul = (a, b) => (a && b ? EXP[(LOG[a] + LOG[b]) % 255] : 0);

/** [total, ec, blocks] for versions 1–6 at ECC M. */
const VER = [
  null,
  [26, 10, 1],
  [44, 16, 1],
  [70, 26, 1],
  [100, 36, 2],
  [134, 48, 2],
  [172, 64, 4],
];
const ALIGN = [null, [], [18], [22], [26], [30], [34]];

function rsGen(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j];
      next[j + 1] ^= gfMul(g[j], EXP[i]);
    }
    g = next;
  }
  return g;
}

function rsEncode(data, ec) {
  const g = rsGen(ec);
  const res = new Uint8Array(data.length + ec);
  res.set(data);
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (!coef) continue;
    for (let j = 0; j < g.length; j++) res[i + j] ^= gfMul(g[j], coef);
  }
  return res.subarray(data.length);
}

function bitsToBytes(bits) {
  const out = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | (bits[i + j] || 0);
    out.push(v);
  }
  return out;
}

function encodeData(text, version) {
  const [total, ec, blocks] = VER[version];
  const dataCw = total - ec;
  const bytes = [...new TextEncoder().encode(text)];
  const bits = [];
  const push = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); };
  push(0b0100, 4);
  push(bytes.length, 8);
  for (const b of bytes) push(b, 8);
  const cap = dataCw * 8;
  const term = Math.min(4, cap - bits.length);
  push(0, term);
  while (bits.length % 8) bits.push(0);
  const data = bitsToBytes(bits);
  const pad = [0xec, 0x11];
  let p = 0;
  while (data.length < dataCw) data.push(pad[(p++) & 1]);
  if (data.length > dataCw) return null;

  const blockLen = Math.floor(dataCw / blocks);
  const groups = [];
  let off = 0;
  const ecEach = ec / blocks;
  for (let b = 0; b < blocks; b++) {
    const slice = data.slice(off, off + blockLen);
    off += blockLen;
    groups.push({ data: slice, ec: [...rsEncode(Uint8Array.from(slice), ecEach)] });
  }
  const inter = [];
  for (let i = 0; i < blockLen; i++) for (const g of groups) inter.push(g.data[i]);
  for (let i = 0; i < ecEach; i++) for (const g of groups) inter.push(g.ec[i]);
  const outBits = [];
  for (const b of inter) for (let i = 7; i >= 0; i--) outBits.push((b >> i) & 1);
  const remain = version === 1 ? 0 : 7;
  for (let i = 0; i < remain; i++) outBits.push(0);
  return outBits;
}

function reserved(size, version) {
  const r = Array.from({ length: size }, () => new Uint8Array(size));
  const mark = (x, y, w, h) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const xx = x + i, yy = y + j;
      if (xx >= 0 && yy >= 0 && xx < size && yy < size) r[yy][xx] = 1;
    }
  };
  const finder = (x, y) => { mark(x, y, 7, 7); mark(x - 1, y - 1, 9, 9); };
  finder(0, 0); finder(size - 7, 0); finder(0, size - 7);
  mark(6, 0, 1, size); mark(0, 6, size, 1);
  for (const a of ALIGN[version]) for (const b of ALIGN[version]) {
    if ((a === 6 && b === 6) || (a === 6 && b === size - 7) || (a === size - 7 && b === 6)) continue;
    mark(a - 2, b - 2, 5, 5);
  }
  mark(0, 8, 9, 1); mark(8, 0, 1, 9);
  mark(size - 8, 8, 8, 1); mark(8, size - 8, 1, 8);
  return r;
}

function drawFinders(mod, size) {
  const paint = (ox, oy) => {
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const edge = x === 0 || x === 6 || y === 0 || y === 6;
      const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
      mod[oy + y][ox + x] = (edge || core) ? 1 : 0;
    }
  };
  paint(0, 0); paint(size - 7, 0); paint(0, size - 7);
  for (let i = 0; i < size; i++) {
    mod[6][i] = i % 2 === 0 ? 1 : 0;
    mod[i][6] = i % 2 === 0 ? 1 : 0;
  }
  for (const a of ALIGN[mod.version] || []) for (const b of ALIGN[mod.version] || []) {
    if ((a === 6 && b === 6) || (a === 6 && b === size - 7) || (a === size - 7 && b === 6)) continue;
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
      const edge = Math.abs(x) === 2 || Math.abs(y) === 2;
      mod[b + y][a + x] = (edge || (x === 0 && y === 0)) ? 1 : 0;
    }
  }
}

function maskBit(x, y, id) {
  switch (id) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return false;
  }
}

function formatBits(mask) {
  const data = (0b00 << 3) | mask; // ECC M = 00
  let d = data << 10;
  const poly = 0b10100110111;
  for (let i = 14; i >= 10; i--) if (d & (1 << i)) d ^= poly << (i - 10);
  return (data << 10 | d) ^ 0x5412;
}

function placeFormat(mod, size, mask) {
  const bits = formatBits(mask);
  const set = (x, y, b) => { mod[y][x] = b; };
  for (let i = 0; i < 8; i++) {
    const b = (bits >> i) & 1;
    set(i < 6 ? i : i + 1, 8, b);
    set(8, size - 1 - i, b);
  }
  for (let i = 0; i < 7; i++) {
    const b = (bits >> (14 - i)) & 1;
    set(8, i < 6 ? i : i + 1, b);
    set(size - 1 - i, 8, b);
  }
  set(8, size - 8, 1);
}

function penalty(mod, size) {
  let p = 0;
  for (let y = 0; y < size; y++) {
    let run = 1;
    for (let x = 1; x < size; x++) {
      if (mod[y][x] === mod[y][x - 1]) run++;
      else { if (run >= 5) p += run - 2; run = 1; }
    }
    if (run >= 5) p += run - 2;
  }
  for (let x = 0; x < size; x++) {
    let run = 1;
    for (let y = 1; y < size; y++) {
      if (mod[y][x] === mod[y - 1][x]) run++;
      else { if (run >= 5) p += run - 2; run = 1; }
    }
    if (run >= 5) p += run - 2;
  }
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
    const v = mod[y][x];
    if (v === mod[y][x + 1] && v === mod[y + 1][x] && v === mod[y + 1][x + 1]) p += 3;
  }
  let dark = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) dark += mod[y][x];
  p += Math.abs(Math.floor(100 * dark / (size * size) / 5) * 5 - 50) / 5 * 10;
  return p;
}

function build(text) {
  const raw = new TextEncoder().encode(text);
  let version = 0;
  let bits = null;
  for (let v = 1; v <= 6; v++) {
    const [total, ec] = VER[v];
    const cap = (total - ec) * 8 - 12;
    if (raw.length * 8 <= cap) { version = v; bits = encodeData(text, v); if (bits) break; }
  }
  if (!bits) throw new Error('join URL is too long for this QR');
  const size = 21 + 4 * (version - 1);
  const res = reserved(size, version);
  const base = Array.from({ length: size }, () => new Uint8Array(size));
  base.version = version;
  drawFinders(base, size);

  let k = 0;
  let up = true;
  for (let x = size - 1; x > 0; x -= 2) {
    if (x === 6) x--;
    for (let i = 0; i < size; i++) {
      const y = up ? size - 1 - i : i;
      for (const xx of [x, x - 1]) {
        if (res[y][xx] || k >= bits.length) continue;
        base[y][xx] = bits[k++];
      }
    }
    up = !up;
  }

  let best = null, bestP = Infinity, bestMask = 0;
  for (let mask = 0; mask < 8; mask++) {
    const m = Array.from({ length: size }, (_, y) => Uint8Array.from(base[y]));
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (!res[y][x] && maskBit(x, y, mask)) m[y][x] ^= 1;
    }
    placeFormat(m, size, mask);
    const p = penalty(m, size);
    if (p < bestP) { bestP = p; best = m; bestMask = mask; }
  }
  return { modules: best, size, version, mask: bestMask };
}

/** SVG string, light-on-dark so it sits on the TV card. */
export function qrSvg(text, { dim = 220 } = {}) {
  const { modules, size } = build(text);
  const quiet = 2;
  const n = size + quiet * 2;
  const cell = dim / n;
  let d = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!modules[y][x]) continue;
      d += `M${(x + quiet) * cell},${(y + quiet) * cell}h${cell}v${cell}h${-cell}z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${dim}" height="${dim}" shape-rendering="crispEdges">
    <rect width="${dim}" height="${dim}" fill="#f4f7fb"/>
    <path d="${d}" fill="#0b1016"/>
  </svg>`;
}

export function qrMatrix(text) {
  return build(text);
}
