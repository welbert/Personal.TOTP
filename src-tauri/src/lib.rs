use chrono;
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use argon2::Argon2;
use rand_core::{OsRng, RngCore};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, State,
};
use totp_rs::{Algorithm, Secret, TOTP};

pub struct AppState {
    pub master_key: Mutex<Option<[u8; 32]>>,
    pub db: Mutex<Connection>,
    pub auto_lock_at: Mutex<Option<u64>>,
    /// None = never lock; Some(secs) = lock after N seconds hidden
    pub auto_lock_timeout: Mutex<Option<u64>>,
    pub shortcut: Mutex<String>,
}

// ---- Crypto ----

fn derive_key(password: &str, salt: &[u8]) -> [u8; 32] {
    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .expect("argon2 failed");
    key
}

fn encrypt(key: &[u8; 32], plaintext: &[u8]) -> (Vec<u8>, [u8; 12]) {
    let cipher = Aes256Gcm::new(key.into());
    let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut nonce);
    let ct = cipher
        .encrypt(Nonce::from_slice(&nonce), plaintext)
        .expect("encryption failed");
    (ct, nonce)
}

fn decrypt_bytes(key: &[u8; 32], ct: &[u8], nonce: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new(key.into());
    cipher
        .decrypt(Nonce::from_slice(nonce), ct)
        .map_err(|_| "senha incorreta ou dados corrompidos".to_string())
}

// ---- DB ----

fn init_db(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS config (
            key   TEXT PRIMARY KEY,
            value BLOB NOT NULL
        );
        CREATE TABLE IF NOT EXISTS totp_entries (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            name             TEXT    NOT NULL,
            issuer           TEXT    NOT NULL DEFAULT '',
            encrypted_secret BLOB    NOT NULL,
            nonce            BLOB    NOT NULL,
            algorithm        TEXT    NOT NULL DEFAULT 'SHA1',
            digits           INTEGER NOT NULL DEFAULT 6,
            period           INTEGER NOT NULL DEFAULT 30,
            created_at       INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        );",
    )
}

fn migrate_db(conn: &Connection) {
    // Safe to run on every startup — SQLite errors if column already exists, which we ignore
    let _ = conn.execute(
        "ALTER TABLE totp_entries ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE totp_entries ADD COLUMN last_copied_at INTEGER",
        [],
    );
}

/// Reads the auto-lock timeout from the config table.
/// Returns None (never) if the stored value is "never",
/// Some(secs) if a number is stored, or Some(300) as default if no row exists.
fn read_auto_lock_timeout(conn: &Connection) -> Option<u64> {
    match conn.query_row(
        "SELECT value FROM config WHERE key = 'auto_lock_timeout'",
        [],
        |r| r.get::<_, String>(0),
    ) {
        Ok(s) if s == "never" => None,
        Ok(s) => s.parse::<u64>().ok().or(Some(300)),
        Err(_) => Some(300), // key absent → default 5 min
    }
}

// ---- Helpers ----

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

const DEFAULT_SHORTCUT: &str = "Alt+Shift+KeyA";

fn read_shortcut_config(conn: &Connection) -> String {
    conn.query_row(
        "SELECT value FROM config WHERE key = 'global_shortcut'",
        [],
        |r| r.get::<_, String>(0),
    )
    .unwrap_or_else(|_| DEFAULT_SHORTCUT.to_string())
}

fn parse_shortcut(s: &str) -> Result<tauri_plugin_global_shortcut::Shortcut, String> {
    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};
    let parts: Vec<&str> = s.split('+').collect();
    if parts.len() < 2 {
        return Err("At least one modifier and one key are required".to_string());
    }
    let mut mods = Modifiers::empty();
    for part in &parts[..parts.len() - 1] {
        match part.trim() {
            "Alt" => mods |= Modifiers::ALT,
            "Ctrl" => mods |= Modifiers::CONTROL,
            "Shift" => mods |= Modifiers::SHIFT,
            "Meta" => mods |= Modifiers::META,
            other => return Err(format!("Unknown modifier: {}", other)),
        }
    }
    let key_part = parts.last().unwrap().trim();
    let code: Code = key_part.parse().map_err(|_| format!("Unknown key: {}", key_part))?;
    Ok(Shortcut::new(Some(mods), code))
}

