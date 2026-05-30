# Changelog — User Creation Tool (UCTool)

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/)

---

## [3.6.7] -- 2026-05-30

### Fixed

- **Disable User page — Minified React error #31** -- 'Objects are not valid as
  a React child (found: object with keys {label, color})'.

  Root cause: `strengthLabel(score)` returns `{ label: string; color: string }`.
  DisableUser.tsx rendered `{strengthLabel(pwStrength.score)}` directly as a
  JSX child instead of `{strengthLabel(pwStrength.score).label}`. React tried
  to render the plain object and threw invariant #31.

  Two additional issues in the same section:
  - Strength criteria map used `pwStrength.upper` / `pwStrength.lower` but
    `PasswordValidation` fields are `uppercase` / `lowercase` (always false =
    strength bar never showed Upper/Lower as met).
  - Policy banner used untyped tuple array `[label, val, warn]` destructuring.
    Replaced with explicit typed object array `{ lbl, val, warn }` to avoid
    esbuild type-widening issues with mixed `(string | number | boolean)[]` tuples.

---


## [3.6.6] -- 2026-05-30

### Fixed

- **VMO and External Auditor templates not appearing** -- `DEFAULT_TEMPLATES` only
  apply when `templates.json` does not yet exist in `%APPDATA%\user-creation-tool\`.
  Once any template is saved (including on first install), the file exists and
  subsequent defaults added in new versions are never loaded.

  Fix: `getTemplates()` now runs a silent migration on every load. After reading
  the saved file, it compares template IDs against `DEFAULT_TEMPLATES`. Any
  defaults whose `id` is not present in the saved file are appended and the
  merged list is written back. User-customised templates are untouched.
  No manual step required — VMO and External Auditor will appear automatically
  on next app launch.

---


## [3.6.5] -- 2026-05-30

### Added

- **Disable User page** (new nav item between Create User and Templates) --
  Full workflow for account offboarding with two use cases:

  Use Case A — Resignation / Notice Period:
    Set an expiry date via date picker. Account remains active until midnight
    on the selected date then disables automatically via AD account expiration.
    Confirmation modal shows plain-English date and explains the user has until
    end of that day. No action required on the last day.

  Use Case B — Immediate Termination:
    Red 'Disable Account Now' button with confirmation modal. Post-operation
    verification re-reads the account to detect silent permission failures
    (same pattern as Enable Account). Service desk contact shown if insufficient
    permissions ('Write userAccountControl' required).

  Step 03 — Force Password Change:
    Same password UI as Reset Password (generate/manual, strength meter, CSPRNG).
    'Must change at next logon' is always set — recommended for immediate
    termination to invalidate any cached credentials.

  IPC: ad:disable-account (with post-verify), ad:set-expiry
  Audit: SETTING_CHANGE with detail=DISABLE_ACCOUNT or SET_EXPIRY:<date>

- **VMO template** (Visiting Medical Officer) -- Clinical Services OU,
  required: Clinical-Read, Scheduling-Access, Internet-Access;
  optional: PACS-View, Pathology-Read, VPN-Users.
  Description notes account expiry is strongly recommended.

- **External Auditor template** -- ExternalAuditors OU, read-only groups,
  required: Audit-Read, FileShare-Read;
  optional: Finance-Read, HR-Read, Internet-Access.
  Description notes expiry should match engagement end date.

### Changed

- **Sidebar numbering removed** -- Nav items no longer show 01/02/03 codes.
  Cleaner visual, matches the 6-item nav (Dashboard, Reset Password,
  Create User, Disable User, Templates, Settings).

---


## [3.6.4] -- 2026-05-27

### Fixed

- **Dashboard fails to load** -- The 3.6.3 Dashboard rewrite called
  `window.api.getSettings()` and `window.api.getTemplates()` directly instead
  of via the `ipc-client` module. Direct calls bypass the `guard()` wrapper
  that checks `typeof window.api !== 'undefined'` before invoking. If `window.api`
  is not yet available when the component mounts (or is briefly undefined during
  the Electron boot sequence), `.then()` is called on `undefined` and throws
  `TypeError: Cannot read properties of undefined`. The ErrorBoundary catches it
  and shows 'Dashboard failed to render'.

  Fix: all Dashboard API calls now use `getSettings()` and `getTemplates()` from
  `../api/ipc-client` which wrap every call in `guard()`. Added `.catch()` on
  both calls so a single failed IPC call cannot crash the component.

---


## [3.6.3] -- 2026-05-27

### Fixed

- **Enable Account silent failure (still disabled after SUCCESS)** --
  `Enable-ADAccount` in some RSAT versions does not throw an error when the
  service account lacks 'Write userAccountControl' permission — it exits 0
  and the audit records SUCCESS, but the attribute is never changed.
  Fix: added a post-enable verification step in the PS script:
  after `Enable-ADAccount`, re-reads the account via `Get-ADUser -Properties Enabled`
  and throws a descriptive error if `$verify.Enabled` is still false.
  The error message explains that 'Write userAccountControl' delegation is required
  and the renderer routes it to the Service Desk contact toast.

- **Enable Account service desk contact** -- When enable fails due to permissions,
  a service desk contact hint is now shown inline below the Enable button
  (not just as a toast) so the operator knows immediately who to call without
  having to remember the toast message.

- **Dashboard shows hardcoded mock stats regardless of mode** --
  Dashboard now listens for `settings:mode-changed` IPC event. Operation Mode
  card shows 'Mock / Demo data' or 'Live AD / Production' reflecting current
  state. Template count is live from `getTemplates()`. Password reset and user
  created counts redirect to the audit log (accurate counts require log parsing
  which is a future enhancement).

### Note on AD delegation for Enable Account

  The 'Reset user passwords' delegation does NOT grant permission to enable/disable
  accounts. To allow the service account to enable disabled accounts, run the
  Delegation of Control Wizard → Create a custom task → User objects →
  'Write Account Restrictions' property (or 'Write userAccountControl' attribute).

---


## [3.6.2] -- 2026-05-27

### Fixed

- **Create user false positive on permission failure** -- `sanitiseError()` was
  stripping error details including 'Access is denied'. Now detects access-denied
  patterns and returns a clear, actionable message. CreateUser page shows a toast
  with the Service Desk contact name and phone (from Settings) when a permission
  error occurs, matching the behaviour of the Reset Password unlock flow.

- **Mock data persists when switching to Production mode** -- Pages loaded
  settings once on mount and had no mechanism to clear state when the mode
  changed. When mock/production mode is toggled in Settings, the main process
  now broadcasts a `settings:mode-changed` IPC event via `BrowserWindow.webContents.send`.
  ResetPassword and CreateUser pages listen for this event and reset all search
  state, selected user, form fields, and cached OUs — ensuring the next operation
  runs against the correct data source.

### Added

- **Enable Account button** -- Account Status panel now shows an 'Enable Account'
  button (blue) when `lockout.enabled === false`. Calls `Enable-ADAccount` via
  the service account credential, then refreshes account status. IPC channel:
  `ad:enable-account`. Audited as `ACCOUNT_UNLOCK` with `detail: ENABLE_ACCOUNT`.

---


## [3.6.1] -- 2026-05-27

### Root cause analysis — 'user not visible in ADUC'

The user WAS created. The audit log entry (action=USER_CREATE, result=SUCCESS,
target=bsmith, detail=OU=LabUsers) and the HMAC signature confirm this.
Active Directory Users and Computers (ADUC) does not auto-refresh — pressing F5
will show the new account. This is standard Windows behaviour.

### Fixed

- **Create User success toast** -- Now shows the exact OU the user was placed in
  and a reminder to press F5 in ADUC to see the new account:
  'Bob Smith created successfully. Location: OU=LabUsers,DC=lab,DC=local.
  Refresh Active Directory Users and Computers (F5) to see the new account.'

- **Trailing apostrophe in Clear-ADAccountExpiration** -- The `expiryLine`
  clear branch ended with `SilentlyContinue'"` — the `'` before the closing `"`
  was emitted into the PS script as a literal trailing apostrophe, producing
  `Clear-ADAccountExpiration ... -ErrorAction SilentlyContinue'` which is a
  PS parse error (unterminated string). Accounts created without an expiry date
  were affected. Removed the extraneous apostrophe. (Regression from v3.4.2.)

