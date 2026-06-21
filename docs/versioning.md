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

Replace `OLD` and `NEW` with the actual version strings:

```powershell
# Windows (PowerShell) — run from the project root
$old = "0.1.0"; $new = "0.2.0"
(Get-Content package.json)                        -replace $old, $new | Set-Content package.json
(Get-Content src-tauri\Cargo.toml)                -replace $old, $new | Set-Content src-tauri\Cargo.toml
(Get-Content src-tauri\tauri.conf.json)           -replace $old, $new | Set-Content src-tauri\tauri.conf.json
```

Then verify:

```powershell
Select-String -Path package.json, src-tauri\Cargo.toml, src-tauri\tauri.conf.json -Pattern '"?version"?\s*[:=]'
```