/// Arms the auto-lock timer if the vault is unlocked and a timeout is configured.
fn arm_auto_lock(state: &AppState) {
    if state.master_key.lock().unwrap().is_some() {
        if let Some(secs) = *state.auto_lock_timeout.lock().unwrap() {
            *state.auto_lock_at.lock().unwrap() = Some(now_secs() + secs);
        }
    }
}

// ---- Types ----

#[derive(Serialize, Deserialize, Clone)]
pub struct TotpEntry {
    pub id: i64,
    pub name: String,
    pub issuer: String,
    pub algorithm: String,
    pub digits: i64,
    pub period: i64,
    pub is_favorite: bool,
    pub last_copied_at: Option<i64>,
}

#[derive(Serialize)]
pub struct TotpCode {
    pub current: String,
    pub next: String,
}

fn to_algorithm(s: &str) -> Algorithm {
    match s {
        "SHA256" => Algorithm::SHA256,
        "SHA512" => Algorithm::SHA512,
        _ => Algorithm::SHA1,
    }
}

// ---- Commands ----

#[tauri::command]
fn is_setup(state: State<AppState>) -> bool {
    state
        .db
        .lock()
        .unwrap()
        .query_row(
            "SELECT 1 FROM config WHERE key = 'master_salt'",
            [],
            |_| Ok(()),
        )
        .is_ok()
}

#[tauri::command]
fn setup_password(password: String, state: State<AppState>) -> Result<(), String> {
    let mut salt = [0u8; 32];
    OsRng.fill_bytes(&mut salt);
    let key = derive_key(&password, &salt);
    let (verify_ct, verify_nonce) = encrypt(&key, b"personal-totp-v1");

    let db = state.db.lock().unwrap();
    db.execute(
        "INSERT OR REPLACE INTO config (key, value) VALUES ('master_salt', ?1)",
        params![salt.as_ref()],
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "INSERT OR REPLACE INTO config (key, value) VALUES ('verify_ct', ?1)",
        params![verify_ct],
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "INSERT OR REPLACE INTO config (key, value) VALUES ('verify_nonce', ?1)",
        params![verify_nonce.as_ref()],
    )
    .map_err(|e| e.to_string())?;
    drop(db);

    *state.master_key.lock().unwrap() = Some(key);
    Ok(())
}

#[tauri::command]
fn unlock(password: String, state: State<AppState>) -> Result<bool, String> {
    let db = state.db.lock().unwrap();
    let salt: Vec<u8> = db
        .query_row(
            "SELECT value FROM config WHERE key = 'master_salt'",
            [],
            |r| r.get(0),
        )
        .map_err(|_| "vault não inicializado")?;
    let verify_ct: Vec<u8> = db
        .query_row(
            "SELECT value FROM config WHERE key = 'verify_ct'",
            [],
            |r| r.get(0),
        )
        .map_err(|_| "vault não inicializado")?;
    let verify_nonce: Vec<u8> = db
        .query_row(
            "SELECT value FROM config WHERE key = 'verify_nonce'",
            [],
            |r| r.get(0),
        )
        .map_err(|_| "vault não inicializado")?;
    drop(db);

    let key = derive_key(&password, &salt);
    match decrypt_bytes(&key, &verify_ct, &verify_nonce) {
        Ok(_) => {
            *state.master_key.lock().unwrap() = Some(key);
            Ok(true)
        }
        Err(_) => Ok(false),
    }
}

#[tauri::command]
fn lock(state: State<AppState>) {
    *state.master_key.lock().unwrap() = None;
    *state.auto_lock_at.lock().unwrap() = None;
}

#[tauri::command]
fn is_unlocked(state: State<AppState>) -> bool {
    state.master_key.lock().unwrap().is_some()
}

