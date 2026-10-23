# FREMA

File and Records Management System — a single ASP.NET Core application that serves a
React SPA and its API from one origin, signed in with an ASP.NET Identity cookie.

See [FREMA-REBUILD-PLAN.md](../FREMA-REBUILD-PLAN.md) for what is built and what remains.

---

## Running it

### Prerequisites

| | Required | Check with |
|---|---|---|
| .NET SDK | 10.x | `dotnet --version` |
| Node | 20.19+ (22 recommended) | `node -v` |
| SQL Server | LocalDB is enough | `sqllocaldb info` |

> **Node version matters.** Vite will not run on Node 14. If `node -v` shows anything below
> 20.19, switch with `nvm use 22`.

### First run

```bash
# 1. Start the database (LocalDB stops on reboot)
sqllocaldb start MSSQLLocalDB

# 2. Configure secrets — these are never committed
cd src/FREMA
dotnet user-secrets set "ConnectionStrings:Default" "Server=(localdb)\MSSQLLocalDB;Database=FREMA;Trusted_Connection=True;MultipleActiveResultSets=True;TrustServerCertificate=True"

# 3. Build the SPA into wwwroot (also vendors OpenCV.js, ~10 MB, once)
cd ClientApp && npm install && npm run build && cd ..

# 4. Create and seed the database
dotnet run -- --seed

# 5. Run
dotnet run --launch-profile https
```

Then open **https://localhost:7233**.

The seeder prints a generated administrator password **once** and stores it nowhere. Set
`Seed:AdminPassword` in user-secrets beforehand if you would rather choose your own.

### Day to day

```bash
# Serve the built SPA from the host — one process, closest to production
cd src/FREMA && dotnet run --launch-profile https
```

```bash
# Or, for frontend work: two processes, with hot reload
cd src/FREMA && dotnet run --launch-profile https     # terminal 1
cd src/FREMA/ClientApp && npm run dev                 # terminal 2 → http://localhost:5173
```

The Vite dev server proxies `/api`, `/Account` and `/branding` to the host, so the
browser sees a single origin and the session cookie — which is `SameSite=Strict` and
`__Host-` prefixed — is sent with every request.

---

## How it fits together

```
Browser
  │  HttpOnly session cookie + X-CSRF header. No tokens ever reach JavaScript.
  ▼
┌──────────────────────────────────────────────────┐
│  FREMA — one ASP.NET Core project                │
│                                                  │
│   /                     React SPA (wwwroot)      │
│   /Account/*            Razor sign-in pages      │
│   /api/account/logout   ends the session         │
│   /api/*                endpoints [Authorize]    │
│                                                  │
│   EF Core ─────────────────► SQL Server          │
│   IDocumentStorage ────────► ./storage (outside  │
│                              the web root)       │
└──────────────────────────────────────────────────┘
```

Signing in on `/Account/Login` sets ASP.NET Identity's application cookie, `__Host-frema`
(HttpOnly, Secure, `SameSite=Strict`, 8 hours sliding). There is no token server: the SPA and
API share an origin, so the cookie is all a request needs, plus the `X-CSRF: 1` header on
anything that changes data (`Infrastructure/Authorization/AntiforgeryHeader.cs`). API calls
without a session get a 401 rather than a redirect, so the SPA can send the browser to sign in.

This replaced an embedded Duende IdentityServer + BFF in October 2026, which needed a paid
licence in production. If single sign-on for other applications is ever needed, OpenIddict
(Apache 2.0) can be added on top of the same Identity user store.

---

## Common tasks

```bash
# Apply migrations without seeding
dotnet ef database update --project src/FREMA

# Add a migration after changing the domain model
dotnet ef migrations add <Name> --project src/FREMA --output-dir Infrastructure/Persistence/Migrations

# Re-seed — idempotent, adds only what is missing
dotnet run --project src/FREMA -- --seed

# Lost the administrator password? Prints a new temporary one, once
dotnet run --project src/FREMA -- --reset-admin-password

# Start over
dotnet ef database drop --project src/FREMA --force
```

Inspect the data by pointing SSMS at `(localdb)\MSSQLLocalDB`, database **FREMA**, with
Windows Authentication.

---

## Troubleshooting

**A save fails with 400 "Missing antiforgery header".** The call did not send `X-CSRF: 1`.
Go through `lib/api.ts`, which adds it, rather than calling `fetch` directly.

**Diagnosing a 401 or 403.** Raise the authentication and authorization overrides in
`appsettings.Development.json` to `Debug`; the log then names the failing scheme and the
unmet requirement.

**Left over from the Duende setup.** The `Bff:Origin` and `Bff:ClientSecret` user-secrets are
no longer read (`dotnet user-secrets remove "Bff:Origin"` and likewise for the other). An
existing database may still hold IdentityServer's tables (`PersistedGrants`, `DeviceCodes`,
`Keys`, `ServerSideSessions`, `PushedAuthorizationRequests`); nothing uses them, and they can
be dropped.

**The scanner shows "OpenCV loading" forever.** `public/vendor/opencv.js` is fetched at build
time and gitignored. Run `npm run vendor:opencv` in `ClientApp`.

---

## Layout

```
src/FREMA/
├── Domain/              entities and enums, free of EF attributes
├── Infrastructure/
│   ├── Persistence/     DbContext, configurations, migrations
│   ├── Authorization/   claims transformation, resource handlers, X-CSRF check
│   ├── Storage/         file storage, content-type sniffing
│   ├── Auditing/        server-side audit trail
│   └── Seeding/         reference data
├── Features/            vertical slices — one folder per area
├── Pages/               Razor pages for sign-in only
└── ClientApp/           React SPA
tests/FREMA.Tests/       (scaffolded; suites still to be written)
```