---


## [3.6.0] -- 2026-05-27

### Fixed

- **Multi-word display name search fails ('grace lee' not found)** --
  The LDAP filter `(|(displayName=*grace lee*)(givenName=*grace lee*)...)` is
  syntactically valid but cannot match because no AD attribute will contain both
  words separated by a space in one field match. 'grace' matches givenName;
  'lee' matches sn (surname). The correct LDAP structure for multi-word search
  is an AND of ORs: each word must match *some* field.

  New logic: split search term on whitespace into individual words. For a single
  word use the existing OR filter. For multiple words build
  `(&(|(fields=*word1*)(...))(|(fields=*word2*)(...)))` so 'grace lee' finds
  users where one field contains 'grace' AND another (or same) field contains 'lee'.

### Added

- **Domain Password Policy inline on Reset Password page** -- When a user is
  selected, the password policy is auto-loaded from the domain controller and
  displayed as a compact banner above the password field, showing min length,
  complexity, history, max age, and lockout threshold. Policy is fetched once
  per session and reused. Source badge distinguishes Default vs Fine-Grained
  policy. Amber highlight on values outside recommended range (min length < 8,
  complexity off, lockout disabled).

---


## [3.5.9] -- 2026-05-27

### Fixed

- **Success toast shows 'Password for null reset'** -- When an AD user has no
  `DisplayName` attribute set, `Get-ADUser` returns `$null` for that field.
  JSON `null` in a JavaScript template literal becomes the string `"null"`.
  Fixed at two layers:
  1. PowerShell (`adGetUser`, `adSearchUsers`): `if ($u.DisplayName) { $u.DisplayName }
     else { $u.SamAccountName }` — null display name never reaches the renderer.
  2. Renderer (`ResetPassword.tsx`): `selectedUser.displayName || selectedUser.sAMAccountName`
     as fallback in the toast message, user card header, and confirmation modal.

- **Search placeholder 'John Smith' implied display name search didn't work** --
  Display name search IS supported (the LDAP filter includes `displayName=*...*`).
  It was broken by the empty-results bug fixed in v3.5.8. Placeholder updated to:
  'username, display name or email — e.g. jsmith or John Smith'.

- **User card avatar shows single initial** -- Guard added so avatar falls back
  to first character of sAMAccountName if givenName is not populated in AD.

---


## [3.5.8] -- 2026-05-27

### Fixed

- **Account Status blank — WhatIf output polluting JSON stdout** --
  `Unlock-ADAccount -WhatIf` writes 'What if: Performing the operation...' to
  PowerShell's information stream (stream 6) in addition to stdout. The previous
  `2>&1 | Out-Null` only redirected stderr; the information stream still leaked
  into stdout before the JSON output, causing `runPSJson` to throw
  'non-JSON output'. Fixed two ways:
  1. Changed to `$null = (... 2>&1 3>&1 4>&1 5>&1 6>&1)` which redirects all
     PS streams (error, warning, verbose, debug, information) to $null.
  2. `runPSJson` now scans output lines and skips everything before the first
     line starting with `{` or `[` — defensive against any future informational
     output that might precede the JSON block.

- **Multi-word search ('bob smith') returns non-JSON error** --
  `Get-ADUser -LDAPFilter` with a multi-word term finds no accounts with a
  space in their sAMAccountName (none exist). `ConvertTo-Json` on an empty
  PS result set outputs nothing, not `[]`. `runPSJson` received empty string
  and threw 'non-JSON output'. Fixed by wrapping the results check:
  if results exist, convert to JSON; else `Write-Output '[]'`. The search
  now correctly returns an empty results list and the UI shows
  'No users found matching "bob smith"'.

---


## [3.5.7] -- 2026-05-27

### Fixed

- **Account Status panel blank / not loading** -- Two issues:

  1. `adGetLockoutStatus` used a typed catch clause
     `catch [System.UnauthorizedAccessException]` which is valid PowerShell
     but requires the type to be loaded before the catch block is compiled.
     In some AD environments this type isn't pre-loaded, causing PS to throw
     a parse error rather than enter the catch, aborting the entire script.
     Fixed by using a generic `catch` with `$_.Exception.Message -match` string
     check for access-denied patterns.

  2. Conditional assignment using `if (...) { value } else { $null }` inline
     in the `[PSCustomObject]` block can produce unexpected output when the
     condition fails in strict mode. Replaced with pre-computed `$bpt` / `$pls`
     variables set before the object literal.

  3. `fetchLockout` in `ResetPassword.tsx` silently did nothing on failure
     (`if (res.success && res.data)` — else branch empty). Now shows a
     warning toast with the actual error message so failures are diagnosable.

  4. Service account credential now also passed to `Get-ADUser` in the
     lockout status query, consistent with other AD operations.

---


## [3.5.6] -- 2026-05-26

### Fixed

