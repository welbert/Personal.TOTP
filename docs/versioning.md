# Versioning

The app follows [Semantic Versioning](https://semver.org): `MAJOR.MINOR.PATCH`.

| Change type | Example | When to bump |
|-------------|---------|--------------|
| `PATCH` | `0.1.0 → 0.1.1` | Bug fixes, no new features |
| `MINOR` | `0.1.0 → 0.2.0` | New features, backwards compatible |
| `MAJOR` | `0.1.0 → 1.0.0` | Breaking changes or major milestones |

## Files to update

The version must be kept in sync across **3 files**:

| File | Field | Line |
|------|-------|------|
| `package.json` | `"version"` | 5 |
| `src-tauri/Cargo.toml` | `version` | 3 |
| `src-tauri/tauri.conf.json` | `"version"` | 4 |

All three must always have the same value. The version shown in the app header
(`getVersion()` from `@tauri-apps/api/app`) is read from `tauri.conf.json` at
build time.

## Bumping the version

Edit each file manually at the indicated line:

| File | Line | Example |
|------|------|---------|
| `package.json` | 5 | `"version": "0.4.0"` |
| `src-tauri/Cargo.toml` | 3 | `version = "0.4.0"` |
| `src-tauri/tauri.conf.json` | 4 | `"version": "0.4.0"` |

> **Note:** avoid using PowerShell `Set-Content` to replace the version — it writes UTF-8 with BOM in PS 5.1, which breaks the Tauri JSON parser at build time.
