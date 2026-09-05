import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the `.pressable` / `.pressable-selection` transition rule in
 * globals.css.
 *
 * WHY THIS FILE EXISTS. Tailwind utilities live inside `@layer utilities`;
 * the press rules are unlayered plain CSS after the `@import`. Per the
 * cascade-layers spec an unlayered normal declaration beats a layered one
 * regardless of specificity, so the press rule's `transition` shorthand
 * overrides any `transition-colors` / `transition-opacity` / `transition-all`
 * on the same element. A bare `transition: transform` there therefore
 * SILENTLY kills colour and opacity transitions.
 *
 * Confirmed in real engines: the settlement payment row fades its background
 * across ~8 frames on press and back on release in Chromium and WebKit, in
 * both themes. (Note the MatchSchedule Share button cannot demonstrate this —
 * its inline `background: var(--surface)` outranks the `active:bg-…` utility,
 * so its colour never changes at all. Separate, pre-existing issue.)
 *
 * The fix is one rule listing the properties a press actually changes. These
 * tests pin that list, and — the important half — fail if any component ever
 * pairs a press class with a state change the list does not cover, so the fix
 * stays correct without anyone having to remember why.
 *
 * SCOPE, honestly stated: this is a static analysis of CSS and JSX text. It
 * proves the declarations and the call sites agree. It does not execute a
 * browser, so it cannot prove the rendered cascade — that was verified by
 * brace-matching the built bundle (`.pressable` sits after the
 * `@layer utilities` block closes) and by hand on device.
 */

const ROOT = join(__dirname, '..', '..');
const CSS = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8');

/** The properties the shared press rule promises to transition. */
const COVERED = [
  'transform',
  'background-color',
  'border-color',
  'color',
  'opacity',
] as const;

/** Body of the `.pressable, .pressable-selection { … }` rule. */
function pressRule(): string {
  const m = CSS.match(/\.pressable,\s*\n\s*\.pressable-selection\s*\{([^}]*)\}/);
  if (!m) throw new Error('Could not find the shared .pressable rule in globals.css');
  return m[1];
}

