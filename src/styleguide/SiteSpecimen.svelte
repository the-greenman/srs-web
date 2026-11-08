<!--
  SiteSpecimen — the site editor canvas (srs-web#680, ADR-029 E1): a hero, a selected prose block
  with its brief shown and one empty field, and a group and its two items; then the site menu
  (srs-web#681, E7): two page items, a dropdown heading with a link entry and a page entry. Specimens
  only; edits are no-ops.
-->
<script lang="ts">
  import { SiteBlock, SiteCanvas, SiteMenu, SiteText } from "$lib/components";

  const noop = () => {};
  let selected = $state("prose");
</script>

<SiteCanvas label="Site page specimen">
  <SiteBlock
    typeLabel="Hero"
    selected={selected === "hero"}
    onselect={() => (selected = "hero")}
    onedit={noop}
    fields={[
      { name: "headline", label: "Headline", value: "Decisions power change.", editable: true },
      { name: "kicker", label: "Kicker", value: "Together.", editable: true },
      { name: "supporting_copy", label: "Supporting copy", value: "Decision making is a craft we can learn.", editable: true },
    ]}
  />
  <SiteBlock
    typeLabel="Prose"
    selected={selected === "prose"}
    onselect={() => (selected = "prose")}
    onedit={noop}
    brief={[
      { label: "Audience", value: "People who run small groups" },
      { label: "Objective", value: "" },
    ]}
    fields={[
      { name: "section_heading", label: "Heading", value: "Decision making is a literacy", editable: true },
      { name: "section_body", label: "Body", value: "", editable: true },
    ]}
  />
  <SiteBlock
    typeLabel="FAQ"
    selected={selected === "faq"}
    onselect={() => (selected = "faq")}
    onedit={noop}
    fields={[{ name: "section_heading", label: "Heading", value: "Questions.", editable: true }]}
  />
  <!-- A group's items are blocks of their own; on the page the shell indents them under the group. -->
  {#each [["Who decides?", "The group, in the open."], ["What is recorded?", "The decision, and why."]] as [q, a] (q)}
    <SiteBlock
      typeLabel="Question"
      onselect={noop}
      onedit={noop}
      fields={[
        { name: "faq_question", label: "Question", value: q, editable: true },
        { name: "faq_answer", label: "Answer", value: a, editable: true },
      ]}
    />
  {/each}
</SiteCanvas>
<p class="sg__note">One field on its own, read-only:</p>
<SiteText value="A read-only field" label="Read-only field" readonly oncommit={noop} />
<p class="sg__note">The site menu: page items show their page's address; a link item's is edited.</p>
<SiteMenu
  items={[
    { id: "m1", label: "Home", depth: 0, pageKey: "home", href: "/" },
    { id: "m2", label: "About", depth: 0, pageKey: "about", href: "/about" },
    { id: "m3", label: "Guides", depth: 0 },
    { id: "m4", label: "Recording", depth: 1, href: "/guides/recording" },
    { id: "m5", label: "Community", depth: 1, pageKey: "community", href: "/community" },
  ]}
  pages={[{ value: "p1", label: "Contact (/contact)" }]}
  onrename={noop}
  onhref={noop}
  onshift={noop}
  onaddpage={noop}
  onaddlink={noop}
/>
