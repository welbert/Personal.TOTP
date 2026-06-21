import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { logger } from "../logger";
import { useToast } from "../hooks/useToast";
import ToastContainer from "./ToastContainer";
import { XIcon } from "./icons";

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

  useEffect(() => {
    invoke<number | null>("get_auto_lock_timeout").then(setAutoLock);
    invoke<string>("get_shortcut").then(setShortcut);
  }, []);

  function handleLanguage(code: string) {
    i18n.changeLanguage(code);
    localStorage.setItem("lang", code);
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

    parts.push(e.code); // e.g. "KeyA", "Digit1", "F5"
    const newShortcut = parts.join("+");

    setCapturing(false);
    invoke<void>("set_shortcut", { shortcut: newShortcut })
      .then(() => { setShortcut(newShortcut); setShortcutError(""); })
      .catch((err) => {
        logger.error("set_shortcut failed", err);
        setShortcutError(t("settings.shortcutError"));
      });
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4 fade-in">
      <ToastContainer toasts={toasts} />
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-slate-100">{t("settings.title")}</h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-5 overflow-y-auto max-h-[calc(100vh-8rem)]">
          {/* Language */}
          <div>
            <p className="text-xs text-slate-400 mb-2">{t("settings.language")}</p>
            <div className="space-y-1">
              {LANGUAGES.map((code) => (
                <button
                  key={code}
                  onClick={() => handleLanguage(code)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    i18n.language === code
                      ? "bg-emerald-600/20 text-emerald-400 border border-emerald-600/30"
                      : "text-slate-300 hover:bg-slate-800 border border-transparent"
                  }`}
                >
                  {t(`settings.languages.${code}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Global shortcut */}
          <div>
            <p className="text-xs text-slate-400 mb-2">{t("settings.shortcut")}</p>
            <button
              ref={captureRef}
              onClick={startCapture}
              onKeyDown={capturing ? handleKeyCapture : undefined}
              onBlur={() => setCapturing(false)}
              className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors outline-none ${
                capturing
                  ? "border-emerald-500 text-emerald-400 bg-emerald-600/10 animate-pulse"
                  : "border-slate-700 text-slate-300 bg-slate-800 hover:border-slate-500"
              }`}
            >
              {capturing ? (
                t("settings.shortcutCapture")
              ) : (
                formatShortcut(shortcut).map((part, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-slate-600 text-xs">+</span>}
                    <kbd className="bg-slate-700 text-slate-200 text-xs font-mono px-1.5 py-0.5 rounded">
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
            <p className="text-xs text-slate-400 mb-2">{t("settings.autoLock")}</p>
            <select
              value={autoLock ?? "never"}
              onChange={(e) => {
                const val = e.target.value;
                handleAutoLock(val === "never" ? null : Number(val));
              }}
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 outline-none focus:border-slate-500 transition-colors cursor-pointer"
            >
              {AUTO_LOCK_OPTIONS.map(({ secs }) => (
                <option key={secs ?? "never"} value={secs ?? "never"}>
                  {autoLockLabel(secs)}
                </option>
              ))}
            </select>
          </div>

          {/* Import / Export */}
          <div className="border-t border-slate-800 pt-4">
            <p className="text-xs text-slate-400 mb-2">{t("settings.importExport")}</p>
            <div className="space-y-1">
              <button
                onClick={handleImport}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800 border border-transparent transition-colors"
              >
                {t("settings.importButton")}
              </button>

              <button
                onClick={handleTemplate}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-500 hover:text-slate-300 hover:bg-slate-800 border border-transparent transition-colors"
              >
                {t("settings.importTemplate")}
              </button>
              <button
                onClick={handleExport}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800 border border-transparent transition-colors"
              >
                {t("settings.exportButton")}
              </button>

            </div>
          </div>

          {/* Diagnostics */}
          <div className="border-t border-slate-800 pt-4">
            <p className="text-xs text-slate-400 mb-2">{t("settings.diagnostics")}</p>
            <button
              onClick={() => invoke("open_log_dir")}
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800 border border-transparent transition-colors"
            >
              {t("settings.openLogFolder")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
