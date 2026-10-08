/**
 * Essay package contract (muDemocracy.org#229, package muSrs/packages/essay). Identity is the
 * engine-resolved type UUID, never namespace/name. Field names key `fieldValues` (RFC-039).
 */
export const ESSAY_TYPE_ID = "0021ef06-4d6b-42fb-af5a-2d53d287138c";
export const PARAGRAPH_TYPE_ID = "ec61d93d-1cd1-4b52-b231-9f1bfc7b40b6";
export const DOCUMENT_STATE_TYPE_ID = "9785968f-bdd4-4c91-81ef-0e62075f3503";
/**
 * `com.mudemocracy.argument/source` (muSrs packages/argument; also the source type of the essay-references
 * fixture). Not part of the essay package: a repository needs the argument package to hold references.
 * Fields: title, source_kind (vocabulary: transcript, document, report, web, ...), source_url.
 */
export const SOURCE_TYPE_ID = "36e85cff-989b-4c6d-9361-3c8906cff87b";
