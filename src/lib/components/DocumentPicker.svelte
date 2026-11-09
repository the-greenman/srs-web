<!--
  DocumentPicker — the document title as the control (srs-web#425, phase 6). The current title reads as the
  bar's title with a chevron; it opens a searchable combobox on the Popover: a filter input, Recent documents
  first, then all, each title in full (wrapping), the current one marked, and an optional "New document" row.
  ARIA combobox + listbox: focus stays in the input, `aria-activedescendant` names the highlighted option;
  Arrow keys, Home and End move, Enter chooses, Escape closes (the Popover). Rules: src/lib/document-picker.ts.
  Recents are remembered per repository when `storageKey` is given. Fills the Toolbar's `titleSlot`.
  Wraps .doc-picker (src/styles/components/doc-picker.css). Parts: trigger, search, list, option, new.
-->
<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Check from '@lucide/svelte/icons/check';
  import Popover from './Popover.svelte';
  import { loadRecents, moveActive, pickerRows, pushRecent, saveRecents, type PickerOption } from '../document-picker.js';

  let {
    options,
    currentId = null,
    label,
    storageKey,
    onselect,
    onnew,
    testid = 'doc-picker',
  }: {
    options: PickerOption[];
    currentId?: string | null;
    /** Accessible name, e.g. "Essay". */
    label: string;
    storageKey?: string;
    onselect: (id: string) => void;
    /** Adds a "New document" row at the bottom. */
    onnew?: () => void;
    testid?: string;
  } = $props();

  const uid = $props.id();
  const store = () => (typeof localStorage === 'undefined' ? undefined : localStorage);
  let open = $state(false);
  let query = $state('');
  let active = $state(-1);
  // svelte-ignore state_referenced_locally -- the key names the repository for the lifetime of the picker
  let recents = $state<string[]>(storageKey ? loadRecents(storageKey, store()) : []);

  const current = $derived(options.find((o) => o.id === currentId));
  const rows = $derived(pickerRows(options, recents, query));
  const optionId = (i: number) => `${uid}-opt-${i}`;
  const showGroups = $derived(!query.trim() && rows.some((r) => r.recent) && rows.some((r) => !r.recent));

  // Opening resets the search and highlights the current document.
  $effect(() => {
    if (open) {
      query = '';
      active = pickerRows(options, recents, '').findIndex((r) => r.id === currentId);
    }
  });
  $effect(() => {
    if (open && active >= 0) document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' });
  });

  function choose(id: string) {
    open = false;
    recents = pushRecent(recents, id);
    if (storageKey) saveRecents(storageKey, recents, store());
    if (id !== currentId) onselect(id);
  }
  function keydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      active = moveActive(rows.length, active, e.key);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[active] ?? (rows.length === 1 ? rows[0] : undefined);
      if (row) choose(row.id);
    }
  }
</script>

<span class="doc-picker" data-part="doc-picker" data-testid={testid}>
  <Popover bind:open role="dialog" label={`${label} switcher`} placement="bottom-start" class="doc-picker__surface">
    {#snippet trigger({ props })}
      <button
        type="button"
        class="doc-picker__trigger"
        data-part="trigger"
        data-testid={`${testid}-trigger`}
        title={current?.title}
        aria-label={current ? `${label}: ${current.title}. Switch` : `${label}: choose`}
        {...props}
      >
        <span class="doc-picker__title">{current?.title ?? `Choose ${label.toLowerCase()}`}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
    {/snippet}
    <input
      class="doc-picker__search"
      data-part="search"
      data-autofocus
      data-testid={`${testid}-search`}
      type="search"
      role="combobox"
      aria-label={`Search ${label.toLowerCase()}s`}
      aria-expanded="true"
      aria-controls={`${uid}-list`}
      aria-activedescendant={active >= 0 ? optionId(active) : undefined}
      aria-autocomplete="list"
      placeholder="Search"
      autocomplete="off"
      bind:value={query}
      oninput={() => (active = rows.length ? 0 : -1)}
      onkeydown={keydown}
    />
    <ul class="doc-picker__list" id={`${uid}-list`} role="listbox" aria-label={label} data-part="list">
      {#each rows as row, i (row.id)}
        {#if showGroups && (i === 0 || rows[i - 1].recent !== row.recent)}
          <li class="doc-picker__group" role="presentation">{row.recent ? 'Recent' : 'All'}</li>
        {/if}
        <!-- svelte-ignore a11y_click_events_have_key_events -- keys are handled by the combobox input (aria-activedescendant) -->
        <li
          id={optionId(i)}
          class="doc-picker__option"
          class:is-active={i === active}
          role="option"
          aria-selected={row.id === currentId}
          data-part="option"
          data-testid={`${testid}-option`}
          onclick={() => choose(row.id)}
          onpointermove={() => (active = i)}
        >
          <span class="doc-picker__mark">{#if row.id === currentId}<Check size={14} aria-hidden="true" />{/if}</span>
          <span class="doc-picker__text">{row.title}</span>
        </li>
      {:else}
        <li class="doc-picker__empty" role="presentation" data-part="empty">No match</li>
      {/each}
    </ul>
    {#if onnew}
      <button
        type="button"
        class="doc-picker__new"
        data-part="new"
        data-testid={`${testid}-new`}
        onclick={() => {
          open = false;
          onnew?.();
        }}>New document</button
      >
    {/if}
  </Popover>
</span>
