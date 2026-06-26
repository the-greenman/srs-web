/**
 * preview-themes.ts — built-in CSS themes for the GuidesShell preview iframe.
 *
 * ADR-007: Preview themes are inline CSS constants in TS, not WASM-backed.
 * The WASM render_document_view produces an unstyled HTML fragment; the preview
 * iframe's <style> block is entirely frontend-owned.
 *
 * Each theme is a complete stylesheet injected into the srcdoc <style> block.
 * srs-web#41: export polish — theme picker for the guides inspector.
 */

export interface PreviewTheme {
  id: string;
  label: string;
  css: string;
}

export const THEME_DEFAULT = `
  body {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 0.875rem;
    line-height: 1.65;
    color: #111;
    margin: 1rem 1.25rem;
    padding: 0;
  }
  h1, h2, h3, h4 { font-weight: 600; margin: 1rem 0 0.4rem; }
  h1 { font-size: 1.1rem; }
  h2 { font-size: 1rem; }
  h3, h4 { font-size: 0.9rem; }
  p { margin: 0 0 0.6rem; }
  table { border-collapse: collapse; width: 100%; margin: 0.5rem 0; font-size: 0.8rem; }
  th, td { border: 1px solid #ddd; padding: 0.3rem 0.5rem; text-align: left; vertical-align: top; }
  th { background: #f5f5f5; font-weight: 600; }
  .srs-document { max-width: 100%; }
  .srs-section { margin-bottom: 1.25rem; }
  .srs-field-label { font-size: 0.7rem; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.04em; color: #888; margin-bottom: 0.2rem; }
`;

export const THEME_PRINT = `
  body {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #000;
    margin: 0;
    padding: 0.5cm 1cm;
  }
  h1, h2, h3, h4 { font-weight: bold; page-break-after: avoid; }
  h1 { font-size: 14pt; margin: 0.8em 0 0.3em; }
  h2 { font-size: 12pt; margin: 0.7em 0 0.3em; }
  h3, h4 { font-size: 11pt; margin: 0.6em 0 0.2em; }
  p { margin: 0 0 0.5em; orphans: 3; widows: 3; }
  table { border-collapse: collapse; width: 100%; margin: 0.5em 0; font-size: 10pt; }
  th, td { border: 1px solid #999; padding: 0.25em 0.4em; text-align: left; vertical-align: top; }
  th { font-weight: bold; background: #eee; }
  .srs-document { max-width: 100%; }
  .srs-section { margin-bottom: 1em; page-break-inside: avoid; }
  .srs-field-label { font-size: 8pt; font-weight: bold; text-transform: uppercase;
    letter-spacing: 0.05em; color: #555; margin-bottom: 0.15em; }
`;

export const PREVIEW_THEMES: PreviewTheme[] = [
  { id: "default", label: "Default", css: THEME_DEFAULT },
  { id: "print", label: "Print", css: THEME_PRINT },
];
