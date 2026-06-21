import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { logger } from "../logger";
import { useToast } from "../hooks/useToast";
import ToastContainer from "./ToastContainer";
import { XIcon } from "./icons";
import { getTheme, setTheme, type Theme } from "../theme";

const LANGUAGES = ["pt-BR", "en-US"] as const;

const AUTO_LOCK_OPTIONS: Array<{ secs: number | null }> = [
  { secs: null },
  { secs: 300 },
  { secs: 600 },
  { secs: 900 },
  { secs: 1800 },
  { secs: 3600 },
];

interface Props {
  onClose: () => void;
  onImported?: () => void;
}

function formatShortcut(raw: string): string[] {
  return raw.split("+").map((p) => p.replace(/^Key/, "").replace(/^Digit/, ""));
}

export default function SettingsModal({ onClose, onImported }: Props) {
  const { t } = useTranslation();
  const [autoLock, setAutoLock] = useState<number | null>(300);
  const [shortcut, setShortcut] = useState("Alt+Shift+KeyA");
  const [capturing, setCapturing] = useState(false);
  const [shortcutError, setShortcutError] = useState("");
  const captureRef = useRef<HTMLButtonElement>(null);
  const { toasts, show: showToast } = useToast();
  const [theme, setThemeState] = useState<Theme>(getTheme);

  useEffect(() => {
    invoke<number | null>("get_auto_lock_timeout").then(setAutoLock);
    invoke<string>("get_shortcut").then(setShortcut);
  }, []);

  function handleLanguage(code: string) {
    i18n.changeLanguage(code);
    localStorage.setItem("lang", code);
  }

  function handleTheme(opt: Theme) {
    setThemeState(opt);
    setTheme(opt);
  }

  async function handleAutoLock(secs: number | null) {
    setAutoLock(secs);
    await invoke("set_auto_lock_timeout", { secs });
  }

  function autoLockLabel(secs: number | null) {
    const key = secs === null ? "never" : String(secs);
    return t(`settings.autoLockOptions.${key}`);
  }

  async function handleImport() {
    const path = await open({
      multiple: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return;
    try {
      const [imported, skipped, failed] = await invoke<[number, number, number]>("import_vault", { path });
      if (skipped === 0 && failed === 0) {
        showToast(t("settings.importSuccess", { imported }), "success");
      } else if (failed === 0) {
        showToast(t("settings.importSkipped", { imported, skipped }), "success");
      } else {
        showToast(t("settings.importPartial", { imported, skipped, failed }), "error");
      }
      onImported?.();
    } catch (err) {
      logger.error("import_vault failed", err);
      showToast(t("settings.importError"), "error");
    }
  }

  function handleTemplate() {
    const template = JSON.stringify({
      app: "Personal TOTP",
      version: 1,
      entries: [
        { name: "Example Service", issuer: "example.com", secret: "JBSWY3DPEHPK3PXP", algorithm: "SHA1", digits: 6, period: 30 },
        { name: "Another Service", issuer: "another.com", secret: "JBSWY3DPEHPK3PXP", algorithm: "SHA1", digits: 6, period: 30 },
      ],
    }, null, 2);
    const blob = new Blob([template], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "personal-totp-template.json";
    a.click();
    URL.revokeObjectURL(url);
    showToast(t("settings.templateDownloaded"), "success");
  }

  async function handleExport() {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const path = await save({
      defaultPath: `personal-totp-${date}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return;
    try {
      const count = await invoke<number>("export_vault", { path });
      const filename = path.split(/[\\/]/).pop() ?? path;
      showToast(t("settings.exportSuccess", { count, filename }), "success");
    } catch (err) {
      logger.error("export_vault failed", err);
      showToast(t("settings.exportError"), "error");
    }
  }

  function startCapture() {
    setShortcutError("");
    setCapturing(true);
    setTimeout(() => captureRef.current?.focus(), 0);
  }

  function handleKeyCapture(e: React.KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    const MODS = ["Control", "Alt", "Shift", "Meta"];
    if (MODS.includes(e.key)) return;

    const parts: string[] = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (e.metaKey) parts.push("Meta");

    if (parts.length === 0) {
      setShortcutError(t("settings.shortcutNeedsModifier"));
      setCapturing(false);
      return;
    }

    parts.push(e.code);
    const newShortcut = parts.join("+");

    setCapturing(false);
    invoke<void>("set_shortcut", { shortcut: newShortcut })
      .then(() => { setShortcut(newShortcut); setShortcutError(""); })
      .catch((err) => {
        logger.error("set_shortcut failed", err);
        setShortcutError(t("settings.shortcutError"));
      });
  }

  const optionCls = (active: boolean) =>
    `w-full text-left px-3 py-2 rounded-lg text-sm transition-colors border ${
      active
        ? "bg-emerald-600/20 text-emerald-400 border-emerald-600/30"
        : "text-theme-2 hover:bg-theme-raised border-transparent"
    }`;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4 fade-in">
      <ToastContainer toasts={toasts} />
      <div className="bg-theme-surface border border-theme-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-theme-line">
          <h2 className="text-sm font-semibold text-theme-1">{t("settings.title")}</h2>
          <button
            onClick={onClose}
            className="text-theme-4 hover:text-theme-2 transition-colors"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-5 overflow-y-auto max-h-[calc(100vh-8rem)]">
          {/* Theme */}
          <div>
            <p className="text-xs text-theme-3 mb-2">{t("settings.theme")}</p>
            <div className="space-y-1">
              {(["system", "dark", "light"] as Theme[]).map((opt) => (
                <button key={opt} onClick={() => handleTheme(opt)} className={optionCls(theme === opt)}>
                  {t(`settings.themes.${opt}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Language */}
          <div>
            <p className="text-xs text-theme-3 mb-2">{t("settings.language")}</p>
            <div className="space-y-1">
              {LANGUAGES.map((code) => (
                <button
                  key={code}
                  onClick={() => handleLanguage(code)}
                  className={optionCls(i18n.language === code)}
                >
                  {t(`settings.languages.${code}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Global shortcut */}
          <div>
            <p className="text-xs text-theme-3 mb-2">{t("settings.shortcut")}</p>
            <button
              ref={captureRef}
              onClick={startCapture}
              onKeyDown={capturing ? handleKeyCapture : undefined}
              onBlur={() => setCapturing(false)}
              className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors outline-none ${
                capturing
                  ? "border-emerald-500 text-emerald-400 bg-emerald-600/10 animate-pulse"
                  : "border-theme-border text-theme-2 bg-theme-raised hover:border-theme-ring"
              }`}
            >
              {capturing ? (
                t("settings.shortcutCapture")
              ) : (
                formatShortcut(shortcut).map((part, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-theme-5 text-xs">+</span>}
                    <kbd className="bg-theme-hover text-theme-1 text-xs font-mono px-1.5 py-0.5 rounded">
                      {part}
                    </kbd>
                  </span>
                ))
              )}
            </button>
            {shortcutError && (
              <p className="text-xs text-red-400 mt-1">{shortcutError}</p>
            )}
          </div>

          {/* Auto-lock */}
          <div>
            <p className="text-xs text-theme-3 mb-2">{t("settings.autoLock")}</p>
            <select
              value={autoLock ?? "never"}
              onChange={(e) => {
                const val = e.target.value;
                handleAutoLock(val === "never" ? null : Number(val));
              }}
              className="w-full bg-theme-raised border border-theme-border text-theme-1 text-sm rounded-lg px-3 py-2 outline-none focus:border-theme-ring transition-colors cursor-pointer"
            >
              {AUTO_LOCK_OPTIONS.map(({ secs }) => (
                <option key={secs ?? "never"} value={secs ?? "never"}>
                  {autoLockLabel(secs)}
                </option>
              ))}
            </select>
          </div>

          {/* Import / Export */}
          <div className="border-t border-theme-line pt-4">
            <p className="text-xs text-theme-3 mb-2">{t("settings.importExport")}</p>
            <div className="space-y-1">
              <button
                onClick={handleImport}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-theme-2 hover:bg-theme-raised border border-transparent transition-colors"
              >
                {t("settings.importButton")}
              </button>

              <button
                onClick={handleTemplate}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-theme-4 hover:text-theme-2 hover:bg-theme-raised border border-transparent transition-colors"
              >
                {t("settings.importTemplate")}
              </button>
              <button
                onClick={handleExport}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-theme-2 hover:bg-theme-raised border border-transparent transition-colors"
              >
                {t("settings.exportButton")}
              </button>
            </div>
          </div>

          {/* Diagnostics */}
          <div className="border-t border-theme-line pt-4">
            <p className="text-xs text-theme-3 mb-2">{t("settings.diagnostics")}</p>
            <button
              onClick={() => invoke("open_log_dir")}
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-theme-2 hover:bg-theme-raised border border-transparent transition-colors"
            >
              {t("settings.openLogFolder")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
