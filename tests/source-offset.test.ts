import { describe, expect, it } from 'vitest';
import { sourceOffset } from '../src/lib/components/source-offset';

describe('sourceOffset (srs-web#595)', () => {
  it('maps a caret in plain prose to the same place', () => {
    expect(sourceOffset('First paragraph.', 'First')).toBe(5);
    expect(sourceOffset('First paragraph.', '')).toBe(0);
    expect(sourceOffset('First paragraph.', 'First paragraph.')).toBe(16);
    expect(sourceOffset('First paragraph.', 'First ')).toBe(6);
  });
  it('skips markup the renderer drops, and steps over a closing emphasis marker', () => {
    expect(sourceOffset('**Bold** words', 'Bold')).toBe(8);
    expect(sourceOffset('# Title\n\nBody text', 'TitleBody')).toBe(13);
    expect(sourceOffset('- one\n- two', 'one tw')).toBe(10);
  });
  it('ignores whitespace the renderer collapsed', () => {
    expect(sourceOffset('Line one\nLine two', 'Line one Line')).toBe(13);
  });
});
