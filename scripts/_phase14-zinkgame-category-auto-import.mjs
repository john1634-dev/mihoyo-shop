/**
 * Phase 14 — ZinkGame category auto-import tests.
 * Run: node scripts/_phase14-zinkgame-category-auto-import.mjs
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const runner = join(
  dirname(fileURLToPath(import.meta.url)),
  "_phase14-zinkgame-category-auto-import-runner.ts"
);

const result = spawnSync("npx", ["tsx", runner], {
  stdio: "inherit",
  shell: true,
  cwd: join(dirname(fileURLToPath(import.meta.url)), ".."),
});

process.exit(result.status ?? 1);
