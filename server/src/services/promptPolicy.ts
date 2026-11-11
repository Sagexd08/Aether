export interface PolicyResult {
  allowed: boolean;
  normalized: string;
  flags: string[];
}

const MINOR = '(child|minor|underage|loli\\w*|shota|kid|toddler|preteen|teen(?:age)?)';
const SEXUAL = '(nude|naked|sex\\w*|porn\\w*|erotic|nsfw|explicit (?:sex|content|scene))'; 
const RULES: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  { id: 'sexual_minors', pattern: new RegExp(`\\b${MINOR}\\b.{0,40}\\b${SEXUAL}\\b|\\b${SEXUAL}\\b.{0,40}\\b${MINOR}\\b`, 'i') },
  { id: 'explicit_sexual', pattern: /\b(porn\w*|hentai|xxx|nsfw|explicit sex|sex act|genitals?|blowjob|nude|naked)\b/i },
  { id: 'graphic_violence', pattern: /\b(gore|gory|dismember\w*|beheading|decapitat\w*|mutilat\w*|torture)\b/i },
  { id: 'self_harm', pattern: /\b(suicide method|how to kill myself|self[- ]?harm instructions?)\b/i },
  { id: 'hate_symbols', pattern: /\b(swastika|kkk rally|white power)\b/i },
];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '@': 'a', $: 's' };

export function normalizePrompt(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f​-‏‪-‮⁠﻿]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const CONFUSABLES: Record<string, string> = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y', 'і': 'i',
  'ј': 'j', 'ѕ': 's', 'к': 'k', 'м': 'm', 'т': 't', 'н': 'h', 'в': 'b',
  'ο': 'o', 'α': 'a', 'ε': 'e', 'ι': 'i', 'ν': 'v', 'ρ': 'p', 'τ': 't', 'κ': 'k',
  'υ': 'u', 'χ': 'x', 'η': 'n', 'μ': 'u',
};

export function foldConfusables(text: string): string {
  return text.toLowerCase().replace(/[Ͱ-ϿЀ-ӿ]/g, (c) => CONFUSABLES[c] ?? c);
}

function deLeet(text: string): string {
  return text.replace(/[01345@$]/g, (c) => LEET[c] ?? c);
}

export function checkPrompt(raw: string): PolicyResult {
  const normalized = normalizePrompt(raw);
  const folded = foldConfusables(normalized);
  const variants = [
    normalized,
    folded,
    deLeet(folded),
    folded.replace(/\b(?:\w )+\w\b/g, (m) => m.replace(/ /g, '')),
  ];
  const flags = RULES.filter((rule) => variants.some((v) => rule.pattern.test(v))).map((rule) => rule.id);
  return { allowed: flags.length === 0, normalized, flags };
}
