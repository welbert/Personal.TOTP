# Logger

Frontend utility (`src/logger.ts`) that writes to a dated log file via a Tauri command.  
Use it instead of `console.error` anywhere you need persistent error traces.

## Usage

```typescript
import { logger } from "../logger";

// available levels
logger.error("copy failed", err);
logger.warn("unexpected state", value);
logger.info("vault unlocked");
logger.debug("entry list loaded", entries.length);
```

Each call:
1. Forwards the arguments to the matching `console.*` method (visible in devtools).
2. Sends the serialized message to the `write_log` Tauri command, which appends to the current day's log file.

Logging errors are swallowed — a broken log path will never crash the UI.

## Log file location

| OS      | Path                                                                              |
|---------|-----------------------------------------------------------------------------------|
| Windows | `%APPDATA%\com.welbert.personal-totp\logs\log-YYYYMMDD.txt`                      |
| macOS   | `~/Library/Logs/com.welbert.personal-totp/log-YYYYMMDD.txt`                      |
| Linux   | `~/.local/share/com.welbert.personal-totp/logs/log-YYYYMMDD.txt`                 |

A new file is created for each calendar day. Old files are not deleted automatically.

To open the log folder directly from the app: **Settings → Diagnostics → Open log folder**.

## Log format

```
[2026-06-21 14:32:01.123] [ERROR] copy failed: clipboard write permission denied
[2026-06-21 14:32:05.456] [INFO]  vault unlocked
```

## Serialization rules

| Value type | Serialized as |
|------------|---------------|
| `Error`    | `message\nstack trace` |
| `object`   | `JSON.stringify(value)` |
| anything else | `String(value)` |

Multiple arguments are joined with a space, matching `console.*` behaviour.

## Rust backend

Two commands support this module (both registered in `lib.rs` and require no capability permissions):

| Command | Purpose |
|---------|---------|
| `write_log(level, message)` | Appends one line to `log-YYYYMMDD.txt` in the app log dir |
| `open_log_dir()` | Creates the log dir if absent, then opens it in the system file manager |

`write_log` uses `chrono::Local::now()` for the timestamp and `app.path().app_log_dir()` for the path — both are resolved at call time, so the file rolls over to the next day automatically at midnight.
