# FREMA — Implementation Plan & Checklist

> **Purpose:** The single source of truth for what's done and what's left to make FREMA
> a fully functional Document Management System. Update the checkboxes as work lands.
> Last updated: 2026-07-04.

---

## 1. Current State (honest snapshot)

FREMA is a **high-fidelity prototype**: the entire UI, workflow logic, RBAC, notifications,
scanning, and email are built — but **almost everything runs on in-memory / localStorage mock
data**. The core remaining work is replacing the mock layer with a real, persistent backend.

### ✅ Built and working
- **Stack:** Next.js 16, React 19, Tailwind v4, TypeScript, Radix/shadcn UI kit, Recharts.
- **Pages:** dashboard, inbox (+ `inbox/[id]`), documents, workflows, reports, audit,
  upload, admin (`users`, `roles`, `origins`, `types`, `settings`), login.
- **Approval workflow (mock):** routing by department, multi-stage stepper, approve/reject,
  comment threads.
- **RBAC (mock):** 5 roles → permission map in `src/lib/permissions-mock.ts`, gated via `useCan()`.
- **In-browser scanning (fully built):** camera capture (`getUserMedia`) + OpenCV.js adaptive
  threshold enhancement + multi-page reorder/remove + multi-page A4 PDF via jsPDF.
  See `src/components/scanner/*` and `src/lib/scanner-pdf.ts`.
- **Email + cron:** Resend integration (`src/lib/email.ts`) + idle-document reminder cron
  (`src/app/api/cron/idle-reminders/route.ts`, scheduled in `vercel.json`).
- **Database groundwork (done 2026-07-04):** Prisma 7 schema with 9 models + 5 enums,
  pushed to a local Prisma Postgres DB, client generated, singleton at `src/lib/prisma.ts`.

### ⚠️ Mock / not yet persistent
- **Auth** is a mock cookie (`dms_mock_user_id`) + localStorage — no password check, no real session.
- **All data** comes from `src/lib/*-mock.ts` (`users`, `workflow`, `audit`, `dashboard`,
  `annotations`, `permissions`).
- **Uploads/scans go nowhere** — submit only appends to the audit mock; no file storage.
- **`/api/scan`** returns a 1×1 placeholder PNG.
- **Search** does not exist.

---

## 2. Operational Notes (READ before backend work)

These were discovered the hard way — don't rediscover them.

- **Node 22+ is required.** The local Prisma Postgres server (`npx prisma dev`) needs the
  built-in `node:sqlite` module (Node 22.5+). Node 20 fails with `No such built-in module`.
- **Start the DB before backend work:** run `npx prisma dev` in a terminal and leave it running
  (serves ports 51213–51216). It stops on reboot — restart it each session.
- **Use `prisma db push`, NOT `prisma migrate dev`, for the local DB.** `migrate dev` throws
  `P1017` because the local Prisma Postgres exposes `template1`, which the migrate engine's
  shadow-database step can't clone. Switch to real `migrate` only against a cloud Postgres in prod.
- **`db push` and `generate` are separate in Prisma 7.** After ANY schema change run BOTH:
  `npx prisma db push && npx prisma generate`.
- **The Prisma 7 client needs an explicit connection.** It does not read `DATABASE_URL`
  ambiently — pass `accelerateUrl` (for `prisma+postgres://` URLs) or a driver `adapter`
  (for plain Postgres). See `src/lib/prisma.ts`.
- **`DATABASE_URL`** lives in `.env` (proxy form `prisma+postgres://localhost:51213/...`).
  For production, a Prisma Postgres cloud URL works as-is; a plain Neon/Supabase host needs a
  `@prisma/adapter-pg` driver adapter instead.
- **Config is already correct:** `prisma.config.ts` loads `dotenv/config` and supplies
  `datasource.url = env("DATABASE_URL")`. No edits needed there.

---

## 3. Phase 1 — Persistence Layer (critical path)

Must be done roughly in order; everything else depends on it.

### 1.1 — Data model ✅ DONE (2026-07-04)
- [x] Prisma schema with 9 models + 5 enums (`prisma/schema.prisma`)
- [x] Pushed to local DB (`prisma db push`) + client generated
- [x] Prisma singleton helper (`src/lib/prisma.ts`)
- [x] `DATABASE_URL` documented in `.env.example`

### 1.2 — Seed the database
- [ ] Write `prisma/seed.ts` loading existing mock data into real tables:
  - [ ] 7 users from `users-mock.ts` (map string roles → `UserRole` enum)
  - [ ] 6 departments from `workflow-mock.ts`
  - [ ] Document types (Memo, Letter, Report, Invoice, Policy, Contract) + a few Origins
  - [ ] Sample documents, routings, comments, annotations, audit entries
