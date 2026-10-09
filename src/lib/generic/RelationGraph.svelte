<!--
  RelationGraph — the relation map, presentation only. Two views over the same SVG:
  - focus: one record in the centre, inbound neighbours on the left arc, outbound on the right, grouped by
    relation type; the relation type shows in the legend and on hover or focus of a node, never at edge midpoints;
  - container: a capped ring of one container's records (the caller caps and says so).
  Labels wrap to two lines. Colours are the --generic-graph-* tokens (generic-shell.css).
-->
<script lang="ts">
  import { type ContainerGraph, type FocusLayout, MAP_H, MAP_W } from "./map-layout.js";
  import { plainLabel, wrapLabel } from "$lib/labels.js";

  type Props =
    | { view: "focus"; focus: { id: string; label: string }; layout: FocusLayout; onOpen: (id: string) => void }
    | { view: "container"; graph: ContainerGraph; onOpen: (id: string) => void };

  let props: Props = $props();
  let box = $state<HTMLDivElement>();

  // The SVG is wider than a phone: start with the focused record (or the ring's middle) in view.
  $effect(() => {
    const cx = props.view === "focus" ? props.layout.center.x : MAP_W / 2;
    if (box) box.scrollLeft = Math.max(0, (cx / MAP_W) * box.scrollWidth - box.clientWidth / 2);
  });

  /** The edge between the centre and a neighbour, trimmed to the circles and pointing the way it is asserted. */
  const edge = (n: { x: number; y: number; direction: "in" | "out" }, c: { x: number; y: number }) => {
    const [from, to, padFrom, padTo] = n.direction === "in" ? [n, c, 10, 30] : [c, n, 30, 10];
    const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const ux = (to.x - from.x) / len;
    const uy = (to.y - from.y) / len;
    return { x1: from.x + ux * padFrom, y1: from.y + uy * padFrom, x2: to.x - ux * padTo, y2: to.y - uy * padTo };
  };
  const activate = (event: KeyboardEvent, id: string, open: (id: string) => void) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open(id);
    }
  };
</script>

<div class="generic-graph" data-testid="scoped-graph" data-view={props.view} bind:this={box}>
  <svg viewBox="0 0 {MAP_W} {MAP_H}" role="group" aria-label="Scoped record relation graph">
    <defs>
      <marker id="generic-graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0L10 5L0 10z" class="arrow" />
      </marker>
    </defs>
    {#if props.view === "focus"}
      {@const { layout, focus, onOpen } = props}
      {#each layout.placed as n, i (`${n.id}:${i}`)}
        {@const side = n.direction === "in" ? -1 : 1}
        {@const e = edge(n, layout.center)}
        {@const lines = wrapLabel(n.label)}
        <g
          class="neighbour"
          data-direction={n.direction}
          data-relation={n.relationType}
          data-tone={n.tone}
          role="button"
          tabindex="0"
          aria-label={`${n.direction === "in" ? "Inbound" : "Outbound"} ${n.relationType}: ${plainLabel(n.label)}`}
          onclick={() => onOpen(n.id)}
          onkeydown={(e) => activate(e, n.id, onOpen)}
        >
          <title>{n.relationType} ({n.direction === "in" ? "inbound" : "outbound"}): {plainLabel(n.label)}</title>
          <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} marker-end="url(#generic-graph-arrow)" />
          <circle cx={n.x} cy={n.y} r="8" />
          <text class="node-label" x={n.x + side * 14} y={n.y - (lines.length - 1) * 6 + 4} text-anchor={side === 1 ? "start" : "end"}>
            {#each lines as line, li (li)}<tspan x={n.x + side * 14} dy={li === 0 ? 0 : 12}>{line}</tspan>{/each}
          </text>
          <text class="edge-label" aria-hidden="true" x={(layout.center.x + n.x) / 2} y={(layout.center.y + n.y) / 2 - 6}>{n.relationType}</text>
        </g>
      {/each}
      <g
        class="focused"
        role="button"
        tabindex="0"
        aria-label={`Focused: ${plainLabel(focus.label)}`}
        onclick={() => onOpen(focus.id)}
        onkeydown={(e) => activate(e, focus.id, onOpen)}
      >
        <circle cx={layout.center.x} cy={layout.center.y} r="26" />
        <text class="node-label" x={layout.center.x} y={layout.center.y + 44} text-anchor="middle">
          {#each wrapLabel(focus.label, 24) as line, li (li)}<tspan x={layout.center.x} dy={li === 0 ? 0 : 12}>{line}</tspan>{/each}
        </text>
      </g>
    {:else}
      {@const { graph, onOpen } = props}
      {@const at = new Map(graph.nodes.map((n) => [n.id, n]))}
      {#each graph.edges as edge (edge.relationId)}
        {@const a = at.get(edge.source)}
        {@const b = at.get(edge.target)}
        {#if a && b}
          <g class="edge" data-relation={edge.relationType}>
            <title>{edge.relationType}</title>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
          </g>
        {/if}
      {/each}
      {#each graph.nodes as node (node.id)}
        <g
          role="button"
          tabindex="0"
          aria-label={`Inspect ${plainLabel(node.label)}`}
          onclick={() => onOpen(node.id)}
          onkeydown={(e) => activate(e, node.id, onOpen)}
        >
          <circle cx={node.x} cy={node.y} r="9" />
          <text class="node-label" x={node.x} y={node.y + 22} text-anchor="middle">
            {#each wrapLabel(node.label, 16) as line, li (li)}<tspan x={node.x} dy={li === 0 ? 0 : 11}>{line}</tspan>{/each}
          </text>
        </g>
      {/each}
    {/if}
  </svg>
</div>
{#if props.view === "focus" && props.layout.legend.length > 0}
  <ul class="generic-graph-legend" data-testid="graph-legend" aria-label="Relation types">
    {#each props.layout.legend as row (`${row.direction}:${row.relationType}`)}
      <li><span class="generic-graph-legend__dir" aria-hidden="true">{row.direction === "in" ? "←" : "→"}</span> {row.relationType} <small>{row.count}</small></li>
    {/each}
  </ul>
{/if}
