import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { logger } from "../logger";

interface Props {
  onConfirmed: () => void;
  onCancel: () => void;
}

export default function ResetVaultModal({ onConfirmed, onCancel }: Props) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleReset() {
    setLoading(true);
    try {
      await invoke("reset_vault");
      onConfirmed();
    } catch (err) {
      logger.error("reset_vault failed", err);
      setError(String(err));
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4 fade-in">
      <div className="bg-slate-900 border border-red-900/50 rounded-2xl w-full max-w-sm shadow-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-red-900/40 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-sm font-semibold text-red-400">{t("reset.title")}</h2>
        </div>

        <p className="text-sm text-slate-300 mb-4">{t("reset.warning")}</p>

        <p className="text-xs text-slate-400 mb-1.5">{t("reset.typePrompt")}</p>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("reset.placeholder")}
          autoFocus
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-red-500 transition-colors font-mono mb-4"
        />

        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg py-2 transition-colors"
          >
            {t("reset.cancel")}
          </button>
          <button
            onClick={handleReset}
            disabled={input !== "DELETE" || loading}
            className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg py-2 transition-colors"
          >
            {loading ? t("reset.submitting") : t("reset.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