- [ ] **Decide dev passwords** — seed each user with a shared hashed dev password (e.g. `password123`)
- [ ] Wire `prisma db seed` (add seed config) and run it

### 1.3 — Real authentication
- [ ] Add auth library (NextAuth v5 **or** Lucia) + `bcryptjs` + `AUTH_SECRET` in `.env`
- [ ] Credentials provider verifying `passwordHash` against the `User` table
- [ ] Replace mock cookie logic in `src/middleware.ts` with real session validation
- [ ] Swap `src/contexts/current-user-context.tsx` from localStorage → real session
- [ ] Keep RBAC surface (`canRole`) but source role from the DB user
- [ ] Update `permissions-mock.ts` role keys to match `UserRole` enum values

### 1.4 — File storage + wire up upload/scan
- [ ] Choose provider (Cloudflare R2 / AWS S3 / Supabase Storage / UploadThing) + env keys
- [ ] Upload route that stores the file and returns a URL/key
- [ ] `document-upload-form.tsx`: on submit → upload file (or scanner jsPDF blob) →
      create `Document` row → write `AuditLog`
- [ ] Confirm scanned multi-page PDF flows all the way to a stored document

---

## 4. Phase 2 — Swap Mocks for Queries (mechanical, parallelizable)

Each mock lib has a clean function surface — replace internals with Prisma queries one at a
time, verifying the UI after each swap.

- [ ] `dashboard-mock` → real aggregate queries (counts by status, recent activity, task queue)
- [ ] `workflow-mock` → real routing writes; approve/reject sets `status` + `actedAt` + comment,
      advances `stage`
- [ ] `audit-mock` → move logging **server-side** (client logs can be spoofed)
- [ ] `annotations-mock` → persist annotations (defer the "shared session" realtime part)
- [ ] `cron/idle-reminders` → replace hardcoded `MOCK_DOCUMENTS` with a real "idle N days" query
- [ ] Admin CRUD against real tables: `users`, `origins`, `types` (and roles/permissions)
- [ ] Notifications panel → real unread items from routings/audit

---

## 5. Phase 3 — Core Features Still Missing

- [ ] **Global search + filters** — API to query documents by title/type/status/date;
      wire existing UI filters
- [ ] **Error handling / toasts** — success/failure notifications for all API actions
      (no toast system exists yet)
- [ ] **Scanner productionization:**
  - [ ] Self-host OpenCV.js (currently loaded from CDN in `use-scanner.ts`) or allow via CSP
  - [ ] Decide fate of `/api/scan` + `scan-sdk-placeholder.ts` (physical scanner path)
  - [ ] Add mobile `<input type="file" capture="environment">` fallback
- [ ] **Testing** — unit tests for approval transitions and permission checks
- [ ] **Responsiveness** — verify Inbox/Reports tables on mobile

---

## 6. Backlog — DMS Features Worth Adding (post-persistence)

Prioritized. All require Phase 1 first.

### High impact
- [ ] **OCR on scans + full-text search** ⭐ — extract text (Tesseract.js) from scanned
      images/PDFs so content is searchable; best fit given the scanner already exists
- [ ] **Document versioning** ⭐ — `DocumentVersion` table, "new version" upload, history/restore
- [ ] **In-app document viewer/preview** ⭐ — inline PDF/image viewer (zoom, page nav)

### Strong fit for a records office
- [ ] Folders/hierarchy + rich metadata & tagging (a `create-folder-form.tsx` stub already exists)
- [ ] Retention & lifecycle policies (archive/dispose schedules; extends idle-reminder cron)
- [ ] Physical records tracking (shelf/box location, barcode/QR, borrow/return log)
- [ ] Document-level permissions & sharing (per-doc/folder access; expiring share links)
- [ ] E-signatures / digital signing on approval

### Polish & productivity
- [ ] Check-in / check-out (locking) · Soft delete + trash/restore · Bulk operations
- [ ] Document templates · Related-document linking · Deduplication (hash on upload)
- [ ] Watermarking · Saved searches · SLA/due-date escalation · @mentions in comments
- [ ] Deeper reporting (turnaround time, per-user/department throughput, aging)

---

## 7. Tech Debt / Cleanup

- [ ] Delete stray `srcapplogin/` directory
- [ ] Delete `version_debug.txt`
- [ ] Confirm `.next`, `.qodo`, `src/generated` are gitignored (generated client already is)
- [ ] Update `README.md` (currently the default create-next-app boilerplate)

---

## 8. Quick Reference — Commands

```bash
# Start local database (leave running; needs Node 22+)
npx prisma dev

# After ANY schema change — run BOTH:
npx prisma db push
npx prisma generate

# Inspect data in a GUI
npx prisma studio

# Seed (once prisma/seed.ts + seed config exist)
npx prisma db seed

# Typecheck / lint / dev server
npx tsc --noEmit
npm run lint
npm run dev
```
