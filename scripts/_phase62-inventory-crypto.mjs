/**
 * Phase 6.2 — inventory-crypto unit checks (local only, no Supabase).
 * Run: node --require ./scripts/shim-server-only.cjs --import tsx scripts/_phase62-inventory-crypto.mjs
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const TEST_KEY = randomBytes(32).toString("hex");
process.env.INVENTORY_ENCRYPTION_KEY = TEST_KEY;

const {
  encryptInventoryCredentials,
  decryptInventoryCredentials,
  INVENTORY_KEY_VERSION,
} = await import("../lib/inventory-crypto.ts");

const sample = {
  login: "test_login",
  password: "test_password",
  email: "test@example.com",
  extra: "notes",
};

const encrypted = encryptInventoryCredentials(sample);
assert.equal(encrypted.key_version, INVENTORY_KEY_VERSION);
assert.equal(encrypted.schema_version, 1);
assert.ok(encrypted.nonce.length > 0);
assert.ok(encrypted.ciphertext.length > 0);

const decrypted = decryptInventoryCredentials(
  encrypted.ciphertext,
  encrypted.nonce,
  encrypted.key_version
);
assert.deepEqual(decrypted, {
  schema_version: 1,
  login: sample.login,
  password: sample.password,
  email: sample.email,
  extra: sample.extra,
});

const encrypted2 = encryptInventoryCredentials(sample);
assert.notEqual(encrypted.nonce, encrypted2.nonce, "nonces must differ per encryption");

const wrongKey = randomBytes(32).toString("hex");
process.env.INVENTORY_ENCRYPTION_KEY = wrongKey;
let wrongKeyFailed = false;
try {
  decryptInventoryCredentials(
    encrypted.ciphertext,
    encrypted.nonce,
    encrypted.key_version
  );
} catch {
  wrongKeyFailed = true;
}
assert.ok(wrongKeyFailed, "wrong key must fail decryption");

process.env.INVENTORY_ENCRYPTION_KEY = TEST_KEY;
const tampered = Buffer.from(encrypted.ciphertext, "base64url");
tampered[0] ^= 0xff;
let tamperFailed = false;
try {
  decryptInventoryCredentials(
    tampered.toString("base64url"),
    encrypted.nonce,
    encrypted.key_version
  );
} catch {
  tamperFailed = true;
}
assert.ok(tamperFailed, "tampered ciphertext must fail auth tag verification");

delete process.env.INVENTORY_ENCRYPTION_KEY;
let missingKeyFailed = false;
try {
  encryptInventoryCredentials(sample);
} catch (err) {
  missingKeyFailed =
    err instanceof Error && err.message.includes("INVENTORY_ENCRYPTION_KEY");
}
assert.ok(missingKeyFailed, "missing key must throw configuration error");

const output = JSON.stringify({ encrypted });
assert.ok(
  !output.includes(sample.password),
  "encrypted output must not contain plaintext password"
);

console.log("Phase 6.2 inventory-crypto: 6/6 checks passed");
