import { describe, it, expect } from "vitest";
import { getNavItems } from "../nav.js";

// Phase F exit: a logged-in operator never sees office tabs (and vice versa).
describe("getNavItems — per-role tab visibility", () => {
  it("operator sees only field tabs: collect, members, prices, sync", () => {
    const ids = getNavItems("operator").map((item) => item.id);
    expect(ids).toEqual(["collect", "members", "prices", "sync"]);
  });

  it("operator never sees office tabs", () => {
    const ids = getNavItems("operator").map((item) => item.id);
    for (const officeTab of ["review", "payments", "centres", "devices", "sms", "slips"]) {
      expect(ids).not.toContain(officeTab);
    }
  });

  it("office manager sees only HQ tabs", () => {
    const ids = getNavItems("office_manager").map((item) => item.id);
    expect(ids).toEqual([
      "members",
      "prices",
      "review",
      "payments",
      "centres",
      "devices",
      "sms",
      "slips",
    ]);
  });

  it("office manager never sees field tabs", () => {
    const ids = getNavItems("office_manager").map((item) => item.id);
    expect(ids).not.toContain("collect");
    expect(ids).not.toContain("sync");
  });

  it("sync tab carries the pending-outbox badge for operators", () => {
    const nav = getNavItems("operator", 3);
    const sync = nav.find((item) => item.id === "sync");
    expect(sync?.badge).toBe(3);
  });

  it("no badge is attached when nothing is pending", () => {
    const nav = getNavItems("operator", 0);
    const sync = nav.find((item) => item.id === "sync");
    expect(sync?.badge).toBe(0);
  });
});
