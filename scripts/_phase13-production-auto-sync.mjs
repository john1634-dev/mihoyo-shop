/**
 * Phase 13 — Production auto-sync tests.
 * Run: node scripts/_phase13-production-auto-sync.mjs
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const runner = join(
  dirname(fileURLToPath(import.meta.url)),
  "_phase13-production-auto-sync-runner.ts"
);

const result = spawnSync("npx", ["tsx", runner], {
  stdio: "inherit",
  shell: true,
  cwd: join(dirname(fileURLToPath(import.meta.url)), ".."),
});

process.exit(result.status ?? 1);
