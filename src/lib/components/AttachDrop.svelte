<!--
  AttachDrop — a focusable zone that takes text files by drop, paste or the file picker (#503).
  Every path goes through checkFiles; accepted files go to `onfiles`, rejections show in a warning
  Notice. A drag without Files (the paragraph reorder, DRAG_MIME) is ignored. Paste is handled only
  while the zone has focus. `state` and `rejected` only force a look, for the styleguide. Extra
  attributes go to the root. Wraps .file-drop (file-drop.css); tokens `--file-drop-*`;
  parts `icon label hint input`.
-->
<script lang="ts">
  import Paperclip from '@lucide/svelte/icons/paperclip';
  import type { HTMLAttributes } from 'svelte/elements';
  import { ACCEPT, checkFiles, readFile, type AttachFile, type AttachPolicy } from './attach-check.js';
  import { formatBytes } from '../format-bytes.js';
  import Notice from './Notice.svelte';

  let {
    policy,
    usedBytes = 0,
    onfiles,
    busy = false,
    compact = false,
    label = 'Attach text files',
    state: forced,
    rejected: initialRejected = [],
    class: klass = '',
    ...rest
  }: {
    policy?: AttachPolicy;
    usedBytes?: number;
    onfiles: (files: AttachFile[]) => void | Promise<void>;
    busy?: boolean;
    compact?: boolean;
    label?: string;
    state?: 'idle' | 'over';
    rejected?: { name: string; reason: string }[];
    class?: string;
  } & Omit<HTMLAttributes<HTMLDivElement>, 'onpaste'> = $props();

  let over = $state(false);
  let rejected = $state(initialRejected);
  let input: HTMLInputElement;
  const isOver = $derived(forced ? forced === 'over' : over);
  const hint = $derived(`Drop, paste or choose text files · up to ${formatBytes(policy?.maxPerFileBytes ?? 1_048_576)} each`);

  async function take(files: File[]) {
    const result = checkFiles(files, policy, usedBytes);
    rejected = result.rejected;
    if (!result.accepted.length) return;
    await onfiles(
      await Promise.all(result.accepted.map(async (f) => ({ name: f.name, type: f.type, bytes: await readFile(f) })))
    );
  }
  const hasFiles = (e: DragEvent) => e.dataTransfer?.types?.includes('Files') ?? false;
  function drag(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    over = true;
  }
  function drop(e: DragEvent) {
    over = false;
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation(); // inside a paragraph: the row's own file drop must not take it again
    if (!busy) void take(Array.from(e.dataTransfer?.files ?? []));
  }
  function paste(e: ClipboardEvent) {
    if (busy) return;
    const files = Array.from(e.clipboardData?.files ?? []);
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!files.length && !text.trim()) return;
    e.preventDefault();
    const name = `pasted-${new Date().toISOString().replaceAll(':', '-')}.md`;
    void take(files.length ? files : [new File([text], name, { type: 'text/markdown' })]);
  }
  function pick() {
    const files = Array.from(input.files ?? []);
    input.value = '';
    void take(files);
  }
  function key(e: KeyboardEvent) {
    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      input.click();
    }
  }
</script>

<div
  class={`file-drop ${compact ? 'file-drop--compact' : ''} ${isOver ? 'file-drop--over' : ''} ${klass}`}
  role="button"
  tabindex="0"
  aria-label={label}
  aria-busy={busy}
  onclick={(e) => e.target !== input && input.click()}
  onkeydown={key}
  ondragenter={drag}
  ondragover={drag}
  ondragleave={() => (over = false)}
  ondrop={drop}
  onpaste={paste}
  {...rest}
>
  <span class="file-drop__icon" data-part="icon"><Paperclip size={16} aria-hidden="true" /></span>
  <span class="file-drop__label" data-part="label">{busy ? 'Attaching…' : label}</span>
  {#if !compact && !busy}<span class="file-drop__hint" data-part="hint">{hint}</span>{/if}
  <input bind:this={input} class="sr-only" data-part="input" type="file" multiple accept={ACCEPT} disabled={busy} tabindex="-1" onchange={pick} />
</div>
{#if rejected.length}
  <Notice kind="warning">
    {#each rejected as r, i (i)}<div>{r.name}: {r.reason}</div>{/each}
  </Notice>
{/if}
