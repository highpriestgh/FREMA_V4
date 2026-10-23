# FREMA — Single-Project Rebuild Plan

> **Goal:** Replace the three-project .NET 6 solution (`FREMA.API` + `FREMA.STS` + `FREMA.UI`)
> and the Next.js prototype with **one ASP.NET Core project** that hosts an embedded
> Duende IdentityServer, a BFF-secured API, and a Vite/React SPA — on a clean EF Core
> schema, with the old solution's bugs fixed.
>
> Source of truth for the rebuild. Tick boxes as work lands.
> Created 2026-09-07.

---

## 0. Decisions (settled)

| Question | Decision |
|---|---|
| Project layout | **One** ASP.NET Core project (+ one test project) |
| Frontend | **Port Next.js → Vite + React Router SPA**, served by ASP.NET Core |
| Auth | **Duende IdentityServer, embedded** in the same host, fronted by Duende.BFF |
| Data access | **EF Core + migrations** — retire all 58 stored procedures |
| Database | **Fresh schema, greenfield.** `FREMA_DB` is not accessible — no data migration |
| Runtime | **.NET 10 LTS** (the old solution is on .NET 6, out of support since Nov 2024) |
| Dev database | **LocalDB** (`(localdb)\MSSQLLocalDB`, SQL Server 2025), created by EF migrations |

> **⚠ Constraint that shapes everything below:** the original `FREMA_DB` is unavailable.
> The 58 stored procedures cannot be scripted out, so **the C# source is the only surviving
> specification** — and it only reveals sproc *names*, *parameters*, and *result columns*
> (from the `sp*` classes in `Models/`). The T-SQL bodies are gone. Business rules must
> therefore be reconstructed and, where ambiguous, **decided fresh rather than recovered**.
> Every such decision gets recorded in `docs/decisions/`.

### Target architecture

```
Browser
  │  HttpOnly session cookie (no tokens in JS) + antiforgery header
  ▼
┌─────────────────────────────────────────────────┐
│  FREMA  (single ASP.NET Core project)           │
│                                                 │
│   /                → Vite React SPA (wwwroot)   │
│   /bff/login|user|logout  → Duende.BFF          │
│   /connect/*, /Account/*  → IdentityServer      │
│   /api/*           → local APIs [Authorize]     │
│   /hubs/notify     → SignalR                    │
│                                                 │
│   EF Core ──────────────────► SQL Server        │
└─────────────────────────────────────────────────┘
```

The app is an OIDC **client of itself**. Duende supports this ("BFF with local APIs"),
and it means no cross-origin CORS, no token relay, and no bearer tokens in the browser.

**Known gotcha:** two cookie-based schemes coexist in one host — IdentityServer's ASP.NET
Identity cookie and the BFF session cookie. Give them distinct names and paths, and set
`DefaultChallengeScheme` explicitly, or login will loop.

### Target folder layout

```
FREMA.sln
├── src/FREMA/
│   ├── FREMA.csproj              net10.0 — the only app project
│   ├── Program.cs
│   ├── appsettings.json          NO secrets — user-secrets / env only
│   ├── ClientApp/                Vite + React + TypeScript
│   │   ├── src/pages/
│   │   ├── src/components/       ported from the Next.js app
│   │   ├── src/api/              generated OpenAPI client
│   │   └── vite.config.ts
│   ├── Domain/                   entities + enums, no EF attributes
│   ├── Infrastructure/
│   │   ├── Persistence/          DbContext, IEntityTypeConfiguration, Migrations
│   │   ├── Storage/              file storage abstraction
│   │   └── Messaging/            email + SMS, background queue
│   ├── Identity/                 IdentityServer config, Razor login pages
│   ├── Features/                 vertical slices (see section 5)
│   └── wwwroot/                  SPA build output (gitignored)
└── tests/FREMA.Tests/            unit + integration
```

> "One project" means one *application*. The test project is separate because .NET
> requires it to be — it is not a second deployable.

---

## 1. Phase 0 — Safety & discovery (BLOCKING)

Nothing else starts until these are done.

### 1.1 Rotate every leaked credential

The old `appsettings.json` files are committed in plaintext. **All of these are compromised
and must be rotated, not reused.** Most sit on infrastructure we don't control — so this is
an item to *escalate to whoever owns those servers and accounts*, not something the rebuild
can close on its own. None of it blocks development, because the new build reuses none of it:

- [ ] SQL Server `sa` password on `DESKTOP-BMD4TBB\SQL2019`
- [ ] SQL Server `sa` password on `PSL-DBSERVER-VM3`
- [ ] Gmail SMTP password + license key for `fremaapps@gmail.com`
- [ ] AfricasTalking API key
- [ ] IdentityServer client/API secret — also hardcoded in `Config.cs`
- [ ] Create a **least-privilege SQL login** for the app. Never ship `sa`.

### 1.2 Reconstruct the spec from the C# (the sprocs are unrecoverable)

`FREMA_DB` is not accessible, so the T-SQL bodies are gone for good. What survives in the
old C# — and is enough to rebuild from:

| Evidence | What it gives us |
|---|---|
| `CommandText = "spX"` + `SqlParameter` list | the **inputs** of all 58 procedures |
| `Models/**/spX.cs` classes | the **output columns** each returned |
| Controller actions | the **call sequence** per use case |
| `Entities/*.cs` (EF scaffold of the real DB) | the **table shapes and column types** |

- [ ] Write `docs/legacy-spec.md`: one row per sproc — name, parameters, result columns,
      calling controller, and inferred purpose
- [ ] Flag the procedures whose logic is **genuinely lost** and must be re-decided, not
      recovered: `spUpdDocumentDuringApproval`, `spUpdDocumentDuringDenial`, `spAddDocInRoute`,
      `spGetMenuRolePermissionByUserId`, `spGetAllDocumentsByUserId`
- [ ] For each, write down the rule we are choosing and why, in `docs/decisions/`.
      These are new product decisions wearing the clothes of a port — treat them as such.
- [ ] Cross-check against the Next.js prototype's mock layer, which encodes a *second*,
      independent reading of the same workflow (stages, roles, routing) and is often clearer
      about intent than the C#.

### 1.3 Confirm the workflow rules with the business

Because the logic can't be read off the old system, these need answering by a person, not
by archaeology:

- [x] **What happens on rejection?** → *It returns to the sender.* Rejection is never
      terminal at a step: the document goes back to whoever routed it (or to the originator
      at step one) with status `Returned`, for correction and re-submission. Only the owner
      can then abandon it, which sets the terminal `Rejected`.
