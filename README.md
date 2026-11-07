# लातूर शेतकरी खरेदी व भरणा प्रणाली (Latur FPC Procurement & Payment System)

Offline-first, tamper-proof procurement and payment platform for Farmer Producer Companies (FPCs), specifically configured for soybean and pigeon pea (tur) operations in the Latur district of Maharashtra.

---

## Architecture & Technology Stack

- **Monorepo**: pnpm workspaces
- **Backend (`apps/api`)**: Fastify, TypeScript, Drizzle ORM, PostgreSQL, WebCrypto ECDSA, AES-GCM
- **Frontend (`apps/web`)**: React 18, Vite, `vite-plugin-pwa` (Service Worker precache), Dexie (IndexedDB), Tailwind CSS
- **Shared (`packages/shared`)**: Canonical JSON, SHA-256 hash chaining, ECDSA P-256 signing, strict integer math (`money.ts`), Zod schemas, Marathi localization (`mr.json`)

---

## Phase 4: Offline-First Tamper-Proof Sync (§9)

### 1. Cryptographic Device Setup & Key Generation
- On first login, each collection device generates an ECDSA P-256 keypair (`extractable: false` for the private key) via WebCrypto.
- The `CryptoKeyPair` is persisted in IndexedDB via structured cloning.
- The public key is exported as JWK and registered with the server at `POST /devices/register`.

### 2. Client-Side Outbox & Hash Chaining
- Each purchase recorded on the device is appended to Dexie `outbox`:
  - `deviceSeq`: strictly increasing sequence (1, 2, 3...)
  - `prevHash`: 64 zeros for the first entry, or the `entryHash` of the preceding purchase.
  - `entryHash`: `SHA-256(prevHash + canonicalJson(payload))`
  - `signature`: ECDSA P-256 signature of `entryHash` using device's private key.
- State is committed atomically in a Dexie transaction (`db.outbox` and `db.meta`).
- The collection slip is displayed immediately, with SMS status marked as "नेटवर्क आल्यावर SMS जाईल" while offline.

### 3. Server Verification Pipeline (`POST /sync/purchases`)
Every purchase uploaded in the batch is evaluated strictly in sequence order:
1. **Device Check**: Verify device ID is registered and not revoked (`DEVICE_REVOKED`).
2. **Signature Verification**: Validate ECDSA signature against the device's registered public key (`SIGNATURE_INVALID`).
3. **Hash Recomputation**: Recompute SHA-256 hash from canonical JSON payload and claimed `prevHash` (`HASH_MISMATCH`).
4. **Chain Continuity**: Verify claimed `prevHash` matches last accepted `entry_hash` for this device (`PREV_HASH_MISMATCH`).
5. **Sequence & Idempotency**: Verify sequence is strictly `lastAccepted + 1`. Duplicate submissions return earlier result idempotently; gaps or out-of-order submissions trigger `SEQ_GAP`.
6. **Recomputation**: Net weight and total amount are recomputed on the server; rejects with `CALCULATION_MISMATCH` if differing.
7. **Two-Case Price Check**:
   - If rate does not match the claimed `price_version`, rejected with `RATE_MISMATCH`.
   - If rate matches claimed version but a newer price was active at `client_time`, accepted and held with `STALE_PRICE_VERSION`.
8. **Encrypted Snapshot**: Member's live bank details are encrypted into `member_snapshot_json` (preserving payment target against subsequent edits).
9. **Anomaly / Hold Checks**: Skewed timestamps (>6 hours) hold with `CLOCK_SKEW`; purchases for farmers who withdrew consent hold with `CONSENT_WITHDRAWN`.
10. **SMS Gateway**: Triggers Marathi SMS receipt to the farmer's registered mobile.

---

## Honest Limitation (§9.9)

> **Browser Environment Timestamp Limitation**  
> A web browser running on a mobile device cannot supply fully trusted hardware timestamps. A dishonest operator could manipulate the client device's system clock.  
> 
> **Our Defences:**
> 1. **Cryptographic Hash Chain**: History cannot be rewritten without invalidating all subsequent hash links.
> 2. **ECDSA Digital Signatures**: Every purchase is signed by the registered device's private key, which cannot be exported.
> 3. **Server Receive Timestamps**: `server_received_at` is always recorded using authoritative server time upon receipt.
> 4. **Sequence-Gap Detection (`SEQ_GAP`)**: Gaps or re-ordered sequences are immediately detected and rejected.
> 5. **Clock Skew Hold (`CLOCK_SKEW`)**: Any purchase with client time skewed by more than 6 hours from server time is flagged and held for manual manager review.
> 
> *Production recommendation:* In native production deployments, combine this protocol with hardware-backed attestation (such as Android KeyStore Key Attestation or SafetyNet/Play Integrity).

---

## Running the Application

### 1. Prerequisites
- Node.js 20+
- pnpm 9+
- Docker & Docker Compose (for PostgreSQL)

### 2. Environment Setup
```bash
cp .env.example .env
docker compose up -d db
```

### 3. Run Development Servers
```bash
# Start API (port 3000)
pnpm dev:api

# Start Web Frontend (port 5173)
pnpm dev:web
```

### 4. Running Tests & Quality Checks
```bash
# Run all unit and integration tests across workspaces (87 tests)
pnpm test

# Run TypeScript typechecks across workspaces
pnpm typecheck

# Run production build (includes Vite PWA service worker generation)
pnpm build
```

