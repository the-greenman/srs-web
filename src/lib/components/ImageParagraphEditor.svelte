<!--
  ImageParagraphEditor — add or edit one essay image paragraph (srs-web#765): the image by picker or
  drop (AttachDrop, kind="image"), alt text (required: nothing is saved without it), an optional
  plain-text caption, the size and, at original size only, the alignment (decisions b2b5c488, 72bcd83e).
  A preview shows the result as the reader will see it. `onsave` returns the refusal to show (plain
  words) or null; Escape or Cancel leaves without writing. Presentation only: the shell writes.
  Wraps .image-editor (image-paragraph.css).
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import AttachDrop from './AttachDrop.svelte';
  import Button from './Button.svelte';
  import Field from './Field.svelte';
  import ImageParagraph from './ImageParagraph.svelte';
  import Input from './Input.svelte';
  import Notice from './Notice.svelte';
  import Select from './Select.svelte';
  import { type AttachFile, type AttachPolicy, imagePolicy } from './attach-check.js';
  import type { ImageAlign, ImageFields, ImageSize } from '../essay/image-paragraph.js';

  let {
    id,
    initial,
    bytes = null,
    policy,
    attachedBytes = 0,
    onsave,
    oncancel,
  }: {
    /** Unique per editor, for the controls' ids. */
    id: string;
    /** The paragraph's values when editing; absent = a new image paragraph, which needs a file. */
    initial?: ImageFields;
    /** The image already attached, for the preview. */
    bytes?: Uint8Array | null;
    /** The repository's attachment policy; the image check keeps it where it is stricter. */
    policy?: AttachPolicy;
    attachedBytes?: number;
    onsave: (fields: ImageFields, file: AttachFile | null) => Promise<string | null>;
    oncancel: () => void;
  } = $props();

  const start = untrack(() => initial);
  let alt = $state(start?.alt ?? '');
  let caption = $state(start?.caption ?? '');
  let size = $state<ImageSize>(start?.size ?? 'full-width');
  let align = $state<ImageAlign>(start?.align ?? 'centre');
  let file = $state<AttachFile | null>(null);
  let refusal = $state<string | null>(null);
  let busy = $state(false);
  const needsFile = $derived(!initial);
  const ready = $derived(!!alt.trim() && (!needsFile || !!file) && !busy);
  const shown = $derived(file?.bytes ?? bytes);

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!ready) return;
    busy = true;
    refusal = await onsave({ alt, caption, size, align }, file);
    busy = false;
  }
  function choose(files: AttachFile[]) {
    file = files[0] ?? null;
    refusal = null;
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form
  class="image-editor"
  aria-label={needsFile ? 'New image paragraph' : 'Edit image paragraph'}
  data-testid="image-editor"
  onsubmit={save}
  onkeydown={(e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      oncancel();
    }
  }}
>
  {#if shown}
    <ImageParagraph alt={alt.trim() || 'Image preview'} caption={caption.trim()} {size} {align} bytes={shown} />
  {/if}
  {#if needsFile}
    <AttachDrop
      kind="image"
      label={file ? `Image: ${file.name} (choose another)` : 'Choose an image'}
      policy={imagePolicy(policy)}
      {attachedBytes}
      busy={busy}
      onfiles={choose}
      data-testid="image-drop"
    />
  {/if}
  <Field label="Alt text" required id={`${id}-alt`} help="What the image shows, for someone who can't see it.">
    <Input id={`${id}-alt`} bind:value={alt} required autocomplete="off" data-testid="image-alt" />
  </Field>
  <Field label="Caption" id={`${id}-caption`} help="Optional. Shown under the image as plain text.">
    <Input id={`${id}-caption`} bind:value={caption} autocomplete="off" data-testid="image-caption" />
  </Field>
  <div class="image-editor__layout">
    <Field label="Size" id={`${id}-size`}>
      <Select
        id={`${id}-size`}
        bind:value={size}
        options={[
          { value: 'full-width', label: 'Full width' },
          { value: 'original', label: 'Original size' },
        ]}
        data-testid="image-size"
      />
    </Field>
    <Field label="Alignment" id={`${id}-align`} help={size === 'original' ? undefined : 'At original size only.'}>
      <Select
        id={`${id}-align`}
        bind:value={align}
        disabled={size !== 'original'}
        options={[
          { value: 'left', label: 'Left' },
          { value: 'centre', label: 'Centre' },
          { value: 'right', label: 'Right' },
        ]}
        data-testid="image-align"
      />
    </Field>
  </div>
  {#if refusal}<Notice kind="warning" data-testid="image-refusal">{refusal}</Notice>{/if}
  <div class="image-editor__actions">
    <Button type="submit" variant="primary" disabled={!ready} data-testid="image-save">{needsFile ? 'Add image' : 'Save'}</Button>
    <Button type="button" variant="ghost" onclick={oncancel} data-testid="image-cancel">Cancel</Button>
  </div>
</form>