- [x] **Can a document be routed to several people at once?** → *Routes are configurable
      per organisation.* Workflow shape became **data, not code** — see 4.1a. A step may
      assign to a department, a role, a named person, or someone chosen at routing time, and
      completes on either the first decision or unanimous approval.
- [x] **What are the approval stages, and who acts at each?** → Answered by the above: there
      are no fixed stages. An administrator defines them per route.
- [x] **Who may see a document that isn't theirs?** → Uploader, or anyone in its routing
      chain, or a holder of `documents.view.all`. Implemented in 3.3.
- [ ] The `name` claim currently carries the username (`admin@frema.local`) because
      `AddAspNetIdentity` maps it from `UserName`. A small `IProfileService` should emit
      `FirstName`/`LastName` instead, so the SPA can greet people properly.
- [ ] Is the document **number** (`Document.Number`) user-supplied or system-generated,
      and does it follow a format?

### 1.4 Licensing

- [x] **Resolved 2026-10-23 by removing Duende.** Sign-in is now ASP.NET Identity's own
      cookie, so there is no licence to obtain. Sections 3.1 and 3.2 below describe the
      replaced design; see decision #0 in [FREMA-ROADMAP.md](FREMA-ROADMAP.md).
      Original note: **Confirmed as a real blocker for production.** The running app logs, at `ERR`:
      *"You do not have a valid license key for the Duende software. This is allowed for
      development and testing scenarios. If you are running in production you are required
      to have a licensed version."* Automatic key management, PAR and the registered client
      each warn separately. Development is unaffected; **going live is not possible without
      resolving this.** Set `IdentityServer:LicenseKey` once obtained — the config binding
      is already in place.

---

## 2. Phase 1 — Solution skeleton

- [x] Single `FREMA` project targeting `net10.0`, nullable enabled, warnings-as-errors
- [x] Folder structure per section 0 (`Domain/`, `Infrastructure/Persistence/`)
- [x] Secrets via user-secrets in dev, environment variables in prod; `appsettings.json`
      holds none, and startup throws if the connection string is absent
- [x] Strongly-typed options with `ValidateOnStart()` — `StorageOptions` binds, validates its
      data annotations, and refuses to start if the storage root sits inside the web root
- [x] **Serilog** structured logging + request logging (the old API had logging commented out)
- [ ] Correlation IDs
- [x] **Global exception handling** → RFC 9457 ProblemDetails
- [x] **Health checks** at `/health`, including a DB-reachability check
- [ ] **Rate limiting** — strict buckets on the anonymous auth endpoints
- [x] OpenAPI **development-only** (the old build shipped Swagger in Release)
- [x] `.gitignore`: `wwwroot/`, `ClientApp/node_modules`, `storage/`, `.vs/`

---

## 3. Phase 2 — Identity, BFF, authorization

### 3.1 Embedded IdentityServer

- [x] Duende IdentityServer 6 → **8.0.7**, BFF **4.2.0**, both on `net10.0`
- [x] `Identity/IdentityServerConfig.cs` + Razor `Pages/Account/Login`
- [x] **One config source.** *Deviation from the original decision:* configuration is held
      **in source, not in a ConfigurationDb.* There is exactly one client, so a reviewable
      diff beats a database row; the point of the decision was to stop having *both*, which
      is what the legacy solution did. The **operational** store (grants, consents) is EF —
      migration `InitialOperationalStore` applied.
- [x] Single client: authorization code + PKCE, **confidential** — the BFF holds a secret
      server-side, where the legacy code client set `RequireClientSecret = false`. The secret
      is 32 random bytes in user-secrets, replacing the literal `*C&%$#F$%R*&^$` that the
      legacy committed in three separate files.
- [ ] Signing keys from a certificate store / Key Vault — currently automatic key management
      (fine for development, needs deciding before production)

### 3.2 Duende.BFF

- [x] `/bff/login`, `/bff/logout`, `/bff/user` via `MapBffManagementEndpoints()`
- [ ] SPA endpoints as **local APIs** — `.AsBffApiEndpoint()` lands with the Phase 4 slices
- [x] Antiforgery on all state-changing requests — `X-CSRF: 1`, verified rejecting a
      request without the header
- [x] Cookie hardening: `__Host-` prefix, `HttpOnly`, `Secure`, `SameSite=Strict`, 8h sliding
- [x] Distinct schemes: `Identity.Application` (the IdP session) vs `bff` (the SPA session).
      The gotcha in section 0 was real — `AddIdentity` points the default schemes at
      Identity, and they have to be re-pointed at the BFF *after* it, or the SPA
      authenticates against the wrong cookie.

**Verified working** by running the app and following the chain:

| Check | Result |
|---|---|
| `/health` | 200 `Healthy`, including the DB check |
| `/.well-known/openid-configuration` | served, issuer `https://localhost:7233` |
| `/bff/login` | 302 → PAR → `/connect/authorize` → `/Account/Login` with a valid `ReturnUrl` |
| Login page | renders the form with an antiforgery token |
| `/bff/user` anonymous | 401 as RFC 9110 ProblemDetails JSON |
| `/bff/user` without `X-CSRF` | rejected by antiforgery |

### 3.3 Real authorization

The old API had `[Authorize]` with **no policy anywhere** — any authenticated user could call
any endpoint, including `GetAllUsers` and every document. The `ApiScope` policy was defined
but never applied, and required `scope == "WebAPI"` while the real scope was `fremaapi`.

- [x] `PermissionClaimsTransformation` — expands roles into `frema:permission` claims via
      `Role → RolePermission → Permission`, cached 5 minutes so a revocation takes effect
      without forcing a re-login. Clones the principal rather than mutating a cached one,
      and is idempotent across repeat invocations.
- [x] One policy per permission, registered from `Permissions.All`
- [x] **Fallback policy requires an authenticated user** — endpoints are protected unless
      they opt out, the inverse of the legacy default
- [x] **Resource-based authorization:** `DocumentAuthorizationHandler` with operations
      Read / Edit / Delete / Act / Route / Comment. Baseline visibility is uploader, or
      anywhere in the routing chain, or `documents.view.all`. Notably `Act` requires a
      **pending routing at the document's current step** — holding `documents.approve` is
      not enough to approve *this* document, and a past participant cannot act twice.
- [x] `MenuItem` drives the UI menu and no longer *is* the security model
- [ ] Apply the policies to endpoints — lands with the Phase 4 slices

### 3.4 Fix the auth bugs

