# लातूर शेतकरी खरेदी व भरणा प्रणाली
## Latur FPC Procurement & Payment System

[![Unit & Integration Tests](https://img.shields.io/badge/tests-134%20passed-brightgreen.svg)]()
[![Bundle Budget](https://img.shields.io/badge/bundle%20size-131.76%20kB%20gzipped%20%28budget%20150%20kB%29-success.svg)]()
[![DPDP Act 2023](https://img.shields.io/badge/DPDP%20Compliance-Hardened-blue.svg)]()
[![Offline First](https://img.shields.io/badge/Offline%20First-ECDSA%20P--256-orange.svg)]()

Production-grade, offline-first, tamper-proof procurement and direct-benefit payment platform purpose-built for Farmer Producer Companies (FPCs), specifically configured for soybean and pigeon pea (*tur*) procurement operations in the Latur district of Maharashtra.

---

## 1. Executive Summary & Client Impact (§1)

Smallholder agricultural procurement in semi-arid zones like Latur is plagued by network unreliability, manual weighment manipulation, and predatory private-trader delays. This system solves these core bottlenecks:

1. **Direct Benefit Transfer (DBT) Payment Turnaround: 12 Days &rarr; 2 Days**
   - Traditional APMC / cooperative procurement runs take up to 12 days to verify paper slips and prepare bank clearing files.
   - This system automates weight deduplication, rate validation, and bank file generation, dropping settlement to under 48 hours directly into farmers' verified accounts.
2. **Weighment & Slip Error Rate: 2.0% &rarr; Under 0.3%**
   - High-contrast, single-step mobile capture, AI LCD reading cross-checks for moisture/scale displays, and integer-only half-up arithmetic eliminate arithmetic and typographical discrepancies.
3. **Disintermediation of Predatory Private Traders**
   - Private traders exploit delayed payments by buying produce at 15–25% distress discounts with immediate cash. 
   - Instant cryptographic receipts, immediate Marathi SMS confirmation, and guaranteed 2-day bank clearing halve private-trader crop diversion.

---

## 2. Architecture & System Design (§4, §5)

```mermaid
flowchart TD
    subgraph Client ["Operator Android PWA (apps/web) - High Sunlight Polite-Chaos UI"]
        A[Weighbridge & Moisture Capture] --> B[AI LCD OCR / Photo Pre-fill]
        B --> C[Integer Net Weight & Amount Engine]
        C --> D[Physical Slip Print / Marathi SMS Queue]
        D --> E[WebCrypto ECDSA P-256 Signer]
        E --> F[Dexie IndexedDB Hash Chain Outbox]
    end

    subgraph Network ["Air-Gapped / Intermittent Rural Connectivity"]
        F -. "Sync when cellular/Wi-Fi connects" .-> G[Fastify API /sync/purchases]
    end

    subgraph Server ["Fastify Backend (apps/api)"]
        G --> H{10-Step Verification Pipeline}
        H -->|Signature, Hash, Seq, Rate Valid| I[Drizzle ORM Engine]
        H -->|Tampered / Broken Chain| J[Rejection Ledger]
        H -->|Clock Skew / Duplicate / Stale Price| K[Review Queue Holds]
        I --> L[(PostgreSQL Database)]
        I --> M[AES-GCM-256 Member Snapshot Storage]
        I --> N[Marathi SMS Gateway Engine]
    end

    subgraph Office ["Office Manager Portal (apps/web)"]
        O[Daily Price Board v1..vn] --> L
        P[Held Purchases Review & Release] --> L
        Q[Centre Daily Summary & Stock Monitoring] --> L
        R[Bank Payment Run Generator] --> S[CSV / NACH Bank File Generator]
        T[Retry-Failed Run Isolation Engine] --> S
    end
```

### Monorepo Structure

```
Isocode_assignment/
├── apps/
│   ├── api/                     # Node.js + Fastify + Drizzle ORM backend
│   │   ├── src/
│   │   │   ├── crypto/          # AES-GCM-256 bank encryption & Argon2 hashing
│   │   │   ├── db/              # Drizzle schema, client, migrations & seed
│   │   │   ├── flags/           # §10.1 anomaly evaluation rules (clock, yield, duplicate)
│   │   │   ├── routes/          # auth, centres, devices, members, payments, purchases, sync
│   │   │   └── server.ts        # Fastify server registration & plugins
│   │   └── src/__tests__/       # 7 test suites, 77 integration tests
│   └── web/                     # React 18 + Vite + Tailwind v4 PWA frontend
│       ├── src/
│       │   ├── db/              # Dexie.js offline schema & inverted token index
│       │   ├── routes/          # Polite-chaos brutalist views (Collect, Review, Prices, Centres)
│       │   ├── utils/           # WebCrypto ECDSA, audio cues, offline outbox
│       │   └── App.tsx          # Navigation, tabs, status bars, and role guards
│       └── src/__tests__/       # 5 test suites, 28 client/offline tests
├── packages/
│   └── shared/                  # Shared domain logic & type definitions
│       ├── src/
│       │   ├── canonicalJson.ts # RFC 8785 deterministic JSON serializer
│       │   ├── hashChain.ts     # SHA-256 chaining algorithms
│       │   ├── money.ts         # Proportional moisture math & half-up rounding
│       │   ├── reasons.ts       # Rejection and Hold typed error constants
│       │   ├── schemas.ts       # Shared Zod validation schemas
│       │   ├── signer.ts        # WebCrypto ECDSA P-256 signing and verification
│       │   └── slip.ts          # Physical Marathi 5-second receipt formatter
│       └── src/__tests__/       # 4 test suites, 29 domain unit tests
└── package.json                 # pnpm workspaces root configuration
```

---

## 3. Technology Stack Decisions & Rationale (§3)

| Component | Choice | Rationale |
|---|---|---|
| **Monorepo Manager** | `pnpm` Workspaces | Strict dependency isolation, symlinked shared packages, zero phantom dependencies, rapid builds. |
| **API Framework** | `Fastify` v5 | Microsecond request routing, native schema validation with Zod, lightweight memory footprint under load. |
| **ORM & Database** | `Drizzle ORM` + `PostgreSQL` | Zero runtime overhead, end-to-end TypeScript inference, SQL-first migration control, rock-solid ACID transactions. |
| **Client Framework** | `React 18` + `Vite` | Instant HMR, minimal bundle overhead, deterministic builds, native PWA service worker caching via `vite-plugin-pwa`. |
| **Client Storage** | `Dexie.js` (IndexedDB) | ACID transactions in the browser, compound secondary keys, sub-3ms multi-token indexing for 6,200+ farmers. |
| **Cryptographic Primitives** | WebCrypto API (`ECDSA P-256` + `SHA-256`) | Standardized browser engine acceleration, hardware-isolation support (`extractable: false`), canonical JSON signing. |
| **Backend Crypto** | `Node.js Crypto` (`AES-GCM-256` + `Argon2id`) | Authenticated symmetric encryption at rest for PII, memory-hard hashing resistant to GPU brute-forcing. |
| **Design Language** | "Polite Chaos" Brutalist Monochrome | Ultra-high contrast (exceeds 7:1) for bright outdoor sunlight at APMC yards, 48px tap targets, 40px+ monumental numerals. |

---

## 4. Mathematical & Money Standards (§6)

Floating-point numbers are strictly forbidden across both frontend and backend. All currency and weight values use 64-bit integer arithmetic.

### 4.1 Units of Measure
- **Weights**: Tenths of a kilogram (`1 kg = 10 tenths`). Gross, tare, and net weights are integers.
- **Moisture**: Tenths of a percent (`12.0% = 120 tenths`).
- **Rates**: Paise per quintal (`1 quintal = 100 kg = 1,000 tenths`). ₹4,850.00/quintal = `485,000 paise`.
- **Amounts**: Integer paise (`₹1.00 = 100 paise`).

### 4.2 Proportional Fractional Moisture Deduction
Deductions apply proportionally for every fraction of moisture above the base threshold:
- **Base Moisture**: `12.0%` (120 tenths) for Soybean.
- **Deduction Rule**: 1 permille (0.1%) weight deduction for every 0.1% moisture above base.
$$\text{excessMoisture} = \max(0, \text{moistureX10} - 120)$$
$$\text{deductionPermille} = \text{excessMoisture} \times 10$$
$$\text{grossAfterTare} = \text{grossX10} - \text{tareX10}$$
$$\text{netX10} = \left\lfloor \frac{\text{grossAfterTare} \times (1000 - \text{deductionPermille}) + 500}{1000} \right\rfloor$$

### 4.3 Half-Up Integer Rounding
Exact half-up rounding implemented via integer arithmetic:
$$\text{roundDiv}(n, d) = \left\lfloor \frac{n + \lfloor d / 2 \rfloor}{d} \right\rfloor$$
$$\text{amountPaise} = \text{roundDiv}(\text{netX10} \times \text{ratePaisePerQuintal}, 1000)$$

### 4.4 Official Reference Verification Table
All cases verified by automated unit tests in both `packages/shared` and `apps/api`:

| Case | Gross (tenths) | Tare (tenths) | Moisture (tenths) | Rate (paise) | Net Weight | Net kg | Total Amount |
|---|---|---|---|---|---|---|---|
| **C07-24518** (Sunil Jadhav) | 12,500 | 180 | 115 (11.5%) | 485,000 | 12,320 tenths | 1,232.0 kg | **₹59,752.00** (5,975,200 p) |
| **C07-24519** (Kamal Shinde) | 8,600 | 120 | 140 (14.0%) | 485,000 | 8,310 tenths | 831.0 kg | **₹40,303.50** (4,030,350 p) |
| **C12-08876** (Mohan Biradar) | 6,400 | 100 | 100 (10.0%) | 720,000 | 6,300 tenths | 630.0 kg | **₹45,360.00** (4,536,000 p) |
| Exactly 12.0% | 10,000 | 0 | 120 (12.0%) | 485,000 | 10,000 tenths | 1,000.0 kg | **₹48,500.00** (4,850,000 p) |
| 12.1% (0.1 pt excess) | 10,000 | 0 | 121 (12.1%) | 485,000 | 9,990 tenths | 999.0 kg | **₹48,451.50** (4,845,150 p) |
| 13.5% (1.5 pt excess) | 10,000 | 0 | 135 (13.5%) | 485,000 | 9,850 tenths | 985.0 kg | **₹47,772.50** (4,777,250 p) |
| 20.0% (8.0 pt excess) | 10,000 | 0 | 200 (20.0%) | 485,000 | 9,200 tenths | 920.0 kg | **₹44,620.00** (4,462,000 p) |
| 30.0% (18.0 pt excess)| 10,000 | 0 | 300 (30.0%) | 485,000 | 8,200 tenths | 820.0 kg | **₹39,770.00** (3,977,000 p) |

---

## 5. Offline Sync & Cryptographic Pipeline (§9)

### 5.1 Device Registration & Key Generation
- On first login, each operator device generates a standard NIST P-256 elliptic-curve keypair (`ECDSA P-256`, SHA-256) using `crypto.subtle.generateKey`.
- The private key is generated with `extractable: false` and the `CryptoKeyPair` is persisted in IndexedDB — the private key can never be exported or cloned off the device.
- The public key is exported as JWK and registered with the server (`POST /devices/register`).
- **Revocation is terminal** (`DEVICE_REVOKED` at register and sync) unless the office manager re-enables the device via `POST /devices/:id/reenable`, which clears `revoked_at` and writes a `DEVICE_REENABLED` audit entry.

### 5.2 Client Outbox & Hash Chaining
Each recorded purchase creates an immutable record in IndexedDB:
1. `deviceSeq`: Strictly sequential integer ($1, 2, 3\dots$).
2. `prevHash`: 64 zeros (`0000...`) for the device's first transaction, or the `entryHash` of the preceding purchase.
3. `entryHash`: $\text{SHA-256}(\text{prevHash} + \text{canonicalJson}(\text{payload}))$.
4. `signature`: ECDSA signature of `entryHash` by the device private key.

### 5.3 Server 10-Step Ingestion Pipeline (`POST /sync/purchases`)
Every entry submitted in an upload batch is evaluated strictly in sequence:
1. **Device Check**: Ensure device exists and is not revoked (`DEVICE_REVOKED`).
2. **Signature Verification**: Validate ECDSA signature against the device's registered public key (`SIGNATURE_INVALID`).
3. **Hash Recomputation**: Recompute hash over canonical JSON; any alteration yields `HASH_MISMATCH`.
4. **Hash Chain Continuity**: Verify claimed `prevHash` equals the last accepted `entryHash` (`PREV_HASH_MISMATCH`).
5. **Sequence & Idempotency**: Verify sequence is strictly `lastAccepted + 1`. Duplicate submissions return earlier result idempotently; gaps trigger `SEQ_GAP`.
6. **Weight & Money Recomputation**: Net weight and amount are recalculated on the server; tampering triggers `CALCULATION_MISMATCH`.
7. **Two-Case Price Verification**:
   - Rate mismatch against claimed version &rarr; Rejected with `RATE_MISMATCH`.
   - Rate matches claimed version, but newer price was published prior to `clientTime` &rarr; Accepted but held with `STALE_PRICE_VERSION`.
8. **Encrypted Snapshot**: Live member bank details are snapshotted and encrypted (`memberSnapshotJson`).
9. **Anomaly & Hold Detection**:
   - `CLOCK_SKEW`: Client timestamp diverges by $>6$ hours from server clock.
   - `DUPLICATE_FARMER`: Second purchase for the same farmer within 60 minutes.
   - `YIELD_HIGH`: Cumulative crop deliveries exceed expected yield for declared acreage.
   - `UNIFORM_MOISTURE`: $\ge 5$ consecutive loads with identical moisture readings.
   - `CONSENT_WITHDRAWN`: Farmer withdrew data processing consent prior to weighment.
10. **Marathi SMS Notification**: Immediate Marathi slip dispatch queued to farmer's mobile.

---

## 6. Honest Browser-Timestamp Limitation (§9.9)

> [!WARNING]
> **Browser Environment Timestamp Limitation**  
> Web browsers executing inside mobile operating systems (Chrome / WebView on Android) cannot provide hardware-isolated, cryptographically attested timestamps. A rogue operator could alter the local device system clock.

### Engineering Defences Implemented:
1. **Cryptographic Hash Chain**: Transactions cannot be retroactively inserted into the sequence without breaking all subsequent hashes and signatures.
2. **Non-Extractable ECDSA Keypair**: Private keys cannot be cloned or transferred across devices.
3. **Server Timestamp Anchoring**: Authoritative `server_received_at` is stamped by the server clock upon ingestion.
4. **Sequence Gap Detection (`SEQ_GAP`)**: Missing sequence numbers or skipped indices trigger instant batch rejection.
5. **Clock Skew Hold Filter (`CLOCK_SKEW`)**: Any transaction with `client_time` drifting by more than 6 hours from `server_received_at` is flagged and held for manual manager review.

---

## 7. Security, Privacy & DPDP Act 2023 Compliance (§16)

The platform implements strict compliance with the **Digital Personal Data Protection (DPDP) Act, 2023**:

- [x] **Zero Aadhaar Ingestion**: Verified total absence of Aadhaar columns, fields, form controls, log lines, or AI vision prompts across the codebase.
- [x] **AES-GCM-256 Encryption at Rest**:
  - Live member bank account numbers (`bank_account_enc`) encrypted with 256-bit AES-GCM using authenticated 96-bit initialization vectors.
  - Member transaction snapshots (`member_snapshot_json`) encrypted with the identical authenticated scheme.
- [x] **Bank Detail UI Masking**: Only the last 4 digits are rendered on screen (`••••••••7890`), preventing shoulder-surfing at crowded collection sheds.
- [x] **Informed Plain-Language Marathi Consent**:
  - Captured at onboarding with plain-language Devanagari text.
  - Form stores `consent_at` timestamp and `consent_text_version` to track re-consent requirements if terms evolve.
- [x] **Consent Withdrawal Architecture (§2, §12)**:
  - Recorded via `consent_withdrawn_at`.
  - Blocks all subsequent purchase registrations.
  - Opens a personal data deletion review task.
  - **Statutory Protection**: Produce already delivered prior to withdrawal is **never** denied payment; payment run files include delivered produce snapshots as required by law.
- [x] **Immutable Snapshot Payment Shield**:
  - Bank file generation reads solely from `member_snapshot_json` captured at weighment sync.
  - Subsequent edits to a farmer's live bank account cannot silently divert funds for previously delivered produce.
- [x] **Role-Based Access Control (RBAC)**:
  - `operator`: Restricted to their assigned centre's purchases and offline queue.
  - `office_manager`: District-wide price setting, hold releases, and payment run generation.
- [x] **Comprehensive Immutable Audit Logging**:
  - Every hold release, approval, payment run creation, retry generation, price revision, and consent withdrawal writes to `audit_log`.

### 7.1 Data Retention & Erasure Procedures
- **Accounting Records**: Under Section 128 of the Companies Act 2013 and Section 44AA of the Income Tax Act 1961, procurement vouchers, weighment slips, and bank transfer settlement records must be preserved for **8 financial years**.
- **Personal Data Erasure Workflow**: When a farmer withdraws consent, personal identifiers (phone number, land holding records) are flagged for deletion review upon the conclusion of the statutory 8-year accounting retention window.

### 7.2 Encryption Key Rotation Procedure
> [!NOTE]
> Key rotation requires an offline migration script to read all existing rows of `members.bank_account_enc` and `purchases.member_snapshot_json`, decrypt using the retirement key (`PREVIOUS_BANK_AES_KEY`), and re-encrypt under the new active key (`BANK_AES_KEY`). Transactions remain paused during rotation.

---

## 8. Bank Payment Run Engine & Retry Model (§12)

The payment generation engine creates bank-ready disbursement files while enforcing strict accounting integrity:

1. **Reconciliation Invariant**:
   $$\sum \text{PaymentLine Amounts} \equiv \sum \text{Approved Purchase Amounts (to exact paisa)}$$
   Any discrepancy aborts file generation immediately.
2. **Honest Purchase Status Machine**:
   - `approved` → at run creation, included purchases move to `in_payment` (not `paid`).
   - `in_payment` → `paid` only after the bank item reports `success` in `POST /payment-runs/:id/status`.
   - A `failed` item (not yet retried) moves its purchase back to `approved`, making it eligible for a retry run; `retry-failed` sets retried purchases to `in_payment` again.
   - `/payment-runs/eligible-purchases` excludes both `in_payment` and `paid`; `itemStatuses[].itemId` is validated against the run (cross-run updates are rejected with `ITEM_NOT_IN_RUN`).
3. **Immutable Stored File, No Silent Fallbacks**:
   - The generated CSV is stored verbatim in `payment_runs.file_content` at creation and `GET /payment-runs/:id/file` serves those exact stored bytes.
   - Items whose member snapshot fails to decrypt, or whose bank details are missing/unverified, are **skipped and reported** in the run response (`skippedPurchases` with `SNAPSHOT_DECRYPT_FAILED`, `BANK_NOT_VERIFIED`, `BANK_DETAILS_MISSING`) — placeholder account numbers are never substituted.
4. **Standard 7-Column Disbursement Layout**:
   `Serial,Beneficiary Name,Account Number,IFSC,Amount,Narration,Payment Reference`
5. **Isolated Retry-Failed Architecture**:
   - If a bank returns transfer failures (e.g., account frozen, invalid IFSC), the office manager triggers `POST /payment-runs/:id/retry-failed`.
   - The engine generates a **brand-new run** (`kind: 'retry'`, referencing `parentRunId`) containing only the failed items.
   - **The original run, CSV file, and audit trail remain completely immutable.**

> [!TIP]
> **Real Bank Format Adaptation**  
> To interface with specific clearing houses (SBI Corporate Bulk Upload, HDFC E-CMS, Bank of Maharashtra Host-to-Host, or NPCI NACH / ISO 20022 XML), only **a single file** (`apps/api/src/routes/payments.ts` / `bankFileWriter.ts`) needs modification. All upstream reconciliation, security, and snapshot guarantees remain untouched.

---

## 9. Production Hardening Steps (§14, §20)

To transition this system from demonstration to production deployment:

1. **Hardware-Backed Device Attestation**:
   - Wrap the PWA in an Android Trusted Web Activity (TWA) or React Native container.
   - Utilize Android KeyStore Key Attestation (`KeyGenParameterSpec.Builder.setAttestationChallenge`) to cryptographically bind the private key to the device's hardware Secure Element / StrongBox.
2. **Host-to-Host (H2H) Bank Clearing**:
   - Replace manual CSV download with direct SFTP / API clearing with mutual TLS (mTLS) to the partner bank (e.g., Bank of Maharashtra or DCC Bank Latur).
3. **Telecom DLT (Distributed Ledger Technology) Registration**:
   - Register commercial sender headers (e.g., `LTFPC`) and Marathi SMS slip templates on Indian telecom DLT portals (Vilpower / Jio / Airtel) pursuant to TRAI TCCCPR regulations.
4. **Sovereign Cloud Hosting**:
   - Deploy backend workloads and managed PostgreSQL instances within Indian sovereign cloud regions (e.g., GCP `asia-south1` Mumbai, `asia-south2` Delhi).

---

## 10. 3-Minute Demo Walkthrough Script (§17)

| Time | Step | Action | Verifiable Outcome |
|---|---|---|---|
| **0:00 - 0:25** | **1. Price Board** | Office Manager logs in and publishes today's Soybean price (₹4,850/q). | New price version (v1) appears instantly on the operator's mobile dashboard. |
| **0:25 - 0:50** | **2. Offline Entry** | Operator disconnects network (Airplane Mode / DevTools offline). Records 3 purchases. | Purchases save to Dexie outbox; Marathi slips render instantly with *"नेटवर्क आल्यावर SMS जाईल"*. |
| **0:50 - 1:15** | **3. AI OCR Cross-Check**| Operator takes photo of moisture meter display reading `11.5%`. | Vision OCR pre-fills `11.5%`; typing differing moisture forces interactive visual confirmation. |
| **1:15 - 1:40** | **4. Reconnect & Sync**| Operator reconnects network. Outbox syncs 3 purchases in sequence. | Status flips to accepted; Marathi SMS receipts logged as sent; stock counts update. |
| **1:40 - 2:05** | **5. Tamper Rejection** | In DevTools, an attacker alters net weight in a queued outbox entry. | Server catches hash/signature mismatch & rejects with `CALCULATION_MISMATCH` / `SIGNATURE_INVALID`. |
| **2:05 - 2:25** | **6. Duplicate Hold** | Operator records a second load for the same farmer within 60 minutes. | Purchase accepted but held in Manager Review Queue with `DUPLICATE_FARMER`. Not cancelled! |
| **2:25 - 2:45** | **7. Review & Payment Run** | Office Manager reviews held slip, releases hold, and generates payment run. | Reconciled CSV file generated to the exact paisa; uses immutable sync snapshot. |
| **2:45 - 3:00** | **8. Isolated Retry** | Manager marks 1 item failed and triggers retry. | New payment run created for only the failed item; original run remains immutable. |

---

## 11. Acceptance Checklist Verification (§19)

| # | Requirement | Implementation & Test Evidence | Status |
|---|---|---|---|
| 1 | Three sample slips match to exact paisa | `phase6.test.ts`, `money.test.ts` (₹59,752.00, ₹40,303.50, ₹45,360.00) | **PASS** |
| 2 | Proportional fractional moisture (12.1% &rarr; 9990, 13.5% &rarr; 9850) | `phase6.test.ts`, `money.test.ts` | **PASS** |
| 3 | Input range validation (gross $\le 50,000\text{ kg}$, moisture $\le 50.0\%$) | `money.test.ts`, `schemas.ts`, `phase6.test.ts` | **PASS** |
| 4 | Offline operation in air-gapped environment | `offlineSync.test.ts`, `collectFlow.test.ts` | **PASS** |
| 5 | Sequential sync & Marathi SMS queueing | `sync.test.ts`, `purchases.test.ts` | **PASS** |
| 6 | Tampered payload rejection with named error | `sync.test.ts` (`HASH_MISMATCH`, `SIGNATURE_INVALID`) | **PASS** |
| 7 | Altered rate rejected with `RATE_MISMATCH` | `sync.test.ts` | **PASS** |
| 8 | Stale price held with `STALE_PRICE_VERSION` | `sync.test.ts` | **PASS** |
| 9 | AI photo OCR discrepancy confirmation | `phase5.test.ts`, `phase5Web.test.ts` | **PASS** |
| 10 | Duplicate farmer within 1 hr held with `DUPLICATE_FARMER` | `flags.test.ts`, `phase5.test.ts` | **PASS** |
| 11 | Payment run total matches purchases to the paisa | `phase5.test.ts`, `payments.ts` | **PASS** |
| 12 | Payment file uses sync snapshot, not live member edits | `phase5.test.ts`, `phase6.test.ts` | **PASS** |
| 13 | Retry-failed creates isolated run; leaves original unchanged | `phase5.test.ts`, `payments.ts` | **PASS** |
| 14 | Revoked device rejected at sync | `sync.test.ts` (`DEVICE_REVOKED`) | **PASS** |
| 15 | Consent withdrawal blocks new entries, pays delivered produce | `phase5.test.ts`, `members.ts` | **PASS** |
| 16 | Plain-language Marathi consent captured with timestamp | `phase2.test.ts`, `members.ts` | **PASS** |
| 17 | 6,200 Devanagari member search under 150ms | `memberSearch.test.ts` (measured 2.78ms) | **PASS** |
| 18 | One-handed operator flow, 48px tap targets, 40px numerals | `phase6Web.test.ts`, `CollectFlow.tsx` | **PASS** |
| 19 | Zero Aadhaar, masked accounts, immutable audit logging | `phase6.test.ts` | **PASS** |
| 20 | Web bundle budget $\le 150\text{ KB}$ gzipped | `apps/web` production build: **131.76 KB** | **PASS** |

---

## 12. Setup, Installation & Verification

### 12.1 Prerequisites
- **Node.js**: `v20.x` or `v22.x`
- **pnpm**: `v9.x` (`corepack enable pnpm`)
- **Docker**: For PostgreSQL container (or local PostgreSQL 15+)

### 12.2 Environment Setup
Create `.env` in repository root:
```ini
PORT=3000
HOST=0.0.0.0
DATABASE_URL=postgres://procurement:procurement_pass@localhost:5432/procurement_db
SESSION_SECRET=super-secret-session-key-minimum-32-chars-long!
BANK_AES_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
VISION_API_KEY=sk-ant-api03-your-anthropic-vision-key
WEB_ORIGIN=http://localhost:5173
NODE_ENV=development
```
- `BANK_AES_KEY`: 64 hex characters (32 bytes) used to encrypt member bank accounts and purchase snapshots.
- `VISION_API_KEY`: Anthropic Claude key for the meter/scale photo reader. In production the reader never fabricates readings — API failures surface as unreadable (`confidence: low`). Deterministic simulated OCR is restricted to `NODE_ENV=test`.
- `WEB_ORIGIN`: CORS whitelist origin for the PWA.

### 12.3 Boot Database & Run Migrations
```bash
# Start PostgreSQL container
docker compose up -d db

# Run database schema migrations and seed initial data
pnpm --dir apps/api run db:seed
```

### 12.4 Run Development Servers
```bash
# Start Fastify API (http://localhost:3000)
pnpm dev:api

# Start React PWA Frontend (http://localhost:5173)
pnpm dev:web
```

### 12.5 Run Complete Test Suite
```bash
# Run all 156 automated unit and integration tests
pnpm test

# Run type checks across all workspaces
pnpm typecheck

# Verify frontend production build (JS bundle stays ≤150 KB gzipped)
pnpm --dir apps/web run build

# Playwright end-to-end suite (boots its own API + PWA; requires Chromium)
pnpm --dir apps/web exec playwright install chromium
pnpm --dir apps/web run test:e2e
```

---

## 13. Default Seed Credentials (for Evaluators)

| Role | Username / Identifier | PIN / Password | Centre |
|---|---|---|---|
| **Office Manager** | `office@latur-fpc.org` | `Password123!` | District HQ (Latur) |
| **Centre Operator** | Ramesh Patil | `1234` | C07 (Ausa) |
| **Centre Operator** | Santosh Deshmukh | `5678` | C12 (Renapur) |
