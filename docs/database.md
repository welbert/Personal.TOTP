# Database

SQLite via `rusqlite` (feature `bundled` — no external sqlite3 dependency).

## Schema

```sql
CREATE TABLE config (
    key   TEXT PRIMARY KEY,
    value BLOB NOT NULL
);

CREATE TABLE totp_entries (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT    NOT NULL,
    issuer           TEXT    NOT NULL DEFAULT '',
    encrypted_secret BLOB    NOT NULL,   -- AES-256-GCM ciphertext of the base32 secret
    nonce            BLOB    NOT NULL,   -- 12-byte GCM nonce
    algorithm        TEXT    NOT NULL DEFAULT 'SHA1',   -- SHA1 | SHA256 | SHA512
    digits           INTEGER NOT NULL DEFAULT 6,        -- 6 or 8
    period           INTEGER NOT NULL DEFAULT 30,       -- 30 or 60 seconds
    is_favorite      INTEGER NOT NULL DEFAULT 0,        -- boolean (0/1)
    last_copied_at   INTEGER,                           -- Unix timestamp, NULL if never copied
    created_at       INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
```

## `config` table

| key            | Content                                      |
|----------------|----------------------------------------------|
| `master_salt`  | 32 random bytes — Argon2id salt              |
| `verify_ct`    | AES-GCM ciphertext of `b"personal-totp-v1"` |
| `verify_nonce` | 12-byte nonce for the verification blob       |

## `totp_entries` table

`encrypted_secret` stores the **base32** secret encrypted (e.g. `JBSWY3DPEHPK3PXP`).  
On read: decrypt → obtain the base32 string → decode → generate TOTP.

### Sort order

`get_entries` always returns rows in this order:
1. Favorites first (`is_favorite DESC`)
2. Most recently copied (`last_copied_at DESC`, NULLs last)
3. Alphabetical by name (`name ASC`)

## Migration

`is_favorite` and `last_copied_at` were added after the initial schema. `migrate_db()` is called on every startup after `init_db()` and runs `ALTER TABLE ADD COLUMN` for each new column, silently ignoring the error if the column already exists — making it safe to run against any database version.

## Resetting the vault

The `reset_vault` command permanently deletes all data from the database without deleting the file itself:

```sql
DELETE FROM totp_entries;
DELETE FROM config;
```

Clearing `config` removes `master_salt`, `verify_ct`, and `verify_nonce`, so `is_setup()` returns `false` on the next call and the app returns to the initial setup screen. The in-memory master key is also wiped immediately.

This is triggered via **Settings → Forgot your password?** on the unlock screen, which requires the user to type `DELETE` before confirming.

> There is no recovery path — if the master password is lost, resetting is the only option.

## Location

Resolved at runtime via `app.path().app_data_dir()`:

```
Windows  → %APPDATA%\com.welbert.personal-totp\totp.db
macOS    → ~/Library/Application Support/com.welbert.personal-totp/totp.db
Linux    → ~/.local/share/com.welbert.personal-totp/totp.db
```