#[tauri::command]
fn get_entries(state: State<AppState>) -> Result<Vec<TotpEntry>, String> {
    if state.master_key.lock().unwrap().is_none() {
        return Err("bloqueado".to_string());
    }
    let db = state.db.lock().unwrap();
    let mut stmt = db
        .prepare(
            "SELECT id, name, issuer, algorithm, digits, period, is_favorite, last_copied_at
             FROM totp_entries
             ORDER BY
                 is_favorite DESC,
                 CASE WHEN last_copied_at IS NULL THEN 0 ELSE 1 END DESC,
                 last_copied_at DESC,
                 name ASC",
        )
        .map_err(|e| e.to_string())?;
    let entries = stmt
        .query_map([], |row| {
            Ok(TotpEntry {
                id: row.get(0)?,
                name: row.get(1)?,
                issuer: row.get(2)?,
                algorithm: row.get(3)?,
                digits: row.get(4)?,
                period: row.get(5)?,
                is_favorite: row.get::<_, i64>(6).map(|v| v != 0)?,
                last_copied_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(entries)
}

#[tauri::command]
fn get_totp_code(id: i64, state: State<AppState>) -> Result<TotpCode, String> {
    let key = state
        .master_key
        .lock()
        .unwrap()
        .ok_or_else(|| "bloqueado".to_string())?;

    let db = state.db.lock().unwrap();
    let (ct, nonce, algorithm, digits, period): (Vec<u8>, Vec<u8>, String, i64, i64) = db
        .query_row(
            "SELECT encrypted_secret, nonce, algorithm, digits, period
             FROM totp_entries WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        )
        .map_err(|_| "entrada não encontrada")?;
    drop(db);

    let secret_raw = decrypt_bytes(&key, &ct, &nonce)?;
    let secret_str =
        String::from_utf8(secret_raw).map_err(|_| "codificação de secret inválida")?;

    let decoded = Secret::Encoded(secret_str.trim().to_uppercase())
        .to_bytes()
        .map_err(|_| "secret base32 inválido")?;

    let totp = TOTP::new(
        to_algorithm(&algorithm),
        digits as usize,
        1,
        period as u64,
        decoded,
        None,
        String::new(),
    )
    .map_err(|e| e.to_string())?;

    let now = now_secs();

    Ok(TotpCode {
        current: totp.generate(now),
        next: totp.generate(now + period as u64),
    })
}

#[tauri::command]
fn add_entry(
    name: String,
    issuer: String,
    secret: String,
    algorithm: String,
    digits: i64,
    period: i64,
    state: State<AppState>,
) -> Result<i64, String> {
    let key = state
        .master_key
        .lock()
        .unwrap()
        .ok_or_else(|| "bloqueado".to_string())?;

    let secret_clean = secret.trim().to_uppercase();

    // Validate secret by decoding + constructing TOTP
    let decoded = Secret::Encoded(secret_clean.clone())
        .to_bytes()
        .map_err(|_| "secret base32 inválido")?;
    TOTP::new(
        to_algorithm(&algorithm),
        digits as usize,
        1,
        period as u64,
        decoded,
        None,
        String::new(),
    )
    .map_err(|e| format!("TOTP inválido: {}", e))?;

    let (ct, nonce) = encrypt(&key, secret_clean.as_bytes());

    let db = state.db.lock().unwrap();
    db.execute(
        "INSERT INTO totp_entries
         (name, issuer, encrypted_secret, nonce, algorithm, digits, period)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![name, issuer, ct, nonce.as_ref(), algorithm, digits, period],
    )
    .map_err(|e| e.to_string())?;

    Ok(db.last_insert_rowid())
}

#[tauri::command]
fn delete_entry(id: i64, state: State<AppState>) -> Result<(), String> {
    if state.master_key.lock().unwrap().is_none() {
        return Err("bloqueado".to_string());
    }
    state
        .db
        .lock()
        .unwrap()
        .execute("DELETE FROM totp_entries WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn toggle_favorite(id: i64, state: State<AppState>) -> Result<bool, String> {
    if state.master_key.lock().unwrap().is_none() {
        return Err("bloqueado".to_string());
    }
    let db = state.db.lock().unwrap();
    db.execute(
        "UPDATE totp_entries
         SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END
         WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    let new_val: bool = db
        .query_row(
            "SELECT is_favorite FROM totp_entries WHERE id = ?1",
            params![id],
            |r| r.get::<_, i64>(0).map(|v| v != 0),
        )
        .map_err(|e| e.to_string())?;
    Ok(new_val)
}

#[tauri::command]
fn record_copy(id: i64, state: State<AppState>) -> Result<(), String> {
    if state.master_key.lock().unwrap().is_none() {
        return Err("bloqueado".to_string());
    }
    state
        .db
        .lock()
        .unwrap()
        .execute(
            "UPDATE totp_entries SET last_copied_at = ?1 WHERE id = ?2",
            params![now_secs() as i64, id],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn update_entry(
    id: i64,
    name: String,
    issuer: String,
    new_secret: Option<String>, // Some(non-empty) = replace secret; None/empty = keep existing
    algorithm: String,
    digits: i64,
    period: i64,
    state: State<AppState>,
) -> Result<(), String> {
    let key = state
        .master_key
        .lock()
        .unwrap()
        .ok_or_else(|| "bloqueado".to_string())?;

    let db = state.db.lock().unwrap();

    match new_secret.as_deref().filter(|s| !s.trim().is_empty()) {
        Some(raw_secret) => {
            let secret_clean = raw_secret.trim().to_uppercase();
            let decoded = Secret::Encoded(secret_clean.clone())
                .to_bytes()
                .map_err(|_| "secret base32 inválido")?;
            TOTP::new(
                to_algorithm(&algorithm),
                digits as usize,
                1,
                period as u64,
                decoded,
                None,
                String::new(),
            )
            .map_err(|e| format!("TOTP inválido: {}", e))?;

            let (ct, nonce) = encrypt(&key, secret_clean.as_bytes());
            db.execute(
                "UPDATE totp_entries
                 SET name=?1, issuer=?2, algorithm=?3, digits=?4, period=?5,
                     encrypted_secret=?6, nonce=?7
                 WHERE id=?8",
                params![name, issuer, algorithm, digits, period, ct, nonce.as_ref(), id],
            )
            .map_err(|e| e.to_string())?;
        }
        None => {
            db.execute(
                "UPDATE totp_entries
                 SET name=?1, issuer=?2, algorithm=?3, digits=?4, period=?5
                 WHERE id=?6",
                params![name, issuer, algorithm, digits, period, id],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
fn hide_window(app: tauri::AppHandle, state: State<AppState>) {
    arm_auto_lock(&state);
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
    }
}

/// Returns the current auto-lock timeout in seconds, or null if disabled.
#[tauri::command]
fn get_auto_lock_timeout(state: State<AppState>) -> Option<u64> {
    *state.auto_lock_timeout.lock().unwrap()
}

/// Persists the auto-lock timeout and updates the running timer.
/// Pass null to disable auto-lock.
#[tauri::command]
fn set_auto_lock_timeout(secs: Option<u64>, state: State<AppState>) -> Result<(), String> {
    let value = match secs {
        None => "never".to_string(),
        Some(s) => s.to_string(),
    };
    state
        .db
        .lock()
        .unwrap()
        .execute(
            "INSERT OR REPLACE INTO config (key, value) VALUES ('auto_lock_timeout', ?1)",
            params![value],
        )
        .map_err(|e| e.to_string())?;
    *state.auto_lock_timeout.lock().unwrap() = secs;
    // If disabled, cancel any pending lock
    if secs.is_none() {
        *state.auto_lock_at.lock().unwrap() = None;
    }
    Ok(())
}

#[tauri::command]
fn quit(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn import_vault(path: String, state: State<AppState>) -> Result<(usize, usize), String> {
    #[derive(serde::Deserialize)]
    struct ImportEntry {
        name: String,
        issuer: Option<String>,
        secret: String,
        algorithm: Option<String>,
        digits: Option<i64>,
        period: Option<i64>,
    }
    #[derive(serde::Deserialize)]
    struct ImportFile {
        entries: Vec<ImportEntry>,
    }

    let key = {
        let lock = state.master_key.lock().unwrap();
        lock.ok_or("Vault is locked")?
    };
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let file: ImportFile = serde_json::from_str(&raw).map_err(|e| e.to_string())?;

    let conn = state.db.lock().unwrap();
    let (mut imported, mut failed) = (0usize, 0usize);

    for entry in file.entries {
        let secret_clean = entry.secret.trim().to_uppercase();
        let algorithm = entry.algorithm.as_deref().unwrap_or("SHA1").to_string();
        let digits = entry.digits.unwrap_or(6);
        let period = entry.period.unwrap_or(30);
        let issuer = entry.issuer.unwrap_or_default();

        let ok = (|| -> Result<(), String> {
            let decoded = Secret::Encoded(secret_clean.clone())
                .to_bytes()
                .map_err(|_| "invalid secret")?;
            TOTP::new(to_algorithm(&algorithm), digits as usize, 1, period as u64, decoded, None, String::new())
                .map_err(|e| e.to_string())?;
            let (ct, nonce) = encrypt(&key, secret_clean.as_bytes());
            conn.execute(
                "INSERT INTO totp_entries (name, issuer, encrypted_secret, nonce, algorithm, digits, period) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![entry.name, issuer, ct, nonce.as_ref(), algorithm, digits, period],
            ).map_err(|e| e.to_string())?;
            Ok(())
        })();

        if ok.is_ok() { imported += 1; } else { failed += 1; }
    }

    Ok((imported, failed))
}

#[tauri::command]
fn export_vault(path: String, state: State<AppState>) -> Result<usize, String> {
    #[derive(serde::Serialize)]
    struct ExportEntry {
        name: String,
        issuer: String,
        secret: String,
        algorithm: String,
        digits: u32,
        period: u32,
    }
    #[derive(serde::Serialize)]
    struct Export {
        app: &'static str,
        version: u32,
        entries: Vec<ExportEntry>,
    }

    let key = {
        let lock = state.master_key.lock().unwrap();
        lock.ok_or("Vault is locked")?
    };
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT name, issuer, encrypted_secret, nonce, algorithm, digits, period \
             FROM totp_entries ORDER BY name",
        )
        .map_err(|e| e.to_string())?;

    let entries: Vec<ExportEntry> = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Vec<u8>>(2)?,
                row.get::<_, Vec<u8>>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, u32>(5)?,
                row.get::<_, u32>(6)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .map(|(name, issuer, ct, nonce, algorithm, digits, period)| {
            let secret = decrypt_bytes(&key, &ct, &nonce)
                .and_then(|b| String::from_utf8(b).map_err(|e| e.to_string()))
                .unwrap_or_default();
            ExportEntry { name, issuer, secret, algorithm, digits, period }
        })
        .collect();

    let count = entries.len();
    let json = serde_json::to_string_pretty(&Export { app: "Personal TOTP", version: 1, entries })
        .map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(count)
}

#[tauri::command]
fn reset_vault(state: State<AppState>) -> Result<(), String> {
    *state.master_key.lock().unwrap() = None;
    *state.auto_lock_at.lock().unwrap() = None;
    let conn = state.db.lock().unwrap();
    conn.execute("DELETE FROM totp_entries", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM config", []).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_shortcut(state: State<AppState>) -> String {
    state.shortcut.lock().unwrap().clone()
}

#[tauri::command]
fn set_shortcut(shortcut: String, app: tauri::AppHandle, state: State<AppState>) -> Result<(), String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let new_sc = parse_shortcut(&shortcut)?;
    let old_str = state.shortcut.lock().unwrap().clone();
    if let Ok(old_sc) = parse_shortcut(&old_str) {
        app.global_shortcut().unregister(old_sc).ok();
    }
    app.global_shortcut().register(new_sc).map_err(|e| e.to_string())?;
    state
        .db
        .lock()
        .unwrap()
        .execute(
            "INSERT OR REPLACE INTO config (key, value) VALUES ('global_shortcut', ?1)",
            params![shortcut],
        )
        .map_err(|e| e.to_string())?;
    *state.shortcut.lock().unwrap() = shortcut;
    Ok(())
}

#[tauri::command]
fn open_log_dir(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let log_dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&log_dir).ok();
    app.opener().open_path(log_dir.to_string_lossy(), None::<String>).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_log(app: tauri::AppHandle, level: String, message: String) {
    use std::io::Write;
    let Ok(log_dir) = app.path().app_log_dir() else { return };
    let _ = std::fs::create_dir_all(&log_dir);
    let now = chrono::Local::now();
    let log_file = log_dir.join(format!("log-{}.txt", now.format("%Y%m%d")));
    let line = format!("[{}] [{}] {}\n", now.format("%Y-%m-%d %H:%M:%S%.3f"), level, message);
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(log_file) {
        let _ = f.write_all(line.as_bytes());
    }
}

// ---- Entry point ----

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Init SQLite
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("totp.db");
            let conn = Connection::open(&db_path)?;
            init_db(&conn)?;
            migrate_db(&conn);

            let auto_lock_timeout = read_auto_lock_timeout(&conn);
            let shortcut_str = read_shortcut_config(&conn);

            app.manage(AppState {
                master_key: Mutex::new(None),
                db: Mutex::new(conn),
                auto_lock_at: Mutex::new(None),
                auto_lock_timeout: Mutex::new(auto_lock_timeout),
                shortcut: Mutex::new(shortcut_str),
            });

            // Background auto-lock thread: checks every 30s and wipes key if timer expired
            {
                let handle = app.handle().clone();
                std::thread::spawn(move || loop {
                    std::thread::sleep(std::time::Duration::from_secs(30));
                    let state = handle.state::<AppState>();
                    let should_lock = {
                        let lock_at = state.auto_lock_at.lock().unwrap();
                        lock_at.map_or(false, |ts| now_secs() >= ts)
                    };
                    if should_lock {
                        *state.master_key.lock().unwrap() = None;
                        *state.auto_lock_at.lock().unwrap() = None;
                        let _ = handle.emit("auto-locked", ());
                    }
                });
            }

            // Global shortcut: Alt+Shift+A → toggle window
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};
                let sc_str = app.state::<AppState>().shortcut.lock().unwrap().clone();
                let shortcut = parse_shortcut(&sc_str)
                    .unwrap_or_else(|_| Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::KeyA));
                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_shortcut(shortcut)?
                        .with_handler(|app_handle, _shortcut, event| {
                            if event.state() == ShortcutState::Pressed {
                                if let Some(win) = app_handle.get_webview_window("main") {
                                    if win.is_visible().unwrap_or(false) {
                                        arm_auto_lock(&app_handle.state::<AppState>());
                                        let _ = win.hide();
                                    } else {
                                        *app_handle
                                            .state::<AppState>()
                                            .auto_lock_at
                                            .lock()
                                            .unwrap() = None;
                                        let _ = win.show();
                                        let _ = win.set_focus();
                                    }
                                }
                            }
                        })
                        .build(),
                )?;
            }

            // System tray
            #[cfg(desktop)]
            {
                let show_i = MenuItem::with_id(app, "show", "Mostrar", true, None::<&str>)?;
                let quit_i = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

                TrayIconBuilder::new()
                    .icon(app.default_window_icon().unwrap().clone())
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .tooltip("Personal TOTP")
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            if let Some(win) = tray.app_handle().get_webview_window("main") {
                                if win.is_visible().unwrap_or(false) {
                                    arm_auto_lock(&tray.app_handle().state::<AppState>());
                                    let _ = win.hide();
                                } else {
                                    *tray
                                        .app_handle()
                                        .state::<AppState>()
                                        .auto_lock_at
                                        .lock()
                                        .unwrap() = None;
                                    let _ = win.show();
                                    let _ = win.set_focus();
                                }
                            }
                        }
                    })
                    .on_menu_event(|app_handle, event| match event.id.as_ref() {
                        "show" => {
                            if let Some(win) = app_handle.get_webview_window("main") {
                                *app_handle
                                    .state::<AppState>()
                                    .auto_lock_at
                                    .lock()
                                    .unwrap() = None;
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                        "quit" => app_handle.exit(0),
                        _ => {}
                    })
                    .build(app)?;
            }

            // Close button → hide to tray + arm auto-lock timer
            if let Some(win) = app.get_webview_window("main") {
                let handle = app.handle().clone();
                win.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        arm_auto_lock(&handle.state::<AppState>());
                        if let Some(w) = handle.get_webview_window("main") {
                            let _ = w.hide();
                        }
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            is_setup,
            setup_password,
            unlock,
            lock,
            is_unlocked,
            get_entries,
            get_totp_code,
            add_entry,
            delete_entry,
            toggle_favorite,
            record_copy,
            update_entry,
            hide_window,
            get_auto_lock_timeout,
            set_auto_lock_timeout,
            quit,
            import_vault,
            export_vault,
            reset_vault,
            write_log,
            open_log_dir,
            get_shortcut,
            set_shortcut,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
