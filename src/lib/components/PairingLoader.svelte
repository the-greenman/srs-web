<!--
  PairingLoader — owns the pairing data path for one open agent row: fetches on mount, refreshes at
  `expiresAt` (never faster than REFRESH_MIN_MS between calls), keeps the previous code visible when
  a refresh fails, announces a changed code through `notify`, and focuses the code on open.
  Headless: renders nothing, publishes the view and retry through bindable props. Unmount (rotate, disconnect, forget, Done)
  clears the timer and drops any in-flight result. srs-web#447
-->
<script module lang="ts">
  /** Minimum gap between any two pair() calls, success or failure. */
  export const REFRESH_MIN_MS = 5000;
</script>

<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { notify } from '$lib/notices.svelte.js';
  import type { PairingResponse } from '$lib/mcp/relay-protocol';
  import { StalePairing } from '$lib/mcp/relay-host.js';
  import { type PairingView, pairingMinutesLeft } from './agent-panel.js';

  let {
    pair,
    now,
    scope,
    view = $bindable(),
    retry = $bindable(),
  }: {
    pair: () => Promise<PairingResponse>;
    now: number;
    /** The element holding the pairing UI; focus lookups stay inside it. */
    scope: () => HTMLElement | null | undefined;
    view?: PairingView;
    retry?: () => void;
  } = $props();

  let data = $state<PairingResponse | null>(null);
  let error = $state<string | null>(null);
  // Bumped when a call settles, so the scheduling effect re-arms; it reads only this and `data`, never `now`.
  let settled = $state(0);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastCall = 0;
  let seq = 0;
  let alive = true;

  const focusCode = () =>
    tick().then(() => {
      const host = scope();
      const code = host?.querySelector<HTMLElement>('[data-testid="pair-code"]');
      if (code && (!host?.contains(document.activeElement) || document.activeElement?.matches('[data-testid="pair-close"]'))) code.focus();
      else if (!code) host?.querySelector<HTMLElement>('[data-testid="pair-close"]')?.focus();
    });

  async function run() {
    const mine = ++seq;
    lastCall = Date.now();
    try {
      const next = await pair();
      if (!alive || mine !== seq) return;
      const first = !data;
      if (data && data.code !== next.code) notify({ kind: 'info', text: 'New pairing code', key: 'pair-code' });
      data = next;
      error = null;
      if (first) void focusCode();
    } catch (e) {
      if (!alive || mine !== seq) return;
      if (!(e instanceof StalePairing)) error = e instanceof Error ? e.message : String(e);
    }
    settled++;
  }

  // Mount: first call and initial focus (declared before the scheduler so lastCall is set).
  $effect(() => {
    void untrack(run);
    void focusCode();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  });

  $effect(() => {
    void settled;
    if (!settled || (error && !data)) return; // no code held: wait for the Retry button
    clearTimeout(timer);
    const due = Math.max((data?.expiresAt ?? 0) - Date.now(), lastCall + REFRESH_MIN_MS - Date.now());
    timer = setTimeout(run, due);
  });

  // Retry is a delay, not a drop: still bounded by REFRESH_MIN_MS.
  retry = () => {
    clearTimeout(timer);
    timer = setTimeout(run, Math.max(0, lastCall + REFRESH_MIN_MS - Date.now()));
  };

  $effect(() => {
    view = { data, error, minutes: data ? pairingMinutesLeft(data.expiresAt, now) : 0 };
  });
</script>
