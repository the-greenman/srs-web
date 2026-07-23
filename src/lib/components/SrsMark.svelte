<script lang="ts">
  /**
   * The SRS repository mark: a black disc with a white outline and a white
   * taijitu-style sine wave through the middle. Rendered beside repository
   * entries in pickers so SRS repositories stand out at a glance (#259).
   * Decorative only — always paired with a text label, hence aria-hidden.
   */
  interface Props {
    size?: number;
  }

  let { size = 16 }: Props = $props();
</script>

<svg
  class="srs-mark"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  aria-hidden="true"
  focusable="false"
>
  <circle cx="12" cy="12" r="10.75" fill="var(--black, #000)" stroke="var(--paper, #fff)" stroke-width="1.25" />
  <path
    d="M1.25 12 a5.375 5.375 0 0 1 10.75 0 a5.375 5.375 0 0 0 10.75 0"
    fill="none"
    stroke="var(--paper, #fff)"
    stroke-width="1.5"
    stroke-linecap="round"
  />
</svg>

<style>
  .srs-mark {
    flex: none;
    display: block;
  }
</style>
