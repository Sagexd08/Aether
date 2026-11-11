const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IHDR_END = 8 + 4 + 4 + 13 + 4;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function textChunk(keyword: string, text: string): Buffer {
  const body = Buffer.concat([Buffer.from('tEXt'), Buffer.from(keyword, 'latin1'), Buffer.from([0]), Buffer.from(text, 'latin1')]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length - 4);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

export function addPngText(png: Buffer, keyword: string, text: string): Buffer {
  if (png.length < IHDR_END || !png.subarray(0, 8).equals(PNG_SIGNATURE)) return png;
  const latin1Safe = text.replace(/[^\x20-\x7e]/g, '?');
  return Buffer.concat([png.subarray(0, IHDR_END), textChunk(keyword, latin1Safe), png.subarray(IHDR_END)]);
}

export function readPngText(png: Buffer): Record<string, string> {
  const found: Record<string, string> = {};
  let offset = 8;
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('latin1', offset + 4, offset + 8);
    if (type === 'tEXt') {
      const data = png.toString('latin1', offset + 8, offset + 8 + length);
      const split = data.indexOf('\0');
      found[data.slice(0, split)] = data.slice(split + 1);
    }
    offset += 12 + length;
  }
  return found;
}
