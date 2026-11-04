import { hash, verify } from "@node-rs/argon2";

export async function hashSecret(secret: string): Promise<string> {
  return hash(secret);
}

export async function verifySecret(secret: string, hashed: string): Promise<boolean> {
  try {
    return await verify(hashed, secret);
  } catch {
    return false;
  }
}

