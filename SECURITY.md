# Security Documentation — User Creation Tool (UCTool)

> **Audience:** CISO, Security Architect, IT Security Reviewer  
> **Version:** 3.5.0  
> **Review Date:** May 2026  
> **Classification:** Internal

---

## Executive Summary

UCTool is a Windows desktop application that provides delegated Active Directory management to IT helpdesk and service delivery staff. It runs with no network exposure, uses DPAPI-encrypted credential storage, and produces a tamper-evident audit log for all privileged operations.

This document covers the security architecture, all findings from the internal security review, the remediation applied, and residual risks accepted.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  Electron Process (no network listener, no ports)   │
│                                                     │
│  Main Process (Node.js)       Renderer (Chromium)   │
│  ├── audit-log.ts      ◄──────────── contextBridge  │
│  ├── session-guard.ts          (contextIsolation=T) │
│  ├── ad-operations.ts  ──►  PowerShell child proc   │
│  ├── powershell.ts     ──►  (minimal env, 30s t/o)  │
│  └── templates-store.ts──►  DPAPI (CurrentUser)     │
└─────────────────────────────────────────────────────┘
         │ child_process.spawn (no shell, no exec)
         ▼
    PowerShell 7 ──► Active Directory (LDAP/Kerberos)
```

**Key architectural security properties:**
- No HTTP server, no open TCP ports, no listening sockets
- All AD communication via local PowerShell cmdlets using Kerberos
- Renderer is a sandboxed Chromium process with no direct Node.js access
- IPC via typed `contextBridge` — renderer cannot call arbitrary Node.js functions

---

## Security Controls

### Authentication & Authorisation

| Control | Implementation |
|---|---|
| Windows identity | All AD operations run under the configured service account or the logged-in Windows user — no app-level password |
| Service account | DPAPI-encrypted credential stored at `%APPDATA%\user-creation-tool\service-cred.json` |
| AD delegation | Permissions scoped to minimum required OUs via AD Delegation of Control Wizard |
| Session timeout | 15-minute inactivity lock; system suspend/lock-screen events also trigger lock |

### Data Protection

| Asset | Protection |
|---|---|
| Service account password | Windows DPAPI `ProtectedData.Protect(CurrentUser)` — machine+user bound, never plaintext on disk |
| Generated passwords | `crypto.getRandomValues()` (renderer) / `crypto.randomInt()` (main process) — CSPRNG throughout |
| Temporary account password | `crypto.randomInt()` via Node.js `require('crypto')` — CSPRNG, not `Math.random()` |
| Settings / templates | Plaintext JSON in `%APPDATA%` (no secrets stored) |

### Audit Logging

All privileged operations write a structured JSON-Lines entry to `%APPDATA%\user-creation-tool\audit.log`:

```json
{
  "ts": "2026-05-23T02:15:33.421Z",
  "action": "PASSWORD_RESET",
  "operator": "DOMAIN\\helpdesk.user",
  "target": "jsmith",
  "result": "SUCCESS",
  "mockMode": false,
  "machine": "HELPDESK-PC01",
  "detail": "mustChange=true",
  "hmac": "a3f8c1d2..."
}
```

**Audited actions:** `PASSWORD_RESET`, `ACCOUNT_UNLOCK`, `USER_CREATE`, `USER_SEARCH`, `LOCKOUT_CHECK`, `SETTING_CHANGE`, `CREDENTIAL_SAVE`, `CREDENTIAL_CLEAR`, `APP_START`, `APP_STOP`

**Tamper evidence:** Each entry is HMAC-SHA256 signed using a key derived from the machine hostname and Windows username. Modifications to log entries will produce HMAC mismatches on verification.

**Compliance:** NIST SP 800-53 AU-2, AU-3, AU-12 · CIS Control 8 · ISM-0109

---

## Security Review Findings & Remediation

### Internal CISO Review — May 2026

#### Finding 1 — CSPRNG not used throughout password generation
**Severity:** 🔴 Critical  
**CWE:** CWE-338 (Use of Cryptographically Weak Pseudo-Random Number Generator)

**Detail:** `password.ts` used `Math.random()` in the Fisher-Yates shuffle after generating characters with `crypto.getRandomValues()`. `generateTempPassword()` in the main process used `Math.random()` throughout — the initial password set at account creation was not cryptographically random.

**Remediation (v3.5.0):**
- Renderer (`password.ts`): Fisher-Yates shuffle now uses `crypto.getRandomValues()` — `shuffleArr[i] % (i+1)` for unbiased index selection
- Main process (`ad-operations.ts`): `generateTempPassword()` replaced with `crypto.randomInt()` (Node.js built-in CSPRNG) for both character selection and shuffle

**Residual Risk:** None. Both password generators now exclusively use OS-provided CSPRNG.

---

#### Finding 2 — Service account credential not used in AD operations
**Severity:** 🔴 Critical  
**Type:** Security Theatre

**Detail:** The Settings page accepted and encrypted a service account credential, but `decryptPassword()` was never called in `ad-operations.ts`. Every AD operation ran as the logged-in Windows user regardless of what was configured. The UI implied privilege separation that did not exist.

**Remediation (v3.5.0):**
- `buildCredentialParam()` added to `powershell.ts` — decrypts the stored credential at runtime, builds a `PSCredential` object in-memory, and returns the PowerShell fragment to prepend to scripts
- `adResetPassword()` and `adUnlockAccount()` now call `buildCredentialParam()` and append `-Credential $cred` to their cmdlets
- Falls back to current Windows user identity if no credential is configured (matching previous behaviour for unconfigured deployments)

**Residual Risk:** Low. The decrypted password exists in Node.js heap memory for the duration of the IPC call and is not persisted anywhere.

---

#### Finding 3 — No audit log
**Severity:** 🔴 Critical  
**Standards:** NIST 800-53 AU-2, AU-12 · CIS Control 8

**Detail:** Zero logging of privileged operations. Password resets, account creation, and unlocks were completely untraceable.

**Remediation (v3.5.0):**
- `src/main/audit-log.ts` — new module, append-only JSON-Lines log
- All privileged IPC handlers (`ad:reset-password`, `ad:create-user`, `ad:unlock-account`) write both SUCCESS and FAILURE entries
- Entries include: timestamp, action, operator (Windows username), target (sAMAccountName), result, mock mode flag, machine name, detail
- Each entry is HMAC-SHA256 signed for tamper evidence
- `APP_START` and `APP_STOP` also logged
- Audit log path displayed in Settings → App Info

**Residual Risk:** Low. The log is append-only at the application level but is not write-protected at the OS level — a local admin could delete or modify it. For high-security environments, forward log entries to a SIEM via a separate log collector agent.

---

#### Finding 4 — No application-level session timeout
**Severity:** 🟠 High

**Detail:** The app launched directly into full functionality with no timeout. On shared workstations, an unlocked unattended session could allow unauthorised use.

**Remediation (v3.5.0):**
- `src/main/session-guard.ts` — 15-minute inactivity timer using `setTimeout`
- System sleep and lock-screen events (`powerMonitor`) also trigger the lock
- Renderer receives `session:locked` IPC event and shows a full-screen lock overlay
- Activity (mouse/keyboard) resets the timer via `session:activity` IPC call
- User clicks "Resume Session" to unlock — no re-authentication required (relies on OS session being already authenticated)

**Residual Risk:** Medium. "Resume" does not require password re-entry — it only prevents casual access on unattended workstations. For environments requiring strong re-authentication, integrate Windows Hello via the `systemPreferences.promptTouchID` equivalent (Windows Hello API) — out of scope for this release.

---

#### Finding 5 — `sandbox: false` in BrowserWindow
**Severity:** 🟠 High (partially accepted)

**Detail:** `sandbox: false` is required because the preload script imports from the Electron API. Combined with `contextIsolation: true`, this is acceptable but a stricter posture would use full sandboxing.

**Remediation (v3.5.0):**
- Added `webSecurity: true` (explicit — was default, now documented)
- Added `allowRunningInsecureContent: false`
- Added `navigateOnDragDrop: false` — prevents drag-and-drop navigation attacks
- CSP tightened: removed `https://fonts.googleapis.com` and `https://fonts.gstatic.com` (see Finding 10)
- `setWindowOpenHandler` denies all `window.open()` calls — links open in system browser

