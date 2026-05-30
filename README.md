# User Creation Tool (UCTool) — Electron Desktop App

> **v3.6.7** — Standalone Electron desktop application.  
> Double-click to launch. No web server, no ports, no dependencies to start manually.  
> CISO-reviewed. All security findings remediated. See [SECURITY.md](SECURITY.md).

---

## Quick Start

```bash
cd uctool-electron
npm install
npm run dev          # Development mode — hot reload + DevTools
```

Build the installer:

```powershell
.\build.ps1 -Clean   # Always clean first to avoid stale cached output
```

---

## Why Electron?

The previous v2.x web architecture required three separate processes before the UI worked. The desktop shortcut pointed at `localhost:5173` — a port that nothing served after install.

| | Web v2.x | Electron v3.x |
|---|---|---|
| Launch | 3 manual steps | Double-click |
| Port dependency | 5173 + 8080 | None |
| Serves frontend | Vite / IIS required | Built-in Chromium |
| Runs PowerShell | Via HTTP API | Direct `child_process` |
| Close button quits | ❌ kept running | ✅ fully quits |
| Works offline | ❌ | ✅ |
| Audit log | ❌ | ✅ HMAC-signed JSON-Lines |
| Session timeout | ❌ | ✅ 15-minute inactivity lock |

---

## ⚙️ Domain Configuration

No domain is hardcoded. Configure at runtime via Settings.

**Option 1 — Settings page (recommended)**

1. Open the app → **Settings**
2. Click **Auto-Detect Domain** — reads from `Get-ADDomain` (RSAT), `$env:USERDNSDOMAIN`, or WMI
3. The detected domain auto-fills the Email Domain field
4. Save — stored in `%APPDATA%\user-creation-tool\settings.json`

**Option 2 — Build-time default**

```env
# .env  (copy from .env.example)
VITE_EMAIL_DOMAIN=yourdomain.local
```

---

## Table of Contents

