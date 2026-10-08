/**
 * Builds e2e/fixtures/essay-pool.srsj (srs-web#519) from essay-references.srsj: the essay package at 1.7.0
 * (document-state gains the comments/references container ids) and the REAL com.mudemocracy.argument/source
 * type (title, source_kind, source_url, ...) in place of that fixture's stand-in. Package definitions are copied
 * verbatim; everything else is done through the engine's WASM bindings: the fixture's source gets the
 * now-required source_kind by a record update, and the document-state is repaired as the editor does for an
 * editable repository (comments + references containers, recorded on the state). A file opened from disk is
 * read-only, so the editor would never do that itself.
 * Usage: node build-essay-pool-fixture.mjs <muSrs/packages/essay 1.7.0> <muSrs/packages/argument> <essay-references.srsj> <out.srsj>
 * (run from the repo root after `npm run fetch-bindings`)
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SrsRepository, initSync } from "../../src/lib/srs_bindings/srs_bindings.js";

const [essay, argument, src, out] = process.argv.slice(2).map((p) => path.resolve(p));
initSync({
  module: readFileSync(new URL("../../src/lib/srs_bindings/srs_bindings_bg.wasm", import.meta.url)),
});
const read = (dir, rel) => JSON.parse(readFileSync(path.join(dir, rel), "utf8"));
const doc = JSON.parse(readFileSync(src, "utf8"));
const data = doc.data;
const pj = data["package/package.json"];
const put = (dir, rel, key) => {
  data[`package/${rel}`] = read(dir, rel);
  if (key && !(pj[key] ??= []).includes(rel)) pj[key].push(rel);
};
for (const rel of ["fields/commentscontainerid-d8b2307a.json", "fields/referencescontainerid-3758d2e9.json"])
  put(essay, rel, "fields");
for (const rel of ["fields/sourcekind-a11ad21b.json", "fields/sourcedate-42655c33.json"])
  put(argument, rel, "fields");
put(argument, "vocabularies/source-kind-62de1a6e.json", "vocabularies");
put(argument, "types/source-36e85cff.json");
// document-state: both versions come from the 1.7.0 package (v2 = current, v1 = the upgrade source)
for (const name of ["document-state-9785968f.json", "document-state-9785968f-v1.json"])
  put(essay, `types/${name}`);
pj.version = "1.7.0";

const SOURCE = "36e85cff-989b-4c6d-9361-3c8906cff87b";
const STATE = "9785968f-bdd4-4c91-81ef-0e62075f3503";
const repo = SrsRepository.load(JSON.stringify(doc));
const records = (typeId) =>
  repo.list_records("{}").map((r) => r.record ?? r).filter((r) => (r.typeId ?? r.type_id) === typeId);
for (const r of records(SOURCE)) {
  const fv = r.fieldValues ?? r.field_values;
  if (!fv.source_kind) repo.update_record(r.instanceId ?? r.instance_id, JSON.stringify({ fieldValues: { ...fv, source_kind: "book" } }));
}
const [state] = records(STATE);
const sfv = state.fieldValues ?? state.field_values;
const title = repo.list_containers("{}").find((c) => c.anchorInstanceId)?.title ?? "On small democracy";
const area = (name) => repo.create_container(JSON.stringify({ title: `${title} (${name})` })).containerId;
repo.update_record(
  state.instanceId ?? state.instance_id,
  JSON.stringify({
    fieldValues: { ...sfv, comments_container_id: area("comments"), references_container_id: area("references") },
    typeVersion: 2,
  })
);
const report = repo.validate();
const errors = report.diagnostics.filter((d) => d.severity === "error");
if (errors.length) throw new Error(`fixture does not validate: ${JSON.stringify(errors)}`);
writeFileSync(out, `${JSON.stringify(JSON.parse(repo.export_srsj()), null, 2)}\n`);
