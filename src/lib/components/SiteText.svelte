<!--
  SiteText — one field of a website block, edited in place as plain text (srs-web#680, ADR-029).
  Only typing commits: focusing and leaving the field never writes; Esc reverts. The text is read
  from the DOM's text nodes (a <br> as a newline), never from CSS-dependent innerText.
  Wraps .site-text (src/styles/components/site.css).
-->
<script lang="ts">
  let {
    value,
    label,
    placeholder = "",
    multiline = true,
    readonly = false,
    heading = false,
    oncommit,
  }: {
    value: string;
    label: string;
    placeholder?: string;
    /** Enter adds a line; otherwise Enter commits. */
    multiline?: boolean;
    readonly?: boolean;
    /** The block's first field reads as its heading (ADR-029 E1). */
    heading?: boolean;
    oncommit: (value: string) => void;
  } = $props();

  let el = $state<HTMLElement>();
  let typed = false;

  function read(node: Node): string {
    let s = "";
    for (const c of Array.from(node.childNodes))
      s += c.nodeType === Node.TEXT_NODE ? (c as Text).data : c.nodeName === "BR" ? "\n" : read(c);
    return s;
  }
  function done() {
    const v = el ? read(el).replace(/\n$/, "") : value;
    if (typed && v !== value) oncommit(v);
    typed = false;
  }
  function keydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (el) el.textContent = value;
      typed = false;
      el?.blur();
    } else if (e.key === "Enter" && !e.shiftKey && !multiline) {
      e.preventDefault();
      el?.blur();
    }
  }
</script>

<!-- Rebuilt whenever the stored text changes, so what is shown is always the engine's text. -->
{#key value}
  <div
    bind:this={el}
    class="site-text"
    class:site-text--heading={heading}
    contenteditable={readonly ? "false" : "plaintext-only"}
    role="textbox"
    tabindex="0"
    aria-label={label}
    aria-readonly={readonly}
    aria-multiline={multiline}
    data-placeholder={placeholder}
    spellcheck="true"
    onblur={done}
    oninput={() => (typed = true)}
    onkeydown={keydown}
  >{value}</div>
{/key}
