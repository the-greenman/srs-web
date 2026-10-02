/**
 * Agent connections (srs-web#358): one relay channel + MCP session per agent. The HOST mints each
 * agent's stable id (`agent:<uuid>`, kept per connection so a reconnect keeps it); the agent's
 * client handle only becomes the display name in the engine. `label` is an optional host-fixed name.
 */
export interface AgentConnection {
  id: string;
  label?: string;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const LIST_KEY = "srs-web.agent-connections";
const LEGACY_ID_KEY = "srs-web.relay-agent-id"; // single-agent era (#360)
const LEGACY_CREDS_KEY = "srs-web.mcp-relay";
/** Relay credentials key for one connection (RelayHost `storageKey`). */
export const credsKey = (id: string) => `${LEGACY_CREDS_KEY}.${id}`;

const save = (list: AgentConnection[], s: Store) => {
  try {
    s.setItem(LIST_KEY, JSON.stringify(list));
  } catch {} // ponytail: storage failure = connections last for this page load only
};

/**
 * The persisted connections. First run seeds one (the pre-#358 single connection migrates in with
 * its id and channel credentials, so existing users keep their agent identity and caller URL).
 */
export function loadConnections(s: Store = localStorage): AgentConnection[] {
  try {
    const v = JSON.parse(s.getItem(LIST_KEY) ?? "null");
    if (Array.isArray(v)) return v.filter((c) => typeof c?.id === "string");
  } catch {}
  const legacy = s.getItem(LEGACY_ID_KEY);
  const first: AgentConnection = { id: legacy ?? `agent:${crypto.randomUUID()}` };
  if (legacy) {
    try {
      const creds = s.getItem(LEGACY_CREDS_KEY);
      if (creds) s.setItem(credsKey(first.id), creds);
      s.removeItem(LEGACY_CREDS_KEY);
      s.removeItem(LEGACY_ID_KEY);
    } catch {}
  }
  save([first], s);
  return [first];
}

export function addConnection(label?: string, s: Store = localStorage): AgentConnection[] {
  const list = [
    ...loadConnections(s),
    { id: `agent:${crypto.randomUUID()}`, ...(label?.trim() ? { label: label.trim() } : {}) },
  ];
  save(list, s);
  return list;
}

export function removeConnection(id: string, s: Store = localStorage): AgentConnection[] {
  const list = loadConnections(s).filter((c) => c.id !== id);
  save(list, s);
  try {
    s.removeItem(credsKey(id));
  } catch {}
  return list;
}