**Residual Risk:** Low-Medium. A renderer XSS would still require a separately exploitable vulnerability in the sanitised IPC surface to escalate to the main process. The IPC surface is minimal (no `eval`, no arbitrary code execution channels).

---

#### Finding 6 — Full `process.env` passed to PowerShell child processes
**Severity:** 🟠 High

**Detail:** `{ env: process.env }` in `spawn()` passed the entire Node.js environment — including any sensitive vars inherited from the OS — to every PowerShell child process.

**Remediation (v3.5.0):**
- Replaced with an explicit allowlist of 13 environment variables required for PowerShell and AD module operation: `SYSTEMROOT`, `WINDIR`, `PATH`, `TEMP`, `TMP`, `USERNAME`, `USERDOMAIN`, `USERDNSDOMAIN`, `COMPUTERNAME`, `PSModulePath`, `APPDATA`, `LOCALAPPDATA`, `USERPROFILE`

**Residual Risk:** None. Only operationally required variables are passed.

---

#### Finding 7 — No PowerShell execution timeout
**Severity:** 🟠 High

**Detail:** A hung DC query or slow network could block the main process indefinitely, freezing the UI and preventing any further operations.

**Remediation (v3.5.0):**
- 30-second `setTimeout` added in `powershell.ts` `runPS()` function
- On timeout: `proc.kill()` is called, and a structured error is returned to the caller
- IPC handlers treat this as a failure and return a user-visible error message

