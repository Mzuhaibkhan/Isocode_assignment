import { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { config } from "../../config.js";
import type { SessionUser } from "../../routes/auth.js";

// Deterministic signer matching @fastify/cookie's HMAC-SHA256 scheme:
//   signedValue = value + "." + base64(HMAC-SHA256(secret, value)) with padding stripped
export function signedSession(user: SessionUser): string {
  const value = JSON.stringify(user);
  const sig = crypto
    .createHmac("sha256", config.SESSION_SECRET)
    .update(value)
    .digest("base64")
    .replace(/=+$/g, "");
  return `${value}.${sig}`;
}

// Performs a real login against the server and returns the raw signed session
// cookie value. Use this where the session must be end-to-end valid.
export async function loginAs(
  app: FastifyInstance,
  role: "operator" | "office_manager",
  centreId = "centre-c07"
): Promise<string> {
  let res;
  if (role === "office_manager") {
    res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { role: "office_manager", email: "office@latur-fpc.org", password: "Password123!" },
    });
  } else {
    const pin = centreId === "centre-c12" ? "5678" : "1234";
    res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { role: "operator", centreId, pin },
    });
  }

  if (res.statusCode !== 200) {
    throw new Error(`loginAs failed: ${res.statusCode} ${res.payload}`);
  }

  const setCookieHeader = res.headers["set-cookie"];
  const setCookie: string =
    typeof setCookieHeader === "string"
      ? setCookieHeader
      : Array.isArray(setCookieHeader)
        ? setCookieHeader[0]
        : "";
  // Return the decoded signed value: `JSON + "." + hmac`, which can be
  // passed straight into inject's `cookies: { session }` option.
  return decodeURIComponent(setCookie.split(";")[0].trim().replace(/^session=/, ""));
}
