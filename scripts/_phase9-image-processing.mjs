/**
 * Phase 9 — image processing local tests.
 * Run: node scripts/_phase9-image-processing.mjs
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const runner = join(
  dirname(fileURLToPath(import.meta.url)),
  "_phase9-image-processing-runner.ts"
);

const result = spawnSync("npx", ["tsx", runner], {
  stdio: "inherit",
  shell: true,
  cwd: join(dirname(fileURLToPath(import.meta.url)), ".."),
});

process.exit(result.status ?? 1);
