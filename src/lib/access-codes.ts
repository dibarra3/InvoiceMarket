import { createHash, randomBytes, randomInt } from "node:crypto";

// Crockford base32: no I, L, O, U, so codes survive being read aloud or retyped.
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_LENGTH = 12; // 60 bits of entropy

/** 256-bit URL-safe token for unguessable invoice links. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isPlausibleToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

/** Short human-typeable code, stored and compared in normalized form (no dashes). */
export function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** Accepts lowercase, dashes/spaces, and the usual O/0 and I/L/1 mix-ups. */
export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

export function formatCode(code: string): string {
  return (code.match(/.{1,4}/g) ?? []).join("-");
}

export function hashCode(normalizedCode: string): string {
  return createHash("sha256").update(normalizedCode).digest("hex");
}
