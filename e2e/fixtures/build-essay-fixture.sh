# Builds e2e/fixtures/essay.srsj with srs CLI build.427. The package is a verbatim copy of
# muDemocracy.org PR #241 (muSrs/packages/essay, issue #229): same ids and field names.
# EMPTY=1 builds the package only (no essay, for the New essay e2e: essay-empty.srsj).
# Usage: PKG=<path to muSrs/packages/essay> bash build-essay-fixture.sh <out.srsj>
set -e
rm -f "${1:?out.srsj}"
OUT=${1:?out.srsj}; W=$(mktemp -d)/essay
srs repo create --repo $W --namespace com.mudemocracy.essay --title "Essay fixture" >/dev/null
rm -rf $W/package && cp -r "$PKG" $W/package
rec() { echo "$2" | srs record create --repo $W --type "$1" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["payload"]["record"]["instanceId"] if d.get("ok") else sys.exit(str(d)))'; }
cont() { echo "$1" | srs container create --repo $W | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["payload"]["container"]["containerId"] if d.get("ok") else sys.exit(str(d)))'; }
N=com.mudemocracy.essay
if [ -n "$EMPTY" ]; then srs repo copy --from $W --to "$OUT" >/dev/null; exit 0; fi
ES=$(rec $N/essay '{"fieldValues":{"title":"On small democracy","summary":"A fixture essay."}}')
P1=$(rec $N/paragraph '{"fieldValues":{"paragraph_title":"Opening","body":"First paragraph."}}')
P2=$(rec $N/paragraph '{"fieldValues":{"paragraph_title":"Claim","body":"Second paragraph."}}')
P3=$(rec $N/paragraph '{"fieldValues":{"body":"Third paragraph."}}')
DP=$(rec $N/paragraph '{"fieldValues":{"paragraph_title":"Spare","body":"Drafted paragraph."}}')
DC=$(cont "{\"title\":\"Essay draft\",\"memberInstanceIds\":[{\"instanceId\":\"$DP\"}]}")
cont "{\"title\":\"On small democracy\",\"anchorInstanceId\":\"$ES\",\"identityInstanceId\":\"$ES\",\"memberInstanceIds\":[{\"instanceId\":\"$ES\"},{\"instanceId\":\"$P1\"},{\"instanceId\":\"$P2\"},{\"instanceId\":\"$P3\"}]}" >/dev/null
rec $N/document-state "{\"fieldValues\":{\"essay\":\"$ES\",\"hidden_instance_ids\":[],\"draft_container_id\":\"$DC\"}}" >/dev/null
srs repo validate --repo $W | python3 -c "import sys,json; print(json.load(sys.stdin)[\"payload\"][\"summary\"])"
srs repo copy --from $W --to "$OUT" >/dev/null
