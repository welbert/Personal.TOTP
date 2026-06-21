# Cryptographic Scheme

## Overview

```
Master password
    │
    ▼  Argon2id (32-byte salt, 32-byte output)
Master Key [u8; 32]
    │
    ├──▶ AES-256-GCM(key, 12-byte nonce) → encrypted_secret  (stored in SQLite)
    └──▶ AES-256-GCM(key, 12-byte nonce) → verify_ct         (stored in SQLite)
```

The master password is **never** stored. Only the salt (for key derivation) and an encrypted verification blob are persisted.

## Key derivation — Argon2id

| Parameter | Value                     |
|-----------|---------------------------|
| Algorithm | Argon2id (crate defaults) |
| Salt      | 32 bytes (OsRng)          |
| Output    | 32 bytes                  |
| Crate     | `argon2 = "0.5"`          |

The salt is generated at vault creation and stored in `config.master_salt`.

## Secret encryption — AES-256-GCM

| Parameter | Value                       |
|-----------|-----------------------------|
| Algorithm | AES-256-GCM                 |
| Nonce     | 12 bytes (OsRng), per entry |
| Tag       | 16 bytes (appended to ct)   |
| Crate     | `aes-gcm = "0.10"`          |

Each TOTP secret has its own random nonce stored alongside the ciphertext.

## Password verification

During setup, a fixed plaintext (`b"personal-totp-v1"`) is encrypted with the master key and saved to `config.verify_ct` + `config.verify_nonce`. On unlock, the derived key attempts to decrypt this blob — if the AES-GCM tag is invalid, the password is wrong. No timing oracle or extra data is exposed.

## What the database stores

```
config
  master_salt   → 32 random bytes (Argon2 salt)
  verify_ct     → AES-GCM ciphertext of the verification blob
  verify_nonce  → 12-byte nonce for the verification blob

totp_entries
  encrypted_secret → AES-GCM ciphertext of the base32 secret
  nonce            → 12-byte nonce for this entry
```

The database contains **no** master password, master key, or plaintext secret.
