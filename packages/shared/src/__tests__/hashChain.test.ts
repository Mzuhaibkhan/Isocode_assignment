import { describe, it, expect } from "vitest";
import { canonicalJson } from "../canonicalJson.js";
import { sha256Hex, entryHash } from "../hashChain.js";

describe("Canonical JSON and Hash Chain (§9.3)", () => {
  it("sorts keys deterministically", () => {
    const objA = { b: 2, a: 1, c: { y: 20, x: 10 } };
    const objB = { c: { x: 10, y: 20 }, a: 1, b: 2 };
    expect(canonicalJson(objA)).toBe(canonicalJson(objB));
    expect(canonicalJson(objA)).toBe('{"a":1,"b":2,"c":{"x":10,"y":20}}');
  });

  it("handles arrays and primitives", () => {
    expect(canonicalJson([3, 2, 1])).toBe("[3,2,1]");
    expect(canonicalJson("hello")).toBe('"hello"');
    expect(canonicalJson(42)).toBe("42");
    expect(canonicalJson(null)).toBe("null");
  });

  it("computes sha256Hex correctly", async () => {
    // SHA256 of empty string is e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    const hash = await sha256Hex("");
    expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("computes entryHash chaining with prevHash", async () => {
    const prevHash = "0".repeat(64);
    const payload = { slipNo: "C07-24518", amount: 5975200 };
    const hash1 = await entryHash(payload, prevHash);
    expect(hash1).toHaveLength(64);

    // Chaining next entry
    const payload2 = { slipNo: "C07-24519", amount: 4030350 };
    const hash2 = await entryHash(payload2, hash1);
    expect(hash2).toHaveLength(64);
    expect(hash2).not.toBe(hash1);
  });
});

