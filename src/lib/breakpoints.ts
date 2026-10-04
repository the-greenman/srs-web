/**
 * The one source of responsive widths (ADR-020 d). CSS custom properties cannot be used inside
 * `@media`, so CSS keeps literal widths annotated with a "bp: role" comment; `tests/breakpoints.test.ts`
 * fails when any `@media` width under src/ is missing from this list.
 */
export const BREAKPOINTS = {
  phone: 480,
  genericNarrow: 600,
  form: 640,
  compact: 720,
  genericStack: 900,
  rail: 960,
  wide: 1100,
} as const;

/** The phone breakpoint as a media query, for matchMedia. */
export const NARROW = `(max-width: ${BREAKPOINTS.phone}px)`;