- [ ] `CreateUser` is `[AllowAnonymous]` → require `MANAGE_USERS`. No public self-registration.
- [ ] **Password reset bypass:** `CheckUserCodeExistsAsync(model.Code)` checks whether *any*
      user holds that code, not the requesting user. Replace the custom code flow with ASP.NET
      Identity's `GeneratePasswordResetTokenAsync` / `ResetPasswordAsync`, verified against the
      specific user, single-use, short expiry.
- [ ] **User enumeration:** `PostForgotPassword` generates the token *before* the null check
      (500 on unknown email) and returns the user's `Id`. Always return 200 with no body.
- [ ] Generated initial passwords are `Guid.NewGuid().ToString("N")[..12].ToUpper()` —
      12 hex chars, uppercased. Replace with a CSPRNG over a full alphabet, and force a
      change on first login (`FirstTimeLogin` already exists).
- [ ] Stop SMS-ing username + password together in one plaintext message.
- [ ] `GenerateCode` has modulo bias (`b % 36` over 256 byte values) — use rejection sampling.
- [ ] Password policy: `RequiredLength = 12` is good, but lowercase/uppercase/digit/symbol are
      all disabled. Re-enable, or require a longer passphrase.

---

## 4. Phase 3 — Domain model & EF Core

### 4.1 Reconciled schema

Merges the old `FREMA_DB` model with the Next.js Prisma model, keeping the better half of each.

