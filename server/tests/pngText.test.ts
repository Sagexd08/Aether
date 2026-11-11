import { describe, expect, it } from 'vitest';
import { crc32 } from 'zlib';
import { addPngText, readPngText } from '../src/utils/pngText.js';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

describe('pngText', () => {
  it('embeds a tEXt chunk that reads back', () => {
    const out = addPngText(TINY_PNG, 'Provenance', '{"generator":"Aether AI T2I"}');
    expect(readPngText(out)).toEqual({ Provenance: '{"generator":"Aether AI T2I"}' });
    expect(out.subarray(out.length - 12).toString('latin1')).toContain('IEND');
    expect(out.length).toBeGreaterThan(TINY_PNG.length);
  });

  it('writes a valid chunk CRC', () => {
    const out = addPngText(TINY_PNG, 'K', 'v');
    const start = 33;
    const length = out.readUInt32BE(start);
    const body = out.subarray(start + 4, start + 8 + length);
    expect(out.readUInt32BE(start + 8 + length)).toBe(crc32(body));
  });

  it('replaces non-ascii characters and ignores non-PNG input', () => {
    expect(readPngText(addPngText(TINY_PNG, 'K', 'é'))).toEqual({ K: '?' });
    const junk = Buffer.from('not a png');
    expect(addPngText(junk, 'K', 'v')).toBe(junk);
  });
});
