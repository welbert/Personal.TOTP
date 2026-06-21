# Architecture

## Overview

Cross-platform desktop application with two independent layers communicating via IPC (Tauri invoke):

```
┌─────────────────────────────────────────────┐
│  Frontend  (React + TypeScript + Tailwind)  │
│                                             │
│  App → SetupScreen | UnlockScreen | TotpList│
│        TotpEntry · AddEntryModal            │
└───────────────────┬─────────────────────────┘
                    │  invoke() / plugin API
┌───────────────────▼─────────────────────────┐
│  Backend  (Rust + Tauri v2)                 │
│                                             │
│  Commands → crypto → SQLite                 │
│  Tray icon · Global shortcut · Window mgmt  │
└─────────────────────────────────────────────┘
```

## Data flow — unlock and code generation

```
User types password
       │
       ▼
unlock(password)
       │
       ├─ Argon2id(password, db_salt) → key[32]
       ├─ AES-256-GCM.decrypt(verify_ct, verify_nonce, key) → ok/fail
       └─ key stored in AppState::master_key (Mutex<Option<[u8;32]>>)

User clicks an entry
       │
       ▼
get_totp_code(id)
       │
       ├─ Reads (encrypted_secret, nonce) from SQLite
       ├─ AES-256-GCM.decrypt(ct, nonce, key) → secret_base32
       ├─ base32_decode(secret_base32) → secret_bytes
       └─ TOTP::generate(now_unix) + TOTP::generate(now_unix + period) → {current, next}
```

## Process lifecycle

- The window **does not quit** when closed — it hides to the system tray.
- The process only exits via tray menu → "Quit" or the `quit` command.
- The master key remains in memory while the process is running.
- `lock()` wipes the key from memory without stopping the process.

## Global shortcut

Registered at startup via `tauri-plugin-global-shortcut`. Default: **Alt+Shift+A**.  
The shortcut is persisted in the `config` table (`key = 'global_shortcut'`) and configurable at runtime via **Settings → Global shortcut** — no restart required.

The shortcut string format is `"Modifier+…+Code"` (e.g. `"Alt+Shift+KeyA"`), using Web KeyboardEvent code names for the key part. `parse_shortcut()` in `lib.rs` converts this string to the `Shortcut` type; `GlobalShortcutExt::unregister` + `register` swap the binding at runtime.

## Data directory

| OS      | Path                                                                   |
|---------|------------------------------------------------------------------------|
| Windows | `%APPDATA%\com.welbert.personal-totp\totp.db`                         |
| macOS   | `~/Library/Application Support/com.welbert.personal-totp/totp.db`     |
| Linux   | `~/.local/share/com.welbert.personal-totp/totp.db`                    |