**Residual Risk:** None for UI freeze. Legitimate slow AD operations (large directory enumeration) should complete within 30 seconds on any reasonable network.

---

#### Finding 8 — Temporary account password uses non-CSPRNG generator
**Severity:** 🟡 Medium  
*(Addressed as part of Finding 1 — same root cause)*

**Remediation:** See Finding 1. `generateTempPassword()` now uses `crypto.randomInt()`.

---

#### Finding 9 — LDAP wildcard search, server-side cap not enforced
**Severity:** 🟡 Medium

**Detail:** `ResultSetSize 20` was a client-side filter applied after AD returned results — on large directories, the DC still processed the full result set.

**Remediation (v3.5.0):**
- Added `Select-Object -First 20` as a server-side pipeline cap
- The 20-result limit is enforced at the AD query level via `ResultSetSize` and at the pipeline level via `Select-Object`, providing defence in depth

**Residual Risk:** Low. Broad searches on very large directories may still be slow but will not produce unbounded result sets.

---

#### Finding 10 — Google Fonts loaded from external CDN
**Severity:** 🟡 Medium

**Detail:** The HTML/CSP allowed `fonts.googleapis.com` and `fonts.gstatic.com`. This created an external network dependency (broken on isolated corporate networks) and leaked app usage to Google's CDN logging.

**Remediation (v3.5.0):**
- Google Fonts `@import` removed from `index.css`
- Font stack replaced with Windows system fonts: `"Segoe UI"` (UI), `"Consolas"` (mono)
- CSP updated: `font-src 'self'` — no external font origins permitted
- No reduction in visual quality — Segoe UI is the native Windows font

**Residual Risk:** None.

---

#### Finding 11 — Raw PowerShell errors leak AD internal structure
**Severity:** 🟡 Medium

**Detail:** Unhandled PS exceptions included DN paths, OU structure, domain names, and internal AD error codes in toast notifications shown to the operator.

**Remediation (v3.5.0):**
- `sanitiseError()` function added to `ipc-handlers.ts`
- Strips: `CN=`, `DC=`, `OU=` components; hex error codes (`0x80070035`); verbose exception class names
- All `catch` blocks in privileged handlers call `sanitiseError()` before returning to renderer
- Full error detail still written to audit log for IT review

**Residual Risk:** None for information disclosure. Full errors are preserved in the audit log.

---

## Accepted Risks

| Risk | Justification | Mitigation |
|---|---|---|
| `sandbox: false` | Required for contextBridge preload architecture; `contextIsolation: true` provides equivalent protection for this use case | Minimal IPC surface, CSP, no eval |
| Session resume without re-auth | Windows OS session is already authenticated; additional prompt adds friction with no security gain on single-user workstations | 15-min timeout limits exposure window |
| Audit log not forwarded to SIEM | Out of scope for v3.5.0 | Log file path documented; forward with preferred log collector |
| No code signing | Not blocking for internal distribution | Plan for v4.0 release |

---

## AD Delegation Requirements

Minimum permissions required for the service account:

| Operation | AD Permission | Scope |
|---|---|---|
| Password Reset | Reset Password | Target OU(s) only |
| Account Unlock | Unlock Account | Target OU(s) only |
| Create User | Create User Objects, Write all user attributes | Target OU(s) only |
| Group Membership | Write Members | Target security groups only |
| OU Enumeration | Read | All OUs (typically inherited from domain root) |
| User Search | Read all user attributes | All OUs |
| Password Policy | Read domain policy | Domain root (read-only) |

**Configure via:** Active Directory Users and Computers → Right-click OU → Delegate Control

---

## Threat Model Summary

| Threat | Likelihood | Impact | Control |
|---|---|---|---|
| Insider misuse of reset function | Medium | High | Audit log, AD delegation scope |
| Credential theft from disk | Low | High | DPAPI (machine+user bound) |
| LDAP injection | Very Low | High | `esc()` on all inputs + LDAP character strip |
| XSS to privilege escalation | Very Low | High | CSP, contextIsolation, minimal IPC |
| Unattended session | Medium | Medium | 15-min inactivity lock |
| Network interception | N/A | N/A | No network listener; AD via Kerberos |

---

## Compliance Mapping

| Requirement | Standard | Status |
|---|---|---|
| CSPRNG for credentials | NIST SP 800-90A, CIS Control 3 | ✅ Met |
| Privileged action logging | NIST 800-53 AU-2, AU-12 | ✅ Met |
| Credential protection at rest | NIST 800-53 IA-5(7), CIS Benchmark L1 | ✅ Met |
| Session timeout | NIST 800-53 AC-11, CIS Control 4 | ✅ Met |
| Minimal privilege transmission | NIST 800-53 SC-4 | ✅ Met |
| Secure error handling | OWASP A09:2021 | ✅ Met |
| No external CDN dependencies | CIS Benchmark | ✅ Met |

---

*Document prepared by: IT Security / Architecture Review*  
*Next review date: November 2026 or upon major version release*
