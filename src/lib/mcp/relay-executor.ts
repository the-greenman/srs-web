/**
 * Browser relay executor: a transport adapter with NO MCP knowledge.
 *
 * It forwards each opaque request body to `session.handle(text)` (the Rust/WASM
 * McpSession) and returns the raw result. Only HTTP-shaped framing lives here:
 * `undefined` (a notification/response with nothing to say) -> 202 empty body;
 * text -> 200 application/json. Requests are serialized; one executor instance
 * is one epoch -- after `stop()` no queued request runs and no reply is sent.
 */
import {
  CLOSE_EXECUTOR_REPLACED,
  RELAY_PROTOCOL_VERSION,
  type RelayRequestFrame,
  type RelayResponseFrame,
  base64UrlDecode,
  base64UrlEncode,
  executorSocketUrl,
  newGeneration,
} from "./relay-wire";

export interface FrameHandler {
  handle(text: string): string | undefined;
}

export type ExecutorStatus = "connecting" | "online" | "offline" | "replaced" | "rejected";

export interface SocketLike {
  onopen: ((e?: unknown) => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: ((e: { code: number }) => void) | null;
  onerror: ((e?: unknown) => void) | null;
  send(data: string): void;
  close(code?: number): void;
}

export interface RelayExecutorOptions {
  executorUrl: string;
  session: FrameHandler;
  takeover?: boolean;
  onStatus(status: ExecutorStatus): void;
  /** Called after every handled request (even if the reply is then dropped). */
  onHandled(): void;
  createSocket?: (url: string) => SocketLike;
  reconnectMs?: number;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export class RelayExecutor {
  #socket: SocketLike | null = null;
  #stopped = false;
  #tail: Promise<void> = Promise.resolve();
  #generation = newGeneration();
  #timer: ReturnType<typeof setTimeout> | undefined;
  #opened = false;

  constructor(private readonly o: RelayExecutorOptions) {}

  start(): void {
    this.#connect(this.o.takeover ?? false);
  }

  stop(): void {
    this.#stopped = true;
    clearTimeout(this.#timer);
    const s = this.#socket;
    this.#socket = null;
    if (s) {
      s.onopen = s.onmessage = s.onclose = s.onerror = null;
      s.close();
    }
  }

  #connect(takeover: boolean): void {
    this.#opened = false;
    this.o.onStatus("connecting");
    const url = executorSocketUrl(this.o.executorUrl, this.#generation, takeover);
    const s = (this.o.createSocket ?? ((u) => new WebSocket(u) as unknown as SocketLike))(url);
    this.#socket = s;
    s.onopen = () => {
      this.#opened = true;
      this.o.onStatus("online");
    };
    s.onmessage = (e) => {
      if (typeof e.data === "string") this.#enqueue(e.data);
    };
    s.onclose = (e) => {
      if (this.#stopped) return;
      if (e.code === CLOSE_EXECUTOR_REPLACED) return this.o.onStatus("replaced");
      // Closed before ever opening: refused (e.g. another tab already holds the channel).
      if (!this.#opened) return this.o.onStatus("rejected");
      this.o.onStatus("offline");
      this.#timer = setTimeout(
        () => this.#stopped || this.#connect(false),
        this.o.reconnectMs ?? 3000
      );
    };
  }

  #enqueue(raw: string): void {
    this.#tail = this.#tail.then(() => this.#process(raw)).catch(() => {});
  }

  async #process(raw: string): Promise<void> {
    if (this.#stopped) return;
    let frame: RelayRequestFrame;
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }
    if (frame.version !== RELAY_PROTOCOL_VERSION || frame.type !== "request") return;
    if (frame.executorGeneration !== this.#generation) return;
    let response: RelayResponseFrame["response"];
    try {
      const out = this.o.session.handle(dec.decode(base64UrlDecode(frame.request.body)));
      response =
        out === undefined
          ? { status: 202, headers: {} }
          : {
              status: 200,
              headers: { "content-type": "application/json" },
              body: base64UrlEncode(enc.encode(out)),
            };
    } catch {
      response = {
        status: 500,
        headers: { "content-type": "application/json" },
        body: base64UrlEncode(enc.encode('{"error":"executor_error"}')),
      };
    }
    this.o.onHandled();
    if (this.#stopped || !this.#socket) return; // epoch ended mid-request: never reply across it
    const reply: RelayResponseFrame = {
      version: RELAY_PROTOCOL_VERSION,
      type: "response",
      requestId: frame.requestId,
      executorGeneration: frame.executorGeneration,
      response,
    };
    this.#socket.send(JSON.stringify(reply));
  }
}
