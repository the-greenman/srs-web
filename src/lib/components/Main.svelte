<!--
  Main — the centre column wrapper (.app__main). Hosts a Topbar + Workspace.
  Wraps .app__main (src/styles/layout.css).
  B4 viewer shell: https://github.com/the-greenman/srs-web/issues/3
-->
<script lang="ts">
import type { Snippet } from "svelte";
const { children }: { children?: Snippet } = $props();
</script>

<main class="app__main">{@render children?.()}</main>
