import { describe, expect, it } from '@jest/globals';
import { SyntaxKind } from 'obscenity';

import {
  ALLOWED_PHRASES,
  ALLOWED_WORDS,
  collapseRepeats,
  hasBlockedWords,
  normalizeForServer,
  patternToRegex,
  serverWordRules,
} from '@/lib/wordFilter';

/** The database's has_blocked_words (migration 0004), in JavaScript. */
function serverCheck(text: string): boolean {
  const { block, allow } = serverWordRules();
  let normalized = normalizeForServer(text);
  for (const phrase of allow) normalized = normalized.split(phrase).join(' ');
  return block.some((rule) => new RegExp(rule).test(normalized));
}

const BLOCKED = [
  'Shit Creek',
  'sh1t creek',
  'What the fuck',
  'Bitch Creek',
  'Whore Flats',
  'porn',
  'Fucking road',
  'a$$hole',
  'sh!t',
  'shït',
  'b1tch',
  'shiiiit creek',
  'Fuuuuck road',
  'jizz',
  'Jizzz',
];
const FINE = [
  'Shitake Flats',
  'Hooker Creek',
  'Dick Smith Flat',
  'Bear scat near the creek',
  'Tit Butte',
  'Assateague',
  'Grass Valley',
  'Assessment Ridge',
  'Cumulus Point',
  'Scunthorpe Hollow',
  'Peacock Flats',
  'Middlesex',
  'Sublett Reservoir',
  'Forest Road 46',
  'Forest Road 455',
  'Site A55',
  '4WD only, FR 4510',
  'B4 noon',
  'Shiitake Flats',
  'Cummings Creek',
  'Mount Cummins',
  'Fagan Lake',
  'Raper Creek',
  'Chinkapin Flat',
  'Assonet River',
  'Rio Negro',
  'Cerro Negro',
  'Crested Butte',
  'Buttes Camp',
  'Bitter Creek',
  'Cumberland Gap',
  'Annalise',
  'Rappel Point',
  '',
  '   ',
];

describe('word filter', () => {
  it('blocks offensive words, including common disguises', () => {
    for (const text of BLOCKED) expect([text, hasBlockedWords(text)]).toEqual([text, true]);
  });

  it('lets ordinary place names and trail words through', () => {
    for (const text of FINE) expect([text, hasBlockedWords(text)]).toEqual([text, false]);
    expect(ALLOWED_WORDS).toEqual(expect.arrayContaining(['hooker', 'scat']));
  });

  it('runs the same check as the database, so they never disagree', () => {
    const samples = [...BLOCKED, ...FINE, 'Shiitake', 'Tranny', 'buttplug', 'Boobook', 'Middlesex', 'Hell Gap'];
    for (const text of samples) expect([text, hasBlockedWords(text)]).toEqual([text, serverCheck(text)]);
    for (const phrase of ALLOWED_PHRASES) expect([phrase, hasBlockedWords(phrase)]).toEqual([phrase, false]);
  });

  it('gives the database rules that agree with the app on plain spellings', () => {
    for (const text of BLOCKED) expect([text, serverCheck(text)]).toEqual([text, true]);
    for (const text of FINE) expect([text, serverCheck(text)]).toEqual([text, false]);
  });

  it('makes rules the database can store and run', () => {
    const { block, allow } = serverWordRules();
    expect(block.length).toBeGreaterThan(50);
    expect(allow.length).toBeGreaterThan(20);
    // The migration's check constraint on moderation.word_rules.
    for (const rule of [...block, ...allow]) expect(rule).toMatch(/^[ a-z().?:]+$/);
    for (const rule of block) expect(() => new RegExp(rule)).not.toThrow();
    expect(new Set(block).size).toBe(block.length);
    // Allowed words aren't blocked at all.
    for (const word of ALLOWED_WORDS) expect(serverCheck(word)).toBe(false);
  });

  it('normalizes text the way the database does', () => {
    expect(normalizeForServer('  Shit-Creek!!  2WD ')).toBe(' shit creeki wd ');
    expect(normalizeForServer('Sh1t Rd 455, Site A55')).toBe(' shit rd site a ');
    expect(normalizeForServer('Shïtake')).toBe(' shitake ');
    expect(normalizeForServer('')).toBe('  ');
    expect(normalizeForServer('Shiiiit Creeek, Grass Valley')).toBe(' shit creek grass valley ');
    expect(collapseRepeats('jizzz boob bookkeeper')).toBe('jiz boob bookeeper');
  });

  it('turns every kind of library pattern into a regular expression', () => {
    expect(
      patternToRegex({
        requireWordBoundaryAtStart: true,
        requireWordBoundaryAtEnd: false,
        nodes: [
          { kind: SyntaxKind.Literal, chars: [...'ab'].map((c) => c.codePointAt(0) ?? 0) },
          { kind: SyntaxKind.Optional, childNode: { kind: SyntaxKind.Literal, chars: [99] } },
          { kind: SyntaxKind.Wildcard },
          { kind: SyntaxKind.BoundaryAssertion },
          { kind: SyntaxKind.Literal, chars: [43] },
        ],
      }),
    ).toBe(' ab(?:c)?. \\+');
  });
});
