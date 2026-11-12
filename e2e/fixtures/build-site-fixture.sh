# Builds e2e/fixtures/site.srsj (srs-web#680): a small website repository for the site editor core.
# The website package is the published bundle (packages-website-0.2.1: types (nav-item among them), the 16 Views, the
# `site` Composition and Theme), installed as a site would install it. muDemocracy's guides are
# not in that bundle, so the `uses` relation type and a minimal `com.mudemocracy/guide` type
# (slug and title, the real ids) are copied from muSrs. Pages:
#   home    published, closing-mark: hero, prose, faq-group (2 items), guide-section, primary-cta (1 card that uses a guide record);
#           drafts: an alternative derived-from faq item q1, and an unrelated hero; its prose is also in "Shared prose"
#   about   published, draft, layout:essay: hero, prose
#   scratch not published: prose
#   menu    Home and About (uses their pages), Guides with one dropdown entry (nav_href)
# Then add-site-evidence-fixture.sh: the essay package, a claim type, and what backs which block (srs-web#694).
# srs CLI build.595 (the bindings srs-web pins).
# Usage: gh release download packages-website-0.2.1 -R the-greenman/srs-web -p website.srspkg
#        gh release download packages-essay-1.11.0 / packages-comments-1.1.0 the same way
#        MU=<muDemocracy.org/muSrs> BUNDLE=website.srspkg ESSAY=essay.srspkg COMMENTS=comments.srspkg bash build-site-fixture.sh <out.srsj>
set -e
OUT=${1:?out.srsj}; rm -f "$OUT"; W=$(mktemp -d)/site; MU=${MU:?muSrs dir}; BUNDLE=${BUNDLE:?website.srspkg}; : ${ESSAY:?essay.srspkg} ${COMMENTS:?comments.srspkg}
srs repo create --repo $W --namespace org.example.site --title "Site fixture" >/dev/null
srs package install --repo $W --bundle "$BUNDLE" >/dev/null
srs relation-type create --repo $W < "$MU/package/relation-types/uses-ce533644.json" >/dev/null
for f in slug-2e3be0f8 title-e5b359b0; do srs field create --repo $W < "$MU/package/fields/$f.json" >/dev/null; done
echo '{"$schema":"https://srs.semanticops.com/schema/2.0/type.json","id":"8f138dd6-11d2-42a5-99ec-3d6e23bed54f","namespace":"com.mudemocracy","name":"guide","version":1,"description":"Fixture guide: slug and title only.","fields":[{"fieldId":"2e3be0f8-0000-0000-0000-000000000000","order":0,"required":true}],"identityFieldId":"2e3be0f8-0000-0000-0000-000000000000"}' \
  | python3 -c 'import json,sys,glob; t=json.load(sys.stdin); ids={json.load(open(f))["name"]:json.load(open(f))["id"] for f in glob.glob(sys.argv[1]+"/package/fields/*.json")}; t["fields"]=[{"fieldId":ids["slug"],"order":0,"required":True},{"fieldId":ids["title"],"order":1,"required":True}]; t["identityFieldId"]=ids["slug"]; print(json.dumps(t))' $W \
  | srs type create --repo $W >/dev/null
