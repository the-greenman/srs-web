<script lang="ts">
  /**
   * The SRS mark: a disc split top to bottom into an ink half and a paper half by an S line
   * (two half-radius arcs, so it reads as an upright letter S), a seed of the opposite colour
   * in each half, and an ink rim. Rendered beside repository entries in pickers so SRS
   * repositories stand out at a glance (#259, #267), and shown on /styleguide (#462).
   * Decorative only: always paired with a text label, hence aria-hidden.
   *
   * Geometry is the owner's, in a 24 box with disc radius r = 10.75, and is copied from
   * semanticops.com/design/srs-mark-halves.svg (the source of truth is that site's
   * Halves.astro; keep the six shapes and their paint order identical). Colours are the
   * component tokens --srs-mark-ink, --srs-mark-paper and --srs-mark-line
   * (tokens-components.css, ADR-020), painted by src/styles/components/srs-mark.css.
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
  <circle class="srs-mark__paper" cx="12" cy="12" r="10.75" />
  <path
    class="srs-mark__ink"
    d="M12 1.25A10.75 10.75 0 0 1 12 22.75A5.375 5.375 0 0 0 12 12A5.375 5.375 0 0 1 12 1.25Z"
  />
  <path class="srs-mark__line" d="M12 1.25A5.375 5.375 0 0 0 12 12A5.375 5.375 0 0 1 12 22.75" />
  <circle class="srs-mark__paper" cx="12" cy="6.625" r="1.505" />
  <circle class="srs-mark__ink" cx="12" cy="17.375" r="1.505" />
  <circle class="srs-mark__rim" cx="12" cy="12" r="10.75" />
</svg>
