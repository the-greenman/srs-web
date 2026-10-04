import type { Component } from "svelte";

/** A Lucide icon component (imported per file from "@lucide/svelte/icons/<name>", ADR-020 a). */
export type IconComponent = Component<{ size?: number | string; "aria-hidden"?: "true" | boolean }>;
