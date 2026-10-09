# Builds e2e/fixtures/method.srsj (srs-web#526): the srs-programme method package, 1 domain, 1 cluster,
# 2 personas, 1 trade-off side and 3 agent-suggested problems in Suggestions, plus empty Affirmed and
# Set aside containers; the cluster, personas and 2 remedies (one answering two problems) sit in Suggestions too (srs-web#541). Built with the srs CLI (build.490), never by hand.
# Usage: PKG=<srs-programme/packages/method> COMMENTS=<com.semanticops.comments-1.0.0.srspkg> bash build-method-fixture.sh <out.srsj>
set -e
rm -f "${1:?out.srsj}"
OUT=${1:?out.srsj}; W=$(mktemp -d)/method
srs repo create --repo $W --namespace com.semanticops.programme --title "Method fixture" >/dev/null
rm -rf $W/package && cp -r "${PKG:?PKG}" $W/package
N=com.semanticops.method
ok() { python3 -c 'import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get("ok") else str(d))'; }
rec() { echo "$2" | srs record create --repo $W --type "$N/$1" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["payload"]["record"]["instanceId"] if d.get("ok") else sys.exit(str(d)))'; }
rel() { echo "{\"relationType\":\"$1\",\"sourceInstanceId\":\"$2\",\"targetInstanceId\":\"$3\"}" | srs relation create --repo $W | ok; }
cont() { echo "$1" | srs container create --repo $W | ok; }
export SRS_ACTOR='{"kind":"ai","id":"agent:method-scout","name":"Method scout"}'
D=$(rec domain '{"fieldValues":{"title":"Writing and review","purpose":"Writing in the editor and reviewing what agents suggest."}}')
C=$(rec cluster '{"fieldValues":{"title":"Leaving the editor","description":"Work cannot come back once it leaves."}}')
OWNER=$(rec persona '{"fieldValues":{"title":"Owner","summary":"Decides what the method affirms."}}')
WRITER=$(rec persona '{"fieldValues":{"title":"Writer","summary":"Writes essays in the editor."}}')
T=$(rec tension '{"fieldValues":{"title":"Testimony and authority"}}')
POLE=$(rec pole '{"fieldValues":{"title":"Testimony","looks_like":"Claims carry who made them."}}')
rel contains $D $C; rel contains $T $POLE
R1=$(rec remedy '{"fieldValues":{"title":"A return path for edited documents","move":"Let a document edited elsewhere come back as a new version.","does_not_fix":"Merging two edits to one paragraph.","falsifier":"Writers still export and never return.","return_when":"Round trips are routine."}}')
R2=$(rec remedy '{"fieldValues":{"title":"Weekly suggestions digest","move":"Send the owner one digest of what is waiting."}}')
export SRS_ACTOR='{"kind":"ai","id":"agent:rebel","name":"Rebel scout"}'
P1=$(rec problem '{"fieldValues":{"problem_id":"SP-1","title":"A document cannot leave and return","statement":"Work edited elsewhere cannot come back.","kind":"condition","source_ref":["semanticops.com#21","muDemocracy.org#36"]}}')
P2=$(rec problem '{"fieldValues":{"problem_id":"SP-2","title":"Suggestions pile up unseen","statement":"Agent suggestions wait in a queue nobody reads.","kind":"consequence","imbalance":"missing","source_ref":["https://example.org/notes"]}}')
export SRS_ACTOR='{"kind":"ai","id":"agent:analyst","name":"Analyst scout"}'
P3=$(rec problem '{"fieldValues":{"problem_id":"SP-3","title":"A brief replaces reading the source","statement":"Agents answer from the brief alone.","kind":"belief"}}')
for P in $P1 $P2 $P3; do rel contains $C $P; done
rel $N/held-by $P1 $WRITER; rel $N/held-by $P2 $OWNER; rel $N/held-by $P3 $OWNER
rel $N/concerns $P2 $POLE
rel $N/answers $R1 $P1; rel $N/answers $R1 $P3; rel $N/answers $R2 $P2
cont "{\"title\":\"Suggestions\",\"memberInstanceIds\":[{\"instanceId\":\"$P1\"},{\"instanceId\":\"$P2\"},{\"instanceId\":\"$P3\"},{\"instanceId\":\"$C\"},{\"instanceId\":\"$OWNER\"},{\"instanceId\":\"$WRITER\"},{\"instanceId\":\"$R1\"},{\"instanceId\":\"$R2\"}]}"
cont "{\"title\":\"Affirmed\",\"memberInstanceIds\":[]}"
cont "{\"title\":\"Set aside\",\"memberInstanceIds\":[]}"
# one human comment on P2 (com.semanticops.comments), so the board card shows a comment chip
srs package install --repo $W --bundle "${COMMENTS:?COMMENTS}" | ok
CM=$(echo '{"fieldValues":{"comment_text":"Which queue, exactly?"}}' | srs record create --repo $W --type com.semanticops.comments/comment | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["payload"]["record"]["instanceId"] if d.get("ok") else sys.exit(str(d)))')
rel com.semanticops.comments/comments-on $CM $P2
srs repo validate --repo $W | python3 -c "import sys,json; print(json.load(sys.stdin)[\"payload\"][\"summary\"])"
srs repo copy --from $W --to "$OUT" >/dev/null