1. [Architecture](#architecture)
2. [Prerequisites](#prerequisites)
3. [Project Structure](#project-structure)
4. [Development](#development)
5. [Building & Packaging](#building--packaging)
6. [Mock vs Production Mode](#mock-vs-production-mode)
7. [Features](#features)
8. [Active Directory Delegation Requirements](#active-directory-delegation-requirements)
9. [Security](#security)
10. [Production Deployment](#production-deployment)
11. [Troubleshooting](#troubleshooting)
12. [Known Issue History](#known-issue-history)

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Electron Process (no network listener, no open ports)     │
│                                                            │
│  ┌───────────────────────┐   ┌──────────────────────────┐  │
│  │  Main Process         │   │  Renderer Process        │  │
│  │  (Node.js)            │   │  (Chromium)              │  │
│  │                       │   │                          │  │
│  │  ipc-handlers.ts      │◄──│  React 18 + Tailwind     │  │
│  │  ad-operations.ts     │   │  ipc-client.ts (guard()) │  │
│  │  powershell.ts        │   │  All pages / UI          │  │
│  │  templates-store.ts   │   │                          │  │
│  │  audit-log.ts         │   │                          │  │
│  │  session-guard.ts     │   │                          │  │
│  └──────────┬────────────┘   └──────────────────────────┘  │
│             │  contextBridge (preload/index.ts)             │
└─────────────┼──────────────────────────────────────────────┘
              │ child_process.spawn (minimal env, 30s timeout)
              ▼
    ┌──────────────────────┐
    │  PowerShell 7        │
    │  pwsh.exe            │
    │  ActiveDirectory     │
    │  module (RSAT)       │
    └──────────────────────┘
```

**IPC flow:** Renderer calls `window.api.resetPassword(payload)` → preload forwards via `ipcRenderer.invoke` → main process handler writes audit entry → runs PowerShell with service account credential → result returned as JSON → renderer updates UI.

No HTTP server. No open ports. No browser required.

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 18+ | [nodejs.org](https://nodejs.org) — build only |
| PowerShell | 7+ | [aka.ms/pwsh](https://aka.ms/pwsh) — required at runtime on target machines |
| RSAT: AD DS Tools | Any | **Production only** — installer attempts auto-install |

---

## Project Structure

```
uctool-electron/
├── src/
│   ├── main/
│   │   ├── index.ts              ← Window, tray, session guard, app lifecycle
│   │   ├── ipc-handlers.ts       ← All ipcMain.handle() registrations + audit entries
│   │   ├── ad-operations.ts      ← AD functions (mock + real PS cmdlets)
│   │   ├── powershell.ts         ← child_process.spawn (minimal env, 30s timeout)
│   │   ├── templates-store.ts    ← JSON CRUD + DPAPI credential storage
│   │   ├── audit-log.ts          ← HMAC-signed JSON-Lines audit log
│   │   └── session-guard.ts      ← 15-minute inactivity lock
│   ├── preload/
│   │   └── index.ts              ← contextBridge — imports ONLY from 'electron'
│   └── renderer/
│       ├── index.html            ← CSP: no external origins
│       └── src/
│           ├── App.tsx           ← Session lock overlay + mode-change listener
│           ├── api/ipc-client.ts ← window.api wrappers with guard()
│           ├── types/            ← TypeScript interfaces
│           ├── pages/            ← Dashboard, ResetPassword, CreateUser,
│           │                        Templates, Settings
│           └── components/       ← Layout, Toast, ConfirmModal, ErrorBoundary
├── resources/
│   └── icon.ico                  ← 4-size ICO: BMP/BITMAPINFOHEADER (16/32/48px) + PNG (256px)
├── SECURITY.md                   ← CISO review findings and remediations
├── CHANGELOG.md
├── postcss.config.cjs            ← Explicit CJS (no "type":"module" conflict)
├── build.bat                     ← Double-click build launcher
├── build.ps1                     ← Full build pipeline
├── electron.vite.config.ts       ← Build config (NOT electron-builder config)
└── package.json                  ← electron-builder config lives here under "build" key
```

> **Note:** `electron-builder.config.ts` was intentionally removed. All electron-builder
> configuration is in `package.json` under `"build"` to avoid `__dirname` resolution
> failures when ts-node processes TypeScript config files in ESM mode.

---

## Development

```bash
npm install
npm run dev    # Opens native window with hot reload + DevTools
```

---

## Building & Packaging

```powershell
.\build.ps1              # Full build + NSIS installer
.\build.ps1 -FrontendOnly   # electron-vite build only
.\build.ps1 -PackageOnly    # Re-package without rebuilding
.\build.ps1 -Clean          # Delete out\ and dist\ first (ALWAYS use after pulling new version)
```

### PowerShell 7 bundled install

Place `PowerShell-7.6.2-win-x64.msi` in the **same folder** as `UCTool-Setup-3.6.7.exe` before running. The installer checks for `pwsh.exe` and installs from the MSI if not found. Non-fatal if the MSI is absent.

```
📁 (deployment folder)
├── UCTool-Setup-3.6.7.exe
└── PowerShell-7.6.2-win-x64.msi   ← optional, place here for auto-install
```

### Output

```
out/                          ← Compiled app (main + preload + renderer)
dist/
└── UCTool-Setup-3.6.7.exe    ← NSIS installer (~120 MB with Electron runtime)
build/
└── build-YYYYMMDD-HHmmss.log
```

---

## Mock vs Production Mode

Controlled via **Settings → Operation Mode** toggle. Persisted to `settings.json`.

| | Mock Mode (default) | Production Mode |
|---|---|---|
| AD calls | Demo users (jsmith, rjohnson) | Live PS cmdlets against domain |
| User search | Partial match on demo data | `Get-ADUser -LDAPFilter` |
| OU browser | Sample OU list | `Get-ADOrganizationalUnit -Filter *` |
| Lockout check | Simulated (not locked) | `Get-ADUser -Properties LockedOut` |
| Password policy | Sample policy | `Get-ADDefaultDomainPasswordPolicy` / FGP |
| RSAT required | ❌ | ✅ |
| Audit log | ✅ (mockMode flag set in entries) | ✅ |

When mode is toggled, all pages automatically clear their state — no stale mock data persists.

**To switch to Production:**

1. Settings → **Install / Update RSAT** (triggers UAC elevation)
2. Settings → **Check RSAT Status** to verify
3. Settings → toggle **Production Mode**
4. Settings → click **Auto-Detect Domain**
5. Optionally enter a service account under **Service / Admin Account**

---

## Features

### Reset Password

- Partial-match search across username, display name, and email address
- **Multi-word search** — "Grace Lee" searches givenName AND surname simultaneously (AND-of-ORs LDAP filter)
- Disambiguation picker when multiple accounts match — shows Title, Department, Office/Site, Manager, Email, Description
- Auto-selects when only one result found
- **Account Status panel** (auto-queries on user selection):
  - Enabled / Disabled badge
  - Locked Out badge with last bad attempt timestamp and bad logon count
  - Password Expired badge, Password Last Set date
  - **Enable Account** button (blue) if account is disabled — verifies change succeeded
  - **Unlock Account** button if locked — permission checked via `-WhatIf`
  - **Service desk contact card** when insufficient permissions — name and phone from Settings
- **Domain Password Policy** inline banner above password field — shows min length, complexity, history, lockout threshold
- Password generator (CSPRNG) or manual entry with real-time 5-criterion strength meter
- "Must change at next logon" option
- Confirmation modal before applying

### Disable User

- **Use Case A — Resignation / Notice Period** — date picker to schedule account expiry on last day
  (account auto-disables at midnight via `Set-ADAccountExpiration`; no manual action required on the day)
- **Use Case B — Immediate Termination** — red Disable Account Now button with confirmation modal;
  post-operation verification detects silent permission failures; service desk contact shown if denied
- Account Status panel showing enabled/locked/expired badges with Refresh
- Step 03 — Change Password: same as Reset Password (CSPRNG, strength meter, force-change-at-logon)
- All actions audited with full detail

### Create User

- Auto-generates username, display name, and UPN from First + Last name
- **Real-time username existence check** (600ms debounce) with 3 numbered suggestions when taken
- **Clone from existing user** — copies OU placement, group memberships, department, title, office
- Template selection auto-populates OU, groups, and default attributes
- **OU browser** — fetches all OUs from AD with human-readable paths (`Users > IT`)
- Phone: mandatory. Department: optional free-text with suggestions
- **Account expiry date** — optional date picker, plain-English confirmation
- Permission error routes to service desk contact toast
- Review modal with full summary including expiry date and OU location before creating
- Success toast shows exact OU location and F5 reminder for ADUC

### Templates

- Full CRUD with confirmation
- OU browser in editor
- Required and optional groups per template
- Default attributes (Department, Title, Office, Company)

### Settings

- **Auto-detect domain** — RSAT → `$env:USERDNSDOMAIN` → WMI cascade
- Email domain for auto-generated UPNs
- **Service Desk Contact** — name and phone shown when unlock/enable/create permissions are missing
- **Service / Admin Account** — DPAPI-encrypted credential (see Security)
- **Install / Update RSAT** — triggers UAC elevation for RSAT install
- **Domain Password Policy viewer** — queries DC for complexity, min length, history, lockout, max/min age, reversible encryption; supports Fine-Grained Password Policies
- RSAT health check
- Audit log path display

### Dashboard

- Live Operation Mode card — reflects current Mock / Production state in real-time
- Active template count
- Updates immediately when mode is changed in Settings

---

## Active Directory Delegation Requirements

UCTool uses a dedicated service account to perform AD operations. The account requires **only the minimum permissions** for each function. Assign via:

**Active Directory Users and Computers → Right-click target OU → Delegate Control**

> Grant permissions on the **specific OUs** where operations will be performed, not the domain root, unless required by your security policy.

---

### Delegation: Reset Password

**Wizard option:** "Reset user passwords and force password change at next logon"

| Permission | Attribute / Right |
|---|---|
| Reset Password | `User-Force-Change-Password` extended right |
| Write Password Last Set | Write `pwdLastSet` |

**How to configure:**
1. Run Delegation of Control Wizard on the target OU
2. Select "Delegate the following common tasks"
3. Tick **"Reset user passwords and force password change at next logon"**

---

### Delegation: Read User Information

**Wizard option:** "Read all user information"

| Permission | Attribute / Right |
|---|---|
| Read all user attributes | `Read` on all user object properties |

**How to configure:**
1. Run Delegation of Control Wizard on the target OU
2. Tick **"Read all user information"**

> This permission is required for user search, displaying the disambiguation picker,
> and showing account status (lockout, bad logon count, password expiry).

---

### Delegation: Unlock Account

**Requires custom task — not in the common tasks list.**

| Permission | Attribute / Right |
|---|---|
| Write lockoutTime | Write `lockoutTime` attribute |

**How to configure:**
1. Run Delegation of Control Wizard on the target OU
2. Select **"Create a custom task to delegate"**
3. Choose "Only the following objects in the folder" → tick **User objects**
4. Tick **"Property-specific"**
5. Find and tick **"Write lockoutTime"**

> Alternatively: the "Reset user passwords" common task sometimes includes lockout
> reset depending on your Windows Server version. Test with `-WhatIf` via
> Settings → Check RSAT or by attempting an unlock — the app will show
> "insufficient permissions" if the right is missing.

---

### Delegation: Enable / Disable Account

**Requires custom task — not in the common tasks list.**

| Permission | Attribute / Right |
|---|---|
| Write userAccountControl | Write `userAccountControl` attribute |

**How to configure:**
1. Run Delegation of Control Wizard on the target OU
2. Select **"Create a custom task to delegate"**
3. "Only the following objects" → **User objects**
4. Tick **"Property-specific"**
5. Find and tick **"Write Account Restrictions"** (covers userAccountControl)
   — or specifically **"Write userAccountControl"** if available

> **Important:** `Enable-ADAccount` does not always throw an error when this
> permission is missing — it may silently succeed without making any change.
> UCTool detects this by re-reading the account after the operation and will show
> an error + service desk contact if the account is still disabled.

### Delegation: Create User Account

**Requires custom task — not in the common tasks list.**

| Permission | Attribute / Right |
|---|---|
| Create User objects | `Create Child — User` on target OU |
| Write all user attributes | `Write` on all user object properties in target OU |

**How to configure:**
1. Run Delegation of Control Wizard on the target OU
2. Select **"Create a custom task to delegate"**
3. Choose **"Only the following objects"** → tick **"User objects"**
   AND tick **"Create selected objects in this folder"**
4. On the permissions screen, tick **"General"** + **"Property-specific"**
   + tick **"Write"**

> Or use the common task **"Create, delete, and manage user accounts"** which
> bundles Create, Delete, and Write-all-properties together. Only use this if
> you also want to allow deletion.

---

### Delegation: Group Membership

**Requires custom task on each target group.**

| Permission | Attribute / Right |
|---|---|
| Write Members | Write `member` attribute on target security groups |

**How to configure:**
1. Run Delegation of Control Wizard on the **OU containing the target groups**
   (usually a Groups OU, not the Users OU)
2. Select **"Create a custom task to delegate"**
3. Choose "Only the following objects" → **Group objects**
4. Tick **"Property-specific"** → tick **"Write Members"**

---

### Delegation: Enumerate OUs (OU Browser)

| Permission | Attribute / Right |
|---|---|
| Read OU objects | `Read` on Organizational-Unit objects |

This is typically inherited from the domain root via default AD permissions.
No additional delegation is usually required.

---

### Delegation: Read Domain Password Policy

| Permission | Attribute / Right |
|---|---|
| Read domain object | `Read` on the domain root object (`Get-ADDefaultDomainPasswordPolicy`) |
| Read Fine-Grained PSO | `Read` on Password Settings Objects (if FGPs are used) |

Default domain user read permissions are usually sufficient. No additional delegation required unless PSOs have restricted read ACLs.

---

### Summary Table

| Function | Common Task | Custom Task Required | Attributes |
|---|---|---|---|
| Search / Read user info | ✅ "Read all user information" | — | Read all user properties |
| Reset password | ✅ "Reset user passwords..." | — | User-Force-Change-Password, pwdLastSet |
| Unlock account | ❌ | ✅ | Write lockoutTime |
| Enable / Disable account | ❌ | ✅ | Write userAccountControl (Account Restrictions) |
| Create user | ❌ | ✅ | Create User child objects + Write all properties |
| Group membership | ❌ | ✅ (on Groups OU) | Write member |
| OU enumeration | — | — | Inherited Read (default) |
| Password policy | — | — | Inherited Read (default) |

---

## Security

UCTool v3.5.x completed an internal CISO review. All 11 findings were remediated.
See [SECURITY.md](SECURITY.md) for the full report.

### Summary of Controls

| Control | Implementation |
|---|---|
| Credential storage | Windows DPAPI `ProtectedData.Protect(CurrentUser)` — machine+user bound, never plaintext on disk |
| Password generation | `crypto.getRandomValues()` (renderer) and `crypto.randomInt()` (main process) — no `Math.random()` |
| Audit log | Append-only JSON-Lines at `%APPDATA%\user-creation-tool\audit.log`, HMAC-SHA256 per entry |
| Session timeout | 15-minute inactivity lock; system suspend/lock-screen also triggers lock |
| PS child process env | 13-variable allowlist — full `process.env` not exposed to PowerShell |
| PS execution timeout | 30-second kill timeout on every PowerShell invocation |
| Error handling | AD internal structure (DN paths, error codes) stripped before display; full detail in audit log |
| No network exposure | No HTTP server, no open ports; AD via local PowerShell over Kerberos |
| Content Security Policy | `default-src 'self'` — no external origins permitted |

### Audit Log Format

```json
{
  "ts": "2026-05-27T08:52:45.677Z",
  "action": "ACCOUNT_UNLOCK",
  "operator": "DOMAIN\\labadmin",
  "target": "grace.lee",
  "result": "SUCCESS",
  "mockMode": false,
  "machine": "JUMPBOX",
  "detail": "ENABLE_ACCOUNT",
  "hmac": "124d9e5bf7d5a499cdf5a85..."
}
```

**Audited actions:** `PASSWORD_RESET` · `ACCOUNT_UNLOCK` · `USER_CREATE` · `USER_SEARCH` · `LOCKOUT_CHECK` · `SETTING_CHANGE` · `CREDENTIAL_SAVE` · `CREDENTIAL_CLEAR` · `APP_START` · `APP_STOP`

**Compliance:** NIST SP 800-53 (AU-2, AU-12, IA-5(7), AC-11, SC-4) · CIS Benchmark L1 · CIS Control 8 · OWASP ASVS · ISM-0428

---

## Production Deployment

Checklist:

- [ ] Run `.\build.ps1 -Clean` for a fresh build
- [ ] Distribute `dist\UCTool-Setup-3.6.7.exe` — Electron runtime bundled
- [ ] Optionally place `PowerShell-7.6.2-win-x64.msi` alongside installer for auto-install
- [ ] Target machines need PowerShell 7 (`winget install Microsoft.PowerShell`)
- [ ] RSAT auto-installed by setup wizard (requires internet + admin rights)
- [ ] First run: Settings → Auto-Detect Domain → disable Mock Mode
- [ ] Configure service account in Settings → Service / Admin Account
- [ ] Run AD Delegation Wizard per the table above for each function needed

---

## Troubleshooting

### Settings / page fails to render

Run `.\build.ps1 -Clean` — stale preload output is the most common cause.

### `window.api` undefined / "IPC bridge not available"

Same root cause. Clean build resolves it. The preload must output CJS, not ESM.

### AD operations fail in production

```powershell
Import-Module ActiveDirectory
Get-ADUser -Identity jsmith -Properties *
```

If this fails, the service account lacks AD permissions or RSAT is not installed.

### Account enable shows success but account is still disabled

The service account lacks `Write userAccountControl` (Account Restrictions) on the target OU. UCTool detects this via post-operation verification and routes to the service desk contact. Configure the custom delegation as described in [Active Directory Delegation Requirements](#active-directory-delegation-requirements).

### Create user says success but user not in ADUC

1. Press **F5** in Active Directory Users and Computers to refresh
2. Check the audit log for the exact OU — `%APPDATA%\user-creation-tool\audit.log`
3. If user does not appear after refresh, the service account may lack Create User Objects permission on that OU

### Multi-word name search returns no results

Search is partial-match per word — "Grace Lee" finds users where one field contains "Grace" AND another contains "Lee". If still no results, verify the user exists in AD by their exact sAMAccountName.

### Build fails — electron-vite errors

```powershell
.\build.ps1 -Clean
```

Check `build\build-YYYYMMDD-HHmmss.log` for the specific esbuild error.

---

## Known Issue History

| Version | Issue | Root Cause | Fix |
|---|---|---|---|
| v3.1.1 | `window.api` undefined | `"type":"module"` caused Node.js to treat CJS preload as ESM | Fixed v3.2.2 |
| v3.2.x | Settings / Create User blank | Same — preload threw before `contextBridge.exposeInMainWorld` | Fixed v3.2.2 |
| v3.3.0 | Reset Password crash | `useEffect` used but not imported from React | Fixed v3.3.1 |
| v3.4.0 | `getPasswordPolicy` missing | `electron.d.ts` not updated when method added | Fixed v3.4.1 |
| v3.5.0 | Settings crash (`setAuditPath`) | `useState` declaration not added, only `useEffect` call patched | Fixed v3.5.1 |
| v3.5.2 | Desktop icon still Electron atom | `electron-builder.config.ts` used `resolve(__dirname,...)` — `__dirname` undefined in ts-node ESM | Fixed v3.5.2 |
| v3.5.2 | Old version not removed on upgrade | Different registry GUID due to broken `productName` resolution | Fixed v3.5.4 |
| v3.5.3–4 | Taskbar disappears during install | `taskkill /f /im explorer.exe` in NSIS macro killed Windows shell | Fixed v3.5.5 |
| v3.5.6 | User search ParserError | `\\` in TS template literal became `\` in PS — backslash is not PS line continuation | Fixed v3.5.6 |
| v3.5.6–7 | Account Status blank; multi-word search error | `-WhatIf` info stream polluted JSON stdout; empty result returned nothing instead of `[]` | Fixed v3.5.8 |
| v3.5.9 | "Updated for null" toast | User with no `DisplayName` set → JSON `null` → JS string `"null"` | Fixed v3.5.9 |
| v3.6.1 | Trailing apostrophe in `Clear-ADAccountExpiration` | Regex replacement left stray `'` — PS unterminated string on accounts without expiry date | Fixed v3.6.1 |
| v3.6.2 | Mock data persists when switching to production | Pages loaded settings once on mount with no mode-change listener | Fixed v3.6.2 |
| v3.6.3 | Enable account silent false positive | `Enable-ADAccount` exits 0 even without `Write userAccountControl` permission; no post-verification | Fixed v3.6.3 |
| v3.6.4 | Dashboard fails to load | `window.api.getSettings()` called directly, bypassing `guard()` — throws if `window.api` undefined on init | Fixed v3.6.4 |
| v3.6.5 | Disable User page — React error #31 | `strengthLabel()` returns `{label,color}` object; rendered directly as JSX child instead of `.label` | Fixed v3.6.7 |
| v3.6.6 | VMO / External Auditor templates not appearing | `DEFAULT_TEMPLATES` only apply on fresh install; existing `templates.json` never received new defaults | Fixed v3.6.6 |