- **User search ParserError: Missing argument in parameter list** -- All PowerShell
  scripts inside TypeScript template literals were using `\\` (backslash) for
  line continuation. In a JS/TS template literal `\\` becomes a single `\` in
  the evaluated string. PowerShell's line continuation character is a backtick
  not a backslash, so the generated scripts had literal backslashes mid-command,
  producing `ParserError: Missing argument in parameter list`. ANSI escape codes
  in the PS error output garbled the display in the app.

  Affected functions: `adSearchUsers`, `adGetOUs`, `adGetLockoutStatus`.
  Fix: collapsed all multi-line PS commands into single-line calls.

### Added

- **PowerShell 7 bundled install** -- Place `PowerShell-7.6.2-win-x64.msi`
  in the same folder as `UCTool-Setup.exe` before running the installer.
  The NSIS `customInstall` macro checks if `pwsh.exe` is already on PATH via
  `where pwsh.exe`. If not found, it looks for the MSI alongside the installer
  (`$EXEDIR\PowerShell-7.6.2-win-x64.msi`) and installs it silently via
  `msiexec /quiet /norestart`. If neither pwsh nor the MSI is present, a
  DetailPrint message is shown and setup continues (non-fatal).

---


## [3.5.5] -- 2026-05-26

### Fixed

- **Explorer crash / taskbar disappears during install and uninstall** --
  `installer-extra.nsh` contained `taskkill /f /im explorer.exe` in both
  `customInstall` and `customUninstall` macros. This forcibly terminated the
  Windows shell process during setup, causing the taskbar to disappear.
  Although `start explorer.exe` was called afterwards, the timing was unreliable
  and users saw a blank desktop mid-install.

  The Explorer kill was added as a workaround for icon cache staleness, under
  the assumption that the icon was not being embedded into the exe PE resources.
  Since v3.5.2 confirmed the icon IS correctly embedded (rcedit working via the
  package.json build config fix), the cache flush workaround is no longer needed.
  Removed entirely from both macros.

---


## [3.5.4] -- 2026-05-26

### Fixed

- **Installer does not remove previous version** -- Pre-3.5.3 builds used
  `electron-builder.config.ts` with a broken `__dirname` reference. When
  electron-builder couldn't read `productName`, it fell back to the `package.json`
  `name` field (`user-creation-tool`) and registered the app in Add/Remove Programs
  under that key. The 3.5.3 installer registered under `User Creation Tool` (correct
  `productName`), leaving both entries in the registry with different GUIDs.

  Fix: `customInstall` macro now checks three registry locations for
  `user-creation-tool` (HKLM, HKLM WOW64, HKCU) and silently uninstalls
  any found entry via `ExecWait '"$R0" /S'` before the new version installs.
  Uses NSIS `$R0` register variable (valid built-in). No PowerShell variables
  with `$` remain in NSIS context, so warning 6000 cannot recur.

---


## [3.5.3] -- 2026-05-26

### Fixed

- **NSIS warning 6000: unknown variable 'null'** -- `installer-extra.nsh` contained
  a multi-line PowerShell command that used `$null` and `$m` inside the NSIS
  `nsExec::ExecToLog` string. NSIS parses `$...` as its own variable references
  even inside single-quoted strings. `$null` is not a defined NSIS variable, so
  NSIS emitted warning 6000. electron-builder treats NSIS warnings as errors.
  Fix: replaced the conditional check with a single idempotent
  `Add-WindowsCapability ... -ErrorAction SilentlyContinue` call.
  `Add-WindowsCapability` is already a no-op when RSAT is installed -- the
  `$null` check was redundant. No PowerShell variables with `$` remain
  in the NSIS script outside of shell-executed strings.

### Note

- Icon fix confirmed working -- UCT amber icon visible on both
  `UCTool-Setup-3.5.2.exe` and uninstaller in Explorer (screenshot confirmed).
  This build (3.5.3) is the first clean end-to-end build: icon embedded
  correctly AND installer produced without errors.

---


## [3.5.2] -- 2026-05-26

### Fixed

- **Desktop icon and shortcut name — definitive fix.**

  Root cause 1: `electron-builder.config.ts` used `resolve(__dirname, 'resources/icon.ico')`.
  electron-builder processes `.ts` config via ts-node, which depending on tsconfig
  `module` setting treats it as ESM. In ESM `__dirname` is undefined.
  `resolve(undefined, ...)` throws — electron-builder received no icon path,
  rcedit was never called, the exe PE resources kept the default Electron atom icon.

  Root cause 2: ICO contained non-standard sizes (24, 64, 128px). rcedit is only
  validated against the 4 standard Windows sizes: 16, 32, 48, 256. Non-standard
  sizes cause rcedit to exit silently without embedding.

  Fix: deleted `electron-builder.config.ts` entirely. Moved the entire
  electron-builder configuration into `package.json` under `"build"` key.
  `package.json` is plain JSON — no TypeScript compilation, no `__dirname`,
  no ESM/CJS ambiguity, no ts-node. Paths are relative strings resolved by
  electron-builder from the project root. This is the approach used in
  electron-builder's own documentation examples.

  ICO rebuilt with exactly 4 frames: 16, 32, 48 (BMP/BITMAPINFOHEADER/BI_RGB),
  256 (PNG). Verified rcedit-compatible via Node.js binary header parsing.

  Verification performed before packaging:
  - All 5 icon path references resolve to existing file ✓
  - ICO header: reserved=0, type=1, count=4 ✓
  - All BMP frames: hdr=40 (BITMAPINFOHEADER), compression=0 (BI_RGB), bpp=32 ✓
  - package.json valid JSON, all required build keys present ✓
  - No electron-builder.config.* file present to override package.json ✓

---



## [3.5.1] -- 2026-05-23

### Fixed

- **Settings.tsx** -- `setAuditPath is not defined`. The `useState` declaration for
  `auditPath` / `setAuditPath` was never inserted — only the `useEffect` call that
  used it was patched. Added `const [auditPath, setAuditPath] = useState('')`.

---


## [3.5.0] -- 2026-05-23  (Security Release)

> Internal CISO security review completed. All 11 findings addressed.
> See SECURITY.md for full findings, remediations, and compliance mapping.

### Security Fixes

- **[CRIT-1] CSPRNG throughout password generation** -- `Math.random()` removed entirely.
  Renderer Fisher-Yates shuffle: `crypto.getRandomValues()`. Main process temp password:
  `crypto.randomInt()`. No `Math.random()` remains in any production code path.

- **[CRIT-2] Service account credential wired into AD operations** -- `buildCredentialParam()`
  added to `powershell.ts`. Decrypts DPAPI blob at call time, builds `PSCredential` in
  memory, injects `-Credential $cred` into `Set-ADAccountPassword` and `Unlock-ADAccount`.
  Falls back to current Windows identity if no credential is configured.

- **[CRIT-3] Audit log** -- `src/main/audit-log.ts` new module. Structured JSON-Lines,
  append-only, HMAC-SHA256 tamper-evident signatures. Audits: PASSWORD_RESET,
  ACCOUNT_UNLOCK, USER_CREATE, USER_SEARCH, LOCKOUT_CHECK, SETTING_CHANGE,
  CREDENTIAL_SAVE/CLEAR, APP_START, APP_STOP. Includes operator, target,
  result, mock mode flag, machine name. NIST 800-53 AU-2/AU-12 compliant.

- **[HIGH-4] Session inactivity timeout** -- `src/main/session-guard.ts`. 15-minute timer.
  System suspend and lock-screen events also trigger lock. Renderer shows full-screen
  lock overlay. Activity resets timer via IPC heartbeat.

- **[HIGH-5] Electron security hardening** -- Added `webSecurity: true`,
  `allowRunningInsecureContent: false`, `navigateOnDragDrop: false`.

- **[HIGH-6] Minimal PowerShell environment** -- `{ env: process.env }` replaced with
  13-variable allowlist. Sensitive Node.js env vars no longer passed to child PS processes.

- **[HIGH-7] PowerShell execution timeout** -- 30-second `setTimeout` in `runPS()`.
  Kills hung processes, returns structured error.

- **[MED-9] LDAP result cap hardened** -- Added `Select-Object -First 20` pipeline cap
  alongside existing `ResultSetSize 20`. Defence in depth.

- **[MED-10] Google Fonts CDN removed** -- `@import` removed from `index.css`. System
  fonts: `Segoe UI` + `Consolas`. CSP tightened to `font-src 'self'`. No external
  origins in any CSP directive.

- **[MED-11] AD error sanitisation** -- `sanitiseError()` strips DN paths, OU components,
  hex error codes from user-facing messages. Full errors preserved in audit log.

### Added

- `SECURITY.md` -- Comprehensive security documentation covering architecture, all 11
  findings, remediations, accepted risks, AD delegation requirements, threat model,
  and compliance mapping (NIST 800-53, CIS Benchmark, OWASP).

---


## [3.4.2] -- 2026-05-23

### Fixed

- **`ad-operations.ts` line 188** -- Unterminated string literal. The `Clear-ADAccountExpiration`
  branch of `expiryLine` ended with `SilentlyContinue'` (apostrophe outside the closing `"`)
  instead of `SilentlyContinue'"`. esbuild saw an unclosed double-quoted string.

