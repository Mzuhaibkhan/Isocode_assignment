import crypto from "node:crypto";
import { config } from "../config.js";

const ALGORITHM = "aes-256-gcm";

export function encryptBank(plaintext: string): string {
  const key = Buffer.from(config.BANK_AES_KEY, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`;
}

export function decryptBank(ciphertextWithIvAndTag: string): string {
  const parts = ciphertextWithIvAndTag.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format");
  }

  const [ivHex, tagHex, encryptedHex] = parts;
  const key = Buffer.from(config.BANK_AES_KEY, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

export function maskBankAccount(accountNumber: string): string {
  if (accountNumber.length <= 4) return accountNumber;
  return "•".repeat(accountNumber.length - 4) + accountNumber.slice(-4);
}

