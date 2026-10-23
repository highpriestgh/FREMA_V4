# FREMA — Roadmap Planner

> Missing document-management features and open engineering work, in recommended order.
> Companion to [FREMA-REBUILD-PLAN.md](FREMA-REBUILD-PLAN.md), which tracks the rebuild itself.
> Tick boxes as work lands; move an item to **In progress** by adding `(in progress — <name>)`.
> Created 2026-10-23. Items 28–34 added the same day from a review of other document systems
> (see [Market research](#market-research) at the bottom). Item 35 (our own Scan Agent) added
> after evaluating Asprise Scanner.js. Item 0 (sign-in moved off Duende to ASP.NET Identity
> cookies) done the same day.

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

- [ ] **2. Tests for workflow, permissions and endpoint protection** · `eng` · effort: M
  [UnitTest1.cs](FREMA/tests/FREMA.Tests/UnitTest1.cs) is the empty template. The features
  below change documents, files and access rules, so they need a safety net first.
  *First step:* `WebApplicationFactory` + LocalDB/Testcontainers; cover approve/decline/return,
  the visibility rule, and a test that every endpoint rejects a caller without its permission.

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

- [ ] **6. Email delivery for notifications and reminders** · `feature` · effort: M
  Reminders and notifications are in-app only, so people who aren't logged in never hear about
  work waiting for them (plan §8).
  *First step:* an `IEmailSender` (MailKit) behind a background queue; call it from
  `ReminderJob` and the routing notifications.

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

- [ ] **11. Auth hardening: rate limiting, display name, legacy bug review** · `eng` · effort: S
  Rate-limit `POST /Account/Login` and `/Account/ChangePassword`; add the user's first and last
  name to the session's claims (a custom `UserClaimsPrincipalFactory`) so the `name` claim is
  not the username; end sessions of deactivated users promptly (shorten the security-stamp
  check interval or check `IsActive` on validation); confirm which old auth bugs (plan §3.4)
  do not apply to the new code and tick them off.

- [ ] **12. Bring the rebuild plan up to date** · `eng` · effort: XS
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

- [ ] **22. CI pipeline** · `eng` · effort: S
  Build, test, migration drift check, `npm run build`, `npm audit` (plan §9).

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

---

## Suggested order of work

*Dates and release grouping are in [Delivery timeline](#delivery-timeline).*

1. **Items 1–2** while starting **4 (recycle bin)**, which is small and removes the biggest
   data-loss risk.
2. **3 (versions)** with **10 (check-out)**, since check-in creates a version.
3. **5 (search + OCR)**, then **8 (metadata)** so search has fields to filter on.
4. **6 (email notifications)**, **29 (escalation)**, **7 (classification and sharing)** and
   **9 (retention)**.
5. **28 (email capture)** and **30 (automatic tagging)**, which build on 5 and 8.
   **35 (Scan Agent):** run its hardware spike early, alongside step 1, since its outcome
   decides the rest; build it out after **3** and **4**, since scanned uploads become versions.
6. The remaining P1 engineering items alongside, then P2 by demand. **31**, **33** and **15**
   are small and can be picked up any time.

---

## Delivery timeline

> Estimated 2026-10-23. Re-estimate at the end of each release.

**Assumptions:** one full-time developer at ~4 productive days a week; 20% contingency on
every estimate; a two-week break over Christmas; start Monday 2026-10-26.
Sizes: XS ≈ ½ day, S ≈ 2–3 days, M ≈ 1½–2 weeks, L ≈ 3–4 weeks, XL (#35) ≈ 10 weeks.

| Release | Items | Effort | Duration | Target |
|---|---|---|---|---|
| **R1 — Go-live (v1.0)** | 0 (done), 1, 2, 3, 4, 5, 6, 10, 11, 12, 13, 21, 22, 29, #35 hardware spike, user testing and deployment | ~70 dev-days | ~20 weeks | late Mar 2027 |
| **R2 — Records** | 7, 8, 9, 15, 28, 30, 31 | ~42 dev-days | ~13 weeks | late Jun 2027 |
| **R3 — Scanning** | 26, 33, 35 | ~56 dev-days | ~17 weeks | late Oct 2027 |
| **R4 — Productivity** | 14, 16, 17, 18, 19, 20, 32 | ~51 dev-days | ~15 weeks | early Mar 2028 |
| **R5 — Polish** | 23, 24, 25, 27, 34 | ~24 dev-days | ~7 weeks | late Apr 2028 |

**One developer:** ~18 months, finishing around April 2028.
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
| 12–14 | Email notifications (6), escalation (29), virus scanning (21), backups (13) |
| 15–17 | User acceptance testing, fixes, production deployment, training |
| 18–20 | Contingency and the Christmas break |

### Risks to the dates

- **External lead times:** a code-signing certificate (1–2 weeks of
  verification), and retention schedules from records or legal staff. Late arrivals move
  release dates even when the code is ready.
- **User testing** tends to surface workflow rules the lost stored procedures handled implicitly.
- **Scanner hardware:** old 32-bit TWAIN drivers could add 1–3 weeks to R3; the week-2 spike
  is there to find out early.
- **Scope lever:** if go-live can ship without OCR search (5), R1 finishes ~5 weeks earlier,
  around mid-February 2027, and search moves to R2.

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
