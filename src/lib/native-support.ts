/** Feature guards for native top-layer primitives (happy-dom has neither). One definition each. */
export const supportsPopover = (): boolean =>
  typeof HTMLElement !== "undefined" && "showPopover" in HTMLElement.prototype;

export const supportsModal = (): boolean =>
  typeof HTMLDialogElement !== "undefined" && "showModal" in HTMLDialogElement.prototype;
