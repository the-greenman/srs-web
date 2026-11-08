<!--
  SiteMenu — a website's menu in the site editor (srs-web#681, ADR-029 E7): the bar's items, each
  dropdown entry indented under its bar item. Each row renames in place; a link item's address is
  edited too, a page item's follows its page. Up and Down reorder among siblings; Indent moves an
  item into the dropdown of the item above, Outdent back to the bar. One dropdown level: Indent is
  off for a dropdown entry and for a bar item that has its own dropdown. Wraps .site-menu (site.css).
-->
<script lang="ts">
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import ListIndentDecrease from "@lucide/svelte/icons/list-indent-decrease";
  import ListIndentIncrease from "@lucide/svelte/icons/list-indent-increase";
  import Button from "./Button.svelte";
  import IconButton from "./IconButton.svelte";
  import Input from "./Input.svelte";
  import Select from "./Select.svelte";

  export interface SiteMenuItem {
    id: string;
    label: string;
    depth: number;
    /** Set when the item goes to a page: its address follows the page. */
    pageKey?: string;
    href?: string;
  }
  export type SiteMenuShift = "up" | "down" | "indent" | "outdent";

  let {
    items,
    pages,
    onrename,
    onhref,
    onshift,
    onaddpage,
    onaddlink,
  }: {
    items: SiteMenuItem[];
    /** The pages an item may go to: value is the page's id, label its title and address. */
    pages: { value: string; label: string }[];
    onrename: (id: string, label: string) => void;
    onhref: (id: string, href: string) => void;
    onshift: (id: string, shift: SiteMenuShift) => void;
    onaddpage: (pageId: string) => void;
    onaddlink: () => void;
  } = $props();

  let pick = $state("");
  const hasDropdown = (i: number) => (items[i + 1]?.depth ?? 0) > items[i].depth;
</script>

<section class="site-menu" aria-label="Site menu">
  {#if items.length === 0}<p class="site-menu__empty">The menu is empty. Add a page or a link.</p>{/if}
  <ul class="site-menu__list">
    {#each items as item, i (item.id)}
      <li class="site-menu__item" class:site-menu__item--entry={item.depth > 0} data-testid="site-menu-item" data-depth={item.depth}>
        <Input aria-label="Menu label" value={item.label} onchange={(e) => onrename(item.id, e.currentTarget.value)} />
        {#if item.pageKey}
          <span class="site-menu__href" title="Follows the page's key">{item.href}</span>
        {:else}
          <Input aria-label={`Address of ${item.label}`} placeholder="none: a dropdown heading" value={item.href ?? ""} onchange={(e) => onhref(item.id, e.currentTarget.value)} />
        {/if}
        <span class="site-menu__actions">
          <IconButton icon={ArrowUp} label={`Move ${item.label} up`} onclick={() => onshift(item.id, "up")} />
          <IconButton icon={ArrowDown} label={`Move ${item.label} down`} onclick={() => onshift(item.id, "down")} />
          <IconButton icon={ListIndentIncrease} label={`Put ${item.label} in the dropdown above`} disabled={i === 0 || item.depth > 0 || hasDropdown(i)} onclick={() => onshift(item.id, "indent")} />
          <IconButton icon={ListIndentDecrease} label={`Move ${item.label} to the bar`} disabled={item.depth === 0} onclick={() => onshift(item.id, "outdent")} />
        </span>
      </li>
    {/each}
  </ul>
  <div class="site-menu__add">
    <Select aria-label="Page to add" data-testid="site-menu-page" value={pick} options={[{ value: "", label: "Choose a page" }, ...pages]} onchange={(e) => (pick = e.currentTarget.value)} />
    <Button size="sm" variant="mono" data-testid="site-menu-add-page" disabled={!pick} onclick={() => { onaddpage(pick); pick = ""; }}>Add page</Button>
    <Button size="sm" variant="mono" data-testid="site-menu-add-link" onclick={onaddlink}>Add link</Button>
  </div>
</section>