---


## [3.4.1] -- 2026-05-23

### Fixed

- **`getPasswordPolicy` missing from `window.api` declaration** -- `electron.d.ts`
  was not updated when the method was added, causing a TypeScript compile error.
  Added `getPasswordPolicy:(username?: string) => Promise<ApiResponse<PasswordPolicy>>`
  to the `Window.api` interface.

- **`ipcMain.handle` optional parameter syntax** -- `async (_evt, username?: string)`
  is not valid in strict TypeScript for an ipcMain callback. Changed to
  `username: string | undefined` which is semantically identical and type-safe.

- **Account expiry date field not rendered** -- The `type="date"` input was not
  inserted into `CreateUser.tsx` because the replacement pattern used a different
  quote style than the source file. Added directly with exact string matching.

---


## [3.4.0] -- 2026-05-23

### Added

- **Account expiry date** (Create User, Step 02) -- Optional date picker spanning the full
  form width. Clamped to today as minimum. On selection, shows plain-English confirmation:
  'Account will expire on Wednesday, 23 July 2026'. Clear button removes the expiry.
  Backend: `Set-ADAccountExpiration` if a date is provided, `Clear-ADAccountExpiration`
  otherwise. Pre-computed outside the template literal to avoid nested backtick issues.
  Included in the Review modal before account creation.

- **Domain Password Policy viewer** (Settings page) -- Click 'Load Policy' to query the
  domain controller. Shows in a grid:
    - Minimum password length
    - Complexity required (Yes/No)
    - Password history count
    - Maximum / minimum password age
    - Lockout threshold, duration, and observation window
    - Reversible encryption status (flagged amber if enabled)
  Policy source badge distinguishes Default Domain Policy vs Fine-Grained Password Policy.
  Fine-grained lookup: `Get-ADUserResultantPasswordPolicy -Identity <user>` (falls back
  to `Get-ADDefaultDomainPasswordPolicy` if no FGP applies or no user specified).
  Windows complexity rules explained inline when complexity is enabled.

### Fixed

- **ICO format** -- Rebuilt with BITMAPINFOHEADER (40-byte header, BI_RGB compression).
  rcedit requires BI_RGB for 32bpp ICO frames; previous BITMAPV4HEADER (108-byte,
  BI_BITFIELDS) was causing rcedit to silently skip icon embedding, leaving the default
  Electron atom icon in the packaged exe PE resource table.

- **installer-extra.nsh** -- Added `del /f /q IconCache.db` and
  `del /f /q iconcache*` from `%LOCALAPPDATA%\Microsoft\Windows\Explorer` before
  restarting Explorer. This forces Windows to rebuild the icon cache immediately
  after install rather than showing the stale cached icon.

- **Shortcut name** -- `electron-builder.config.ts` documented that `productName`
  drives the desktop shortcut label on Windows, not `shortcutName` alone.
  Both are now set to 'User Creation Tool' and the ICON constant is used consistently
  across `icon`, `win.icon`, `nsis.installerIcon`, `nsis.uninstallerIcon`,
  `nsis.installerHeaderIcon`.

---


## [3.3.2] -- 2026-05-23

### Changed

- **Reset Password — Step 01 description updated** to make it explicit that the
  Account Status panel and Password Reset section appear *after* a user is selected.
  The search step is intentionally minimal — everything else is revealed progressively.

- **Mock mode hint** added below the search box when no user has been selected yet:
  shows 'try jsmith or rjohnson' so users can immediately test the full flow.
  Only visible when results and selectedUser are both null.

---


## [3.3.1] -- 2026-05-23

### Fixed

- **ResetPassword.tsx** -- `useEffect` was used inside the component but not included
  in the React import. Added to `import { useState, useEffect } from 'react'`.

---


## [3.3.0] -- 2026-05-23

### Added

- **Account Status / Lockout panel** (Reset Password page) -- Automatically queries
  AD when a user is selected. Displays:
    - Enabled / Disabled account status
    - Locked Out flag (with last bad attempt timestamp and bad logon count)
    - Password Expired flag
    - Password Last Set date
  PowerShell: `Get-ADUser -Properties LockedOut, BadLogonCount, BadPasswordTime,
  PasswordExpired, PasswordLastSet`.

