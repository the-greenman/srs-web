/** One row of an ActionMenu. Neutral so both the paragraph list and the header list satisfy it. */
export interface MenuAction {
  id: string;
  label: string;
  icon?: string;
  run: () => void;
  enabled: boolean;
}
