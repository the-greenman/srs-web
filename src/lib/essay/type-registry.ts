/**
 * Essay package contract (muDemocracy.org#229, package muSrs/packages/essay). Identity is the
 * engine-resolved type UUID, never namespace/name. Field names key `fieldValues` (RFC-039).
 */
export const ESSAY_TYPE_ID = "0021ef06-4d6b-42fb-af5a-2d53d287138c";
export const PARAGRAPH_TYPE_ID = "ec61d93d-1cd1-4b52-b231-9f1bfc7b40b6";
export const DOCUMENT_STATE_TYPE_ID = "9785968f-bdd4-4c91-81ef-0e62075f3503";
/** `comment` type (muDemocracy.org#250): `comment_text` field; linked to its paragraph by `comments-on`. */
export const COMMENT_TYPE_ID = "7482e41b-7d3d-4069-b165-ee509dacce22";
/** RelationTypeDefinition id of `com.mudemocracy.essay/comments-on` (comment -> paragraph). */
export const COMMENTS_ON_TYPE_ID = "607009b0-310c-4eda-aad2-d079884ff85c";
/** The engine's relation filter / create input keys on the declared name, not the definition id. */
export const COMMENTS_ON = "com.mudemocracy.essay/comments-on";