rec() { echo "$2" | srs record create --repo $W --type "$1" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["payload"]["record"]["instanceId"] if d.get("ok") else sys.exit(str(d)))'; }
cont() { echo "$1" | srs container create --repo $W | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["payload"]["container"]["containerId"] if d.get("ok") else sys.exit(str(d)))'; }
rel() { echo "{\"relationType\":\"$1\",\"sourceInstanceId\":\"$2\",\"targetInstanceId\":\"$3\"}" | srs relation create --repo $W | python3 -c 'import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get("ok") else str(d))'; }
N=com.mudemocracy.website
# a guide: its container (containerType guide) anchors the guide record; a section is a member
G=$(rec com.mudemocracy/guide '{"fieldValues":{"slug":"recording","title":"Recording a decision"}}')
GS=$(rec com.mudemocracy/guide '{"fieldValues":{"slug":"four-questions","title":"The four questions"}}')
cont "{\"title\":\"Guide · Recording a decision\",\"containerType\":\"guide\",\"anchorInstanceId\":\"$G\",\"memberInstanceIds\":[{\"instanceId\":\"$G\"},{\"instanceId\":\"$GS\"}]}" >/dev/null
brief='"section_key":"KEY","meta_objective":"brief objective","section_audience":"brief audience","editorial_objective":"brief editorial","action_intent":"brief intent"'
# home
HP=$(rec $N/homepage '{"fieldValues":{"page_key":"home","page_title":"Home","page_intent":"The homepage.","primary_audience":"brief audience","tone_guidance":"brief tone"}}')
H1=$(rec $N/hero "{\"fieldValues\":{${brief/KEY/opening},\"eyebrow\":\"Eyebrow\",\"headline\":\"Decisions power change.\",\"kicker\":\"Together.\",\"supporting_copy\":\"Supporting copy.\",\"presentation\":\"large\"}}")
H2=$(rec $N/homepage-prose "{\"fieldValues\":{${brief/KEY/why},\"section_heading\":\"Why\",\"section_body\":\"A prose body.\"}}")
FQ=$(rec $N/faq-group "{\"fieldValues\":{${brief/KEY/faq},\"section_heading\":\"Questions.\"}}")
F1=$(rec $N/faq-item '{"fieldValues":{"faq_item_key":"q1","faq_question":"First?","faq_answer":"Yes."}}')
F2=$(rec $N/faq-item '{"fieldValues":{"faq_item_key":"q2","faq_question":"Second?","faq_answer":"No."}}')
GB=$(rec $N/guide-section "{\"fieldValues\":{${brief/KEY/guide},\"render_as\":\"section\",\"section_heading\":\"From the guide\"}}")
PC=$(rec $N/primary-cta "{\"fieldValues\":{${brief/KEY/act},\"section_heading\":\"Start\",\"section_body\":\"Pick one.\"}}")
AC=$(rec $N/action-card '{"fieldValues":{"card_key":"record","section_heading":"Record a decision","action_label":"Read the guide","action_href":"/guides/recording"}}')
rel contains $FQ $F1; rel contains $FQ $F2; rel contains $PC $AC
rel uses $GB $GS; rel uses $AC $GS
cont "{\"title\":\"Home\",\"tags\":[\"published\",\"closing-mark\"],\"anchorInstanceId\":\"$HP\",\"memberInstanceIds\":[{\"instanceId\":\"$HP\"},{\"instanceId\":\"$H1\"},{\"instanceId\":\"$H2\"},{\"instanceId\":\"$FQ\"},{\"instanceId\":\"$F1\",\"depth\":1},{\"instanceId\":\"$F2\",\"depth\":1},{\"instanceId\":\"$GB\"},{\"instanceId\":\"$PC\"},{\"instanceId\":\"$AC\",\"depth\":1}]}" >/dev/null
# home's drafts (srs-web site editor ADR-029 E2: the prototype's id), with an alternative for q1 and
# an unrelated draft; and the prose block shared with a plain, non-page container
HC=$(srs container list --repo $W | python3 -c 'import sys,json; d=json.load(sys.stdin)["payload"]["containers"]; print([c["containerId"] for c in d if c["title"]=="Home"][0])')
DRAFTS=$(python3 -c 'import sys,uuid; print(uuid.uuid5(uuid.UUID("6f1d2c4e-8a3b-5c7d-9e0f-1a2b3c4d5e6f"), sys.argv[1]+":drafts"))' $HC)
D1=$(rec $N/faq-item '{"fieldValues":{"faq_item_key":"q1-alt","faq_question":"First, again?","faq_answer":"Yes, again."}}')
D2=$(rec $N/hero "{\"fieldValues\":{${brief/KEY/opening-alt},\"eyebrow\":\"\",\"headline\":\"Another opening.\",\"supporting_copy\":\"Draft copy.\"}}")
rel derived-from $D1 $F1
cont "{\"containerId\":\"$DRAFTS\",\"title\":\"Drafts · Home\",\"memberInstanceIds\":[{\"instanceId\":\"$D1\"},{\"instanceId\":\"$D2\"}]}" >/dev/null
cont "{\"title\":\"Shared prose\",\"memberInstanceIds\":[{\"instanceId\":\"$H2\"}]}" >/dev/null
# about
AP=$(rec $N/homepage '{"fieldValues":{"page_key":"about","page_title":"About","page_intent":"About us.","primary_audience":"brief audience","tone_guidance":"brief tone"}}')
A1=$(rec $N/hero "{\"fieldValues\":{${brief/KEY/opening},\"eyebrow\":\"\",\"headline\":\"About.\",\"supporting_copy\":\"Who we are.\"}}")
A2=$(rec $N/homepage-prose "{\"fieldValues\":{${brief/KEY/story},\"section_heading\":\"Our story\",\"section_body\":\"It began.\"}}")
# a note on a page (a comment, say) is not a block
AN=$(echo '{"title":"A note on the page","sections":[{"name":"body","label":"Body","content":"Not a block."}]}' | srs note create --repo $W | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["payload"]["note"]["instanceId"] if d.get("ok") else sys.exit(str(d)))')
cont "{\"title\":\"About\",\"tags\":[\"published\",\"draft\",\"layout:essay\"],\"anchorInstanceId\":\"$AP\",\"memberInstanceIds\":[{\"instanceId\":\"$AP\"},{\"instanceId\":\"$A1\"},{\"instanceId\":\"$AN\"},{\"instanceId\":\"$A2\"}]}" >/dev/null
# scratch, not published
SP=$(rec $N/homepage '{"fieldValues":{"page_key":"scratch","page_title":"Scratch","page_intent":"Not yet.","primary_audience":"brief audience","tone_guidance":"brief tone"}}')
S1=$(rec $N/homepage-prose "{\"fieldValues\":{${brief/KEY/note},\"section_heading\":\"Draft\",\"section_body\":\"Not yet.\"}}")
cont "{\"title\":\"Scratch\",\"anchorInstanceId\":\"$SP\",\"memberInstanceIds\":[{\"instanceId\":\"$SP\"},{\"instanceId\":\"$S1\"}]}" >/dev/null
# the menu (srs-web#681): the container tagged site-menu; Home and About use their pages, Guides is a
# dropdown heading over one code route
M1=$(rec $N/nav-item '{"fieldValues":{"nav_label":"Home"}}'); rel uses $M1 $HP
M2=$(rec $N/nav-item '{"fieldValues":{"nav_label":"About"}}'); rel uses $M2 $AP
M3=$(rec $N/nav-item '{"fieldValues":{"nav_label":"Guides"}}')
M4=$(rec $N/nav-item '{"fieldValues":{"nav_label":"Recording","nav_href":"/guides/recording"}}')
cont "{\"title\":\"Site menu\",\"tags\":[\"site-menu\"],\"memberInstanceIds\":[{\"instanceId\":\"$M1\"},{\"instanceId\":\"$M2\"},{\"instanceId\":\"$M3\"},{\"instanceId\":\"$M4\",\"depth\":1}]}" >/dev/null
# a container anchored on a Tier-0 note (as a conversation is in muSrs): not a page, and must not break listing
NOTE=$(echo '{"title":"A conversation","sections":[{"name":"narrative","label":"Narrative","content":"Not a page."}]}' | srs note create --repo $W | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["payload"]["note"]["instanceId"] if d.get("ok") else sys.exit(str(d)))')
cont "{\"title\":\"A conversation\",\"anchorInstanceId\":\"$NOTE\",\"identityInstanceId\":\"$NOTE\",\"memberInstanceIds\":[{\"instanceId\":\"$NOTE\"}]}" >/dev/null
MU=$MU ESSAY=$ESSAY COMMENTS=$COMMENTS bash "$(dirname "$0")/add-site-evidence-fixture.sh" $W
srs repo validate --repo $W | python3 -c "import sys,json; s=json.load(sys.stdin)[\"payload\"][\"summary\"]; print(s); sys.exit(1 if s[\"errors\"] else 0)"
srs repo copy --from $W --to "$OUT" >/dev/null
