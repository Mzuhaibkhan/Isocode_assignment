import { test, expect, type Page } from "@playwright/test";

/**
 * End-to-end hardening suite (plan G1).
 *
 * The Playwright config boots a seeded in-memory API (NODE_ENV=test → PGlite)
 * and the Vite dev server, so no Docker is required. Every test gets a fresh
 * browser context (= fresh IndexedDB/Dexie) while the SERVER state accumulates
 * across tests in declaration order, so assertions are deliberately
 * state-tolerant (e.g. payment totals are compared against the UI, never a
 * hardcoded sum).
 */

const BASE_URL = "http://localhost:5173";

/** Seed identities from apps/api/src/db/seed.ts */
const OFFICE_EMAIL = "office@latur-fpc.org";
const OFFICE_PASSWORD = "Password123!";
const OPERATOR_PIN = ["1", "2", "3", "4"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Log in as the C07 field operator via the tactile PIN numpad. */
async function loginOperator(page: Page): Promise<void> {
  const loginButton = page.getByRole("button", { name: /लॉगिन करा/ });
  if (!(await loginButton.isVisible().catch(() => false))) {
    await page.goto("/");
  }
  for (const digit of OPERATOR_PIN) {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }
  await loginButton.click();
  // The operator lands on the Collect tab.
  await expect(page.getByRole("button", { name: /नवीन खरेदी/ })).toBeVisible({ timeout: 30_000 });
}

/** Log in at HQ (office manager). */
async function loginOffice(page: Page): Promise<void> {
  const officeTab = page.getByRole("button", { name: /व्यवस्थापक/ });
  if (!(await officeTab.isVisible().catch(() => false))) {
    await page.goto("/");
  }
  await officeTab.click();
  await page.locator('input[type="email"]').fill(OFFICE_EMAIL);
  await page.locator('input[type="password"]').fill(OFFICE_PASSWORD);
  await page.getByRole("button", { name: /साइन इन करा/ }).click();
  // The office manager lands on the Members tab.
  await expect(page.getByRole("button", { name: /सभासद/ })).toBeVisible({ timeout: 30_000 });
}

/** Log out via the header button (no page reload — Dexie still holds the user). */
async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: /बाहेर पडा/ }).click();
  await expect(page.getByRole("button", { name: /लॉगिन करा/ })).toBeVisible();
}

/**
 * Wait until the member directory (Dexie cache) serves rows for `query`.
 * The search input only re-queries on change, so the poll clears and re-fills
 * it — this also covers the post-login member-cache race.
 */
async function waitForMemberRow(page: Page, query: string): Promise<void> {
  const input = page.getByPlaceholder(/SEARCH MEMBER/);
  await expect
    .poll(
      async () => {
        await input.fill("");
        await input.fill(query);
        return page.getByRole("button", { name: new RegExp(query) }).count();
      },
      { timeout: 30_000 }
    )
    .toBeGreaterThan(0);
}

/**
 * Make sure the Dexie price cache is populated before recording purchases,
 * otherwise a purchase would fall back to the stale v1 rate and get held as
 * STALE_PRICE_VERSION on sync.
 */
async function warmPriceCache(page: Page): Promise<void> {
  await page.getByRole("button", { name: /दर फलक/ }).click();
  await expect(page.getByText(/₹[\d,]+\.\d{2}/).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /नवीन खरेदी/ }).click();
  await expect(page.getByPlaceholder(/SEARCH MEMBER/)).toBeVisible();
}

/** Record one purchase end-to-end with the default weights (1250/18/11.5). */
async function recordPurchase(page: Page, memberQuery: string): Promise<void> {
  await waitForMemberRow(page, memberQuery);
  await page.getByRole("button", { name: new RegExp(memberQuery) }).first().click();
  await page.getByRole("button", { name: /NEXT: MOISTURE/ }).click();
  await page.getByRole("button", { name: /NEXT: SUMMARY/ }).click();
  await page.getByRole("button", { name: /CONFIRM & PRINT SLIP/ }).click();
  await expect(page.getByText("खरेदी पावती (RECEIPT)")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /नवीन खरेदी नोंदवा/ }).click();
}

/** Split one CSV line, honouring RFC-style double-quoted fields. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

/** Sum the "Amount" column (index 4) of a bank payment CSV, in paise. */
function sumCsvAmounts(csv: string): number {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  let totalPaise = 0;
  for (let i = 1; i < lines.length; i++) {
    const amount = parseCsvLine(lines[i])[4];
    totalPaise += Math.round(parseFloat(amount) * 100);
  }
  return totalPaise;
}

/** Mirror of packages/shared/src/money.ts formatRupees. */
function formatRupees(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const p = String(paise % 100).padStart(2, "0");
  return "₹" + rupees.toLocaleString("en-IN") + "." + p;
}

// ---------------------------------------------------------------------------
// Tests (serial by declaration order; the server state accumulates)
// ---------------------------------------------------------------------------

test("office publishes a price and the operator sees it after sync", async ({ page }) => {
  await loginOffice(page);

  await page.getByRole("button", { name: /दर फलक/ }).click();
  await page.locator('input[type="number"]').fill("5151");
  await page.getByRole("button", { name: /PUBLISH RATE/ }).click();
  await expect(page.getByText(/यशस्वीरीत्या जाहीर झाला/)).toBeVisible();

  await logout(page);
  await loginOperator(page);

  await page.getByRole("button", { name: /दर फलक/ }).click();
  await expect(page.getByText("₹5,151.00").first()).toBeVisible({ timeout: 30_000 });
});

