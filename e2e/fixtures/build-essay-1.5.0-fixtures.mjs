// Builds e2e/fixtures/essay-1.5.0.srsj (essay 1.5.0 installed the normal way, reference copies
// present) and essay-1.5.0-no-refs.srsj (the same with .srs-import/refs removed: the live case of
// srs-web#450, where the engine cannot prove any definition unmodified). Uses the pinned WASM
// bindings and the earlier bundle that scripts/ensure-packages.mjs fetched (packages.lock.json history).
// Usage (from the repo root, after npm ci): node e2e/fixtures/build-essay-1.5.0-fixtures.mjs
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const bindings = join(root, "src/lib/srs_bindings");
const cache = join(root, "node_modules/.cache/srs-real-bindings");
mkdirSync(cache, { recursive: true });
copyFileSync(join(bindings, "srs_bindings.js"), join(cache, "fixtures.mjs"));
const mod = await import(join(cache, "fixtures.mjs"));
mod.initSync({ module: readFileSync(join(bindings, "srs_bindings_bg.wasm")) });

const ESSAY = "5b14a4d4-ec08-4e5b-be75-c183aec90c40";
const repo = mod.SrsRepository.create(JSON.stringify({ title: "Essay 1.5.0 fixture" }));
repo.install_package_bundle(readFileSync(join(root, `src/lib/packages/${ESSAY}@1.5.0.srspkg`), "utf8"), "{}");
const out = (name, r) => writeFileSync(join(root, "e2e/fixtures", name), r.export_srsj());
out("essay-1.5.0.srsj", repo);

const files = repo.export_tree();
const kept = Object.fromEntries(Object.entries(files).filter(([p]) => !p.includes(".srs-import/refs")));
out("essay-1.5.0-no-refs.srsj", mod.SrsRepository.load_tree(kept));
