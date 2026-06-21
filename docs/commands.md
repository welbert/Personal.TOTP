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

> `AddEntryModal.tsx` parses `otpauth://` URLs on the frontend and extracts the fields before calling this command.

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

### `write_log(level: string, message: string) → void`
Appends one line to the current day's log file (`log-YYYYMMDD.txt` inside the platform log directory).  
Called by `src/logger.ts` — prefer using the logger module over invoking this command directly.

### `open_log_dir() → void`
Creates the log directory if it does not exist, then opens it in the system file manager.  
Triggered by **Settings → Diagnostics → Open log folder**.

> See [docs/logger.md](logger.md) for the full logger guide, file paths, and log format.

## Keyboard shortcuts (frontend)

Active when the window is focused and no `<input>` has focus:

| Key     | Action                                                                                   |
|---------|------------------------------------------------------------------------------------------|
| `1`–`9` | Copies the code at that position in the filtered list and hides the window to the tray  |
| `Esc`   | Hides the window to the tray                                                             |

Keys beyond the number of visible entries do nothing.

## Plugins (called directly, without invoke)

| Plugin | Frontend usage |
|--------|----------------|
| `@tauri-apps/plugin-clipboard-manager` | `writeText(code)` when clicking an entry or using a keyboard shortcut |
