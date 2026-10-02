// VENDORED VERBATIM from the-greenman/browser-executor-relay src/protocol.ts at commit
// 02232f78daab342fcbc049f955cd2f4ca5f0b04f. Do not edit; CI (scripts/check-relay-protocol.mjs) diffs
// everything below this header against that commit. To update, bump the pin there and re-copy.
/**
 * Generic relay protocol: the dependency-free, Worker-free entry for executor
 * implementers (package export `./protocol`). Keep this file import-free and
 * free of Worker/Durable Object globals so a browser app can bundle or vendor it.
 * `body` is base64url encoded bytes and is opaque to
 * this package: it may contain any application protocol.
 */
export const RELAY_PROTOCOL_VERSION = 1;

/** WebSocket close code the relay sends an executor that a takeover replaced. */
export const CLOSE_EXECUTOR_REPLACED = 4002;

/** Executor connect query params (browsers cannot set upgrade headers). */
export const EXECUTOR_GENERATION_PARAM = "generation";
export const EXECUTOR_TAKEOVER_PARAM = "takeover";
/** Non-browser executors may send these headers instead; the query value wins. */
export const EXECUTOR_GENERATION_HEADER = "x-relay-executor-generation";
export const EXECUTOR_TAKEOVER_HEADER = "x-relay-executor-takeover";
export const EXECUTOR_GENERATION_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export const DEFAULT_LIMITS = {
  maxBodyBytes: 128 * 1024,
  maxPendingCalls: 32,
  deadlineMs: 30_000,
} as const;

export type SafeHeaders = Record<string, string>;

export interface RelayHttpRequest {
  method: "POST";
  contentType: string | null;
  headers: SafeHeaders;
  body: string;
}

export interface RelayHttpResponse {
  status: number;
  headers: SafeHeaders;
  /** Omitted for a bodyless executor response, such as an accepted notification. */
  body?: string;
}

export interface RelayRequestFrame {
  version: typeof RELAY_PROTOCOL_VERSION;
  type: "request";
  requestId: string;
  executorGeneration: string;
  deadlineUnixMs: number;
  request: RelayHttpRequest;
}

export interface RelayResponseFrame {
  version: typeof RELAY_PROTOCOL_VERSION;
  type: "response";
  requestId: string;
  executorGeneration: string;
  response: RelayHttpResponse;
}

export interface ExecutorAttachment {
  version: typeof RELAY_PROTOCOL_VERSION;
  kind: "executor";
  generation: string;
  connectedAtUnixMs: number;
}

export type RelayCredentialRole = "executor" | "caller";

export interface RelayCredentialClaims {
  channel: string;
  role: RelayCredentialRole;
  version: typeof RELAY_PROTOCOL_VERSION;
  /** Executor credentials only: exact browser Origin the executor upgrade must present. Absent = unbound. */
  origin?: string;
}

export interface ChannelBootstrap {
  channel: string;
  executorUrl: string;
  callerUrl: string;
}

/** `executorUrl` from the bootstrap plus the generation nonce (and takeover flag) the relay requires. */
export function executorSocketUrl(executorUrl: string, generation: string, takeover = false): string {
  const url = new URL(executorUrl);
  url.searchParams.set(EXECUTOR_GENERATION_PARAM, generation);
  if (takeover) url.searchParams.set(EXECUTOR_TAKEOVER_PARAM, "true");
  return url.toString();
}

/** A fresh executor generation nonce (43 base64url chars, within the 16-128 pattern). */
export function newExecutorGeneration(): string {
  return randomBase64Url(32);
}

export function base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let offset = 0; offset < view.length; offset += 0x8000) {
    binary += String.fromCharCode(...view.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlDecode(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

export function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
