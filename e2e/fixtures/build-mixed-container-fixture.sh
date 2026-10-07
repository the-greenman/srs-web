# Builds e2e/fixtures/mixed-container.srsj: one container holding a Tier-0 note and two records
# (srs-web#483: a note member has no `record` in resolve_container_view). Built with the srs CLI, never by hand.
# Usage: PKG=<path to muSrs/packages/essay> bash build-mixed-container-fixture.sh <out.srsj>
set -e
rm -f "${1:?out.srsj}"
OUT=${1:?out.srsj}; W=$(mktemp -d)/mixed
srs repo create --repo $W --namespace com.mudemocracy.essay --title "Mixed container fixture" >/dev/null
rm -rf $W/package && cp -r "$PKG" $W/package
id() { python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["payload"]["'$1'"]["instanceId"] if d.get("ok") else sys.exit(str(d)))'; }
N=com.mudemocracy.essay
NOTE=$(echo '{"title":"A loose note","sections":[{"name":"body","content":"Just a note."}]}' | srs note create --repo $W | id note)
P1=$(echo '{"fieldValues":{"paragraph_title":"First","body":"One."}}' | srs record create --repo $W --type $N/paragraph | id record)
P2=$(echo '{"fieldValues":{"paragraph_title":"Second","body":"Two."}}' | srs record create --repo $W --type $N/paragraph | id record)
echo "{\"title\":\"Mixed bag\",\"memberInstanceIds\":[{\"instanceId\":\"$NOTE\"},{\"instanceId\":\"$P1\"},{\"instanceId\":\"$P2\"}]}" | srs container create --repo $W | python3 -c 'import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get("ok") else str(d))'
srs repo validate --repo $W | python3 -c "import sys,json; print(json.load(sys.stdin)[\"payload\"][\"summary\"])"
srs repo copy --from $W --to "$OUT" >/dev/null
