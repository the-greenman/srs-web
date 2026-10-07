import { expect, it } from "vitest";
import { uuid5 } from "../src/lib/uuid5.js";

it("matches the RFC 4122 DNS-namespace vector", () => {
  expect(uuid5("6ba7b810-9dad-11d1-80b4-00c04fd430c8", "python.org")).toBe(
    "886313e1-3b8a-5372-9b90-0c9aee199e5d"
  );
});
