import { deflateSync, inflateSync } from 'node:zlib';

/** Minimal PNG writer (8-bit RGBA, no interlacing), for the map preview images. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, 'ascii');
  const body = Buffer.concat([header.subarray(4), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([header.subarray(0, 4), body, crc]);
}

export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  if (rgba.length !== width * height * 4) throw new Error('encodePng: wrong pixel buffer size');
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

/**
 * Minimal PNG reader for the terrain import's elevation tiles: 8 bits per
 * channel, RGB or RGBA, no interlacing. Returns the pixels as r, g, b bytes
 * (alpha is dropped).
 */
export function decodePngRgb(file: Uint8Array): { width: number; height: number; rgb: Uint8Array } {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  if (view.getUint32(0) !== 0x89504e47) throw new Error('decodePngRgb: not a PNG file');
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const data: Uint8Array[] = [];
  while (offset < file.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...file.subarray(offset + 4, offset + 8));
    const body = file.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      const [depth, colorType, , , interlace] = body.subarray(8);
      if (depth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0)
        throw new Error('decodePngRgb: only 8-bit RGB or RGBA images without interlacing');
      channels = colorType === 2 ? 3 : 4;
    } else if (type === 'IDAT') data.push(body);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  if (raw.length !== (stride + 1) * height) throw new Error('decodePngRgb: wrong image size');
  const rgb = new Uint8Array(width * height * 3);
  const row = new Uint8Array(stride);
  const previous = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? row[i - channels] : 0;
      const up = previous[i];
      const upLeft = i >= channels ? previous[i - channels] : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      } else if (filter !== 0) throw new Error('decodePngRgb: unknown row filter');
      row[i] = (line[i] + predicted) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      rgb[(y * width + x) * 3] = row[x * channels];
      rgb[(y * width + x) * 3 + 1] = row[x * channels + 1];
      rgb[(y * width + x) * 3 + 2] = row[x * channels + 2];
    }
    previous.set(row);
  }
  return { width, height, rgb };
}