test("offline purchases sync after reconnect and create SMS log rows", async ({ page }) => {
  await loginOperator(page);
  await warmPriceCache(page);

  // The shed goes offline: three purchases land in the local outbox only.
  await page.context().setOffline(true);
  await recordPurchase(page, "जाधव");
  await recordPurchase(page, "कमल");
  await recordPurchase(page, "बाळासाहेब");

  await page.getByRole("button", { name: /सिंक स्थिती/ }).click();
  await expect(page.getByText("⏳ PENDING")).toHaveCount(3);

  // Reconnect and sync — every row must be accepted by the hash-chain server.
  await page.context().setOffline(false);
  await page.getByRole("button", { name: /SYNC NOW/ }).click();
  await expect(page.getByText("✓ SYNCED")).toHaveCount(3, { timeout: 30_000 });

  // HQ must see one Marathi SMS per accepted purchase.
  await logout(page);
  await loginOffice(page);
  await page.getByRole("button", { name: /SMS नोंदी/ }).click();
  await expect(page.getByText("SENT ✓")).toHaveCount(3, { timeout: 30_000 });
});

test("tampered outbox row is rejected with a named Marathi reason", async ({ page }) => {
  await loginOperator(page);
  await warmPriceCache(page);

  await page.context().setOffline(true);
  await recordPurchase(page, "जाधव");

  await page.getByRole("button", { name: /सिंक स्थिती/ }).click();
  await expect(page.getByText("⏳ PENDING")).toHaveCount(1);

  // Mutate the payload without recomputing hash/signature; the immediate sync
  // attempt must fail while offline, leaving the tampered row pending.
  await page.getByRole("button", { name: /TEST TAMPER/ }).click();
  await expect(page.getByText(/सिंक प्रतिसाद|सिंक अयशस्वी/)).toBeVisible();
  await expect(page.getByText("⏳ PENDING")).toHaveCount(1);

  await page.context().setOffline(false);
  await page.getByRole("button", { name: /SYNC NOW/ }).click();
  await expect(page.getByText("✗ REJECTED")).toHaveCount(1, { timeout: 30_000 });
  await expect(page.getByText(/हॅश जुळत नाही/)).toBeVisible();
});

test("role guard: operator and office see disjoint navigation", async ({ page }) => {
  await loginOperator(page);
  const nav = page.locator("nav");

  await expect(nav.getByRole("button", { name: /नवीन खरेदी/ })).toBeVisible();
  await expect(nav.getByRole("button", { name: /सिंक स्थिती/ })).toBeVisible();
  await expect(nav.getByRole("button", { name: /देयक फाईल/ })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: /पुनरावलोकन/ })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: /SMS नोंदी/ })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: /साधने/ })).toHaveCount(0);

  await logout(page);
  await loginOffice(page);

  await expect(nav.getByRole("button", { name: /देयक फाईल/ })).toBeVisible();
  await expect(nav.getByRole("button", { name: /पुनरावलोकन/ })).toBeVisible();
  await expect(nav.getByRole("button", { name: /SMS नोंदी/ })).toBeVisible();
  await expect(nav.getByRole("button", { name: /साधने/ })).toBeVisible();
  await expect(nav.getByRole("button", { name: /नवीन खरेदी/ })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: /सिंक स्थिती/ })).toHaveCount(0);
});

test("payment run CSV file total matches the UI total to the paisa", async ({ page }) => {
  await loginOffice(page);
  await page.getByRole("button", { name: /देयक फाईल/ }).click();

  const selectAll = page.locator("label", { hasText: /SELECT ALL/ });
  await expect(selectAll).toBeVisible({ timeout: 30_000 });
  await selectAll.locator('input[type="checkbox"]').check();

  await page.getByRole("button", { name: /GENERATE PAYMENT RUN/ }).click();
  const notice = page.getByText(/यशस्वीरित्या तयार झाला/);
  await expect(notice).toBeVisible({ timeout: 30_000 });

  const noticeText = (await notice.textContent()) ?? "";
  const runId = noticeText.match(/रन\s+(run-[0-9a-f]{8})/)?.[1];
  const uiTotal = noticeText.match(/रक्कम:\s*(₹[\d,]+\.\d{2})/)?.[1];
  expect(runId, "run id must be present in the notice").toBeTruthy();
  expect(uiTotal, "formatted total must be present in the notice").toBeTruthy();

  // The office session cookie authenticates the download through the Vite proxy.
  const response = await page.request.get(`${BASE_URL}/api/payment-runs/${runId}/file`);
  expect(response.status()).toBe(200);
  const csv = await response.text();

  expect(csv).toContain(
    "Serial,Beneficiary Name,Account Number,IFSC,Amount,Narration,Payment Reference"
  );
  // A seeded slip must make it into the bank file.
  expect(csv).toContain("C07-24518");

  // Byte-exact accounting: the file sum must equal the UI total to the paisa.
  expect(formatRupees(sumCsvAmounts(csv))).toBe(uiTotal);
});
