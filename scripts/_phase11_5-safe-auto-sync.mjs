/**
 * Phase 11.5 — Safe automatic price/status sync tests.
 * Run: node scripts/_phase11_5-safe-auto-sync.mjs
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const runner = join(
  dirname(fileURLToPath(import.meta.url)),
  "_phase11_5-safe-auto-sync-runner.ts"
);

const result = spawnSync("npx", ["tsx", runner], {
  stdio: "inherit",
  shell: true,
  cwd: join(dirname(fileURLToPath(import.meta.url)), ".."),
});

process.exit(result.status ?? 1);
