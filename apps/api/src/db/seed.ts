import { db, pool } from "./client.js";
import * as schema from "./schema.js";
import { hashSecret } from "../auth/hash.js";
import { encryptBank } from "../crypto/aes.js";
import { sha256Hex } from "@procurement/shared";

export async function runSeed(targetDb?: any) {
  const d = targetDb || db;
  console.log("Seeding database...");

  // 1. Centres
  const c07 = {
    id: "centre-c07",
    code: "C07",
    name: "Latur East Collection Centre",
    village: "Ausa",
  };
  const c12 = {
    id: "centre-c12",
    code: "C12",
    name: "Latur West Collection Centre",
    village: "Renapur",
  };

  await d.insert(schema.centres).values([c07, c12]).onConflictDoNothing();

  // 2. Users
  const officePasswordHash = await hashSecret("Password123!");
  const op1PinHash = await hashSecret("1234");
  const op2PinHash = await hashSecret("5678");

  const officeManager = {
    id: "user-office-1",
    role: "office_manager",
    name: "Anil Kadam (Office Manager)",
    email: "office@latur-fpc.org",
    passwordHash: officePasswordHash,
  };

  const op1 = {
    id: "user-op-c07",
    role: "operator",
    centreId: c07.id,
    name: "Ramesh Patil",
    email: "ramesh.c07@latur-fpc.org",
    pinHash: op1PinHash,
  };

  const op2 = {
    id: "user-op-c12",
    role: "operator",
    centreId: c12.id,
    name: "Santosh Deshmukh",
    email: "santosh.c12@latur-fpc.org",
    pinHash: op2PinHash,
  };

  await d.insert(schema.users).values([officeManager, op1, op2]).onConflictDoNothing();

  // 3. Devices
  const device1 = {
    id: "dev-c07-01",
    userId: op1.id,
    centreId: c07.id,
    publicKeyJwk: JSON.stringify({ kty: "EC", crv: "P-256", x: "test-x", y: "test-y" }),
  };
  const device2 = {
    id: "dev-c12-01",
    userId: op2.id,
    centreId: c12.id,
    publicKeyJwk: JSON.stringify({ kty: "EC", crv: "P-256", x: "test-x2", y: "test-y2" }),
  };

  await d.insert(schema.devices).values([device1, device2]).onConflictDoNothing();

  // 4. Moisture Rules
  await d
    .insert(schema.moistureRules)
    .values([
      { id: "mr-soybean", crop: "Soybean", baseMoistureX10: 120, deductionPermillePerPoint: 10 },
      { id: "mr-tur", crop: "Tur", baseMoistureX10: 120, deductionPermillePerPoint: 10 },
    ])
    .onConflictDoNothing();

  // 5. Price Board
  const price1 = {
    id: "price-sb-v1",
    crop: "Soybean",
    grade: "FAQ",
    ratePaisePerQuintal: 485000, // Rs 4,850
    version: 1,
    setBy: officeManager.id,
  };
  const price2 = {
    id: "price-tur-v1",
    crop: "Tur",
    grade: "FAQ",
    ratePaisePerQuintal: 720000, // Rs 7,200
    version: 1,
    setBy: officeManager.id,
  };

  await d.insert(schema.priceBoard).values([price1, price2]).onConflictDoNothing();

  // 6. 25 Members across 4 villages
  const villages = ["Ausa", "Renapur", "Shirur Anantpal", "Nilanga"];
  const baseMembers = [
    { code: "FMR-001", name: "सुनील जाधव", latin: "Sunil Jadhav", village: "Ausa", land: 45, mobile: "9822012345", ac: "912345678901", ifsc: "MAHB0000123" },
    { code: "FMR-002", name: "कमल शिंदे", latin: "Kamal Shinde", village: "Ausa", land: 30, mobile: "9822012346", ac: "912345678902", ifsc: "MAHB0000123" },
    { code: "FMR-003", name: "मोहन बिरादार", latin: "Mohan Biradar", village: "Renapur", land: 25, mobile: "9822012347", ac: "912345678903", ifsc: "SBIN0001234" },
    { code: "FMR-004", name: "ज्ञानेश्वर मुंडे", latin: "Dnyaneshwar Munde", village: "Renapur", land: 50, mobile: "9822012348", ac: "912345678904", ifsc: "SBIN0001234" },
    { code: "FMR-005", name: "बाळासाहेब गायकवाड", latin: "Balasaheb Gaikwad", village: "Shirur Anantpal", land: 60, mobile: "9822012349", ac: "912345678905", ifsc: "MAHB0000456" },
    { code: "FMR-006", name: "विकास सावंत", latin: "Vikas Sawant", village: "Shirur Anantpal", land: 35, mobile: "9822012350", ac: "912345678906", ifsc: "MAHB0000456" },
    { code: "FMR-007", name: "प्रदीप चव्हाण", latin: "Pradeep Chavan", village: "Nilanga", land: 40, mobile: "9822012351", ac: "912345678907", ifsc: "BKID0002345" },
    { code: "FMR-008", name: "अनिल माने", latin: "Anil Mane", village: "Nilanga", land: 20, mobile: "9822012352", ac: "912345678908", ifsc: "BKID0002345" },
    { code: "FMR-009", name: "संजय भोसले", latin: "Sanjay Bhosale", village: "Ausa", land: 55, mobile: "9822012353", ac: "912345678909", ifsc: "MAHB0000123" },
    { code: "FMR-010", name: "दिलीप कदम", latin: "Dilip Kadam", village: "Renapur", land: 38, mobile: "9822012354", ac: "912345678910", ifsc: "SBIN0001234" },
    { code: "FMR-011", name: "संतोष कांबळे", latin: "Santosh Kamble", village: "Shirur Anantpal", land: 22, mobile: "9822012355", ac: "912345678911", ifsc: "MAHB0000456" },
    { code: "FMR-012", name: "राजेंद्र पवार", latin: "Rajendra Pawar", village: "Nilanga", land: 70, mobile: "9822012356", ac: "912345678912", ifsc: "BKID0002345" },
    { code: "FMR-013", name: "नारायण मोरे", latin: "Narayan More", village: "Ausa", land: 48, mobile: "9822012357", ac: "912345678913", ifsc: "MAHB0000123" },
    { code: "FMR-014", name: "तानाजी सूर्यवंशी", latin: "Tanaji Suryawanshi", village: "Renapur", land: 32, mobile: "9822012358", ac: "912345678914", ifsc: "SBIN0001234" },
    { code: "FMR-015", name: "मारुती शिंदे", latin: "Maruti Shinde", village: "Shirur Anantpal", land: 28, mobile: "9822012359", ac: "912345678915", ifsc: "MAHB0000456" },
    { code: "FMR-016", name: "अशोक केंद्रे", latin: "Ashok Kendre", village: "Nilanga", land: 65, mobile: "9822012360", ac: "912345678916", ifsc: "BKID0002345" },
    { code: "FMR-017", name: "गणेश राठोड", latin: "Ganesh Rathod", village: "Ausa", land: 18, mobile: "9822012361", ac: "912345678917", ifsc: "MAHB0000123" },
    { code: "FMR-018", name: "विजय लोहार", latin: "Vijay Lohar", village: "Renapur", land: 24, mobile: "9822012362", ac: "912345678918", ifsc: "SBIN0001234" },
    { code: "FMR-019", name: "सुरेश पाटील", latin: "Suresh Patil", village: "Shirur Anantpal", land: 52, mobile: "9822012363", ac: "912345678919", ifsc: "MAHB0000456" },
    { code: "FMR-020", name: "महेश काळे", latin: "Mahesh Kale", village: "Nilanga", land: 44, mobile: "9822012364", ac: "912345678920", ifsc: "BKID0002345" },
    { code: "FMR-021", name: "पांडुरंग गिरी", latin: "Pandurang Giri", village: "Ausa", land: 36, mobile: "9822012365", ac: "912345678921", ifsc: "MAHB0000123" },
    { code: "FMR-022", name: "अविनाश सोळंके", latin: "Avinash Solanke", village: "Renapur", land: 29, mobile: "9822012366", ac: "912345678922", ifsc: "SBIN0001234" },
    { code: "FMR-023", name: "विष्णू फड", latin: "Vishnu Phad", village: "Shirur Anantpal", land: 41, mobile: "9822012367", ac: "912345678923", ifsc: "MAHB0000456" },
    { code: "FMR-024", name: "दत्तात्रय घुगे", latin: "Dattatraya Ghuge", village: "Nilanga", land: 33, mobile: "9822012368", ac: "912345678924", ifsc: "BKID0002345" },
    { code: "FMR-025", name: "केशव मुंढे", latin: "Keshav Mundhe", village: "Ausa", land: 47, mobile: "9822012369", ac: "912345678925", ifsc: "MAHB0000123" },
  ];

  const now = new Date();
  const memberRecords = baseMembers.map((m, idx) => ({
    id: `member-${idx + 1}`,
    farmerCode: m.code,
    name: m.name,
    nameLatin: m.latin,
    village: m.village,
    landTenthsAcre: m.land,
    mobile: m.mobile,
    bankAccountEnc: encryptBank(m.ac),
    ifsc: m.ifsc,
    bankVerifiedAt: now,
    consentAt: now,
    consentTextVersion: 1,
  }));

  await d.insert(schema.members).values(memberRecords).onConflictDoNothing();

  // 7. Seed Sample Purchases (yesterday)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const samplePurchases = [
    {
      id: "a0000000-0000-0000-0000-000000000001",
      slipNo: "C07-24518",
      memberId: "member-1", // Sunil Jadhav
      crop: "Soybean",
      grade: "FAQ",
      grossX10: 12500,
      tareX10: 180,
      moistureX10: 115,
      netX10: 12320,
      ratePaise: 485000,
      amountPaise: 5975200,
      priceVersion: 1,
      memberSnapshotJson: encryptBank(
        JSON.stringify({
          name: "सुनील जाधव",
          bankAccount: "912345678901",
          ifsc: "MAHB0000123",
          bankVerified: true,
        })
      ),
      deviceId: device1.id,
      deviceSeq: 1,
      prevHash: "0".repeat(64),
      entryHash: await sha256Hex("C07-24518"),
      signature: "mock-sig-1",
      clientTime: yesterday,
      status: "accepted",
    },
    {
      id: "a0000000-0000-0000-0000-000000000002",
      slipNo: "C07-24519",
      memberId: "member-2", // Kamal Shinde
      crop: "Soybean",
      grade: "FAQ",
      grossX10: 8600,
      tareX10: 120,
      moistureX10: 140,
      netX10: 8310,
      ratePaise: 485000,
      amountPaise: 4030350,
      priceVersion: 1,
      memberSnapshotJson: encryptBank(
        JSON.stringify({
          name: "कमल शिंदे",
          bankAccount: "912345678902",
          ifsc: "MAHB0000123",
          bankVerified: true,
        })
      ),
      deviceId: device1.id,
      deviceSeq: 2,
      prevHash: await sha256Hex("C07-24518"),
      entryHash: await sha256Hex("C07-24519"),
      signature: "mock-sig-2",
      clientTime: yesterday,
      status: "accepted",
    },
    {
      id: "a0000000-0000-0000-0000-000000000003",
      slipNo: "C12-08876",
      memberId: "member-3", // Mohan Biradar
      crop: "Tur",
      grade: "FAQ",
      grossX10: 6400,
      tareX10: 100,
      moistureX10: 100,
      netX10: 6300,
      ratePaise: 720000,
      amountPaise: 4536000,
      priceVersion: 1,
      memberSnapshotJson: encryptBank(
        JSON.stringify({
          name: "मोहन बिरादार",
          bankAccount: "912345678903",
          ifsc: "SBIN0001234",
          bankVerified: true,
        })
      ),
      deviceId: device2.id,
      deviceSeq: 1,
      prevHash: "0".repeat(64),
      entryHash: await sha256Hex("C12-08876"),
      signature: "mock-sig-3",
      clientTime: yesterday,
      status: "accepted",
    },
  ];

  await d.insert(schema.purchases).values(samplePurchases).onConflictDoNothing();

  console.log("Seeding complete: 2 centres, 3 users, 2 devices, 25 members, 2 prices, 3 sample slips.");
}

if (process.argv[1]?.includes("seed.ts")) {
  runSeed()
    .then(() => pool.end())
    .catch((err) => {
      console.error("Seed error:", err);
      process.exit(1);
    });
}