- **Permission-aware Unlock button** -- After checking lockout status, runs
  `Unlock-ADAccount -WhatIf` against the configured service account to verify
  it has the AD 'Unlock Account' permission on that user's OU:
    - Has permission: 'Unlock Account' button shown; calls `Unlock-ADAccount`
      then re-fetches status to confirm
    - No permission (UnauthorizedAccessException on -WhatIf): service desk
      contact card shown with name and phone number from Settings

- **Service Desk Contact** (Settings page) -- Two new fields: service desk name
  and phone number. Displayed on the Reset Password page when the current
  account lacks unlock permissions. Configurable without a rebuild.

- `AppSettings` extended with `serviceDeskName` and `serviceDeskPhone` fields.
  Default: name='IT Service Desk', phone='' (empty until configured).

- `ad:lockout-status` and `ad:unlock-account` IPC channels.

---


## [3.2.8] -- 2026-05-23

### Added

- **Username existence check** -- As the user types a username, a 600ms debounced
  call to `ad:check-username` runs `Get-ADUser -Identity` against the domain (or
  checks mock data in mock mode). Status indicator shows: checking / Available / Taken.
  When taken, three numbered alternatives are shown (e.g. jsmith2, jsmith3, jsmith4)
  as clickable buttons. Selecting one re-checks availability. The Review & Create
  button is disabled while the check is in progress.

