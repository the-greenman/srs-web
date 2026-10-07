/** The standalone document the Print / Save as PDF action writes into a new window (pure; the shell owns `window.open`). */
export function printHtml(themeCss: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Guide</title><style>${themeCss}</style><style>@media print { body { margin: 0; } }</style></head><body>${bodyHtml}</body></html>`;
}
