"""Builds e2e/fixtures/essay-pool.srsj (srs-web#519) from essay-references.srsj: the essay package at 1.7.0
(document-state gains the comments/references container ids, so the editor makes the References pool) and the
REAL com.mudemocracy.argument/source type (title, source_kind, source_url, ...) in place of that fixture's
stand-in. The fixture's one source gets the now-required source_kind.
A file opened from disk is read-only, so the editor never repairs it: after this script, load the result once with the
editor's repair on (loadEssay(repo, id, { repair: true }) on the real engine, as tests/essay-references.wasm.test.ts does)
and write back repo.export_srsj(), so the comments and references containers and their state fields are in the file.
Usage: python3 build-essay-pool-fixture.py <muSrs/packages/essay 1.7.0> <muSrs/packages/argument> <essay-references.srsj> <out.srsj>"""
import json, pathlib, sys

essay, argument, src, out = (pathlib.Path(a) for a in sys.argv[1:5])
doc = json.loads(src.read_text())
data = doc["data"]
pj = data["package/package.json"]

def put(pkg, rel, key):
    data[f"package/{rel}"] = json.loads((pkg / rel).read_text())
    if rel not in pj.setdefault(key, []):
        pj[key].append(rel)

for rel in ("fields/commentscontainerid-d8b2307a.json", "fields/referencescontainerid-3758d2e9.json"):
    put(essay, rel, "fields")
for rel in ("fields/sourcekind-a11ad21b.json", "fields/sourcedate-42655c33.json"):
    put(argument, rel, "fields")
put(argument, "vocabularies/source-kind-62de1a6e.json", "vocabularies")
data["package/types/source-36e85cff.json"] = json.loads((argument / "types/source-36e85cff.json").read_text())
# document-state: both versions come from the 1.7.0 package (v2 = current, v1 = the upgrade source)
for name in ("document-state-9785968f.json", "document-state-9785968f-v1.json"):
    data[f"package/types/{name}"] = json.loads((essay / "types" / name).read_text())
pj["version"] = "1.7.0"
for k, v in data.items():
    if k.startswith("records/") and "source_kind" not in v.get("fieldValues", {}) and v.get("typeId") == "36e85cff-989b-4c6d-9361-3c8906cff87b":
        v["fieldValues"]["source_kind"] = "book"
out.write_text(json.dumps(doc, indent=2, sort_keys=True, ensure_ascii=False) + "\n")
