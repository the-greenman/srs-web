<!--
  FieldInput — dispatch wrapper for field widget rendering.

  Routes a FieldFormDef to the correct form primitive:
    valueType "text"   → Textarea (multi-line)
    valueType "select" → Select (enum options)
    otherwise          → Input (single-line)

  Render-dispatch only — no value initialisation, no SRS semantics (ADR-001).
  The `rows` prop applies only to the Textarea branch.

  Extracted from the triplicated dispatch in SectionForm and RecordForm (#61).
-->
<script lang="ts">
  import type { FieldFormDef } from "$lib/governance/types.js";
  import Input from "$lib/components/Input.svelte";
  import Textarea from "$lib/components/Textarea.svelte";
  import Select from "$lib/components/Select.svelte";

  let {
    def,
    value = $bindable(""),
    id,
    disabled = false,
    required = false,
    rows = 4,
  }: {
    def: FieldFormDef;
    value?: string;
    id: string;
    disabled?: boolean;
    /** Native browser enforcement, set from the schema's FieldAssignment.required. */
    required?: boolean;
    /** Forwarded to Textarea only; ignored by Input and Select branches. */
    rows?: number;
  } = $props();
</script>

{#if def.valueType === "text"}
  <Textarea {id} bind:value {disabled} {required} {rows} />
{:else if def.valueType === "select" && def.options?.length}
  <Select {id} bind:value options={def.options} {disabled} {required} />
{:else}
  <Input {id} bind:value {disabled} {required} />
{/if}
