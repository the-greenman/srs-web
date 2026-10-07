<script lang="ts">
  /**
   * The name set as a wordmark, mirroring semanticops.com Wordmark.astro: "Semantic" in
   * regular, "Ops" in bold, tight tracking. Sized by a type-token role.
   * Styles: src/styles/components/wordmark.css.
   */
  interface Props {
    size?: "sm" | "md" | "lg";
  }

  let { size = "md" }: Props = $props();
</script>

<span class="wordmark wordmark--{size}"
  ><span class="wordmark__lead">Semantic</span><span class="wordmark__tail">Ops</span></span
>
