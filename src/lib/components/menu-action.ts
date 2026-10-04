import type { IconComponent } from "./icon.js";

/** One row of an ActionMenu. Neutral so both the paragraph list and the header list satisfy it. */
export interface MenuAction {
  id: string;
  label: string;
  icon?: IconComponent;
  run: () => void;
  enabled: boolean;
}