describe('globals.css — the shared press transition', () => {
  it('is a single shared rule, not duplicated per component', () => {
    // Minimality is the point: one rule, both selectors. If this splits, the
    // two press depths can drift apart.
    expect(CSS).toMatch(/\.pressable,\s*\n\s*\.pressable-selection\s*\{/);
  });

  it('transitions transform — the press animation itself still works', () => {
    // The whole reason the class exists. Unlayered, so no Tailwind
    // transition-* utility can take this back off.
    expect(pressRule()).toContain('transform var(--duration-fast)');
  });

  it('also transitions the colour and opacity properties Tailwind would have', () => {
    // Preserves `transition-colors` / `transition-opacity` behaviour that the
    // shorthand would otherwise reset away.
    const body = pressRule();
    for (const prop of COVERED) {
      expect(body, `press rule must transition ${prop}`).toContain(`${prop} var(--duration-fast)`);
    }
  });

  it('is NOT a bare `transition: transform` — the regression this guards', () => {
    expect(pressRule()).not.toMatch(/transition:\s*transform\s+var\(--duration-fast\)\s+var\(--ease-out\)\s*;/);
  });

  it('uses the motion tokens, so reduced motion makes it instant', () => {
    // Hardcoded ms here would keep animating for a viewer who asked for less
    // motion — the tokens are zeroed in the prefers-reduced-motion block.
    const body = pressRule();
    expect(body).not.toMatch(/\d+ms/);
    expect(CSS).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{[^}]*--duration-fast:\s*0ms/);
  });

  it('keeps the two press depths: 0.97 for controls, 0.98 for wide targets', () => {
    expect(CSS).toMatch(/\.pressable:active\s*\{\s*transform:\s*scale\(0\.97\)/);
    expect(CSS).toMatch(/\.pressable-selection:active\s*\{\s*transform:\s*scale\(0\.98\)/);
  });

  it('has no @layer in globals.css — the premise the whole rule rests on', () => {
    // If someone wraps this file in `@layer`, the press rule stops winning
    // over Tailwind's utilities and the property list above becomes both
    // unnecessary and misleading. Fail loudly rather than silently.
    expect(CSS).not.toMatch(/@layer\s+[\w-]+\s*\{/);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * The standing guard: every press site must only animate covered properties.
 * ──────────────────────────────────────────────────────────────────────── */

/** Tailwind state-variant prefix + utility root → the CSS property it moves. */
const PROP_BY_UTILITY: Record<string, string> = {
  bg: 'background-color',
  border: 'border-color',
  text: 'color',
  opacity: 'opacity',
  scale: 'transform',
  shadow: 'box-shadow',
  ring: 'box-shadow',
  outline: 'outline-color',
  underline: 'text-decoration-color',
  decoration: 'text-decoration-color',
  fill: 'fill',
  stroke: 'stroke',
};

const VARIANTS = ['hover:', 'active:', 'focus:', 'focus-visible:', 'disabled:', 'group-hover:'];

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) tsxFiles(full, out);
    else if (name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

type Site = { file: string; line: number; uncovered: string[] };

function pressSites(): Site[] {
  const sites: Site[] = [];
  const files = [join(ROOT, 'app'), join(ROOT, 'components')].flatMap((d) => tsxFiles(d));

  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    // className="…" | className={`…`} | className={'…'}
    // No `s` flag: the pattern uses no `.`, and the tsconfig target rejects it.
    const re = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g;
    for (const m of src.matchAll(re)) {
      const cls = [m[1], m[2], m[3]].filter(Boolean).join(' ');
      if (!/\bpressable(-selection)?\b/.test(cls)) continue;

      const animated = new Set<string>();
      for (const v of VARIANTS) {
        // `[a-z]+` with NO hyphen, deliberately: every root in the map above
        // is a single word, and a hyphen-permitting class matched greedily —
        // `active:outline-red-500` captured "outline-red", which is in no map
        // and so slipped through the guard entirely.
        for (const hit of cls.matchAll(new RegExp(`${v}([a-z]+)-`, 'g'))) {
          const prop = PROP_BY_UTILITY[hit[1]];
          if (prop) animated.add(prop);
        }
      }
      const uncovered = [...animated].filter((p) => !COVERED.includes(p as typeof COVERED[number]));
      if (uncovered.length) {
        sites.push({
          file: file.slice(ROOT.length + 1),
          line: src.slice(0, m.index).split('\n').length,
          uncovered,
        });
      }
    }
  }
  return sites;
}

describe('press sites only animate properties the shared rule covers', () => {
  it('finds press sites at all (so a broken scanner cannot pass vacuously)', () => {
    // Without this, a regex that matches nothing would make the guard below
    // green forever.
    const files = [join(ROOT, 'app'), join(ROOT, 'components')].flatMap((d) => tsxFiles(d));
    const count = files.filter((f) => /\bpressable/.test(readFileSync(f, 'utf8'))).length;
    expect(count).toBeGreaterThan(4);
  });

  it('no press site animates box-shadow, outline, fill or stroke', () => {
    // The press rule cannot transition these (box-shadow is deliberately
    // excluded as the expensive one; the rest nothing needs). Because the
    // rule is unlayered, adding e.g. `pressable hover:shadow-lg` would make
    // the shadow SNAP instead of fade, with no error anywhere.
    //
    // If this fails: either drop the offending utility, or add the property
    // to both COVERED here and the rule in globals.css — do NOT paper over
    // it with a per-component transition override, which is the thing the
    // unlayered rule would defeat anyway.
    const offenders = pressSites();
    expect(
      offenders,
      `press sites animating uncovered properties:\n${offenders
        .map((s) => `  ${s.file}:${s.line} → ${s.uncovered.join(', ')}`)
        .join('\n')}`,
    ).toEqual([]);
  });
});
