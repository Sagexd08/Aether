import { describe, expect, it } from 'vitest';
import {
  enhanceSchema,
  generateSchema,
  idParamSchema,
  loginSchema,
  pageQuerySchema,
  preferencesSchema,
  registerSchema,
  upscaleSchema,
} from '../src/middleware/validate.js';

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) => schema.safeParse(value).success;

describe('generateSchema', () => {
  const base = { positive_prompt: 'a bird' };

  it('applies defaults', () => {
    expect(generateSchema.parse(base)).toMatchObject({ steps: 20, cfg_scale: 3, width: 512, height: 512, model: 'sd15' });
  });

  it.each([
    [{ positive_prompt: '' }],
    [{ positive_prompt: '   ' }],
    [{ positive_prompt: 'x'.repeat(1001) }],
    [{ ...base, negative_prompt: 'x'.repeat(1001) }],
    [{ ...base, model: 'm'.repeat(65) }],
    [{ ...base, steps: 0 }],
    [{ ...base, steps: 51 }],
    [{ ...base, steps: 1.5 }],
    [{ ...base, cfg_scale: 0.5 }],
    [{ ...base, cfg_scale: 6.1 }],
    [{ ...base, seed: -1 }],
    [{ ...base, seed: 2 ** 31 }],
    [{ ...base, width: 255 }],
    [{ ...base, width: 769 }],
    [{ ...base, width: 260 }],
    [{ ...base, height: 800 }],
  ])('rejects %j', (value) => {
    expect(ok(generateSchema, value)).toBe(false);
  });

  it('accepts boundary values', () => {
    expect(ok(generateSchema, { ...base, steps: 1, cfg_scale: 1, seed: 0, width: 256, height: 768 })).toBe(true);
    expect(ok(generateSchema, { ...base, steps: 50, cfg_scale: 6, seed: 2 ** 31 - 1 })).toBe(true);
  });
});

describe('upscaleSchema', () => {
  it('requires image_url or request_id', () => {
    expect(ok(upscaleSchema, {})).toBe(false);
    expect(ok(upscaleSchema, { request_id: 'abc-123' })).toBe(true);
    expect(ok(upscaleSchema, { image_url: '/uploads/a.png' })).toBe(true);
  });

  it('bounds scale and ids', () => {
    expect(ok(upscaleSchema, { request_id: 'abc', scale: 3 })).toBe(false);
    expect(ok(upscaleSchema, { request_id: '../etc' })).toBe(false);
    expect(ok(upscaleSchema, { image_url: 'x'.repeat(301) })).toBe(false);
  });
});

describe('auth schemas', () => {
  it('normalizes email and enforces password length', () => {
    expect(registerSchema.parse({ email: ' A@B.com ', password: 'abcdefghij' }).email).toBe('a@b.com');
    expect(ok(registerSchema, { email: 'a@b.com', password: 'short' })).toBe(false);
    expect(ok(registerSchema, { email: 'nope', password: 'abcdefghij' })).toBe(false);
  });

  it('rejects passwords over 72 bytes', () => {
    expect(ok(registerSchema, { email: 'a@b.com', password: 'a'.repeat(73) })).toBe(false);
    expect(ok(loginSchema, { email: 'a@b.com', password: 'é'.repeat(37) })).toBe(false);
    expect(ok(loginSchema, { email: 'a@b.com', password: 'a'.repeat(72) })).toBe(true);
  });
});

describe('misc schemas', () => {
  it('bounds paging', () => {
    expect(pageQuerySchema.parse({})).toEqual({ limit: 10, offset: 0 });
    expect(ok(pageQuerySchema, { limit: '51' })).toBe(false);
    expect(ok(pageQuerySchema, { limit: '0' })).toBe(false);
    expect(ok(pageQuerySchema, { offset: '10001' })).toBe(false);
  });

  it('bounds enhance prompt', () => {
    expect(ok(enhanceSchema, { prompt: '' })).toBe(false);
    expect(ok(enhanceSchema, { prompt: 'x'.repeat(1001) })).toBe(false);
    expect(ok(enhanceSchema, { prompt: 'a bird', style: 's'.repeat(65) })).toBe(false);
  });

  it('is strict on preferences', () => {
    expect(ok(preferencesSchema, { ui_mode: 'simple' })).toBe(true);
    expect(ok(preferencesSchema, { admin: true })).toBe(false);
    expect(ok(preferencesSchema, { preferred_resolution: 'big' })).toBe(false);
  });

  it('restricts id params', () => {
    expect(ok(idParamSchema, { id: 'a1-b2_c3' })).toBe(true);
    expect(ok(idParamSchema, { id: 'a/b' })).toBe(false);
    expect(ok(idParamSchema, { id: 'x'.repeat(65) })).toBe(false);
  });
});
