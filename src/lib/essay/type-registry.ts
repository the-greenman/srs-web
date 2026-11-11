/**
 * Essay package contract (muDemocracy.org#229, package muSrs/packages/essay). Identity is the
 * engine-resolved type UUID, never namespace/name. Field names key `fieldValues` (RFC-039).
 */
export const ESSAY_TYPE_ID = "0021ef06-4d6b-42fb-af5a-2d53d287138c";
export const PARAGRAPH_TYPE_ID = "ec61d93d-1cd1-4b52-b231-9f1bfc7b40b6";
export const DOCUMENT_STATE_TYPE_ID = "9785968f-bdd4-4c91-81ef-0e62075f3503";
/**
 * `com.mudemocracy.argument/source` (muSrs packages/essay since essay 1.9.0, which keeps its argument
 * namespace and UUID; argument builds on essay). An essay older than 1.9.0 has no source type until upgraded.
 * Fields: title, source_kind (vocabulary: transcript, document, report, web, ...), source_url.
 */
export const SOURCE_TYPE_ID = "36e85cff-989b-4c6d-9361-3c8906cff87b";
/**
 * `com.mudemocracy.argument/quotation` (essay package 1.9.0, srs-web#525). Fields: title, quote_text,
 * locator, warrant_level (all required), description.
 */
export const QUOTATION_TYPE_ID = "00572b36-7e4f-4cc2-9de1-9eab16a496ef";
/**
 * `com.mudemocracy.essay/image_paragraph` (essay package 1.11.0, srs-web#764). Fields: paragraph_title,
 * alt_text (required), caption, image_size (full-width | original), image_align (left | centre | right).
 */
export const IMAGE_PARAGRAPH_TYPE_ID = "34548fd0-cf12-4a64-b3ec-ee705470e137";
/** The types an essay's paragraphs are: text paragraphs and image paragraphs. */
export const isParagraphType = (typeId: string): boolean =>
  typeId === PARAGRAPH_TYPE_ID || typeId === IMAGE_PARAGRAPH_TYPE_ID;
