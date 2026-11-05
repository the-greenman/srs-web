<!--
  ChangesPanel — what changed since the last save, grouped Added / Changed / Removed, each entry
  with its title, kind and (when the engine knows) who made it. Presentation only: the diff comes
  from the engine's `changes` read (srs-rust#1522) via $lib/document-changes. `onOpen` is called
  with an entry's id when it names a record the host can show (`canOpen`, default all); any other
  entry is plain text, never a link that does nothing. Wraps .changes*
  (src/styles/components/changes-panel.css). srs-web#587
-->
<script lang="ts">
  import type { DocumentChanges } from '../document-changes.js';

  let {
    changes,
    onOpen,
    canOpen = () => true,
  }: {
    changes: DocumentChanges;
    onOpen?: (id: string) => void;
    canOpen?: (id: string) => boolean;
  } = $props();
</script>

<section class="changes" data-testid="changes-panel" aria-label="Unsaved changes">
  {#if changes.total === 0}
    <p class="changes__empty" data-testid="changes-empty">Nothing has changed since the last save.</p>
  {:else}
    {#each changes.groups as group (group.key)}
      <div class="changes__group" data-group={group.key}>
        <h3 class="changes__heading">{group.label} <span class="changes__count">{group.items.length}</span></h3>
        <ul class="changes__list">
          {#each group.items as item, i (item.id ?? `${item.kind}-${i}`)}
            <li class="changes__item" data-kind={item.kind}>
              {#if item.id && onOpen && group.key !== 'removed' && item.kind !== 'container' && canOpen(item.id)}
                <button type="button" class="changes__link" onclick={() => onOpen(item.id!)}>{item.title}</button>
              {:else}
                <span class="changes__title">{item.title}</span>
              {/if}
              <span class="changes__kind">{item.kind}</span>
              {#if item.by}<span class="changes__by">by {item.by}</span>{/if}
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  {/if}
</section>
