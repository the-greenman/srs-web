<!--
  CopyField — a readonly mono value with a Copy button that flips to "Copied" briefly. Used for the
  connector URL, the pairing code and the direct URL in McpConnection. `testid` goes on the input,
  `${testid}-copy` on the button. Wraps .mcp-conn__url. srs-web#447
-->
<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import Copy from '@lucide/svelte/icons/copy';
  import { copyText } from '$lib/clipboard.js';
  import IconButton from './IconButton.svelte';
  import Input from './Input.svelte';

  let { value, label, buttonLabel, testid }: { value: string; label: string; buttonLabel: string; testid: string } = $props();

  let copied = $state(false);
  async function copy() {
    // false (unavailable or denied): the value stays selectable in the field
    if (!(await copyText(value))) return;
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
</script>

<div class="mcp-conn__url" data-part="url">
  <Input readonly {value} aria-label={label} data-part="input" data-testid={testid} onfocus={(e) => e.currentTarget.select()} />
  <IconButton icon={copied ? Check : Copy} variant="outline" label={copied ? 'Copied' : buttonLabel} onclick={copy} data-testid="{testid}-copy" />
</div>
