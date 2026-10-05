# Builds e2e/fixtures/essay-references.srsj (srs-web#278): the essay package (muDemocracy.org muSrs/packages/essay
# 1.6.0, verbatim, incl. the essay-references composition) plus the argument/primary definitions that package's
# bundle inlines (claim-backing and source-citation views and their fields), minimal fixture
# `com.mudemocracy.argument/problem` and `/source` types, one problem and one source, each linked to a
# paragraph (bears-on / evidences). srs CLI build.468 or later.
# Usage: MU=<muDemocracy.org/muSrs> bash build-essay-references-fixture.sh <out.srsj>
set -e
OUT=${1:?out.srsj}; rm -f "$OUT"; W=$(mktemp -d)/essay; MU=${MU:?muSrs dir}
srs repo create --repo $W --namespace com.mudemocracy.essay --title "Essay fixture" >/dev/null
rm -rf $W/package && cp -r "$MU/packages/essay" $W/package
python3 - "$MU" "$W" <<'PY'
import json, pathlib, shutil, sys
mu, w = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
extra = {"fields": ["packages/argument/fields/statement-2d065342", "packages/argument/fields/title-db580a8d",
  "packages/argument/fields/citation-80b74312", "packages/argument/fields/sourceurl-beccc3c8",
  "packages/argument/fields/description-e7c60942", "package/fields/warrant-cc46971a", "package/fields/warrantlevel-ea742151"],
  "vocabularies": ["package/vocabularies/warrant-level-cf5ca321"],
  "views": ["packages/argument/views/source-citation-view-af2236a9", "packages/argument/views/claim-backing-view-c68673c1"]}
pj = w / "package" / "package.json"
d = json.loads(pj.read_text())
for kind, srcs in extra.items():
    (w / "package" / kind).mkdir(exist_ok=True)
    for src in srcs:
        f = pathlib.Path(src + ".json").name
        shutil.copy(mu / (src + ".json"), w / "package" / kind / f)
        d.setdefault(kind, []).append(f"{kind}/{f}")
pj.write_text(json.dumps(d, indent=2))
PY
for t in \
 '{"$schema":"https://srs.semanticops.com/schema/2.0/type.json","id":"6e955608-b469-4b8e-8855-5dccdb73fe11","namespace":"com.mudemocracy.argument","name":"problem","version":1,"description":"Fixture problem: title and statement.","fields":[{"fieldId":"db580a8d-7662-48ce-bc7f-e50e4a7cccd1","order":0,"required":true,"displayLabel":"Title"},{"fieldId":"2d065342-ff8f-4eeb-a6b5-ed200f286fab","order":1,"required":true,"displayLabel":"Statement"}],"identityFieldId":"db580a8d-7662-48ce-bc7f-e50e4a7cccd1"}' \
 '{"$schema":"https://srs.semanticops.com/schema/2.0/type.json","id":"36e85cff-989b-4c6d-9361-3c8906cff87b","namespace":"com.mudemocracy.argument","name":"source","version":1,"description":"Fixture source: title, citation and description.","fields":[{"fieldId":"db580a8d-7662-48ce-bc7f-e50e4a7cccd1","order":0,"required":true,"displayLabel":"Title"},{"fieldId":"80b74312-3416-4c0c-bdb2-c1306b21e1a0","order":1,"required":false,"displayLabel":"Citation"},{"fieldId":"e7c60942-7cdf-407e-be1f-bf5f4a648285","order":2,"required":false,"displayLabel":"Description"}],"identityFieldId":"db580a8d-7662-48ce-bc7f-e50e4a7cccd1"}'; do
  echo "$t" | srs type create --repo $W >/dev/null
done
rec() { echo "$2" | srs record create --repo $W --type "$1" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["payload"]["record"]["instanceId"] if d.get("ok") else sys.exit(str(d)))'; }
cont() { echo "$1" | srs container create --repo $W | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["payload"]["container"]["containerId"] if d.get("ok") else sys.exit(str(d)))'; }
rel() { echo "{\"relationType\":\"$1\",\"sourceInstanceId\":\"$2\",\"targetInstanceId\":\"$3\"}" | srs relation create --repo $W >/dev/null; }
N=com.mudemocracy.essay; A=com.mudemocracy.argument
ES=$(rec $N/essay '{"fieldValues":{"title":"On small democracy","summary":"A fixture essay."}}')
P1=$(rec $N/paragraph '{"fieldValues":{"paragraph_title":"Opening","body":"First paragraph."}}')
P2=$(rec $N/paragraph '{"fieldValues":{"paragraph_title":"Claim","body":"Second paragraph."}}')
PR=$(rec $A/problem '{"fieldValues":{"title":"Small groups lose touch","statement":"Small self-governing groups cannot see each other."}}')
SO=$(rec $A/source '{"fieldValues":{"title":"Ostrom, Governing the Commons","citation":"Elinor Ostrom, Governing the Commons, 1990.","description":"Polycentric governance."}}')
rel com.mudemocracy.essay/bears-on $P1 $PR
rel evidences $SO $P2
DP=$(rec $N/paragraph '{"fieldValues":{"paragraph_title":"Spare","body":"Drafted paragraph."}}')
DC=$(cont "{\"title\":\"Essay draft\",\"memberInstanceIds\":[{\"instanceId\":\"$DP\"}]}")
cont "{\"title\":\"On small democracy\",\"anchorInstanceId\":\"$ES\",\"identityInstanceId\":\"$ES\",\"memberInstanceIds\":[{\"instanceId\":\"$ES\"},{\"instanceId\":\"$P1\"},{\"instanceId\":\"$P2\"}]}" >/dev/null
rec $N/document-state "{\"fieldValues\":{\"essay\":\"$ES\",\"hidden_instance_ids\":[],\"draft_container_id\":\"$DC\"}}" >/dev/null
srs repo validate --repo $W | python3 -c "import sys,json; print(json.load(sys.stdin)[\"payload\"][\"summary\"])"
srs repo copy --from $W --to "$OUT" >/dev/null
# `repo copy` writes one file per type id, so one document-state version is lost (build-essay-fixture's splice has the same job): restore both.
python3 - "$MU" "$OUT" <<'PY'
import json, pathlib, sys
mu, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
doc = json.loads(out.read_text()); data = doc["data"]
data["package/types/document-state-9785968f.json"] = json.loads((mu / "packages/essay/types/document-state-9785968f.json").read_text())
data["package/types/document-state-9785968f-v1.json"] = json.loads((mu / "packages/essay/types/document-state-9785968f-v1.json").read_text())
types = data["package/package.json"]["types"]
types[types.index("types/document-state-9785968f.json", types.index("types/document-state-9785968f.json") + 1)] = "types/document-state-9785968f-v1.json"
out.write_text(json.dumps(doc, indent=2, sort_keys=True, ensure_ascii=False) + "\n")
PY
