import { describe, it, expect, beforeAll } from "vitest";
import "fake-indexeddb/auto";
import { AppDB, buildNameTokens, CachedMember } from "../offline/db.js";

describe("Phase 2: Dexie Devanagari Member Search at Scale (§13.4)", () => {
  let testDb: AppDB;

  const firstNames = ["सुनील", "कमल", "मोहन", "ज्ञानेश्वर", "बाळासाहेब", "विकास", "प्रदीप", "अनिल", "संजय", "दिलीप"];
  const lastNames = ["जाधव", "शिंदे", "बिरादार", "मुंडे", "गायकवाड", "सावंत", "चव्हाण", "माने", "भोसले", "कदम"];
  const villages = ["Ausa", "Renapur", "Shirur Anantpal", "Nilanga"];

  const lastNamesLatin: Record<string, string> = {
    जाधव: "Jadhav",
    शिंदे: "Shinde",
    बिरादार: "Biradar",
    मुंडे: "Munde",
    गायकवाड: "Gaikwad",
    सावंत: "Sawant",
    चव्हाण: "Chavan",
    माने: "Mane",
    भोसले: "Bhosale",
    कदम: "Kadam",
  };

  beforeAll(async () => {
    testDb = new AppDB();
    await testDb.open();

    console.log("Generating 6,200 synthetic farmer records...");
    const syntheticMembers: CachedMember[] = [];

    for (let i = 1; i <= 6200; i++) {
      const fn = firstNames[i % firstNames.length];
      const ln = lastNames[i % lastNames.length];
      const name = `${fn} ${ln}`;
      const nameLatin = `${fn} ${lastNamesLatin[ln] || ""}`;
      const village = villages[i % villages.length];
      const code = `FMR-${String(i).padStart(5, "0")}`;

      syntheticMembers.push({
        id: `synth-${i}`,
        farmerCode: code,
        name,
        nameLatin,
        village,
        landTenthsAcre: 20 + (i % 80),
        mobile: `98220${String(i).padStart(5, "0")}`,
        bankAccountMasked: `••••••••${String(i).padStart(4, "0")}`,
        ifsc: "MAHB0000123",
        bankVerified: i % 2 === 0,
        consentWithdrawn: false,
        nameTokens: buildNameTokens(name, nameLatin),
      });
    }

    // Insert into Dexie
    await testDb.members.bulkPut(syntheticMembers);
    const count = await testDb.members.count();
    expect(count).toBe(6200);
    console.log(`Successfully seeded ${count} members into Dexie.`);
  });

  it("finds members by Devanagari surname token in under 150ms", async () => {
    const startTime = performance.now();
    const results = await testDb.searchMembers("जाधव", 20);
    const elapsed = performance.now() - startTime;

    console.log(`Devanagari surname search ("जाधव") took ${elapsed.toFixed(2)}ms, found ${results.length} results.`);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toContain("जाधव");
    expect(elapsed).toBeLessThan(150); // Hard constraint from brief & implementation plan
  });

  it("finds members by Latin surname token (e.g. 'Jadhav') in under 150ms", async () => {
    const startTime = performance.now();
    const results = await testDb.searchMembers("Jadhav", 20);
    const elapsed = performance.now() - startTime;

    console.log(`Latin surname search ("Jadhav") took ${elapsed.toFixed(2)}ms, found ${results.length} results.`);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].nameTokens).toContain("jadhav");
    expect(elapsed).toBeLessThan(150);
  });

  it("finds members by farmer code prefix in under 150ms", async () => {
    const startTime = performance.now();
    const results = await testDb.searchMembers("FMR-0004", 10);
    const elapsed = performance.now() - startTime;

    console.log(`Farmer code search ("FMR-0004") took ${elapsed.toFixed(2)}ms, found ${results.length} results.`);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].farmerCode.startsWith("FMR-0004")).toBe(true);
    expect(elapsed).toBeLessThan(150);
  });

  it("finds members by village in under 150ms", async () => {
    const startTime = performance.now();
    const results = await testDb.searchMembers("Nilanga", 10);
    const elapsed = performance.now() - startTime;

    console.log(`Village search ("Nilanga") took ${elapsed.toFixed(2)}ms, found ${results.length} results.`);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].village).toBe("Nilanga");
    expect(elapsed).toBeLessThan(150);
  });
});

