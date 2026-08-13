import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/** Current production encryption key version. Future rotation: decrypt vN, re-encrypt vN+1. */
export const INVENTORY_KEY_VERSION = 1;

/** Payload schema stored inside ciphertext (never persisted as plaintext in DB). */
export type InventoryCredentialPayload = {
  schema_version: number;
  login: string;
  password: string;
  email: string;
  extra: string;
};

export type EncryptedInventoryCredentials = {
  ciphertext: string;
  nonce: string;
  key_version: number;
  schema_version: number;
};

const ALGORITHM = "aes-256-gcm";
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const DEFAULT_SCHEMA_VERSION = 1;

const HEX_KEY_PATTERN = /^[0-9a-fA-F]{64}$/;

function loadEncryptionKey(keyVersion: number): Buffer {
  if (keyVersion !== INVENTORY_KEY_VERSION) {
    throw new Error(
      `Unsupported inventory encryption key_version: ${keyVersion}. ` +
        `Future rotation must decrypt with the old key and re-encrypt with the new key.`
    );
  }

  const raw = process.env.INVENTORY_ENCRYPTION_KEY?.trim();
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Missing INVENTORY_ENCRYPTION_KEY — required in production for inventory credential storage"
      );
    }
    throw new Error("Missing INVENTORY_ENCRYPTION_KEY");
  }

  if (!HEX_KEY_PATTERN.test(raw)) {
    throw new Error(
      "INVENTORY_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes)"
    );
  }

  return Buffer.from(raw, "hex");
}

/**
 * Encrypt structured inventory credentials for storage in inventory_credentials.
 * Generates a fresh random 12-byte nonce per call. Never logs plaintext.
 */
export function encryptInventoryCredentials(
  payload: Omit<InventoryCredentialPayload, "schema_version"> & {
    schema_version?: number;
  }
): EncryptedInventoryCredentials {
  const key = loadEncryptionKey(INVENTORY_KEY_VERSION);
  const nonce = randomBytes(NONCE_BYTES);
  const schemaVersion = payload.schema_version ?? DEFAULT_SCHEMA_VERSION;

  const body: InventoryCredentialPayload = {
    schema_version: schemaVersion,
    login: payload.login,
    password: payload.password,
    email: payload.email,
    extra: payload.extra ?? "",
  };

  const plaintext = JSON.stringify(body);
  const cipher = createCipheriv(ALGORITHM, key, nonce, {
    authTagLength: AUTH_TAG_BYTES,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([encrypted, authTag]);

  return {
    ciphertext: combined.toString("base64url"),
    nonce: nonce.toString("base64url"),
    key_version: INVENTORY_KEY_VERSION,
    schema_version: schemaVersion,
  };
}

/**
 * Decrypt inventory_credentials row fields. Verifies GCM auth tag before returning.
 * Never logs decrypted payload.
 */
export function decryptInventoryCredentials(
  ciphertext: string,
  nonce: string,
  keyVersion: number
): InventoryCredentialPayload {
  const key = loadEncryptionKey(keyVersion);
  const nonceBuf = Buffer.from(nonce, "base64url");
  const combined = Buffer.from(ciphertext, "base64url");

  if (nonceBuf.length !== NONCE_BYTES) {
    throw new Error("Invalid inventory credential nonce");
  }

  if (combined.length <= AUTH_TAG_BYTES) {
    throw new Error("Invalid inventory credential ciphertext");
  }

  const encrypted = combined.subarray(0, combined.length - AUTH_TAG_BYTES);
  const authTag = combined.subarray(combined.length - AUTH_TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, key, nonceBuf, {
    authTagLength: AUTH_TAG_BYTES,
  });
  decipher.setAuthTag(authTag);

  let plaintext: string;
  try {
    plaintext = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Inventory credential decryption failed (authentication tag mismatch)");
  }

  const parsed = JSON.parse(plaintext) as InventoryCredentialPayload;
  if (
    typeof parsed.login !== "string" ||
    typeof parsed.password !== "string" ||
    typeof parsed.email !== "string"
  ) {
    throw new Error("Invalid inventory credential payload shape");
  }

  return {
    schema_version: Number(parsed.schema_version) || DEFAULT_SCHEMA_VERSION,
    login: parsed.login,
    password: parsed.password,
    email: parsed.email,
    extra: typeof parsed.extra === "string" ? parsed.extra : "",
  };
}
