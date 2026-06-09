const scripts = new Map<string, Promise<void>>();

export function loadScript(src: string): Promise<void> {
  const existing = scripts.get(src);
  if (existing) return existing;

  const loading = new Promise<void>((resolve, reject) => {
    const found = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (found?.dataset.loaded === "true") {
      resolve();
      return;
    }

    const script = found ?? document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true }
    );
    script.addEventListener(
      "error",
      () => {
        scripts.delete(src);
        reject(new Error(`Failed to load ${src}`));
      },
      { once: true }
    );
    if (!found) document.head.appendChild(script);
  });

  scripts.set(src, loading);
  return loading;
}
