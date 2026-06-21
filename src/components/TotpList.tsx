import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useTranslation } from "react-i18next";
import { logger } from "../logger";
import { GearIcon, LockIcon, PlusIcon, SearchIcon } from "./icons";
import TotpEntry from "./TotpEntry";
import AddEntryModal from "./AddEntryModal";
import EditEntryModal from "./EditEntryModal";
import SettingsModal from "./SettingsModal";

interface Entry {
  id: number;
  name: string;
  issuer: string;
  algorithm: string;
  digits: number;
  period: number;
  is_favorite: boolean;
  last_copied_at: number | null;
}

interface TotpCode {
  current: string;
  next: string;
}

interface Props {
  onLock: () => void;
}

export default function TotpList({ onLock }: Props) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [version, setVersion] = useState("");

  const loadEntries = useCallback(async () => {
    try {
      const list = await invoke<Entry[]>("get_entries");
      setEntries(list);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEntries();
    getVersion().then(setVersion);
  }, [loadEntries]);

  useEffect(() => {
    function onFocus() {
      setSearch("");
      setCopiedId(null);
      loadEntries();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadEntries]);

  async function handleLock() {
    await invoke("lock");
    onLock();
  }

  function handleDelete(id: number) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function markCopied(id: number) {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    setCopiedId(id);
    copiedTimerRef.current = setTimeout(() => setCopiedId(null), 2000);
  }

  function handleCopied(id: number) {
    markCopied(id);
    loadEntries();
  }

  function handleFavoriteToggled(_id: number) {
    loadEntries();
  }

  const filtered = entries.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return e.name.toLowerCase().includes(q) || e.issuer.toLowerCase().includes(q);
  });

  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;

  const modalOpenRef = useRef(false);
  modalOpenRef.current = showAdd || editingId !== null || showSettings;

  // Keyboard shortcuts
  useEffect(() => {
    async function handleKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) return;

      if (e.key === "Escape") {
        e.preventDefault();
        await invoke("hide_window");
        return;
      }

      if (e.key === "s" && !modalOpenRef.current) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }

      const digit = parseInt(e.key);
      if (isNaN(digit) || digit < 1 || digit > 9) return;

      const entry = filteredRef.current[digit - 1];
      if (!entry) return;

      e.preventDefault();

      try {
        const code = await invoke<TotpCode>("get_totp_code", { id: entry.id });
        await writeText(code.current.replace(/\s/g, ""));
        invoke("record_copy", { id: entry.id }).catch(() => {});
        markCopied(entry.id);
        setTimeout(() => invoke("hide_window"), 400);
      } catch (err) {
        logger.error("keyboard copy failed", err);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-theme-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-theme-2">{t("main.appName")}</span>
          {version && <span className="text-xs text-theme-5">v{version}</span>}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSettings(true)}
            title={t("main.settings")}
            className="text-theme-4 hover:text-theme-2 transition-colors p-1"
          >
            <GearIcon className="w-4 h-4" />
          </button>
          <button
            onClick={handleLock}
            title={t("main.lock")}
            className="text-theme-4 hover:text-theme-2 transition-colors p-1"
          >
            <LockIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 pb-3 shrink-0">
        <div className="flex items-center gap-2 bg-theme-surface border border-theme-line rounded-lg px-3 py-2 focus-within:border-theme-ring transition-colors">
          <SearchIcon className="w-4 h-4 text-theme-5 shrink-0" />
          <input
            ref={searchRef}
            type="text"
            placeholder={t("main.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") searchRef.current?.blur(); }}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="flex-1 bg-transparent text-sm text-theme-1 placeholder-theme-5 outline-none"
          />
          {search ? (
            <button
              onClick={() => setSearch("")}
              className="text-theme-5 hover:text-theme-3 text-xs"
            >
              ✕
            </button>
          ) : !searchFocused && (
            <kbd className="text-theme-5 text-xs font-mono bg-theme-raised border border-theme-border rounded px-1 py-0.5 pointer-events-none">
              S
            </kbd>
          )}
        </div>
      </div>

      {/* Entry list */}
      <div className="flex-1 overflow-y-auto px-4 space-y-2 pb-20 min-h-0">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-theme-border border-t-emerald-400 rounded-full animate-spin" />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            {entries.length === 0 ? (
              <>
                <p className="text-theme-4 text-sm mb-1">{t("main.emptyTitle")}</p>
                <p className="text-theme-5 text-xs">{t("main.emptySubtitle")}</p>
              </>
            ) : (
              <p className="text-theme-4 text-sm">{t("main.noResults", { query: search })}</p>
            )}
          </div>
        )}

        {filtered.map((entry, index) => (
          <TotpEntry
            key={entry.id}
            entry={entry}
            onDelete={handleDelete}
            onCopied={handleCopied}
            onFavoriteToggled={handleFavoriteToggled}
            onEdit={setEditingId}
            shortcutKey={index < 9 ? index + 1 : undefined}
            flashCopied={copiedId === entry.id}
          />
        ))}
      </div>

      {/* FAB */}
      <div className="absolute bottom-5 right-5">
        <button
          onClick={() => setShowAdd(true)}
          className="w-11 h-11 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full shadow-lg flex items-center justify-center transition-colors"
          title={t("main.addAccount")}
        >
          <PlusIcon className="w-5 h-5" />
        </button>
      </div>

      {showAdd && (
        <AddEntryModal
          onClose={() => setShowAdd(false)}
          onAdded={loadEntries}
        />
      )}

      {editingId !== null && (() => {
        const entry = entries.find((e) => e.id === editingId);
        return entry ? (
          <EditEntryModal
            entry={entry}
            onClose={() => setEditingId(null)}
            onSaved={loadEntries}
          />
        ) : null;
      })()}

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} onImported={loadEntries} />
      )}
    </div>
  );
}
