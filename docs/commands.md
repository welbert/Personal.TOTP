# Tauri Commands (IPC Rust ↔ Frontend)

All commands are called via `invoke(name, args)` from `@tauri-apps/api/core`.

## Vault

### `is_setup() → boolean`
Returns `true` if the vault has been initialized (`master_salt` exists in the database).

### `setup_password(password: string) → void`
Creates the vault for the first time:
- Generates a random salt (Argon2id)
- Derives the master key
- Saves the salt + encrypted verification blob
- Keeps the key in memory (user is already unlocked)

### `unlock(password: string) → boolean`
Attempts to unlock with the provided password.
- `true` → correct password, key is in memory
- `false` → wrong password

### `lock() → void`
Wipes the master key from memory. Does not stop the process.

### `is_unlocked() → boolean`
Checks whether a master key is currently in memory.

## TOTP Entries

### `get_entries() → TotpEntry[]`
Returns all entries without secrets (metadata only), sorted by favorites → most recently copied → name:
```typescript
interface TotpEntry {
  id: number;
  name: string;
  issuer: string;
  algorithm: string;              // "SHA1" | "SHA256" | "SHA512"
  digits: number;                 // 6 | 8
  period: number;                 // 30 | 60
  is_favorite: boolean;
  last_copied_at: number | null;  // Unix timestamp, null if never copied
}
```

### `get_totp_code(id: number) → TotpCode`
Generates the current codes for an entry:
```typescript
interface TotpCode {
  current: string;   // code valid right now
  next: string;      // code for the next period
}
```
Decrypts the secret on the fly — it is never exposed to the frontend.

### `add_entry(name, issuer, secret, algorithm, digits, period) → number`
Adds a new entry. `secret` must be base32 (e.g. `JBSWY3DPEHPK3PXP`).
Validates the secret before saving. Returns the created `id`.

**Duplicate detection:** before inserting, the command decrypts every stored secret and compares it against the new one. If a match is found it returns the error string `SECRET_ALREADY_EXISTS:<name>` (where `<name>` is the existing entry's display name). The frontend catches this prefix, extracts the name, and shows a localised error message.

> `AddEntryModal.tsx` handles three ways to fill the form before calling this command:
> - Paste an `otpauth://` URL into the Secret field — all fields are parsed and filled automatically.
> - Click **Scan from image** — opens a file picker; the selected image is decoded with `jsQR` via an off-screen canvas.
> - Click **Paste from clipboard** — reads the clipboard image via `navigator.clipboard.read()` and decodes it the same way.
> - Press **Ctrl+V** while the modal is open — any image on the clipboard is intercepted by a document-level `paste` listener and decoded automatically.
> All QR paths expect the QR code to encode an `otpauth://` URL.

### `update_entry(id, name, issuer, newSecret, algorithm, digits, period) → void`
Updates an existing entry. If `newSecret` is a non-empty base32 string, the secret is validated and re-encrypted; pass `null` or an empty string to keep the current secret unchanged.

### `delete_entry(id: number) → void`
Removes an entry from the database.

### `toggle_favorite(id: number) → boolean`
Toggles the `is_favorite` flag for an entry and returns the new value.

### `record_copy(id: number) → void`
Updates `last_copied_at` to the current Unix timestamp for the given entry.  
Called fire-and-forget after every copy action (click or keyboard shortcut).

## App

### `hide_window() → void`
Hides the window to the system tray and arms the auto-lock timer (if configured).

### `quit() → void`
Exits the process completely (equivalent to "Quit" in the tray menu).

### `get_auto_lock_timeout() → number | null`
Returns the current auto-lock timeout in seconds, or `null` if auto-lock is disabled.

### `set_auto_lock_timeout(secs: number | null) → void`
Persists the auto-lock timeout and updates the in-memory value immediately.  
Pass `null` to disable auto-lock. Valid values: `300`, `600`, `900`, `1800`, `3600`.  
Configurable via **Settings → Auto-lock**.

### `get_shortcut() → string`
Returns the current global shortcut string (e.g. `"Alt+Shift+KeyA"`).

### `set_shortcut(shortcut: string) → void`
Unregisters the current global shortcut, registers the new one, and persists it to the database.  
Format: `"Modifier+…+Code"` where modifiers are `Alt`, `Ctrl`, `Shift`, `Meta` and code is a Web KeyboardEvent code (`KeyA`, `Digit1`, `F5`, etc.).  
Returns an error if the shortcut is already registered by another application.  
Configurable via **Settings → Global shortcut** (click the key display and press a new combination).

### `get_autostart() → boolean`
Returns `true` if the app is registered to launch at system startup, `false` otherwise.

### `set_autostart(enabled: boolean) → void`
Enables or disables launch at system startup.  
On Windows, writes/removes the entry in `HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run` via `tauri-plugin-autostart` (backed by the `auto-launch` crate).  
Disabled by default (no registry entry is created on first run).  
Configurable via **Settings → Startup → Launch at startup**.

### `write_log(level: string, message: string) → void`
Appends one line to the current day's log file (`log-YYYYMMDD.txt` inside the platform log directory).  
Called by `src/logger.ts` — prefer using the logger module over invoking this command directly.

### `open_log_dir() → void`
Creates the log directory if it does not exist, then opens it in the system file manager.  
Triggered by **Settings → Diagnostics → Open log folder**.

> See [docs/logger.md](logger.md) for the full logger guide, file paths, and log format.

## Import / Export

### `export_vault(path: string) → number`
Decrypts all entries and writes them to `path` as a JSON file in the Personal TOTP format.  
Returns the number of entries exported.

### `import_vault(path: string) → [number, number, number]`
Reads a JSON file at `path` and imports entries into the vault.  
Returns a tuple `[imported, skipped, failed]`:
- `imported` — entries successfully added
- `skipped` — entries whose secret already exists in the vault (duplicates detected by decrypting and comparing)
- `failed` — entries with an invalid or undecodable secret

Each skipped entry is logged at `INFO`; each failed entry is logged at `WARN` — both include the entry name and reason.

### `reset_vault() → void`
Deletes all rows from `totp_entries` and `config`, and clears the in-memory master key.  
Requires the user to type `DELETE` in the confirmation modal before the command is called.

## Keyboard shortcuts (frontend)

Active when the window is focused and no `<input>` has focus:

| Key     | Action                                                                                      |
|---------|---------------------------------------------------------------------------------------------|
| `S`     | Focuses the search input (no-op when a modal is open)                                       |
| `1`–`9` | Copies the code at that position in the filtered list and hides the window to the tray      |
| `Esc` (search focused) | Blurs the search input without clearing text or hiding the window             |
| `Esc`   | Hides the window to the tray                                                                |

Keys `1`–`9` beyond the number of visible entries do nothing.

## Plugins (called directly, without invoke)

| Plugin | Frontend usage |
|--------|----------------|
| `@tauri-apps/plugin-clipboard-manager` | `writeText(code)` when clicking an entry or using a keyboard shortcut |