| Entity | Source | Notes |
|---|---|---|
| `ApplicationUser` | old (AspNetUsers) | keep; add `DepartmentId` |
| `Department` | Prisma | **new to C#** — routing is department-based |
| `DocumentType` | Prisma | **replaces** `Document.Type` (a 3-char string) |
| `Origin` | Prisma | = old `Address` |
| `Folder` | old | **new to Prisma** — keep the parent/child hierarchy |
| `Document` | merged | enums for status/stage; `FileKey`/`MimeType`/`Size`, **not base64** |
| `WorkflowDefinition` | **new** | admin-configurable route; see 4.1a |
| `WorkflowStep` | **new** | ordered stage within a route |
| `WorkflowRouting` | Prisma | now the *runtime instance* of a step — adds department, priority, due date, `ActedAt` |
| `Comment` | both | = old `DocumentToComment` |
| `Annotation` | Prisma | **new to C#** |
| `AuditLog` | both | = old `Audit`; append-only, written **server-side** |
| `Notification` | old | **new to Prisma** — pairs with SignalR |
| `Role` / `Permission` / `RolePermission` / `UserRole` | old | keep DB-driven RBAC (richer than Prisma's static enum) |
| `Menu` / `MenuRole` / `MenuRolePermission` | old | UI menu only |

Replace magic ints with enums: `DocumentStatus`, `RoutingStatus`, `Priority`,
`StepAssignmentMode`, `StepCompletionPolicy`. `Document.Status` was a bare `int` and `Title`
was capped at 50 chars — both fixed.

### 4.1a Workflow is data, not code

The decisive answer from section 1.3. Neither predecessor could express another
organisation's process without a code change: the legacy backend hard-coded a single
user-to-user hop in T-SQL, and the prototype hard-coded a four-value `WorkflowStage` enum.
**That enum is gone.**

- `WorkflowDefinition` — a named route an administrator configures. Optionally scoped to a
  `DocumentType` and/or an originating `Department`; the most specific active match is
  selected at submission, falling back to the one flagged `IsDefault` (a filtered unique
  index permits only one).
- `WorkflowStep` — an ordered stage. `AssignmentMode` picks who acts:
  `Department` | `Role` | `User` | `ChosenAtRuntime` (the legacy behaviour).
  `CompletionPolicy` is `AnyOne` or `Unanimous`, which is what makes parallel approval
  possible. Optional `DueAfterDays` gives the step an SLA. A **database check constraint**
  guarantees the assignment target matches the mode, so an invalid route cannot be persisted
  by any path.
- `Document.CurrentStepId` is a pointer into the route; `WorkflowRouting` is the runtime
  instance of one person's assignment within one step.
- **Definitions are versioned.** Editing a route in use would change its shape underneath
  running workflows, so edits clone to a new `Version` rather than mutate.

**Return-to-sender.** A rejection is never terminal at a step. `WorkflowRouting.RoutedById`
is the return address: rejecting sends the document back there (or to `UploadedById` at step
one) with `DocumentStatus.Returned`, and `ReturnedFromRoutingId` links the new hop to the
rejection that caused it, so the inbox can show *why* it came back. Only the owner can
abandon a returned document, which sets the terminal `Rejected`. Review-only steps
(`IsReviewOnly`) acknowledge without the power to return.

**Resume, not restart** (settled while implementing). A returned document goes back to the
sender *at the sender's own step*, as a live assignment. Correcting it and approving that
assignment again carries it forward to the step that rejected it — so earlier approvals are
not thrown away and the reviewer who asked for the change is the one who sees it next.

### 4.2 Work

- [x] Domain entities, free of EF attributes — `Domain/{Enums,Identity,Organisation,Documents,Operations}.cs`
- [x] `IEntityTypeConfiguration<T>` per entity; indexes matching the prototype's
      (`Status`, `Stage`, `UploadedById`, `CreatedAt`, `AssignedToId + Status`)
- [x] `FremaDbContext` — **one** context (the old solution had three across two projects)
- [x] Initial migration `InitialSchema`, applied to LocalDB — 23 tables (22 + EF's
      migration history), 2 check constraints, 1 filtered unique index
- [ ] Workflow engine services: definition selection, step advancement, return-to-sender
      (schema is in place; the behaviour is Phase 4 work)
- [ ] Admin API + UI for authoring workflow definitions
- [ ] `dotnet ef migrations` drift check in CI
- [x] No IdentityServer tables in the app context — the old API modelled `Clients`,
      `DeviceCodes`, `PersistedGrants`, `ApiResources` and more, which belong to the STS
- [ ] Seed: roles, permissions, menus, departments, document types, origins, an admin user

**Design decisions taken while building this** (candidates for `docs/decisions/`):

- **`Guid` keys throughout**, via `IdentityUser<Guid>`. This deletes the legacy
  `Guid.Parse(UsrId)` on every request — bug #13 — rather than fixing it.
- **One RBAC model, not two.** The legacy DB carried ASP.NET Identity's
  `AspNetRoles`/`AspNetUserRoles` *and* a hand-rolled `Role`/`UserRole` pair. Only Identity's
  survives; `Permission` + `RolePermission` layer on top.
- **Menus collapsed from three tables to one.** `Menu`/`MenuRole`/`MenuRolePermission` become
  `MenuItem` with a nullable `RequiredPermissionId`. A menu item now *names* the permission
  that reveals it; the same permission independently guards the endpoints — previously the
  menu tables were the only access control, and the API checked nothing.
- **`AuditLog.UserId` is `SetNull` with a denormalised `UserName`**, so deleting a user cannot
  erase their audit history.
- **`WorkflowRouting` user FKs are `NoAction`** — SQL Server rejects multiple cascade paths
  into `AspNetUsers`.

### 4.3 Seeding (there is no data migration)

`FREMA_DB` is unavailable, so this is a greenfield database. No `Address→Origin` mapping, no
carrying password hashes across, no `ImgFolder` file move — every user re-registers.

- [x] **Idempotent seeder**, run explicitly with `dotnet run -- --seed` — never as a startup
      side effect, so a deployment restart cannot silently rewrite reference data. Verified
      idempotent: a second run reported no changes.
      - 17 permissions, 5 roles with grants (Administrator 17, Manager 7, Record Officer 6,
        Editor 5, Viewer 1), 6 departments, 6 document types, 5 origins, the navigation menu,
        the default `Standard Approval` workflow, and one administrator.
      - **Admin password** comes from `Seed:AdminPassword` if set; otherwise a 24-character
        password is generated from a 70-character alphabet via `RandomNumberGenerator.GetString`
        — no modulo bias, unlike the legacy `GenerateCode` — printed once and stored nowhere.
        `MustChangePassword` is set.
- [ ] Realistic demo dataset behind a `--seed-demo` flag: documents at each workflow step,
      routings, comments, audit entries. This replaces the Next.js mock layer as the thing
      the UI is developed against.

**End-to-end login verified.** Driving the real OIDC flow with a cookie jar:
`/bff/login` → PAR → `/connect/authorize` → login form → credential POST → authorization
code → `/connect/token` (id, access and refresh tokens issued) → `/connect/userinfo` →
`/signin-oidc` sets the BFF cookie. `/bff/user` then returns `sub`, `role: Administrator`,
and **all 17 `frema:permission` claims** — proving `PermissionClaimsTransformation` resolves
role grants into the claims the authorization policies check.
- [ ] **If `FREMA_DB` ever becomes reachable**, a migration is still worth writing — record
      the mapping in `docs/decisions/` now while the old schema is fresh, so it stays cheap.

---

## 5. Phase 4 — API surface

51 endpoints across 8 controllers become feature slices. RPC-style names
(`GetAllDocument`, `PostChangePassword`) become REST resources.

| Slice | Endpoints |
|---|---|
| `Features/Documents` | list (paged/filtered/sorted), get, create, update, delete, approve, decline, review, assign, comments |
| `Features/Documents/Files` | `POST /api/documents/{id}/content` (multipart), `GET .../content` (streamed) |
| `Features/Folders` | CRUD, tree by parent, documents in folder |
| `Features/Users` | CRUD, profile, change password, forgot/reset |
| `Features/Roles` | roles, permissions, role-permission assignment |
| `Features/Menus` | menu + menu-role-permission CRUD |
| `Features/Audit` | list with date/user/entity filters, paged |
| `Features/Notifications` | list, mark read |
| `Features/Search` | **new** — cross-document search, absent from both codebases |
| `Features/Dashboard` | **new** — aggregates for the SPA dashboard |

### Delivered so far

- [x] `Features/Workflow/WorkflowEngine` — definition selection by specificity, assignment
      resolution for all four modes, step completion under both policies, advancement, and
      return-to-sender
- [x] `Features/Documents` — list (paged, filtered, sorted), get, create, update, delete,
      submit, decision, comments, and `/api/inbox`
- [x] `Common/Paging` — `PagedResult<T>` and a clamped `PageRequest` (max 100)
- [x] `Common/DomainException` + handler — 403/404/409/422 as RFC 9457 ProblemDetails,
      with anything unexpected logged and returned as an opaque 500
- [x] `Infrastructure/Auditing` — server-side only, entries enlisted in the same
      transaction as the change they describe so the two cannot diverge
- [x] `Features/Admin` — departments, document types and origins. Written **once** against
      an `IReferenceEntity` contract rather than three times; the legacy solution had a
      controller, service and set of stored procedures per table, which is why the same
      null-dereference and missing-paging bugs appear in each of them.
- [x] `Features/Users` — list, get, create, update, `/me`, `/me/password`, and a `/lookup`
      for recipient pickers that returns names and departments only
- [x] `Features/Roles` — roles, permissions, and grant reconciliation
- [x] `Features/Folders` — hierarchy with a cycle guard on move
- [x] `Features/Navigation` — `/api/menu`, filtered to what the caller may reach
- [x] `Features/Dashboard` — aggregates computed in the database
- [x] `Features/Audit` + notifications — audit is **read-only by design**; there is no write
      endpoint and there should never be one
- [ ] Dedicated search beyond the document list's `q` filter

**All 15 endpoints verified 200 against a running instance.** Behaviour checked, not just
reachability:

| Check | Result |
|---|---|
| Duplicate reference name | **409** |
| Delete a document type in use (`usageCount: 1`) | **409** — "deactivate it instead" |
| Delete an unused one | **204** |
| Move a folder inside its own child | **422** cycle guard |
| Create user | **201** with a one-time generated password, `mustChangePassword` set |

### The visibility rule, proven

A `Viewer` account was created and signed in, holding exactly one permission
(`documents.view`):

| As Viewer | Result |
|---|---|
| `/api/menu` | 3 items — the Administration group disappears entirely once its children are filtered away |
| `/api/users`, `/api/roles`, `/api/permissions`, `/api/audit` | **403** |
| `/api/departments` | 200 — deliberately open to any signed-in user, because pickers need it |
| `/api/documents` | `totalCount: 0` (admin sees 4) |
| `/api/documents/{id}` by direct id | **403** "You are not permitted to read this document" |
| `/api/documents/{id}/content` | **403** |

Those last three are the heart of it. The legacy API returned all four documents, the full
detail, and the file bytes to any authenticated caller.

**Two EF translation failures found by running it:** `Count(predicate)` inside a grouped
projection, and `OrderByDescending` on a projected record property — neither translates, and
both throw at runtime rather than compile time. Rewritten as a conditional `Sum` and an
ordering on the aggregate before projection.

**Verified end to end** against a running instance, driving the real BFF/OIDC session:

| Scenario | Result |
|---|---|
| Create → submit | Draft → Pending, routed to step 1, appears in inbox with a 3-day due date |
| Approve without naming a recipient | **422** "Step 'Approval' needs a recipient to be chosen" |
| Approve with recipient | advances to step 2, assignment created |
| Reject with no reason | **422** "A reason is required when returning a document" |
| Reject with reason | **Returned**, back at step 1 with the sender, flagged `isReturn`, reason carried as the note |
| Approve through final step | **Approved**, `CurrentStep` cleared, `ClosedAt` set |
| Audit trail | 12 server-written entries covering both lifecycles |

**Two defects found and fixed by running it, not by reading it:**

1. `AddIdentity` sets `DefaultSignInScheme` to `Identity.External`. Overriding
   `DefaultScheme`/`DefaultChallengeScheme`/`DefaultSignOutScheme` but *not* that one meant
   the OIDC callback deposited the session in Identity's external-login cookie: `/bff/login`
   appeared to succeed, `/bff/user` returned 200, and every API call was anonymous. This is
   the section 0 gotcha in its most deceptive form.
2. Forward advancement passed the acting routing's id as `returnedFrom`, so every normal hop
   was flagged as a bounce-back in the inbox and the trail. Fixed, and those call sites now
   use named arguments so the mistake is not repeatable.

**Design decision — approval and routing are one act.** A step set to `ChosenAtRuntime` needs
a recipient, and the natural moment to choose is when approving ("I approve, send it to X").
`DecisionRequest.NextAssignees` carries it, and the document detail exposes a `NextStep`
hint — name, whether a recipient is required, and the department to scope the picker to — so
the client can prompt *before* the user commits rather than failing them afterwards. Without
this a document could advance into a step with nobody assigned and simply stop dead, which is
exactly what the first test run did.

### Bugs fixed in this phase

- [ ] **Connection leak** — every old service called `_context.Database.OpenConnection()` and
      never closed it. Gone entirely with EF Core.
- [ ] **Null-on-empty** — `MapToList<T>` returned `null` for zero rows and callers immediately
      did `result.FirstOrDefault().Id`. `GetDocumentById` on a missing id returned **500, not 404**,
      and used the result *before* its own null check. EF returns empty collections; add explicit 404s.
- [ ] **No paging anywhere** — `GetAllDocument` and `GetAllUsers` returned everything. All
      collection endpoints get `page` / `pageSize` / `sort` / `filter` with a hard max page size.
- [ ] **Exceptions as flow control** — `throw new Exception("Invalid Code…")` becomes typed
      domain exceptions mapped to 400/404/409 by the ProblemDetails middleware.
- [ ] **`Guid.Parse(UsrId)`** on an unchecked claim — a null or non-GUID `sub` throws. Use
      `TryParse` behind a `CurrentUser` accessor (the old `CustomBaseController` that would
      have done this was entirely commented out).
- [ ] **Delete `WeatherForecastController`** and the commented-out `GeneralRepo` / `IGeneral` /
      `CustomBaseController` shells.
- [ ] Request validation with FluentValidation — the old DTOs had bare properties, so
      `ModelState.IsValid` passed trivially.
- [ ] DTOs separate from persistence: the old API returned `sp*` result classes directly,
      coupling the wire contract to stored-procedure column names.

---

## 6. Phase 5 — File storage

The old design returns documents as **base64 data URIs inside JSON** — `File.ReadAllBytes`
into memory, ~33% size inflation, no streaming, no range requests, no caching. `GetAllDocument`
did this for *every document in the system* in one response.

- [x] `IDocumentStorage` abstraction; `LocalDiskDocumentStorage` now, S3/Azure Blob later
- [x] **Storage root outside the web root**, enforced by an options validator that fails at
      *startup* if it is ever pointed inside `wwwroot`. Nothing is served statically; there
      is no `UseDirectoryBrowser`.
- [x] Upload via **multipart**, not base64 JSON. Streamed to disk in 64 KB chunks while
      hashing, so a file is never held whole in memory.
- [x] Max size enforced **during** the copy, aborting mid-stream rather than after the whole
      upload has been accepted
- [x] **Content sniffed from magic bytes** (`FileTypeInspector`) and cross-checked against the
      extension — the client's declared MIME is not trusted at all
- [x] Extension allow-list enforced on the write path
- [x] **Server-generated keys** (`yyyy/MM/{guid}{ext}`), plus a root-containment check when
      resolving any key back to a path
- [x] Download through an **authorized** endpoint with `Range`, `ETag` and `Last-Modified`
- [x] SHA-256 recorded per file, doubling as the strong ETag
- [x] Replacing content deletes the old blob only *after* the new one is safely written
- [ ] Virus scanning hook on upload
- [ ] Page-count extraction for PDFs (`Document.PageCount` is still null)

**Verified against a running instance:**

| Attempt | Result |
|---|---|
| Genuine PDF | 200, `application/pdf` sniffed from the header |
| Text file renamed `.pdf` | **422** "contents do not match its '.pdf' extension" — the exact legacy hole |
| `.exe` upload | **422**, extension not in the allow-list |
| Filename `../../../wwwroot/pwned.pdf` | stored under a generated key; name reduced to `pwned.pdf`; nothing written outside the root |
| Download | 200, correct type, `Accept-Ranges: bytes`, ETag = SHA-256 |
| `If-None-Match` | **304** |
| `Range: bytes=0-7` | **206** with `Content-Range: bytes 0-7/69` — what lets a viewer seek inside a large PDF |
| `?download=true` | `Content-Disposition: attachment` |
| No session | **401** |
| Round trip | downloaded bytes identical to uploaded; API's SHA-256 matches `sha256sum` |

Rejected uploads left no audit entry and no orphaned blob.

---

## 7. Phase 6 — Frontend port (Next.js → Vite SPA)

Most of the existing React is portable: the components are client-side, the UI kit is
Radix/shadcn (framework-agnostic), and the scanner is pure browser APIs.

- [x] Vite + React + TypeScript in `ClientApp/`, building straight into `wwwroot/`;
      dev server proxies `/api`, `/bff`, `/connect`, `/Account` to the host so the browser
      sees one origin and the `SameSite=Strict` session cookie travels
- [x] Ported the Tailwind v4 theme and all 17 `components/ui/*` — drop-in, with the Next
      font variables swapped for system stacks and every `"use client"` directive stripped
- [x] Ported the **scanner** files (`use-scanner`, `scanner-modal`, `page-strip`, `scanner-pdf`)
- [x] **OpenCV.js self-hosted.** It was fetched from `docs.opencv.org` on first use — 10.3 MB
      over the open internet at *runtime*, which fails on an intranet-only deployment, breaks
      under a strict CSP, is unversioned, and tells a third party which of your users are
      scanning. `scripts/fetch-opencv.mjs` vendors it at build time via a `prebuild` hook;
      the file is gitignored as a build artefact, and a failed fetch is non-fatal — only the
      scanner is affected, and it reports its own not-ready state.
- [x] **Scanner wired into the upload page** — it hands back a finished multi-page `File`,
      so a scan and a picked file follow exactly the same upload path
- [x] `AppShell` with the sidebar built from `/api/menu` — server-filtered, so the client
      decides nothing about what a user may see
- [x] React Router: dashboard, inbox, documents, document detail, **upload**, **audit**,
      **admin reference data** (departments / types / origins), 404
- [x] **Workflow-definition admin** (`/admin/workflows`, editable; `/workflows`, read-only for
      anyone who routes documents) — list, create, edit, reorder steps, make default,
      activate/deactivate, delete
- [x] **Users admin** (`/admin/users`) — search, filter by department, create (temporary
      password shown once, with copy), edit names, department, roles and active status
- [x] **Roles admin** (`/admin/roles`) — permissions grouped by category, select-all per
      group, create and delete custom roles; built-in role names are locked
- [x] `/api/roles/lookup` — role names for pickers, open to any signed-in user, so assigning a
      role (to a user or a workflow step) no longer needs the right to redefine roles. Fixes
      the gap noted under route administration.
- [x] **Reports** (`GET /api/reports`, `/reports`) — for a chosen range (7 days to 12
      months): documents registered, approved and abandoned; open and overdue now; median and
      average turnaround; the slowest steps; per-department decisions, wait times and backlog;
      the age of open documents; and a daily trend. Counts only, so it can be shown to people
      who could not open the documents themselves.
- [x] **Folders** — a folder panel on the Documents page (select to filter; add subfolder,
      rename and delete for holders of `folders.manage`), a folder choice when registering a
      document, and a folder setting in each document's details
- [x] `PUT /api/documents/{id}/folder` — filing is separate from editing. Records staff file
      documents after approval, when the uploader can no longer change them, so filing needs
      `folders.manage` and read access to the document, at any status
- [x] Folder counts now include only documents the viewer can see. Before, they counted every
      document, which revealed how many hidden documents sat in each folder
- [x] **Settings** (`/admin/settings`, `admin.settings`) — the four areas chosen:
  1. **Document numbering** — prefix, digits, include year, restart yearly; live preview of
     the next number. Numbers are allocated by a locking `MERGE` on a counter row *inside the
     same transaction* that saves the document (`DocumentNumberGenerator`), so simultaneous
     registrations cannot collide and a failed save gives its number back. Replaces the random
     `FR-2026-XXXXXXXX` numbers. Typed-in numbers are still allowed; the sequence skips any it
     would otherwise reuse.
  2. **Organisation name and logo** — in the sidebar and on the sign-in page. The logo is PNG,
     JPEG or WebP only (checked from the bytes; SVG refused because it can carry script),
     ≤ 512 KB, served anonymously at `/branding/logo?v=…` so the sign-in page can show it.
  3. **Deadlines and reminders** — default deadline for steps without one; a background job
     (`ReminderHostedService`, every 15 min, `Reminders:IntervalMinutes`) sends in-app
     reminders once before the deadline and then at most every *n* hours while overdue;
     "Send reminders now" for administrators. A **notification bell** shows them. In-app only —
     email delivery is still Phase 7.
  4. **File uploads** — allowed types (only those the server can verify from contents) and a
     size limit, capped by `Storage:MaxFileSizeBytes` (now 200 MB). The upload page and
     document file panel follow the rules and warn before sending.

  New migration `Settings` (additive): `SystemSettings` (single row, created by the migration),
  `DocumentNumberCounters`, `WorkflowRoutings.LastReminderAt`.

**Verified** (API and Chromium, as the test account with a temporary Administrator role, since
removed):

| Check | Result |
|---|---|
| 10 documents registered simultaneously | `FR-2026-000001` … `000010`, all unique, no gaps |
| A save that fails after taking a number | next document got `000011` — no gap |
| Change to `REG`, 4 digits, no year | next document `REG-0013`; count carried on |
| Invalid prefix / `.exe` / 5000 MB | each refused with a plain message |
| PNG when only PDF allowed; 2 MB PDF with 1 MB limit | refused: "not accepted", "exceeds the 1 MB limit" |
| SVG renamed `.png` as logo | refused |
| Logo without a session; sign-in page | 200 `image/png`; page shows name, logo, and tab title |
| Step with no deadline, default 3 days | due date set 3 days out |
| Reminders: first run / second run | 4 due-soon / 0 — no repeats |
| Overdue, last reminded 30 h ago (repeat 24 h) / again | 1 / 0 |
| Reminders switched off | run reports disabled, nothing sent |
| Bell | 3 unread; opening one navigated to the document and left 2 |

**Three defects found and fixed while testing:**

1. **Missing referenced record → 500.** Creating or updating a document with a folder, type or
   origin id that does not exist hit a foreign-key error. It now returns 404 naming what is
   missing. (Pre-existing; exposed by the numbering rollback test.)
2. **Uploads above ~28 MB would have failed with a bare 413.** Kestrel's default request limit
   sits below the upload limit, so the application's own size message would never be reached.
   Kestrel and multipart limits are now set from the configured ceiling.
3. **Uploading a logo discarded unsaved changes on the Settings page.** The logo saves
   immediately and reloaded the page data, which reset the whole form. The form now fills
   once and is only replaced by the result of an explicit save. Re-tested: changes made before
   a logo upload are kept and saved.

All settings were returned to their defaults after testing.

> Test data left: route "Report Review" and its document "Quarterly records report"; documents
> "Concurrency test 1–10", "After the failure", "After the 404", "New format" (`REG-0013`),
> "Upload rules test"; reminder notifications for the test accounts.

**Folders — verified in Chromium** as a Records Officer (a role granted to the test account
for the test, then removed): created a folder and a subfolder from the panel; filed a Pending
document from its page; selecting the subfolder showed that one document under the heading
"Records Office / Retention"; deleting the non-empty folder was refused (409, "holds 1
document(s)"). No other errors. **Visibility checked:** with an admin-only document also
filed in that folder (2 in total), the test account's count and list both showed 1.

Limitation: selecting a folder shows documents filed *directly* in it, not in its subfolders.

> Leftover test data: folders "Parent" / "Child" from the earlier cycle-guard test, and
> "Records Office" / "Retention" from this one.

**Reports — verified.** All queries translate to SQL (wait times are computed by the database
in minutes). Checked against the data: 4 open documents, and the age groups sum to 4; the
Review step comes out slowest at 32.2 hours. An inverted range is rejected with a plain
message. In Chromium the page rendered with no errors, the chart tooltip showed per-day
values, and switching the range reloaded it. The two chart colours (blue/orange) passed the
colour-blindness and contrast checks for both light and dark backgrounds. The chart has a
legend, labels at the line ends, and a "Show table" option, so it doesn't rely on colour alone.

> Leftover test data: "Q3 Procurement Policy" is open at the Approval step with nobody
> assigned — created on the first test run, before approving required choosing the next
> recipient. It is counted as open in the reports. It can be deleted, or reassigned once an
> admin reassignment feature exists.

**Verified in Chromium:** created a Finance user with the Manager role through the form (a
20-character temporary password was shown once); granted the Viewer role
`documents.comment` and the confirmation said it applies to 1 user on their next request.
No 4xx/5xx.

**End-to-end result:** the Invoice document that had been refused because nobody held the
Manager role was then submitted. It chose the Invoice route, and the role-based first step
assigned it automatically to the new manager, filed under Finance.

- [x] **Forced password change — fixed.** Signing in with a temporary password now leads to
      `/Account/ChangePassword` before any session exists. The sign-in page checks the
      password *without* signing in, and issues only a five-minute cookie that proves the
      password was correct. That cookie is not a session, so there is no way round the page.
      Verified in Chromium:

      | Attempt | Result |
      |---|---|
      | Sign in with the temporary password | sent to the change-password page |
      | Go to `/bff/login` instead | back to sign-in; `/bff/user` returns 401 |
      | Weak password | rejected with the password rules |
      | Passwords don't match | rejected |
      | Reuse the temporary password | rejected |
      | Valid new password | lands on `/dashboard`; `mustChangePassword` is false; audited |
      | Sign in again with the new password | straight in |
      | Sign in with the old temporary password | "Invalid username or password" |

      (The users list first labelled these accounts "Pending first sign-in", which was wrong
      for people who had signed in; it now shows "Never signed in" or "Temporary password".)

      **This applies to the seeded administrator too**: `admin@frema.local` was created with a
      temporary password, so its next sign-in will ask for a new one.

**Route administration — API** (`Features/Workflow/WorkflowDefinitionEndpoints`):

- **Versioning.** A route no document has used is edited in place. A route that has been used
  is never changed: saving creates the next version, retires the old one, and moves the
  default flag across. Documents already on the old version finish on it. Verified: editing
  the in-use default produced v2 (3 steps), v1 was kept with its 2 steps and 3 documents, and a
  running document still showed v1's route. Editing again through the UI produced v3.
- Validation returns plain sentences naming the step at fault, e.g. *"Step 1 ('Dept step')
  assigns to a department, but none is chosen."*
- There is always exactly one default. The active default cannot be deactivated or deleted,
  and a route that documents have used cannot be deleted — it can only be deactivated.
- A retired version cannot be reactivated alongside its newer version.
- Route selection verified: an Invoice document picked the Invoice route. Submitting it was
  refused because no user has the Manager role yet, which is the correct response.

**Bug found while testing:** the app's database connection retries on transient failures,
and that retry mechanism rejects transactions opened manually. Editing a route that was in
use returned a 500, though the transaction rolled back and nothing was changed. Both
multi-step writes now run inside `InRetriableTransactionAsync`, so a retry repeats the whole
operation.

**Server-side follow-up — done.** `SubmitAsync` now rejects a returned document that still
has an open assignment (409), so resume-not-restart is enforced by the server itself, not
only by the UI.

> Known gap: the step editor's role picker reads `/api/roles`, which requires `admin.roles`.
> An administrator with `admin.settings` but not `admin.roles` cannot assign a step to a
> role. It works today only because the Administrator role has every permission.
- [x] **Document detail** — workflow trail, decision panel with recipient picker, comment
      thread, and file attach/open/download
- [x] **Toasts** — reporting the server's own ProblemDetails wording, so a user reads
      "contents do not match its '.pdf' extension" rather than "upload failed"
- [x] Typed API client (`lib/api.ts`) sending the `X-CSRF` header on every call, with
      `ApiError` carrying the server's ProblemDetails
- [ ] Generate `lib/types.ts` from the OpenAPI document rather than hand-maintaining it
- [x] Auth: `/bff/login` redirect, session from `/bff/user`, profile from `/api/users/me`
- [x] Permissions from the server's claims, not a hardcoded client map
- [x] **Loading states** — a top loading bar driven by every tracked request (shown only if a
      request takes over 150 ms; notification polling excluded), and page-shaped skeletons for
      the signed-in shell, dashboard, inbox, documents (rows and folder tree), document detail,
      reports, workflows, users, roles, audit, reference data, settings and the notification
      list. Refetches keep existing content on screen (dimmed on Documents and Reports) rather
      than flashing back to a skeleton.
- [x] **Toasts, extended** — enter/exit animation (off with reduced motion), at most four on
      screen, identical messages shown once, optional action button. Page loads that fail now
      show a toast (previously the page stayed blank). An unreachable server gets its own
      message. **Expired session:** one persistent "Your session has ended" toast with
      "Sign in again", and no automatic redirect, so work in progress is not thrown away.
      Verified in Chromium with responses slowed to 2–3 s, a forced 500 and forced 401s.
- [ ] Retire the Next.js app once parity is reached

**A full workflow action completed through the UI**, driven in Chromium: opened a returned
document from the inbox, read the return reason, chose a recipient, sent it on. Step moved
`Review → Approval`, the trail grew to four entries, no 4xx/5xx.

**A conflict the screenshot exposed.** Both a decision panel and a re-submit panel rendered
at once on a returned document — and they did *contradictory* things. "Approve and send on"
resumes the route forward; "Re-submit" calls `/submit`, which selects a definition afresh and
restarts at step one, discarding every approval already given. Exactly the restart the
resume-not-restart decision ruled out. The two are now mutually exclusive: an assignment
awaiting you means you resume it, and submitting is offered only when there is no assignment
to act on — which is the genuine case of a document returned from the very first step, where
no earlier step exists to hold one.

The panel also now reads as what it is: "Returned to you", with the reason surfaced in the
panel rather than left to be hunted for in the trail, and "Send on again" instead of
"Approve".

**The scanner verified working**, driven in Chromium with a fake camera device: OpenCV
served from `/vendor/opencv.js` (200), `window.cv.Mat` compiled and ready, the video element
holding a live `MediaStream`, and the modal reporting "OpenCV Active" with no page errors.
Registering a document through the upload form also completes end to end, landing on its
detail page with the submit panel offered.

One screen serves all three reference tables, mirroring the server, where they are written
once against `IReferenceEntity` — three near-identical screens here would have reintroduced
exactly the duplication that was removed there.

> **Server-side follow-up:** `WorkflowEngine.SubmitAsync` still accepts a `Returned` document
> and restarts its route. The UI no longer offers that path except where it is correct, but
> the endpoint would still do it if called directly. It should refuse when the document has a
> pending routing, so the rule is enforced where it is decided rather than only where it is
> displayed.

**Verified in a real browser** (Playwright, Chromium): signed in through the full OIDC
round-trip, landed on `/dashboard`, 14 permission-filtered nav items rendered, live
aggregates and the real audit trail displayed. `/inbox` and `/documents` both render server
data. **No 4xx/5xx** beyond the expected pre-login `/bff/user` probe.

Node was on **v14.21.3** at the start of this phase, which Vite cannot run on; switched to
the already-installed **v22.23.1** (`nvm use 14.21.3` reverts it).

The Vite template enables `erasableSyntaxOnly`, which bans `enum` declarations and
constructor parameter properties. Converted to `as const` objects with derived union types
and explicit field assignment rather than disabling the check — it keeps the source within
the type-stripping subset that Node can run natively.

---

## 8. Phase 7 — Realtime & background work

- [ ] SignalR `NotifyHub` with **authorization** and per-user groups (the old hub was empty
      and unauthenticated)
- [ ] Replace `new RestClient(...)` + synchronous `_client.Execute()` inside async actions —
      that blocks a thread-pool thread per call and exhausts sockets. Use `IHttpClientFactory`
      typed clients, fully async, with Polly retries.
- [ ] Notification sends move to a **background queue** — currently a slow SMS gateway blocks
      the HTTP response, and the result is assigned to a variable that is never checked, so
      failures are silent.
- [ ] Actually implement email. `EmailConfiguration`, Coravel, Coravel.Mailer and MailKit are
      all referenced in the old project but nothing sends mail — only SMS is wired.
- [ ] Port the Next.js idle-document reminder cron to a hosted service / Coravel scheduler
- [ ] Drop unused packages after the audit

---

## 9. Phase 8 — Hardening & delivery

The old solution has **no tests at all**.

- [ ] Unit tests: approval/decline state transitions, routing advancement, permission resolution
- [ ] Integration tests: `WebApplicationFactory` + Testcontainers (SQL Server), covering the
      BFF login flow, authorization on every endpoint, and file upload/download
- [ ] A test asserting no endpoint is reachable without the correct permission
- [ ] OpenTelemetry traces/metrics
- [ ] CI: build, test, `dotnet ef migrations` drift check, npm build, `npm audit`
- [ ] Deployment: migrations applied as a deploy step (not at startup), HTTPS + HSTS,
      secrets from the environment
- [ ] Delete `docs/legacy-sql/` and the old solution once cutover is verified

---

## 10. Bug ledger — old → fixed

Traceability from the review of the .NET 6 solution.

| # | Issue | Severity | Fixed in |
|---|---|---|---|
| 1 | Credentials in committed `appsettings.json` | Critical | 1.1 |
| 2 | `UseDirectoryBrowser` exposes all documents | Critical | 6 |
| 3 | `[Authorize]` with no policy — any user, any endpoint | Critical | 3.3 |
| 4 | Password-reset code not scoped to the user | Critical | 3.4 |
| 5 | `CreateUser` is `[AllowAnonymous]` | Critical | 3.4 |
| 6 | Unvalidated base64 upload, MIME trusted | Critical | 6 |
| 7 | User enumeration + 500 in forgot-password | High | 3.4 |
| 8 | `LocalDrive._DirPath` never assigned | High | 6 |
| 9 | `OpenConnection()` never closed | High | 5 |
| 10 | `MapToList` returns null → NRE → 500 not 404 | High | 5 |
| 11 | Base64 document payloads, no streaming | High | 6 |
| 12 | No paging on any collection endpoint | High | 5 |
| 13 | Sync RestSharp in async actions, client per request | High | 8 |
| 14 | Weak generated passwords, SMS'd with the username | High | 3.4 |
| 15 | `throw new Exception` as flow control | Medium | 2, 5 |
| 16 | Swagger enabled in Release | Medium | 2 |
| 17 | No logging in the API | Medium | 2 |
| 18 | .NET 6 out of support | Medium | 2 |
| 19 | Sprocs absent from source control | Medium | 1.2, 4 |
| 20 | Three DbContexts, IdentityServer tables in the app context | Medium | 4.2 |
| 21 | `sp*` classes used as API contracts | Medium | 5 |
| 22 | `GenerateCode` modulo bias | Low | 3.4 |
| 23 | `WeatherForecastController`, dead commented code, `.vs/` | Low | 5 |
| 24 | Unused Coravel/MailKit/email config | Low | 8 |

---

## 11. Sequencing

```
Phase 0  escalate secret rotation (not ours to close) ─┐
         reconstruct the spec from C#                  │  runs alongside
         confirm workflow rules with the business  ────┤  Phases 1–2
   │                                                   │
Phase 1  skeleton ◄────────────────────────────────────┘
   │
Phase 2  identity + BFF ──┐
   │                      │  (independent once the skeleton exists)
Phase 3  domain + EF ─────┤
   │                      │
Phase 4  API slices ◄─────┘
   │
Phase 5  file storage
   │
Phase 6  frontend port ──► can start against a mocked OpenAPI doc
   │                        as soon as the Phase 4 contracts are agreed
Phase 7  realtime + background
   │
Phase 8  hardening + cutover
```

Phases 3 and 6 are the long poles. The frontend port can run in parallel with Phases 4–5 as
soon as the OpenAPI contract is settled, since the SPA can develop against a generated mock.

---

## 12. Open questions

- [ ] Which of the 6 Next.js departments map to real org units, and which users belong to each?
- [ ] Is the `Folder` hierarchy actually used in production, or was it aspirational? It exists
      in the old backend but only as a stub form in the Next.js app.
- [ ] Keep SMS (AfricasTalking) as a channel, or move to email-only?
- [ ] Does anything other than `FREMA.UI` consume the STS? If not, the embedded-IdentityServer
      decision could be revisited in favour of plain cookie auth.
- [ ] Target deployment — IIS (the old config implies `C:\inetpub\wwwroot\CustomApi`), or
      containers?
