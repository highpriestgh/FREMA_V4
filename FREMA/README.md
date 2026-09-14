# FREMA

File and Records Management System — a single ASP.NET Core application that hosts an
embedded Duende IdentityServer, a BFF-secured API, and a React SPA.

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
dotnet user-secrets set "Bff:Origin" "https://localhost:7233"
dotnet user-secrets set "Bff:ClientSecret" "<32 random bytes, base64>"

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

The Vite dev server proxies `/api`, `/bff`, `/connect` and `/Account` to the host, so the
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
│   /bff/login|user|logout Duende.BFF              │
│   /connect/*, /Account/* IdentityServer          │
│   /api/*                 endpoints [Authorize]   │
│                                                  │
│   EF Core ─────────────────► SQL Server          │
│   IDocumentStorage ────────► ./storage (outside  │
│                              the web root)       │
└──────────────────────────────────────────────────┘
```

The application is an OIDC client **of itself**. Two cookie schemes coexist:
`Identity.Application` for the identity-provider session, `__Host-frema-bff` for the SPA's.

---

## Common tasks

```bash
# Apply migrations without seeding
dotnet ef database update --project src/FREMA

# Add a migration after changing the domain model
dotnet ef migrations add <Name> --project src/FREMA --output-dir Infrastructure/Persistence/Migrations

# Re-seed — idempotent, adds only what is missing
dotnet run --project src/FREMA -- --seed

# Start over
dotnet ef database drop --project src/FREMA --force
```

Inspect the data by pointing SSMS at `(localdb)\MSSQLLocalDB`, database **FREMA**, with
Windows Authentication.

---

## Troubleshooting

**Every API call returns 401 but `/bff/login` seems to work.**
`AddIdentity` sets `DefaultSignInScheme` to `Identity.External`. If that is not overridden to
`bff`, the OIDC callback deposits the session in the wrong cookie — login appears to succeed
and every subsequent request is anonymous. See the `AddAuthentication` block in `Program.cs`.

**Diagnosing a 401 or 403.** Raise the authentication and authorization overrides in
`appsettings.Development.json` to `Debug`; the log then names the failing scheme and the
unmet requirement.

**Duende licence warnings at startup.** Expected in development. A licence is required for
production — set `IdentityServer:LicenseKey` once you have one.

**The scanner shows "OpenCV loading" forever.** `public/vendor/opencv.js` is fetched at build
time and gitignored. Run `npm run vendor:opencv` in `ClientApp`.

---

## Layout

```
src/FREMA/
├── Domain/              entities and enums, free of EF attributes
├── Infrastructure/
│   ├── Persistence/     DbContext, configurations, migrations
│   ├── Authorization/   claims transformation, resource handlers
│   ├── Storage/         file storage, content-type sniffing
│   ├── Auditing/        server-side audit trail
│   └── Seeding/         reference data
├── Features/            vertical slices — one folder per area
├── Identity/            IdentityServer configuration
├── Pages/               Razor pages for sign-in only
└── ClientApp/           React SPA
tests/FREMA.Tests/       (scaffolded; suites still to be written)
```
