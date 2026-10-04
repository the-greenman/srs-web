/**
 * The one hover/focus open-delay: show at once, hide after `delay` ms, re-entry cancels (so the
 * pointer crossing the gap to a hover card does not lose it). Used by AttachmentGlyph and ActorMark.
 */
export const CLOSE_DELAY_MS = 150;

export function hoverBridge(set: (open: boolean) => void, delay = CLOSE_DELAY_MS) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    show() {
      clearTimeout(timer);
      set(true);
    },
    hide() {
      clearTimeout(timer);
      timer = setTimeout(() => set(false), delay);
    },
    /** Close now (Escape). */
    close() {
      clearTimeout(timer);
      set(false);
    },
    destroy() {
      clearTimeout(timer);
    },
  };
}
