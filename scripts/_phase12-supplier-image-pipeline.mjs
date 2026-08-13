/**
 * Phase 12 — Supplier image pipeline tests.
 * Run: node scripts/_phase12-supplier-image-pipeline.mjs
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const runner = join(
  dirname(fileURLToPath(import.meta.url)),
  "_phase12-supplier-image-pipeline-runner.ts"
);

const result = spawnSync("npx", ["tsx", runner], {
  stdio: "inherit",
  shell: true,
  cwd: join(dirname(fileURLToPath(import.meta.url)), ".."),
});

process.exit(result.status ?? 1);