- **Clone from existing user** (Step 03) -- Enter any existing user's sAMAccountName
  or UPN to copy their AD profile to the new account. Copies:
    - Target OU (derived from the source user's DistinguishedName)
    - All group memberships (via Get-ADPrincipalGroupMembership, excluding Domain Users)
    - Department, Title, Office attributes
  Overrides any template selection. Cleared with the 'Clear Clone' button.
  IPC channel: `ad:get-clone-source` -- production PS: `Get-ADUser -Properties
  Department,Title,Office,MemberOf` + resolve each group to sAMAccountName.

### Changed

- **Department field** -- Changed from mandatory dropdown to optional free-text input.
  A `<datalist>` provides suggestions for common values without enforcing a fixed list.

- **Phone field** -- Changed from optional to mandatory. Validated against a loose
  pattern allowing international formats (+61 2 0000 0000, ext, brackets, hyphens).

- **Mandatory field indicator** -- Red asterisks added to all required fields:
  First Name, Last Name, Username, Email, Job Title, Phone, Target OU.

---


## [3.2.7] -- 2026-05-23

### Fixed

- **Unterminated string literal in ipc-handlers.ts** -- The RSAT install handler was
  written by a Python script that interpreted `\n` escape sequences as literal newlines
  inside JS single-quoted strings, producing unterminated string literals that esbuild
  rejected. Rewritten as an array of strings joined with `'\\n'` and using explicit
  string concatenation (no template literals or embedded newlines) throughout.

---


## [3.2.6] -- 2026-05-23

### Fixed

- **RSAT elevation** -- Previous approach spawned a child PowerShell that then tried to
  launch another instance via -Verb RunAs, but quoting through three shell layers caused
  the command to fail silently. Rewritten: a temp .ps1 file is written to the system
  temp directory, then `Start-Process powershell.exe -ArgumentList "-File <path>" -Verb RunAs -Wait`
  is called from a single PowerShell process. This is the canonical Windows pattern for
  UAC elevation from a non-elevated context. `windowsHide: false` is required -- the UAC
  prompt is a visible desktop dialog that cannot appear if the parent is hidden.

- **ICO format for rcedit** -- Rebuilt with BITMAPV4HEADER (108-byte header) and
  BI_BITFIELDS compression with explicit BGRA channel masks. rcedit (the tool electron-
  builder uses to embed the ICO into the exe PE resource table via UpdateResource) has
  stricter ICO parsing than Windows shell -- it requires the V4 header for 32bpp images.
  Previous builds used BITMAPINFOHEADER (40 bytes) which rcedit accepted but produced an
  incorrect PE resource entry. The V4 header version embeds cleanly and Windows shell,
  taskbar, Alt-Tab, and Start Menu all show the correct icon without a cache flush.

- **Shortcut name / old shortcut cleanup** -- NSIS `customInstall` macro now explicitly
  deletes all known previous shortcut names (`user-creation-tool.lnk`, `UCTool.lnk`,
  `User Creation Tool.lnk`) before electron-builder creates the new one. This handles
  upgrades where the old shortcut persisted under the wrong name.

- **NSIS customInstall macro** -- Converted `installer-extra.nsh` to use electron-
  builder's `!macro customInstall` / `!macro customUninstall` conventions. These macros
  are automatically invoked by electron-builder's generated NSIS script at the correct
  points in the install/uninstall flow.

- **UCTool-Overview.txt** -- Removed all version numbers. This is a one-time document
  that does not need to be updated with each release.

---


## [3.2.5] -- 2026-05-23

### Fixed

- **RSAT section** -- Replaced the static PowerShell command display with an
  'Install / Update RSAT' button. Clicking it spawns an elevated PowerShell window
  via `Start-Process -Verb RunAs`, triggering UAC. In a corporate environment where
  the current user is not a local admin, the UAC prompt asks for admin credentials.
  After installation, status auto-refreshes. A separate 'Check RSAT Status' button
  allows re-verification without re-installing.

- **Desktop/taskbar icon not updating** -- Two fixes:
  1. Icon path in main process changed to use `process.resourcesPath` in the packaged
     app (previously relative `__dirname` path was invalid after packaging).
  2. `electron-builder.config.ts` now uses `resolve(__dirname, 'resources/icon.ico')`
     (absolute path) for both `icon` at the root level and within `win` and `nsis`
     sections, ensuring the ICO is correctly embedded into the exe PE resource table.
  3. NSIS installer calls `ie4uinit.exe -show` + restarts Explorer post-install to
     force Windows icon cache refresh immediately.

- **Installer filename** -- Added `artifactName: 'UCTool-Setup-${version}.exe'` to
  the NSIS section. Previously electron-builder used `productName` (with spaces) as
  the artifact base, producing 'user-creation-tool Setup 3.2.4.exe'. Output is now
  `UCTool-Setup-3.2.5.exe`.

- **Shortcut display name** -- `shortcutName: 'User Creation Tool'` was already set;
  confirmed `executableName: 'UCTool'` produces the correct exe name while keeping
  the shortcut label as 'User Creation Tool' as requested.

---


## [3.2.4] -- 2026-05-22

### Added

- **RSAT auto-install in NSIS installer** -- `resources/installer-extra.nsh` now contains
  a `UCT_INSTALL_RSAT` macro that calls `Add-WindowsCapability` during setup.
  Checks current install state first; skips if already installed; non-fatal if it fails
  (app still launches in mock mode). Detects Windows Server and skips the capability
  command (Server uses Add-WindowsFeature, which requires manual install).

- **Service account credentials in Settings** -- New 'Service / Admin Account' section
  with username and password fields. Password is encrypted with Windows DPAPI
  (`ProtectedData.Protect`, `CurrentUser` scope) before writing to disk.
  Plaintext is never stored. Encrypted blob is bound to the current Windows user
  account on the current machine. Compliant with CIS Benchmark L1 credential
  storage controls and NIST SP 800-53 IA-5(7). Only username and timestamp are
  returned to the renderer -- the encrypted blob stays in the main process.
  `ipcMain` channels: `cred:save`, `cred:load`, `cred:clear`.

- **New ICO with raw pixel-art BMP frames** -- Previous Pillow rounded_rectangle BMP
  encoding was producing non-standard headers that Windows shell rejected at small sizes.
  Rebuilt using direct BITMAPINFOHEADER DIB encoding with pixel-perfect box-drawing
  and anti-aliased corner rounding via manual distance calculation. BMP for 16-128px,
  PNG for 256px. Tested at 16, 24, 32, 48, 64, 128, 256px.

- **UCTool-Overview.txt** -- GitHub-ready plain-text overview file covering:
  features, security model (DPAPI), RSAT requirements, installation, system
  requirements, build instructions, storage locations, and technology stack.

### Fixed

- All remaining references to test domain removed from CHANGELOG (historical entries
  updated to use generic placeholders).

---


## [3.2.3] -- 2026-05-22

### Fixed

- **ipc-client.ts line 38** -- `export const` arrow functions with explicit return-type
  annotations spanning two lines placed `=>` on a new line, which esbuild rejects.
  All exports rewritten as single-line declarations. Same esbuild rule as the earlier
  if/else bare-body errors: JSX attribute expressions and arrow function syntax both
  require `=>` on the same line as the parameter list.

---


## [3.2.2] -- 2026-05-22

> Root cause of window.api undefined finally resolved. README fully updated.

### Fixed

- **window.api undefined** -- Root cause was adding "type": "module" to package.json in v3.1.1.
  Node.js treats .js files as ESM; electron-vite outputs preload as CJS require() syntax;
  Node.js refuses to execute CJS in an ESM file; preload throws before contextBridge runs;
  window.api is never defined. Fix: removed "type": "module" from package.json.
  Converted postcss.config.js to postcss.config.cjs with module.exports syntax.

- **Defensive guard in ipc-client.ts** -- guard() wrapper checks window.api before every call.
  Returns a structured error message instead of throwing TypeError if bridge is unavailable.

### Changed

- postcss.config.js renamed to postcss.config.cjs
- electron.vite.config.ts css.postcss updated to postcss.config.cjs
- README fully rewritten with all versions, known issues, troubleshooting

---


## [3.2.1] -- 2026-05-22

> Critical fix: window.api undefined on Settings and Create User pages. Close button now fully quits.

### Fixed

- **window.api undefined** -- Root cause: preload imported `electronAPI` from `@electron-toolkit/preload`.
  electron-vite externalises this package (does not bundle it). In the packaged app, the runtime
  require fails silently, throwing before `contextBridge.exposeInMainWorld('api', ...)` runs.
  window.api is therefore undefined for all renderer code. Preload now has zero external dependencies
  -- only imports `contextBridge` and `ipcRenderer` from 'electron', which is always available.
  Removed `@electron-toolkit/preload` and `@electron-toolkit/utils` from package.json.

- **X button did not close the app** -- Added `mainWindow.on('close', () => app.quit())`.
  Previously the app kept running in the system tray. Now X = fully quit.

- **Tray Open did not restore the window** -- After the window was destroyed, mainWindow was null.
  The openWindow() helper now calls createWindow() to re-create it if needed.

- Replaced `@electron-toolkit/utils` is.dev check with `process.env.NODE_ENV === 'development'`.

---


## [3.2.0] — 2026-05-22

> Desktop icon fix, user search with disambiguation, ErrorBoundary, shortcut name.

### Fixed

- **Desktop icon showing Electron default** — Rebuilt `resources/icon.ico` with BMP-encoded DIB frames for sizes 16–128 px (only 256 px remains PNG-compressed). Windows shell and electron-builder's exe resource embedder both prefer BMP-encoded frames for smaller sizes; the previous PNG-compressed ICO was not being picked up by the Windows shell icon renderer.
- **Shortcut name** — Added `executableName: 'UCTool'` to `electron-builder.config.ts` and verified `shortcutName: 'User Creation Tool'`. The desktop shortcut and Start Menu entry will now show "User Creation Tool" as the display name.
- **Create User blank screen** — The `if (validate()) a else b` syntax error from v3.1.1 was the root cause. Added `ErrorBoundary` component (class-based, required by React's `componentDidCatch` API) so that if any page throws during render, a clear error message and "← Go Back" button are shown instead of a blank window.

### Added

- **User search with disambiguation** (Reset Password page):
  - Search is now partial-match: entering "smith" returns all users with "smith" in their name, username, or email
  - Single match → auto-selects immediately (no extra click)
  - Multiple matches → shows a picker list with full organisation details: Title, Department, Office/Site, Manager, Email, Description (from AD `description` attribute)
  - After selection, the full user org card is shown so the super-user can confirm the correct person before resetting
  - Confirmation modal shows Name, Username, Department, Title, and Site
- **`adSearchUsers()`** in main process — uses `Get-ADUser -LDAPFilter` for partial matching across `samAccountName`, `userPrincipalName`, `displayName`, `givenName`, `sn`; pulls `Description`, `City`, `Manager` (resolved to display name) in addition to standard fields; `ResultSetSize 20` cap
- **`ErrorBoundary`** component — class component wrapping each page individually (keyed by `page` in `App.tsx` so it resets on navigation); shows error message, "← Go Back" (navigates to Dashboard), and "Reload App" button; stack trace visible in dev mode
- `UserSearchResult` interface in `types/index.ts` with `city`, `description`, `manager` fields
- `ad:search-users` IPC channel

---


## [3.1.1] — 2026-05-22

> Two-line build fix.

### Fixed

- **`CreateUser.tsx` line 320** — bare `if (x) a else b` without braces is invalid inside a JSX attribute expression in esbuild. Fixed by wrapping both branches in `{ }`.
- **`ResetPassword.tsx` line 134** — same pattern in the password mode toggle button. Fixed with braces.
- **`postcss.config.js` ESM warning** — added `"type": "module"` to `package.json`. The project was already full ESM; the missing field caused Node to reparse the postcss config on each build, adding unnecessary overhead.

---


## [3.1.0] — 2026-05-22

> Build fix, universal domain support, AD domain auto-detection, OU browser in Create User and Templates.

### Fixed

- **Critical build failure** — `$Args` is a PowerShell reserved automatic variable. The `Invoke-Cmd` function parameter named `$Args` shadowed it, causing the function to splat an empty array. npm received no arguments, printed its help text, and exited 1. Renamed to `$CmdArgs` throughout `build.ps1`.

### Added

- **AD domain auto-detection** (Settings page) — "Auto-Detect Domain" button runs a three-stage detection: `Get-ADDomain` (RSAT), `$env:USERDNSDOMAIN` (environment variable, no RSAT needed), then WMI `Win32_ComputerSystem`. Detected `dnsRoot` auto-fills the Email Domain field if it's empty.
- **OU browser** on Create User page — "Load from AD" button calls `Get-ADOrganizationalUnit -Filter *`, returns all OUs with human-readable path (e.g. `Users > IT`). Dropdown replaces the manual DN text field. Falls back to manual text entry if AD is unavailable.
- **OU browser** on Templates editor — same AD OU dropdown via reusable `OUSelector` component. Manual entry fallback retained.
- `ad:detect-domain` IPC channel — main → `adDetectDomain()` → structured `DomainInfo` object
- `ad:get-ous` IPC channel — main → `adGetOUs()` → `OrgUnit[]` with `name`, `distinguishedName`, `path`
- `OrgUnit` and `DomainInfo` interfaces in `types/index.ts`
- New mock OU set in `ad-operations.ts` for development without AD

### Changed

- **Universal app** — all hardcoded `hardcoded domain references removed from every file:
  - `electron-builder.config.ts` appId: `local.org.uctool` → `com.yourorg.uctool`
  - `templates-store.ts` default templates now have empty `targetOU` (set via OU browser)
  - Default `emailDomain` setting is now empty string (auto-detected or manually set in Settings)
  - `.env.example` `VITE_EMAIL_DOMAIN` left blank
  - Sidebar footer "[domain]" → "Active Directory"
  - ResetPassword placeholder updated to generic `yourdomain.local`
- Create User email domain now read from `window.api.getSettings()` at runtime — reflects changes from Settings page without rebuild
- Settings page: "Email Domain" field now shows auto-detect button alongside manual entry

---


## [3.0.0] — 2026-05-22

> **Architecture rewrite — Electron desktop application.**
> Eliminates the three-process web architecture (Vite dev server + PS HTTP API + browser).
> The app is now a single native `.exe` that runs standalone.

### Why this rewrite was necessary

The v2.x web architecture had three fundamental problems visible in user testing:

1. **`localhost:5173 ERR_CONNECTION_REFUSED`** — The installer shortcut pointed at the Vite dev server port. Nothing served the frontend after install because the dev server was never running. The built `dist/` files had no server behind them.
2. **Desktop icon showed CMD window** — The shortcut launched `cmd.exe /c start http://localhost:5173`. Windows used `cmd.exe`'s icon, not the application icon.
3. **Three separate processes required** — Frontend dev server, PowerShell HTTP backend, and RSAT all had to be started manually before the UI was usable. Not viable for helpdesk staff.

Electron solves all three in one step.

### Added

**Electron Main Process (`src/main/`)**
- `index.ts` — `BrowserWindow` (1280×820, min 960×640), system tray with Open/Quit menu, auto-show after `ready-to-show` to prevent white flash
- `powershell.ts` — `runPS()` / `runPSJson<T>()` helpers using `child_process.spawn`; tries `pwsh.exe` (PS7) then falls back to `powershell.exe`; `esc()` sanitises user input against PS injection
- `ad-operations.ts` — `adGetUser`, `adResetPassword`, `adCreateUser`; each has a mock path (no domain required) and a production path (real PS + AD cmdlets); mock users `jsmith` and `rjohnson` seeded
- `ipc-handlers.ts` — all `ipcMain.handle()` registrations: `ad:get-user`, `ad:reset-password`, `ad:create-user`, `ad:check-module`, `templates:get/save/delete`, `settings:get/save`
- `templates-store.ts` — JSON persistence to `%APPDATA%\user-creation-tool\`; default templates seeded on first run (IT Standard, Clinical Staff, External Contractor); `getSettings()` / `saveSettings()` for mock mode + email domain

**Preload (`src/preload/index.ts`)**
- `contextBridge.exposeInMainWorld('api', {...})` — secure typed bridge; no Node.js APIs exposed to renderer; all communication via `ipcRenderer.invoke`

**Renderer (`src/renderer/`)**
- `src/api/ipc-client.ts` — replaces HTTP `client.ts`; identical function signatures so all page components required zero changes
- `src/types/electron.d.ts` — `window.api` TypeScript declaration
- `src/pages/Settings.tsx` — **new page**: Mock Mode toggle (amber = mock, green = production), email domain field, AD Module availability check, app info panel
- Sidebar updated: Settings nav item (⚙) added with divider; footer changed from "API Connected" to "Electron Desktop App"
- `CreateUser.tsx` — email domain now loaded from `window.api.getSettings()` at runtime (reflects Settings changes without rebuild)
- Navigation type `NavPage` extended with `'settings'`

**Packaging**
- `electron.vite.config.ts` — single config for main, preload, and renderer (React/Vite) builds
- `electron-builder.config.ts` — NSIS installer: per-machine install, `C:\Program Files\User Creation Tool\`, desktop + Start Menu shortcuts, correct icon on all installer surfaces, no app data deleted on uninstall
- `resources/icon.ico` — same 7-size ICO (16–256px) used for window titlebar, taskbar, Alt-Tab, Start Menu, installer wizard, desktop shortcut

**Build script**
- `build.ps1` — 4 steps: prerequisites → `npm install` → `electron-vite build` → `electron-builder`; `-FrontendOnly`, `-PackageOnly`, `-Clean` flags; timestamped log
- `build.bat` — thin launcher (same pattern as v2.x)

### Changed

- Templates default domain updated: `DC=corp,DC=local` → `DC=[org],DC=local`; added Clinical Staff template
- Version bumped to `3.0.0` across all files

### Removed

- `backend/UCTool-Backend.ps1` — replaced by `src/main/ad-operations.ts` + `src/main/powershell.ts`
- `backend/Start-UCTool.ps1` — no longer needed; main process starts automatically
- `installer.nsi` — replaced by electron-builder's built-in NSIS generation
- HTTP API (all 6 REST endpoints) — replaced by IPC channels

---

## [2.1.5] — 2026-05-22

> Logo applied. NSIS installer fixed. Build succeeds end-to-end.

### Added
- Option B logo: `assets/icon.ico` — 7 sizes (16–256 px), 32-bit RGBA, PNG-compressed
- Inline SVG `BrandLogo` in `Sidebar.tsx`
- Favicon updated to match Option B

### Fixed
- `installer.nsi` `PRODUCT_VERSION` hardcoded `2.0.0` — now injected via `/DPRODUCT_VERSION`
- `MUI_ICON` caused hard abort when `assets\icon.ico` missing — guarded with `!if /FileExists`
- `LICENSE.txt` auto-created as stub by `build.ps1` if absent
- Product name corrected to "User Creation Tool" throughout installer
- GitHub URLs updated from `ad-toolkit` to `user-creation-tool`

---

## [2.1.4] — 2026-05-22

> Single-file fix — `vite-env.d.ts` missing caused TypeScript build failure.

### Fixed
- `src/vite-env.d.ts` added: `/// <reference types="vite/client" />` resolves `Property 'env' does not exist on type 'ImportMeta'` across 3 files

---

## [2.1.3] — 2026-05-22

> `Invoke-External` deadlock fix.

### Fixed
- `ProcessStartInfo` + synchronous `ReadLine()` deadlocked when stderr buffer filled
- Replaced with `& $Executable @Arguments 2>&1 | ForEach-Object` — no threads, no buffers, no deadlock

---

## [2.1.2] — 2026-05-22

> Build rewritten in PowerShell.

### Fixed
- `npm install` exiting non-zero on audit advisories treated as build failure
- Working-directory drift causing `npm run build` to look in wrong folder
- `build.ps1` introduced; `build.bat` reduced to a launcher

---

## [2.1.1] — 2026-05-22

> `build.bat` hotfix — `npm --prefix` fix, timestamp fix, version parsing fix.

---

## [2.1.0] — 2026-05-22

> Project renamed ADToolkit → UCTool. Light/dark theme. Domain was previously hardcoded (now removed — auto-detected at runtime).

---

## [2.0.0] — 2026-05-22

> Major rewrite — React 18 + TypeScript + Vite + Tailwind. PowerShell 7 HTTP backend.

---

## [1.0.0] — 2024-08-20

> Initial release — vanilla JS + PS HttpListener.

---

[3.6.7]: https://github.com/your-org/user-creation-tool/compare/v3.6.6...v3.6.7
[3.6.6]: https://github.com/your-org/user-creation-tool/compare/v3.6.5...v3.6.6
[3.6.5]: https://github.com/your-org/user-creation-tool/compare/v3.6.4...v3.6.5
[3.6.4]: https://github.com/your-org/user-creation-tool/compare/v3.6.3...v3.6.4
[3.6.3]: https://github.com/your-org/user-creation-tool/compare/v3.6.2...v3.6.3
[3.6.2]: https://github.com/your-org/user-creation-tool/compare/v3.6.1...v3.6.2
[3.6.1]: https://github.com/your-org/user-creation-tool/compare/v3.6.0...v3.6.1
[3.6.0]: https://github.com/your-org/user-creation-tool/compare/v3.5.9...v3.6.0
[3.5.9]: https://github.com/your-org/user-creation-tool/compare/v3.5.8...v3.5.9
[3.5.8]: https://github.com/your-org/user-creation-tool/compare/v3.5.7...v3.5.8
[3.5.7]: https://github.com/your-org/user-creation-tool/compare/v3.5.6...v3.5.7
[3.5.6]: https://github.com/your-org/user-creation-tool/compare/v3.5.5...v3.5.6
[3.5.5]: https://github.com/your-org/user-creation-tool/compare/v3.5.4...v3.5.5
[3.5.4]: https://github.com/your-org/user-creation-tool/compare/v3.5.3...v3.5.4
[3.5.3]: https://github.com/your-org/user-creation-tool/compare/v3.5.2...v3.5.3
[3.5.2]: https://github.com/your-org/user-creation-tool/compare/v3.5.1...v3.5.2
[3.5.1]: https://github.com/your-org/user-creation-tool/compare/v3.5.0...v3.5.1
[3.5.0]: https://github.com/your-org/user-creation-tool/compare/v3.4.2...v3.5.0
[3.4.2]: https://github.com/your-org/user-creation-tool/compare/v3.4.1...v3.4.2
[3.4.1]: https://github.com/your-org/user-creation-tool/compare/v3.4.0...v3.4.1
[3.4.0]: https://github.com/your-org/user-creation-tool/compare/v3.3.2...v3.4.0
[3.3.2]: https://github.com/your-org/user-creation-tool/compare/v3.3.1...v3.3.2
[3.3.1]: https://github.com/your-org/user-creation-tool/compare/v3.3.0...v3.3.1
[3.3.0]: https://github.com/your-org/user-creation-tool/compare/v3.2.8...v3.3.0
[3.2.8]: https://github.com/your-org/user-creation-tool/compare/v3.2.7...v3.2.8
[3.2.7]: https://github.com/your-org/user-creation-tool/compare/v3.2.6...v3.2.7
[3.2.6]: https://github.com/your-org/user-creation-tool/compare/v3.2.5...v3.2.6
[3.2.5]: https://github.com/your-org/user-creation-tool/compare/v3.2.4...v3.2.5
[3.2.4]: https://github.com/your-org/user-creation-tool/compare/v3.2.3...v3.2.4
[3.2.3]: https://github.com/your-org/user-creation-tool/compare/v3.2.2...v3.2.3
[3.2.2]: https://github.com/your-org/user-creation-tool/compare/v3.2.1...v3.2.2
[3.2.1]: https://github.com/your-org/user-creation-tool/compare/v3.2.0...v3.2.1
[3.2.0]: https://github.com/your-org/user-creation-tool/compare/v3.1.1...v3.2.0
[3.1.1]: https://github.com/your-org/user-creation-tool/compare/v3.1.0...v3.1.1
[3.1.0]: https://github.com/your-org/user-creation-tool/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/your-org/user-creation-tool/compare/v2.1.5...v3.0.0
[2.1.5]: https://github.com/your-org/user-creation-tool/compare/v2.1.4...v2.1.5
[2.1.4]: https://github.com/your-org/user-creation-tool/compare/v2.1.3...v2.1.4
[2.1.3]: https://github.com/your-org/user-creation-tool/compare/v2.1.2...v2.1.3
[2.1.2]: https://github.com/your-org/user-creation-tool/compare/v2.1.1...v2.1.2
[2.1.1]: https://github.com/your-org/user-creation-tool/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/your-org/user-creation-tool/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/your-org/user-creation-tool/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/your-org/user-creation-tool/releases/tag/v1.0.0
