# FREMA — Roadmap Planner

> Missing document-management features and open engineering work, in recommended order.
> Companion to [FREMA-REBUILD-PLAN.md](FREMA-REBUILD-PLAN.md), which tracks the rebuild itself.
> Tick boxes as work lands; move an item to **In progress** by adding `(in progress — <name>)`.
> Created 2026-10-23. Items 28–34 added the same day from a review of other document systems
> (see [Market research](#market-research) at the bottom). Item 35 (our own Scan Agent) added
> after evaluating Asprise Scanner.js. Item 0 (sign-in moved off Duende to ASP.NET Identity
> cookies) done the same day. Email and SMS notifications (#6) moved to the end of the plan
> pending the owner's choice of providers.

**Working order:** see [Build order](#build-order), a single numbered list of every step.

**Priority key**

| | Meaning |
|---|---|
| **P0** | Blocks go-live, or a core expectation of any DMS |
| **P1** | Expected in any serious DMS; do next |
| **P2** | Strong value, moderate effort |
| **P3** | Polish and nice-to-haves |

**Kind:** `feature` = user-facing DMS capability · `eng` = engineering / hardening

---

## Already in place (for reference)

Upload with type sniffing and SHA-256, multi-page scanner, inline PDF preview with `Range`
support, folders, document types and origins, configurable approval workflows with
return-to-sender, comments, an append-only audit log, in-app notifications and reminders,
dashboard, reports, and users, roles and permissions.

---

## P0 — Do first

- [x] **0. Replace Duende IdentityServer + BFF with ASP.NET Identity cookies** · `eng` · done 2026-10-23
  **Decision:** FREMA is one app on one origin, so a token server added cost without adding
  security. Sign-in is now the Identity application cookie (`__Host-frema`, HttpOnly, Secure,
  `SameSite=Strict`), state-changing API calls still need `X-CSRF: 1`, and sign-out is
  `POST /api/account/logout`. Both Duende packages and their database migration are removed,
  so **no production licence is needed** (plan §1.4 closed). Upgrade path if other apps ever
  need single sign-on: OpenIddict (Apache 2.0) on the same user store. If the organisation
  wants Windows / Active Directory logins instead, consider Keycloak.
  Verified against a throwaway database: sign-in, the forced temporary-password change, the
  open-redirect guard, the header check, permission-protected endpoints and sign-out.

- [ ] **1. Rotate leaked credentials** · `eng` · effort: S (ours) / external
  The SQL `sa` passwords, Gmail SMTP and AfricasTalking key are still exposed (plan §1.1).
  The legacy IdentityServer secret no longer matters to the new app, but rotate it anyway if
  the old solution is still running anywhere.
  *First step:* raise it with whoever owns the infrastructure.

- [x] **2. Tests for workflow, permissions and endpoint protection** · `eng` · done 2026-10-23
  19 integration tests in `FREMA/tests/FREMA.Tests`, against the real app and a throwaway SQL
  Server database (LocalDB locally, a container in CI):
  - *Workflow (12):* full approval, return to sender, resume without restart, rejection needs a
    reason, only the current assignee acts, unanimous and any-one steps, review-only steps,
    department-restricted recipients, most-specific route selection.
  - *Visibility (3):* read, edit and delete rules.
  - *Endpoint protection (4):* every `/api` endpoint declares authorization, refuses anonymous
    callers and users without its permission; writes need `X-CSRF`.
  Writing them found that every refused request (403/404/409/422) was logged as an error 500;
  fixed by moving request logging outside the exception handler.
  *Not yet covered:* file upload and download, and the cookie sign-in flow (checked by hand
  in step 1). Add them as those areas change (steps 8 and 22).

- [ ] **3. Version history** · `feature` · effort: M
  Replacing content currently deletes the old blob, so earlier versions are lost. A DMS is
  expected to keep every version, show who changed what, and allow restore.
  *First step:* a `DocumentVersion` entity (file key, hash, size, uploader, note, created at);
  `PUT /content` appends instead of overwriting; version list and restore on the detail page.

- [ ] **4. Recycle bin (soft delete)** · `feature` · effort: S
  `DELETE /api/documents/{id}` calls `db.Documents.Remove`, a permanent delete. One wrong click
  destroys a record and its audit context.
  *First step:* `DeletedAt` / `DeletedById` with a global query filter; a Recycle Bin page with
  restore; permanent purge only after N days (setting) or by an admin.

- [ ] **5. Full-text search with OCR** · `feature` · effort: L
  Search is only the list's `q` filter over title and number. Scanned documents are images, so
  their text cannot be found at all.
  *First step:* extract text on upload (PdfPig for text PDFs, Tesseract for scans) into a
  `DocumentText` table; SQL Server full-text index; a search page with metadata filters.
  This also fills `Document.PageCount`.

## P1 — Next

- [ ] **7. Security classification and per-document sharing** · `feature` · effort: M
  Access is "uploader or anyone in the routing". There is no way to mark a document
  Confidential, or to share one with a colleague or department outside the workflow.
  *First step:* a `Classification` enum on `Document` checked in `DocumentAuthorizationHandler`;
  a `DocumentShare` (user or department, read or comment, optional expiry).

- [ ] **8. Custom metadata fields and tags** · `feature` · effort: M
  Every document type has the same fixed fields. Real records need type-specific fields
  (reference number, sender, date received, amount) and free tags to search and report on.
  *First step:* `MetadataField` definitions per `DocumentType` (text / number / date / list),
  values stored as JSON on the document; render in upload and detail forms; add to search.

- [ ] **9. Retention schedules and legal hold** · `feature` · effort: M
  There is no rule for how long a record is kept or when it may be destroyed, which records
  management requires.
  *First step:* retention period and disposal action per `DocumentType`; a legal-hold flag that
  blocks deletion; a "due for disposal" report; disposal recorded in the audit log.

- [ ] **10. Check-out / edit lock** · `feature` · effort: S
  Two people can replace a document's content at the same time and the last upload wins.
  *First step:* `CheckedOutById` / `CheckedOutAt`; check-out, check-in (creates a version, see 3)
  and admin force-release.

- [x] **11. Auth hardening: rate limiting, deactivated users, legacy bug review** · `eng` · done 2026-10-23
  - Sign-in and password-change posts limited per IP (`Security:SignInAttemptsPerMinute`,
    default 30), with a "wait a minute" message on the page.
  - Deactivated users are refused at sign-in, and an existing session ends within a minute
    (`FremaSignInManager`; cookie revalidation every minute). Before this, a deactivated
    user's session kept sliding for as long as they used it.
  - Old auth bugs reviewed: all fixed or not applicable (plan §3.4).
  - *Dropped:* names in the session claims. Screens already show full names from the
    profile, and the audit log is better off recording the unique username.

- [x] **12. Bring the rebuild plan up to date** · `eng` · effort: XS
  Tick the reminder job (§8) and the document-number question (§1.3), which are done in code.

- [ ] **13. Backups and encryption at rest** · `eng` · effort: S
  Files sit on local disk unencrypted, with no backup routine defined.
  *First step:* decide on the deployment target (plan §12), then a backup job for the database
  and storage root, plus TDE or volume encryption.

- [ ] **28. Email capture** · `feature` · effort: M
  A monitored mailbox whose attachments become documents, with rules that set type, origin and
  folder from the sender or subject. Paperless-ngx and DocuWare treat email as a main intake
  channel, and it suits a correspondence system. *(Moved up from P3, where it was part of #25.)*
  *First step:* a hosted service polling IMAP (MailKit); `MailRule` entities (match on
  from / subject / body → document type, origin, folder); mark or move the mail once consumed
  so it is never imported twice.

- [ ] **29. Workflow escalation** · `feature` · effort: S
  Reminders already go to the assignee, but overdue work stays with them. DocuWare and
  Laserfiche escalate it.
  *First step:* an escalation threshold on `WorkflowStep` (e.g. 2 days overdue); `ReminderJob`
  notifies the assignee's department head, or reassigns to them, and records it in the audit log.

- [ ] **30. Automatic tagging and classification on upload** · `feature` · effort: M
  Suggest document type, origin and tags from the document's text, as Paperless-ngx's matching
  and DocuWare's intelligent indexing do. Depends on OCR text (#5) and metadata (#8).
  *First step:* rules on document types and origins (any word / exact phrase / regex);
  pre-fill the upload form with the best match for the user to confirm. Consider a trained
  classifier only once there is enough correctly tagged history.

- [ ] **35. FREMA Scan Agent — our own scanner helper (flagship feature)** · `feature` · effort: XL
  A small program installed on office PCs that lets FREMA drive any desktop scanner from the
  browser: press **Scan** on the upload page, paper goes through the feeder, and a cleaned,
  searchable PDF lands on the document. Replaces buying Asprise Scanner.js or Dynamsoft
  (per-site licences plus a yearly subscription). The camera scanner stays for phones;
  scan-to-folder (#33) stays for network copiers.

  **Design**
  - .NET 10 Windows app in the FREMA solution (`src/FREMA.ScanAgent`), system-tray only,
    built on **NAPS2.Sdk** (LGPL 2.1; `NAPS2.Wia` is MIT) for TWAIN, WIA and eSCL scanners.
    Keep its DLLs unmodified and separately replaceable, and ship the LGPL notice.
  - **No browser → localhost calls.** Chrome 142+ asks before any site reaches `localhost`,
    and a local HTTPS endpoint needs a trusted certificate. Instead the work is relayed
    through the FREMA server:
    1. The upload page asks the server for a **scan session** (`POST /api/scan-sessions`)
       and gets back a one-time token that expires after 5 minutes.
    2. The page opens `frema-scan://start?session=…&token=…`; Windows launches the agent.
    3. The agent scans, shows its own preview (re-order, rotate, delete pages), builds the PDF
       and uploads it to `PUT /api/scan-sessions/{id}/content` with the token.
    4. The page polls the session (SignalR later, #26) and attaches the result to the form.
  - **Security:** the FREMA server address is fixed at install time, so a hostile web page
    cannot make the agent scan and upload elsewhere. Tokens are single-use and tied to
    the user and session; files go through the normal upload validation; every session is
    audited.

  **Milestones**
  - [ ] **Spike (2–3 days):** console app with NAPS2.Sdk that lists scanners and scans a
        multi-page duplex batch to PDF, tested on the office's real scanner models
        (including 32-bit TWAIN drivers).
  - [ ] **Server:** `ScanSession` entity and migration, create / status / content endpoints,
        token handling, audit entries, tests.
  - [ ] **Agent MVP:** protocol handler, scanner picker, scan, preview window, upload, error
        messages a user can act on.
  - [ ] **Upload page:** a "Scan from scanner" button beside the camera scanner, showing session
        progress and an "Install FREMA Scan Agent" link when nothing answers.
  - [ ] **Packaging:** MSI (WiX) for Group Policy rollout, a code-signing certificate so
        SmartScreen doesn't block it, and auto-update from the FREMA server.
  - [ ] **Standout features:**
    - [ ] Scan profiles per document type (DPI, colour, duplex, feeder), set by admins.
    - [ ] Automatic deskew, crop and blank-page removal.
    - [ ] Local OCR so PDFs arrive searchable; this feeds #5.
    - [ ] **Batch scanning with QR separator sheets:** FREMA prints a cover sheet carrying the
          document's number as a QR code. Staff scan one stack, and the agent splits it and
          files each part onto the right document.
    - [ ] Offline queue: scans made while the server is unreachable upload when it returns.
  - [ ] **Later:** macOS (Apple ImageCaptureCore) and Linux (SANE), both supported by
        NAPS2.Sdk; live page thumbnails in the browser.

## P2 — Then

- [ ] **14. Annotations** · `feature` · effort: M
  The `Annotation` entity exists in the domain but there is no API or UI.
  *First step:* endpoints for create/list/delete per page; highlights and sticky notes over the
  PDF viewer.

- [ ] **15. Duplicate detection** · `feature` · effort: XS
  `FileHash` is already stored. Warn on upload when the same file already exists and link to it.

- [ ] **16. Bulk actions** · `feature` · effort: M
  Bulk upload, move to folder, tag, and download selected documents as a ZIP.

- [ ] **17. Previews and thumbnails for non-PDF files** · `feature` · effort: M
  Only PDFs preview inline. Generate thumbnails for images and convert Office files to PDF for
  viewing (LibreOffice headless or a conversion service).

- [ ] **18. Electronic signature / approval stamp** · `feature` · effort: M
  Approvals are recorded in the database but not on the document. Stamp the final PDF with
  approver, date and document number, and optionally a digital signature.

- [ ] **19. Related documents** · `feature` · effort: S
  Link a reply to the letter it answers, or attachments to a parent document.

- [ ] **20. Export reports and audit to CSV / PDF** · `feature` · effort: S

- [ ] **21. Virus scanning on upload** · `eng` · effort: S
  Already listed in plan §6; ClamAV via `nClam`, or Windows Defender on the host.

- [x] **22. CI pipeline** · `eng` · done 2026-10-23
  `.github/workflows/frema-ci.yml`: restore with NuGet audit, Release build, tests, migration
  drift check, `npm audit`, lint and build; on push, PR and weekly. Its first run found the
  `Infrastructure/Storage` source that `.gitignore` had kept out of git.

- [ ] **31. Saved searches and smart views** · `feature` · effort: S
  M-Files lets one document appear in several virtual folders defined by metadata
  (e.g. "Pending — Finance — this month") without copying it.
  *First step:* save a search's filters under a name, per user or shared with a role; show
  saved views in the sidebar with live counts.

- [ ] **32. Electronic forms that start a workflow** · `feature` · effort: L
  Laserfiche Forms and DocuWare let staff submit a request or memo as a form that becomes a
  routed document, rather than writing and scanning one.
  *First step:* a form definition per document type (reusing the #8 metadata fields); on
  submit, render the answers to PDF, create the document and start its workflow.

- [ ] **33. Scan-to-folder intake** · `feature` · effort: S
  Files dropped into a watched folder (or a network scanner's output folder) are uploaded
  automatically, as with Paperless-ngx's consume folder.
  *First step:* a hosted service with `FileSystemWatcher` on a configured path; files go through
  the same validation as uploads and land in an intake queue for someone to file and route.

## P3 — Later

- [ ] **23. Favourites and recently viewed** · `feature` · effort: S
- [ ] **24. Watermarking and download controls for confidential documents** · `feature` · effort: M
- [ ] **25. Document templates** · `feature` · effort: M — email capture moved to #28
- [ ] **34. Mobile-friendly approvals** · `feature` · effort: M
  DocuWare has a mobile app for approving and stamping. A responsive inbox and decision screen
  (optionally installable as a PWA) gives most of that without a native app.
- [ ] **26. Realtime updates with SignalR** · `eng` · effort: M — plan §8
- [ ] **27. Retire the Next.js prototype** · `eng` · effort: S — once parity is confirmed

## Last — Waiting on a provider decision

- [ ] **6. Email and SMS notifications** · `feature` · effort: M · *deferred 2026-10-23*
  Notifications and reminders are in-app only, so people who aren't signed in don't hear about
  work waiting for them (plan §8). Moved to the end of the plan on purpose: the owner is
  choosing the email and SMS providers, and the work starts once that choice is made.
  Until then, in-app notifications and escalation (#29) carry the load.
  **Options researched:**
  - *Email:* MailKit (MIT) through the organisation's existing mail account (Microsoft 365,
    Google Workspace or its own server); Mailpit (MIT) as a local test inbox. Self-hosting
    Postal (MIT) is possible but means owning deliverability (SPF, DKIM, IP reputation).
  - *SMS:* an Android phone acting as a gateway, using SMS Gateway for Android (Apache 2.0) or
    textbee (MIT). It sends from a SIM bundle, slowly, and from a phone number rather than a
    sender name. Or Jasmin / Kannel with an SMPP account from a mobile network at high volume.
    Or a commercial aggregator such as AfricasTalking.
  - *Web push:* free browser notifications via the open Web Push standard; pairs with #34.
  *First step once the providers are chosen:* one notification interface with a sender per
  channel (email, SMS, push), sent from a background queue so a slow gateway never holds up a
  request, plus per-user channel preferences. Calls from `ReminderJob` and the routing
  notifications go through it.

---

## Build order

> **The order we work in.** One step at a time, top to bottom; mark a step ✅ and move ▶ on when it lands.
> Item numbers (#) point to the detailed entries above. Dates are in
> [Delivery timeline](#delivery-timeline). **▶ marks the next step.**

**Started now, by the owner, in parallel** (each has a lead time):
- [ ] Rotate leaked credentials (#1)
- [ ] Decide where FREMA will be hosted (IIS or other); blocks backups (step 12) and go-live
- [ ] List the office scanner models; needed for the hardware spike (step 5)
- [ ] Choose email and SMS providers; needed only at the very end (R6)

### R1 — Go-live

| Step | Item | Work | Why here |
|---|---|---|---|
| 1 | #0 | ~~Move sign-in off Duende~~ ✅ done 2026-10-23 | Removed the licence blocker |
| 2 | #12 | ~~Update the rebuild plan~~ ✅ done 2026-10-23 | The plan should match the code before anything else changes |
| 3 | #11 | ~~Auth hardening: rate limits, deactivated users, legacy bug review~~ ✅ done 2026-10-23 | Finished the sign-in work while it was fresh |
| 4 | #22 | ~~CI pipeline~~ ✅ done 2026-10-23 | Every later change is now built and checked on push |
| 5 | #35 | Scan Agent hardware spike — ⏸ *waiting on the office scanner models* | Early, because its result decides how big R3 is |
| 6 | #2 | ~~Test harness, workflow and permission tests~~ ✅ done 2026-10-23 | The safety net before documents and files start changing |
| ▶ 7 | #4 | Recycle bin | Removes the biggest data-loss risk, and is small |
| 8 | #3, #10 | Version history with check-out | Together, because check-in creates a version |
| 9 | #5 | Search with OCR | The largest R1 item; needs versions in place to index the right file |
| 10 | #29 | Workflow escalation | Covers for the lack of email until R6 |
| 11 | #21 | Virus scanning on upload | Before real users upload real files |
| 12 | #13 | Backups and encryption at rest | Needs the hosting decision |
| 13 | — | User testing, fixes, production deployment, training | **Go-live** |

### R2 — Records

| Step | Item | Work | Why here |
|---|---|---|---|
| 14 | #15 | Duplicate detection | Nearly free: the file hash is already stored |
| 15 | #8 | Custom metadata fields and tags | Search, tagging, forms and retention all build on it |
| 16 | #30 | Automatic tagging on upload | Needs OCR text (#5) and fields (#8) |
| 17 | #7 | Confidentiality and per-document sharing | Changes the access rule, so after the tests and before more features |
| 18 | #9 | Retention schedules and legal hold | Needs document types with fields; schedules come from records staff |
| 19 | #31 | Saved searches and smart views | Small, and uses the new fields |
| 20 | #28 | Email capture | Needs a mailbox to read from |

### R3 — Scanning

| Step | Item | Work | Why here |
|---|---|---|---|
| 21 | #26 | Realtime updates (SignalR) | The Scan Agent uses it to tell the page a scan arrived |
| 22 | #35 | Scan Agent: server side, agent MVP, upload page, packaging | The flagship feature |
| 23 | #35 | Scan Agent: profiles, clean-up, local OCR, QR batch splitting, offline queue | What makes it stand out |
| 24 | #33 | Scan-to-folder intake | For network copiers; reuses the agent's intake queue |

### R4 — Productivity

| Step | Item | Work | Why here |
|---|---|---|---|
| 25 | #14 | Annotations | The data model already exists |
| 26 | #18 | Approval stamp and e-signature | Builds on annotations' PDF handling |
| 27 | #19 | Related documents | Small |
| 28 | #16 | Bulk actions | Easier once fields and sharing exist |
| 29 | #17 | Previews for non-PDF files | |
| 30 | #20 | Export reports and audit to CSV / PDF | |
| 31 | #32 | Electronic forms that start a workflow | Largest R4 item; reuses #8 fields |

### R5 — Polish

| Step | Item | Work |
|---|---|---|
| 32 | #34 | Mobile-friendly approvals |
| 33 | #23 | Favourites and recently viewed |
| 34 | #24 | Watermarks and download controls |
| 35 | #25 | Document templates |
| 36 | #27 | Retire the Next.js prototype |

### R6 — Notifications

| Step | Item | Work |
|---|---|---|
| 37 | #6 | Notification interface and background queue |
| 38 | #6 | Per-user channel preferences |
| 39 | #6 | Email, SMS and web-push senders for the chosen providers |

---

## Delivery timeline

> Estimated 2026-10-23. Re-estimate at the end of each release.

**Assumptions:** one full-time developer at ~4 productive days a week; 20% contingency on
every estimate; a two-week break over Christmas; start Monday 2026-10-26.
Sizes: XS ≈ ½ day, S ≈ 2–3 days, M ≈ 1½–2 weeks, L ≈ 3–4 weeks, XL (#35) ≈ 10 weeks.

| Release | Items | Effort | Duration | Target |
|---|---|---|---|---|
| **R1 — Go-live (v1.0)** | 0 (done), 1, 2, 3, 4, 5, 10, 11, 12, 13, 21, 22, 29, #35 hardware spike, user testing and deployment | ~64 dev-days | ~18 weeks | mid Mar 2027 |
| **R2 — Records** | 7, 8, 9, 15, 28, 30, 31 | ~42 dev-days | ~13 weeks | mid Jun 2027 |
| **R3 — Scanning** | 26, 33, 35 | ~56 dev-days | ~17 weeks | mid Oct 2027 |
| **R4 — Productivity** | 14, 16, 17, 18, 19, 20, 32 | ~51 dev-days | ~15 weeks | late Feb 2028 |
| **R5 — Polish** | 23, 24, 25, 27, 34 | ~24 dev-days | ~7 weeks | mid Apr 2028 |
| **R6 — Notifications** | 6, once the providers are chosen | ~6 dev-days | ~2 weeks | late Apr 2028 |

**One developer:** ~18 months, finishing around April 2028. Moving notifications to the end
shortens go-live by about two weeks but does not change the overall finish.
**Two developers:** ~11 months, finishing around September 2027. One builds R3 (Scan Agent) while
the other does R2 then R4, after both finish R1 together. Not half, because of coordination and review.

### R1 week by week

| Weeks | Work |
|---|---|
| 1 | Start external items (credential rotation, hosting decision); plan update (12), CI (22), auth hardening (11) |
| 2 | Scan Agent hardware spike (#35) |
| 3–4 | Test harness and workflow / permission tests (2) |
| 5–7 | Recycle bin (4), then version history with check-out (3, 10) |
| 8–11 | Search with OCR (5) |
| 12–13 | Escalation (29), virus scanning (21), backups (13) |
| 14–16 | User acceptance testing, fixes, production deployment, training |
| 17–18 | Contingency and the Christmas break |

### Risks to the dates

- **External lead times:** a code-signing certificate (1–2 weeks of
  verification), and retention schedules from records or legal staff. Late arrivals move
  release dates even when the code is ready.
- **User testing** tends to surface workflow rules the lost stored procedures handled implicitly.
- **Scanner hardware:** old 32-bit TWAIN drivers could add 1–3 weeks to R3; the week-2 spike
  is there to find out early.
- **Scope lever:** if go-live can ship without OCR search (5), R1 finishes ~5 weeks earlier,
  around early February 2027, and search moves to R2.
- **Go-live without email or SMS:** staff only see notifications while signed in. Escalation
  (#29) and the dashboard's overdue counts soften this; confirm it is acceptable during user
  testing.

---

## Market research

Features compared against M-Files, SharePoint, Laserfiche, DocuWare, Alfresco, OpenText and
Paperless-ngx (October 2026; sources are mostly vendor and comparison-site pages).

| Seen in other systems | Here |
|---|---|
| Version history and check-out | #3, #10 |
| OCR and full-text search | #5 |
| Metadata-driven organisation | #8 |
| Retention, legal hold, disposal | #9 |
| Confidentiality labels | #7 |
| Workflow deadlines and escalation | reminders exist; #29 |
| Automatic tagging / intelligent indexing | #30 |
| Email capture | #28 |
| Stamps and annotations | #14, #18 |
| Saved searches / virtual folders | #31 |
| Electronic forms | #32 |
| Scan-to-folder intake | #33 |
| Mobile approvals | #34 |
| E-signature (DocuSign / Adobe Sign) | extend #18 |

Not adopted for now: real-time co-authoring (FREMA routes documents for approval rather than
editing them together), formal records certification such as DoD 5015.2 (only if an auditor
requires it), and ERP/CRM connectors (no current need). Microsoft 365 / Outlook integration and
search by meaning are worth revisiting once #5 is done.
