/**
 * The browser's `localStorage`, or undefined when there is none. With site data blocked,
 * merely reading `window.localStorage` throws a SecurityError, so a bare
 * `typeof localStorage === 'undefined'` guard is not enough (srs-web#828).
 */
export function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
