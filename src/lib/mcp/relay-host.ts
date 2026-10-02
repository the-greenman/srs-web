/**
 * Owns the relay channel for the currently loaded repository: credential
 * persistence, rotation, takeover, and reporting handled executor requests to the
 * owner. Never saves or touches a storage provider.
 */
import {
  type ExecutorStatus,
  type FrameHandler,
  RelayExecutor,
  type SocketLike,
} from "./relay-executor";
import type { ChannelBootstrap } from "./relay-protocol";
import { bootstrapChannel } from "./relay-wire";

export type HostStatus = ExecutorStatus | "idle" | "error";

export interface HostState {
  status: HostStatus;
  callerUrl: string | null;
  error: string | null;
}

export interface RelayHostOptions {
  relayUrl: string;
  /** An MCP request was handled; the owner re-checks the engine write epoch (one signal, srs-web#345). */
  onHandled(): void;
  onChange(state: HostState): void;
  createSocket?: (url: string) => SocketLike;
  fetchImpl?: typeof fetch;
  storage?: Pick<Storage, "getItem" | "setItem">;
  reconnectMs?: number;
  /** Credential storage key; one per agent connection (srs-web#358). */
  storageKey?: string;
}

const KEY = "srs-web.mcp-relay";

export class RelayHost {
  #exec: RelayExecutor | null = null;
  #session: FrameHandler | null = null;
  #seq = 0;
  #creds: ChannelBootstrap | null = null;
  #state: HostState = { status: "idle", callerUrl: null, error: null };

  constructor(private readonly o: RelayHostOptions) {}

  #set(patch: Partial<HostState>): void {
    this.#state = { ...this.#state, ...patch };
    this.o.onChange(this.#state);
  }

  #stored(): ChannelBootstrap | null {
    try {
      const v = JSON.parse(
        (this.o.storage ?? localStorage).getItem(this.o.storageKey ?? KEY) ?? "null"
      );
      return v?.relayUrl === this.o.relayUrl ? v.creds : null;
    } catch {
      return null;
    }
  }

  #store(creds: ChannelBootstrap): void {
    try {
      (this.o.storage ?? localStorage).setItem(
        this.o.storageKey ?? KEY,
        JSON.stringify({ relayUrl: this.o.relayUrl, creds })
      );
    } catch {}
  }

  /** Bind the executor to a newly loaded repository session (new epoch). */
  async attach(session: FrameHandler): Promise<void> {
    this.detach();
    this.#session = session;
    await this.#open(false, false);
  }

  /** Unload: stop admission; queued/in-flight requests never cross the epoch. */
  detach(): void {
    this.#seq++;
    this.#exec?.stop();
    this.#exec = null;
    this.#session = null;
    this.#set({ status: "idle" });
  }

  async rotate(): Promise<void> {
    if (this.#session) await this.#open(true, false);
  }

  async takeover(): Promise<void> {
    if (this.#session) await this.#open(false, true);
  }

  async #open(fresh: boolean, takeover: boolean): Promise<void> {
    const seq = ++this.#seq;
    const session = this.#session;
    if (!session) return;
    this.#exec?.stop();
    this.#exec = null;
    try {
      this.#creds =
        (!fresh && this.#stored()) || (await bootstrapChannel(this.o.relayUrl, this.o.fetchImpl));
    } catch (e) {
      if (seq === this.#seq)
        this.#set({ status: "error", error: e instanceof Error ? e.message : String(e) });
      return;
    }
    if (seq !== this.#seq) return; // detached/re-attached while bootstrapping
    this.#store(this.#creds);
    this.#set({ callerUrl: this.#creds.callerUrl, error: null });
    this.#exec = new RelayExecutor({
      executorUrl: this.#creds.executorUrl,
      session,
      takeover,
      createSocket: this.o.createSocket,
      reconnectMs: this.o.reconnectMs,
      onStatus: (status) => this.#set({ status }),
      onHandled: () => this.o.onHandled(),
    });
    this.#exec.start();
  }
}
