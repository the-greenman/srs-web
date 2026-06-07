<!--
  Repeatable — array-valued field widget (ext:repeatable-fields). bindable
  `values`; honours min/max-items. UI-only add/remove state (no SRS semantics).
  Skin from src/styles/components/repeatable.css; widget behaviour ported in
  spirit from srs-vscode/src/webview/forms.ts.
  B9 repeatable editing:  https://github.com/the-greenman/srs-web/issues/5
  B5 repeatable rendering: https://github.com/the-greenman/srs-web/issues/4
-->
<script lang="ts">
let {
  label,
  typeHint,
  help,
  values = $bindable<string[]>([]),
  min = 0,
  max,
  addLabel = "+ Add",
}: {
  label: string;
  typeHint?: string;
  help?: string;
  values?: string[];
  min?: number;
  max?: number;
  addLabel?: string;
} = $props();

const canRemove = $derived(values.length > min);
const canAdd = $derived(max == null || values.length < max);

function add() {
  if (canAdd) values = [...values, ""];
}
function remove(i: number) {
  if (canRemove) values = values.filter((_, j) => j !== i);
}
</script>

<div class="field">
  <span class="field__label">
    {label}{#if typeHint}<span class="field__type-hint">{typeHint}</span>{/if}
  </span>
  {#if help}<p class="field__help">{help}</p>{/if}

  <div class="repeat">
    <div class="repeat__list">
      {#each values as _, i (i)}
        <div class="repeat__entry">
          <span class="repeat__index">{i + 1}</span>
          <input class="input" bind:value={values[i]} />
          <button
            class="repeat__remove"
            title="Remove entry"
            onclick={() => remove(i)}
            disabled={!canRemove}
          >&times;</button>
        </div>
      {/each}
    </div>
    <div class="repeat__foot">
      <button class="btn btn--mono" onclick={add} disabled={!canAdd}>{addLabel}</button>
      <span class="repeat__hint">
        {values.length}{max != null ? ` / ${max}` : ''}
        {values.length === 1 ? 'entry' : 'entries'}
      </span>
    </div>
  </div>
</div>
