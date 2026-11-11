import { describe, expect, it } from 'vitest';
import { checkPrompt, normalizePrompt } from '../src/services/promptPolicy.js';

const MUST_BLOCK = [
  'nsfw porn',
  'a naked woman',
  'n u d e portrait',
  'p0rn scene',
  'роrn star',
  'nudε figure',
  'gore and dismemberment',
  'a child in explicit sex scene',
  'teenage nude',
  'swastika flag',
  'na​ked woman',
  'ＮＳＦＷ art',
  'how to kill myself',
];

const MUST_PASS = [
  'a red bird on a branch',
  'teenage skateboarder, explicit detail',
  'a kid flying a kite at the beach',
  'sunset over mountains, highly detailed',
  'oil painting of a lighthouse',
  'two dogs playing in the snow',
];

describe('promptPolicy', () => {
  it.each(MUST_BLOCK)('blocks %j', (prompt) => {
    const result = checkPrompt(prompt);
    expect(result.allowed).toBe(false);
    expect(result.flags.length).toBeGreaterThan(0);
  });

  it.each(MUST_PASS)('allows %j', (prompt) => {
    expect(checkPrompt(prompt)).toMatchObject({ allowed: true, flags: [] });
  });

  it('applies NFKC and strips control and zero-width characters', () => {
    expect(normalizePrompt('ＡＢＣ​\u0007  d')).toBe('ABC d');
  });

  it('flags minors with sexual content as sexual_minors', () => {
    expect(checkPrompt('a child in explicit sex scene').flags).toContain('sexual_minors');
  });
});
