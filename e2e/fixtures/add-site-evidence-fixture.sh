# Adds evidence to the site fixture (srs-web#694 PR 1): the essay package (source, quotation; with the
# comments package it requires), a minimal com.mudemocracy/claim type (claim_id, title, warrant_level,
# the real ids) and the `challenges` relation type copied from muSrs, then what backs which block:
#   home  hero        <- evidences: a quotation (secondary), derived-from the verified source
#         prose Why   <- evidences: the verified source; challenges: a claim (tertiary)
#         faq q1      <- evidences: the verified source (an item)
#   about hero        tagged our-reading, no evidence
#         prose story <- evidences: a recalled source only (weak)
# Called by build-site-fixture.sh, and run once on its own over an unpacked site.srsj, so the earlier
# records keep their ids. Usage: MU=<muSrs> ESSAY=essay.srspkg COMMENTS=comments.srspkg bash add-site-evidence-fixture.sh <repo dir>
set -e
W=${1:?repo dir}; MU=${MU:?muSrs dir}; ESSAY=${ESSAY:?essay.srspkg}; COMMENTS=${COMMENTS:?comments.srspkg}
srs package install --repo $W --bundle "$COMMENTS" >/dev/null
srs package install --repo $W --bundle "$ESSAY" >/dev/null
srs relation-type create --repo $W < "$MU/package/relation-types/challenges-e3ccd8f7.json" >/dev/null
srs field create --repo $W < "$MU/package/fields/claimid-3ab45ec6.json" >/dev/null
python3 -c 'import json,sys; t=json.load(open(sys.argv[1])); keep=["3ab45ec6-50d5-43dc-a5bb-f68d13b33a91","db580a8d-7662-48ce-bc7f-e50e4a7cccd1","ea742151-a85e-42a7-b6e2-38e293716407"]; t["fields"]=[f for f in t["fields"] if f["fieldId"] in keep]; t["description"]="Fixture claim: claim_id, title and warrant_level only."; [t.pop(k,None) for k in ("fieldOrder","views","lifecycleRef")]; print(json.dumps(t))' "$MU/package/types/claim-d6224314.json" \
  | srs type create --repo $W >/dev/null
# the site's record tags, closed: installing the essay package declares vocabularies, so a tag must
# resolve to a term (muSrs passes only because an unrelated open vocabulary admits every tag)
echo '{"id":"7a0e3c55-2f4b-4c1e-9d6a-5b8f0e2d4c11","namespace":"org.example.site","name":"site-tags","version":1,"mode":"closed","terms":[{"id":"0b5d2e1f-6a3c-4f7e-8d9b-1c2e3f4a5b6c","version":1,"namespace":"org.example.site","key":"our-reading","label":"Our reading","description":"The project's own reading, awaiting the owner's decision."}]}' \
  | srs vocabulary create --repo $W >/dev/null
rec() { echo "$2" | srs record create --repo $W --type "$1" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["payload"]["record"]["instanceId"] if d.get("ok") else sys.exit(str(d)))'; }
rel() { echo "{\"relationType\":\"$1\",\"sourceInstanceId\":\"$2\",\"targetInstanceId\":\"$3\"}" | srs relation create --repo $W | python3 -c 'import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get("ok") else str(d))'; }
# a block by its type and one field's value (the records build-site-fixture.sh made)
block() { srs record list --repo $W --type "$1" | python3 -c 'import sys,json; k,v=sys.argv[1:]; d=json.load(sys.stdin)["payload"]["records"]; print([r["instanceId"] for r in d if r["record"]["fieldValues"].get(k)==v][0])' "$2" "$3"; }
N=com.mudemocracy.website; A=com.mudemocracy.argument
H1=$(block $N/hero headline "Decisions power change.")
H2=$(block $N/homepage-prose section_heading "Why")
F1=$(block $N/faq-item faq_item_key q1)
A1=$(block $N/hero headline "About.")
A2=$(block $N/homepage-prose section_heading "Our story")
SV=$(rec $A/source '{"fieldValues":{"title":"A verified source","source_kind":"book","citation":"Author, A verified source (2020)","source_url":"https://example.org/verified","warrant_level":"verified"}}')
SR=$(rec $A/source '{"fieldValues":{"title":"A recalled source","source_kind":"conversation","warrant_level":"recalled"}}')
Q=$(rec $A/quotation '{"fieldValues":{"title":"The quoted words","quote_text":"Decisions are made together.","locator":"p. 12","warrant_level":"secondary"}}')
C=$(rec com.mudemocracy/claim '{"fieldValues":{"claim_id":"C-1","title":"A counter-claim","warrant_level":"tertiary"}}')
rel derived-from $Q $SV
rel evidences $Q $H1
rel evidences $SV $H2; rel challenges $C $H2
rel evidences $SV $F1
rel evidences $SR $A2
srs record get $A1 --repo $W | python3 -c 'import sys,json; r=json.load(sys.stdin)["payload"]["record"]; r["tags"]=sorted(set((r.get("tags") or [])+["our-reading"])); print(json.dumps(r))' \
  | srs record update $A1 --repo $W >/dev/null
