import BookOpen from "@lucide/svelte/icons/book-open";
import CircleAlert from "@lucide/svelte/icons/circle-alert";
import FileText from "@lucide/svelte/icons/file-text";
/**
 * KIND_ICONS: the ONE map from an annotation's data key (`Annotation.icon`: the neighbour's type name
 * for an attachment) to its Lucide icon (ADR-020 a, owner decision D3). A letter is never the only
 * cue, and an unmapped key gets the fallback, so new kinds need no code. `attachment` is a client
 * presentation grouping by neighbour kind; this map never infers SRS semantics from it.
 * Names verified against node_modules/@lucide/svelte/dist/icons/.
 */
import Image from "@lucide/svelte/icons/image";
import Lightbulb from "@lucide/svelte/icons/lightbulb";
import Link from "@lucide/svelte/icons/link";
import MessageSquareQuote from "@lucide/svelte/icons/message-square-quote";
import NotebookText from "@lucide/svelte/icons/notebook-text";
import Paperclip from "@lucide/svelte/icons/paperclip";
import Scale from "@lucide/svelte/icons/scale";
import Table from "@lucide/svelte/icons/table";
import type { IconComponent } from "./icon.js";

export const FALLBACK_ICON: IconComponent = Paperclip;

export const KIND_ICONS: Record<string, IconComponent> = {
  note: NotebookText,
  comment: MessageSquareQuote,
  source: BookOpen,
  problem: CircleAlert,
  claim: Lightbulb,
  "counter-claim": Scale,
  document: FileText,
  file: FileText,
  spreadsheet: Table,
  image: Image,
  link: Link,
};

/** The icon for a data key (case-insensitive); the fallback when unmapped. */
export const iconFor = (key: string | undefined): IconComponent =>
  KIND_ICONS[(key ?? "").toLowerCase()] ?? FALLBACK_ICON;
