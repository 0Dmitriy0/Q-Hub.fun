---
name: powershell-utf8-mojibake
description: Never rewrite project files with PowerShell 5.1 Get-Content/Set-Content — Ukrainian text gets corrupted
metadata:
  node_type: memory
  type: feedback
  originSessionId: 5deb2cd6-a48a-4b15-93ac-03d2703484ea
  modified: 2026-10-23T00:44:15.418Z
---

On this machine (Windows PowerShell 5.1), `Get-Content -Raw` without `-Encoding utf8` reads files as cp1251 and `Set-Content -Encoding utf8` writes a BOM — together they turned all Cyrillic in desktop/src/main.cjs into mojibake («РџРѕРјС–С‡…») on 2026-10-23.

**Why:** the project's code, comments and UI strings are Ukrainian; one such round-trip silently breaks every user-facing message while `node --check` still passes.

**How to apply:** edit files with Edit/Write or Bash `sed`; if PowerShell is unavoidable use `[IO.File]::ReadAllText/WriteAllText` with `UTF8Encoding($false)`. Fix for an already-mangled file: read as UTF-8, `GetEncoding(1251).GetBytes`, decode strictly as UTF-8.
