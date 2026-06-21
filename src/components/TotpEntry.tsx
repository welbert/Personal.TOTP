import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useTranslation } from "react-i18next";
import { logger } from "../logger";
import { CheckIcon, CopyIcon, PencilIcon, StarIcon, TrashIcon } from "./icons";
import ConfirmModal from "./ConfirmModal";

interface Entry {
  id: number;
  name: string;
  issuer: string;
  period: number;
  is_favorite: boolean;
  last_copied_at: number | null;
}

interface Code {
  current: string;
  next: string;
}

interface Props {
  entry: Entry;
  onDelete: (id: number) => void;
  onCopied: (id: number) => void;
  onFavoriteToggled: (id: number) => void;
  onEdit: (id: number) => void;
  shortcutKey?: number;
  flashCopied?: boolean;
}

function useCountdown(period: number) {
  const [remaining, setRemaining] = useState(() => {
    const now = Math.floor(Date.now() / 1000);
    return period - (now % period);
  });

  useEffect(() => {
    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      setRemaining(period - (now % period));
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [period]);

  return remaining;
}

function formatCode(code: string): string {
  if (code.length === 6) return `${code.slice(0, 3)} ${code.slice(3)}`;
  if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`;
  return code;
}

export default function TotpEntry({
  entry,
  onDelete,
  onCopied,
  onFavoriteToggled,
  onEdit,
  shortcutKey,
  flashCopied,
}: Props) {
  const { t } = useTranslation();
  const [code, setCode] = useState<Code | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const remaining = useCountdown(entry.period);
  const prevPeriodSlotRef = useRef(-1);

  const fetchCode = useCallback(async () => {
    try {
      const c = await invoke<Code>("get_totp_code", { id: entry.id });
      setCode(c);
    } catch {
      // ignore
    }
  }, [entry.id]);

  useEffect(() => {
    fetchCode();
  }, [fetchCode]);

  useEffect(() => {
    const now = Math.floor(Date.now() / 1000);
    const slot = Math.floor(now / entry.period);
    if (prevPeriodSlotRef.current !== -1 && prevPeriodSlotRef.current !== slot) {
      fetchCode();
    }
    prevPeriodSlotRef.current = slot;
  }, [remaining, fetchCode, entry.period]);

  async function handleCopy() {
    if (!code) return;
    try {
      await writeText(code.current.replace(/\s/g, ""));
      invoke("record_copy", { id: entry.id }).catch(() => {});
      onCopied(entry.id);
    } catch (err) {
      logger.error("click copy failed", err);
    }
  }

  async function handleFavorite(e: React.MouseEvent) {
    e.stopPropagation();
    await invoke("toggle_favorite", { id: entry.id });
    onFavoriteToggled(entry.id);
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setShowConfirm(true);
  }

  async function confirmDelete() {
    setShowConfirm(false);
    setDeleting(true);
    try {
      await invoke("delete_entry", { id: entry.id });
      onDelete(entry.id);
    } catch {
      setDeleting(false);
    }
  }

  const progress = (remaining / entry.period) * 100;
  const urgent = remaining <= 5;
  const showCopied = flashCopied;

  return (
    <div
      className="group bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 cursor-pointer hover:border-slate-600 transition-all"
      onClick={handleCopy}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {shortcutKey !== undefined && (
            <span className="shrink-0 w-5 h-5 rounded flex items-center justify-center text-[10px] font-mono font-semibold bg-slate-800 text-slate-500 border border-slate-700 group-hover:border-slate-600 group-hover:text-slate-400 transition-colors">
              {shortcutKey}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-100 truncate">{entry.name}</p>
            {entry.issuer && (
              <p className="text-xs text-slate-500 truncate">{entry.issuer}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleFavorite}
            className={`p-0.5 transition-colors ${
              entry.is_favorite
                ? "text-amber-400 hover:text-amber-300"
                : "text-slate-700 hover:text-amber-400 opacity-0 group-hover:opacity-100"
            }`}
            title={entry.is_favorite ? t("entry.unfavorite") : t("entry.favorite")}
          >
            <StarIcon className="w-3.5 h-3.5" filled={entry.is_favorite} />
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); onEdit(entry.id); }}
            className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-slate-300 transition-all p-0.5"
            title={t("entry.edit")}
          >
            <PencilIcon className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleDelete}
            disabled={deleting}
            className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all p-0.5"
            title={t("entry.remove")}
          >
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className={`font-mono text-xl font-bold tracking-widest ${urgent ? "text-amber-400" : "text-emerald-400"}`}>
            {code ? formatCode(code.current) : "------"}
          </span>
          {code && (
            <span className="font-mono text-xs text-slate-600 tracking-widest">
              {formatCode(code.next)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs tabular-nums ${urgent ? "text-amber-400" : "text-slate-500"}`}>
            {remaining}s
          </span>
          <div className={`transition-all ${showCopied ? "text-emerald-400" : "text-slate-600 group-hover:text-slate-400"}`}>
            {showCopied ? <CheckIcon className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
          </div>
        </div>
      </div>

      <div className="mt-2.5 h-0.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-none ${urgent ? "bg-amber-400" : "bg-emerald-500"}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {showConfirm && (
        <ConfirmModal
          message={t("main.removeConfirm", { name: entry.name })}
          confirmLabel={t("entry.remove")}
          cancelLabel={t("entry.cancel")}
          onConfirm={confirmDelete}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
