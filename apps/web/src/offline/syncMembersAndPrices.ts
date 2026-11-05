import { db, buildNameTokens, CachedMember, CachedPrice } from "./db.js";

export async function syncMembersAndPrices(): Promise<{
  memberCount: number;
  priceCount: number;
}> {
  try {
    // 1. Fetch members from API
    const membersRes = await fetch("/api/members");
    if (membersRes.ok) {
      const data = await membersRes.json();
      const rawMembers = data.members || [];

      const cachedMembers: CachedMember[] = rawMembers.map((m: any) => ({
        id: m.id,
        farmerCode: m.farmerCode,
        name: m.name,
        nameLatin: m.nameLatin,
        village: m.village,
        landTenthsAcre: m.landTenthsAcre,
        mobile: m.mobile,
        bankAccountMasked: m.bankAccountMasked,
        ifsc: m.ifsc,
        bankVerified: m.bankVerified,
        consentWithdrawn: m.consentWithdrawn,
        nameTokens: buildNameTokens(m.name, m.nameLatin),
      }));

      await db.transaction("rw", db.members, async () => {
        await db.members.clear();
        await db.members.bulkPut(cachedMembers);
      });
    }

    // 2. Fetch prices from API
    const pricesRes = await fetch("/api/prices/current");
    if (pricesRes.ok) {
      const data = await pricesRes.json();
      const rawPrices = data.prices || [];

      const cachedPrices: CachedPrice[] = rawPrices.map((p: any) => ({
        id: p.id,
        crop: p.crop,
        grade: p.grade,
        ratePaisePerQuintal: p.ratePaisePerQuintal,
        rateRupees: p.rateRupees,
        rateFormatted: p.rateFormatted,
        version: p.version,
        effectiveFrom: p.effectiveFrom,
      }));

      await db.transaction("rw", db.prices, async () => {
        await db.prices.clear();
        await db.prices.bulkPut(cachedPrices);
      });
    }

    const memberCount = await db.members.count();
    const priceCount = await db.prices.count();

    return { memberCount, priceCount };
  } catch (err) {
    console.warn("Could not sync with server, using local offline cache:", err);
    return {
      memberCount: await db.members.count(),
      priceCount: await db.prices.count(),
    };
  }
}

