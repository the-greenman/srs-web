#!/usr/bin/env node
// Fails if the vendored src/lib/mcp/relay-protocol.ts differs from the relay's src/protocol.ts at
// the pinned commit (srs-web#347). Bump PIN here and in the vendored file's header together.
import { readFileSync } from "node:fs";

const PIN = "8db0fd9a8981a830234beea6c377625671d9b371";
const url = `https://raw.githubusercontent.com/the-greenman/browser-executor-relay/${PIN}/src/protocol.ts`;
const res = await fetch(url);
if (!res.ok) {
  console.error(`could not fetch ${url}: ${res.status}`);
  process.exit(1);
}
const upstream = await res.text();
const local = readFileSync(new URL("../src/lib/mcp/relay-protocol.ts", import.meta.url), "utf8");
// The vendored copy is the pinned file verbatim after a 3-line comment header.
const body = local.split("\n").slice(3).join("\n");
if (body !== upstream) {
  console.error(`src/lib/mcp/relay-protocol.ts differs from relay src/protocol.ts @ ${PIN}`);
  process.exit(1);
}
console.log(`relay-protocol.ts matches relay @ ${PIN.slice(0, 8)}`);
