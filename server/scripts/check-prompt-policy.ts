import { checkPrompt } from '../src/services/promptPolicy.js';

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
];

const MUST_PASS = [
  'a red bird on a branch',
  'teenage skateboarder, explicit detail',
  'a kid flying a kite at the beach',
  'sunset over mountains, highly detailed',
  'oil painting of a lighthouse',
  'two dogs playing in the snow',
];

let failures = 0;
for (const prompt of MUST_BLOCK) {
  const { allowed } = checkPrompt(prompt);
  if (allowed) {
    failures += 1;
    console.log(`FAIL  should block: ${JSON.stringify(prompt)}`);
  }
}
for (const prompt of MUST_PASS) {
  const { allowed, flags } = checkPrompt(prompt);
  if (!allowed) {
    failures += 1;
    console.log(`FAIL  should pass: ${JSON.stringify(prompt)} (flags ${flags.join(',')})`);
  }
}
console.log(failures === 0 ? `prompt policy: ${MUST_BLOCK.length + MUST_PASS.length} cases ok` : `${failures} case(s) failed`);
process.exit(failures === 0 ? 0 : 1);
