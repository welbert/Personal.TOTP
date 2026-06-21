# Personal TOTP — CLAUDE.md

Cross-platform desktop TOTP authenticator (2FA).  
Stores TOTP keys encrypted with a master password and generates codes in real time.

## Versioning rule

**When bumping the version, update all 3 files in sync** — they must always match:

| File | Field |
|------|-------|
| `package.json` | `"version"` (line 5) |
| `src-tauri/Cargo.toml` | `version` (line 3) |
| `src-tauri/tauri.conf.json` | `"version"` (line 4) |

See [docs/versioning.md](docs/versioning.md) for the bump script and semver guidelines.

## UI text rule

**Any time you add or modify visible text in a component, you must add or update the corresponding keys in ALL translation files** (`src/i18n/pt-BR.json` and `src/i18n/en-US.json`). Never hardcode display strings in components — always use `t("key")` from `useTranslation()`. See [docs/i18n.md](docs/i18n.md) for the full guide.

## Stack

| Layer      | Technology                                              |
|------------|---------------------------------------------------------|
| UI         | React 19 + TypeScript + Tailwind v4                     |
| Desktop    | Tauri v2                                                |
| Backend    | Rust (Tauri commands)                                   |
| Database   | SQLite via `rusqlite` (bundled)                         |
| Crypto     | Argon2id (key derivation) + AES-256-GCM (encryption)   |
| TOTP       | `totp-rs` v5                                            |
| i18n       | `i18next` + `react-i18next`                             |
| Build tool | Vite v7                                                 |

**Package manager: pnpm** (do not use npm/yarn).

## Commands

```bash
pnpm tauri dev        # development with hot-reload
pnpm tauri build      # production build (installer in src-tauri/target/release/bundle)
pnpm build            # frontend only (dist/)
```

## Structure

```
Personal.TOTP/
├── src/
│   ├── App.tsx                 # Screen routing (setup/unlock/main)
│   ├── index.css               # Tailwind + dark theme base
│   ├── main.tsx                # React entry point — disables right-click context menu; imports i18n before app
│   ├── logger.ts               # Logger utility — use instead of console.* (see docs/logger.md)
│   ├── i18n/
│   │   ├── index.ts            # i18next init — language detection + persistence
│   │   ├── pt-BR.json          # Portuguese (Brazil) translations
│   │   └── en-US.json          # English (US) translations
│   ├── hooks/
│   │   └── useToast.ts         # Toast queue hook — show(message, type) + auto-dismiss after 4 s
│   └── components/
│       ├── SetupScreen.tsx     # Master password creation (first run)
│       ├── UnlockScreen.tsx    # Vault unlock; "Forgot your password?" link opens ResetVaultModal
│       ├── TotpList.tsx        # List with search + FAB to add entries
│       ├── TotpEntry.tsx       # Entry card: current code, next code, countdown
│       ├── AddEntryModal.tsx   # Add entry modal (supports otpauth:// URL)
│       ├── EditEntryModal.tsx  # Edit entry modal (secret optional — blank = keep)
│       ├── SettingsModal.tsx   # Settings: language, global shortcut, auto-lock, import/export, diagnostics
│       ├── ConfirmModal.tsx    # Generic confirmation dialog (used for delete)
│       ├── ResetVaultModal.tsx # Vault reset confirmation — requires typing "DELETE"; calls reset_vault
│       ├── ToastContainer.tsx  # Renders active toasts (bottom-center, slide-up animation)
│       └── icons.tsx           # Inline SVG icons
├── src-tauri/
│   ├── src/lib.rs              # Entire backend: DB, crypto, commands, tray, shortcut
│   ├── Cargo.toml              # Rust dependencies
│   ├── tauri.conf.json         # Window and build config
│   └── capabilities/
│       └── desktop.json        # Frontend IPC permissions
├── docs/                       # Technical documentation (see below)
└── pnpm.json                   # pnpm config (onlyBuiltDependencies: esbuild)
```

## Technical documentation

| File                        | Content                                                    |
|-----------------------------|------------------------------------------------------------|
| [docs/architecture.md](docs/architecture.md) | Layers, data flow, process lifecycle          |
| [docs/crypto.md](docs/crypto.md)             | Argon2id + AES-256-GCM, what is/isn't stored  |
| [docs/database.md](docs/database.md)         | Full SQLite schema, migration, DB location    |
| [docs/commands.md](docs/commands.md)         | All Tauri commands with TypeScript types      |
| [docs/i18n.md](docs/i18n.md)                 | i18n setup, key structure, adding languages   |
| [docs/versioning.md](docs/versioning.md)     | Semver guidelines, files to update, bump script |
| [docs/logger.md](docs/logger.md)             | Logger utility (`src/logger.ts`), log file paths, format, Rust commands |

## Key behaviors

- **Window close button** → hides to system tray (process keeps running)
- **Window resizable** → user can drag corners/edges; minimum 380×480 px
- **Right-click** → context menu disabled globally (prevents browser devtools menu in production)
- **Quit** → tray menu → "Quit" (or `invoke("quit")`)
- **Global shortcut** → toggles visibility; default `Alt+Shift+A`, configurable at runtime via **Settings → Global shortcut** (persisted in SQLite)
- **Click an entry** → copies the current code to the clipboard
- **Paste `otpauth://`** in the Secret field of the modal → auto-fills all fields
- **`S`** → focuses the search input (only when no modal is open; DOM-level, not a global OS shortcut)
- **Keys `1`–`9`** → copy nth entry's code and hide window to tray
- **`Esc` (search focused)** → blurs the search input without clearing text or hiding the window
- **`Esc`** → hide window to tray
- **Auto-lock** → vault locks after a configurable timeout (Never/5/10/15/30/60 min) when hidden in the tray; default 5 min
- **Toast notifications** → import, export, and template download show a bottom-center toast (success/error) via `useToast`

## Adding features

### New Rust command
1. Write `#[tauri::command] fn name(...)` in `src-tauri/src/lib.rs`
2. Register it in `.invoke_handler(tauri::generate_handler![..., name])`
3. No need to add a permission to `capabilities/desktop.json` (custom commands are auto-allowed)

### New Rust dependency
```bash
cd src-tauri && cargo add <crate>
```

### New npm dependency
```bash
pnpm add <package>
# or for dev:
pnpm add -D <package>
```

## Environment notes

- **Windows**: use `python` (not `python3`) in the terminal
- **Line endings**: `.md` and `.json` files use CRLF
- **Rust**: entire backend in `src-tauri/src/lib.rs` (single file for now)
- **State**: master key lives in `AppState::master_key: Mutex<Option<[u8;32]>>` — cleared when the process exits
