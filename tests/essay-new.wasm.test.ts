// @vitest-environment node
/**
 * New essay against the REAL engine (the default test config stubs the WASM bindings, so the
 * generated JS is copied to node_modules/.cache the stub does not match). Reads go through srs-client.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { newEssay } from "../src/lib/essay/essay-document.js";
import { DOCUMENT_STATE_TYPE_ID, ESSAY_TYPE_ID } from "../src/lib/essay/type-registry.js";
import {
  getContainer,
  getContainerArrangement,
  listContainers,
  listRecords,
} from "../src/lib/srs-client.js";

const bindings = path.resolve(__dirname, "../src/lib/srs_bindings");

// Skipped when the generated bindings are absent (they are a downloaded build artifact).
describe.skipIf(!existsSync(path.join(bindings, "srs_bindings_bg.wasm")))(
  "newEssay on the real engine",
  () => {
    it("stores essay record, anchored container, draft container and state; validates clean", async () => {
      const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
      mkdirSync(dir, { recursive: true });
      copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "real.mjs"));
      const mod = await import(/* @vite-ignore */ path.join(dir, "real.mjs"));
      mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
      const repo = mod.SrsRepository.load(
        readFileSync(path.join(__dirname, "../e2e/fixtures/essay-empty.srsj"), "utf8")
      );

      const essayId = newEssay(repo, "My essay");

      const essay = listRecords(repo, {}).find((r) => r.typeId === ESSAY_TYPE_ID);
      expect(essay?.instanceId).toBe(essayId);
      const [summary] = listContainers(repo, { rootInstanceId: essayId });
      const container = getContainer(repo, summary.containerId);
      expect(container.anchorInstanceId).toBe(essayId);
      expect(container.identityInstanceId).toBe(essayId);
      const [first] = getContainerArrangement(repo, summary.containerId);
      expect(first.instanceId).toBe(essayId);
      expect(first.depth ?? 0).toBe(0);

      const state = listRecords(repo, {}).find((r) => r.typeId === DOCUMENT_STATE_TYPE_ID);
      expect(state?.fieldValues.essay).toBe(essayId);
      const draftId = state?.fieldValues.draft_container_id as string;
      expect(listContainers(repo, {}).some((c) => c.containerId === draftId)).toBe(true);
      expect(getContainer(repo, draftId).containerId).toBe(draftId);

      const report = repo.validate();
      expect(report.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(report.summary.errors).toBe(0);
    });
  }
);
