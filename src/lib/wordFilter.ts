// The word filter for spot text and display names (App Store Guideline 1.2
// asks for one). The word list comes from the "obscenity" library, turned
// into rules the database stores too (moderation.word_rules, migrations 0004
// and 0005). The app and the database run the very same check: read the text
// the same way (normalizeForServer), take out allowed phrases, then look for a
// blocked word. So what the app lets through, the database accepts, and the
// filter holds even for requests that don't come from the app.

import { DataSet, SyntaxKind, englishDataset } from 'obscenity';

/**
 * Words on the library's list that are also everyday place names or trail
 * words ("Hooker Creek", "bear scat"). Allowed in both the app and the
 * database; reports and moderation handle any misuse.
 */
export const ALLOWED_WORDS: readonly string[] = ['cock', 'dick', 'dyke', 'hooker', 'scat', 'tit'];

/**
 * Real place names and surnames that contain a blocked word ("Cummings
 * Creek", "Rio Negro"). Allowed as whole phrases, so the word on its own is
 * still caught.
 */
export const ALLOWED_PHRASES: readonly string[] = [
  'annalee',
  'annalena',
  'annaliese',
  'annalisa',
  'annalise',
  'arroyo negro',
  'assonet',
  'cerro negro',
  'chinkapin',
  'chinquapin',
  'cumming',
  'cummings',
  'cummins',
  'fagan',
  'georgy',
  'ojo negro',
  'rappel',
  'raper',
  'rio negro',
  'shiitake',
];

type Metadata = { originalWord: string };

function dataset(): DataSet<Metadata> {
  return new DataSet<Metadata>()
    .addAll(englishDataset)
    .removePhrasesIf((phrase) => ALLOWED_WORDS.includes(phrase.metadata?.originalWord ?? ''));
}

let compiled: { block: RegExp[]; allow: string[] } | null = null;

/** True when the text has a word DisCamp doesn't allow. The database's has_blocked_words, step for step. */
export function hasBlockedWords(text: string): boolean {
  if (!text.trim()) return false;
  if (!compiled) {
    const rules = serverWordRules();
    compiled = { block: rules.block.map((rule) => new RegExp(rule)), allow: rules.allow };
  }
  let normalized = normalizeForServer(text);
  if (!normalized.trim()) return false;
  for (const phrase of compiled.allow) normalized = normalized.split(phrase).join(' ');
  return compiled.block.some((rule) => rule.test(normalized));
}

// --- The database's copy ------------------------------------------------------

const ACCENTS = ['áàâäãåāéèêëēíìîïīóòôöõøōúùûüūñçýÿšžčćřłğşď', 'aaaaaaaeeeeeiiiiiooooooouuuuuncyyszccrlgsd'] as const;
const LOOK_ALIKES = ['013457@$!|', 'oieastasii'] as const;

function translate(word: string, [from, to]: readonly [string, string]): string {
  return Array.from(word, (c) => {
    const i = from.indexOf(c);
    return i >= 0 ? to.charAt(i) : c;
  }).join('');
}

/**
 * Text as the database's filter reads it (moderation.normalize_text in
 * migration 0005, step for step): Unicode look-alikes folded (NFKC), lower
 * case, common accents dropped, and in words with at least two letters,
 * look-alike digits and symbols read as letters ("sh1t"; a lone "4" in
 * "Forest Road 455" stays a number). Then everything that isn't a letter
 * becomes a space, repeated letters are collapsed, and there's a space at
 * each end.
 */
export function normalizeForServer(text: string): string {
  const words = text
    .normalize('NFKC')
    .toLowerCase()
    .split(/\s+/)
    .map((word) => {
      const plain = translate(word, ACCENTS);
      return /[a-z].*[a-z]/.test(plain) ? translate(plain, LOOK_ALIKES) : plain;
    });
  return ` ${collapseRepeats(
    words
      .join(' ')
      .replace(/[^a-z]+/g, ' ')
      .trim(),
  )} `;
}

/**
 * Repeated letters read once ("shiiit" as "shit"), or twice for the letters
 * that are often doubled in English (b, e, g, l, o, s: "grass", "book"), the
 * way the library reads them.
 */
export function collapseRepeats(text: string): string {
  return text.replace(/([beglos])\1+/g, '$1$1').replace(/([acdfhijkmnpqrtuvwxyz])\1+/g, '$1');
}

// The shapes of the library's parsed patterns (it doesn't export them).
type PatternNode =
  | { kind: SyntaxKind.Literal; chars: number[] }
  | { kind: SyntaxKind.Optional; childNode: PatternNode }
  | { kind: SyntaxKind.Wildcard }
  | { kind: SyntaxKind.BoundaryAssertion };
interface ParsedPattern {
  requireWordBoundaryAtStart: boolean;
  requireWordBoundaryAtEnd: boolean;
  nodes: PatternNode[];
}

const escape = (text: string) => text.replace(/[^a-z0-9 ]/g, (c) => `\\${c}`);

function nodeToRegex(node: PatternNode): string {
  switch (node.kind) {
    case SyntaxKind.Literal:
      // Collapsed like the text it runs on, or "jizz" could never match.
      return escape(collapseRepeats(String.fromCodePoint(...node.chars)));
    case SyntaxKind.Optional:
      return `(?:${nodeToRegex(node.childNode)})?`;
    case SyntaxKind.Wildcard:
      return '.';
    case SyntaxKind.BoundaryAssertion:
      return ' ';
  }
}

/** One library pattern as a Postgres regular expression over normalized text. */
export function patternToRegex(pattern: ParsedPattern): string {
  return [
    pattern.requireWordBoundaryAtStart ? ' ' : '',
    ...pattern.nodes.map(nodeToRegex),
    pattern.requireWordBoundaryAtEnd ? ' ' : '',
  ].join('');
}

/**
 * What migrations 0004 and 0005 put in moderation.word_rules: "block" rules are
 * regular expressions, "allow" rules are phrases removed from the text first
 * (so "Scunthorpe" or "shitake" don't trip the filter). Sorted, no repeats.
 */
export function serverWordRules(): { block: string[]; allow: string[] } {
  const built = dataset().build();
  const block = built.blacklistedTerms.map((term) => patternToRegex(term.pattern as unknown as ParsedPattern));
  const allow = [...(built.whitelistedTerms ?? []), ...ALLOWED_PHRASES]
    .filter((phrase) => /^[a-z' -]+$/i.test(phrase))
    .map((phrase) => normalizeForServer(phrase).trim())
    .filter((phrase) => phrase.replace(/ /g, '').length >= 3);
  const unique = (list: string[]) => [...new Set(list)].sort();
  return { block: unique(block), allow: unique(allow) };
}
