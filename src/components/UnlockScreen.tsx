import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { LockIcon } from "./icons";
import ResetVaultModal from "./ResetVaultModal";

interface Props {
  onUnlocked: () => void;
  onReset: () => void;
}

export default function UnlockScreen({ onUnlocked, onReset }: Props) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [showReset, setShowReset] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const ok = await invoke<boolean>("unlock", { password });
      if (ok) {
        onUnlocked();
      } else {
        setAttempts((a) => a + 1);
        setError(t("unlock.errorWrong"));
        setPassword("");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-950 px-8 fade-in">
      <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mb-5">
        <LockIcon className="w-6 h-6 text-slate-400" />
      </div>

      <h1 className="text-lg font-semibold text-slate-100 mb-1">{t("unlock.title")}</h1>
      <p className="text-sm text-slate-400 mb-6">{t("unlock.subtitle")}</p>

      <form onSubmit={handleSubmit} className="w-full space-y-3">
        <input
          type="password"
          placeholder={t("unlock.password")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-500 transition-colors"
        />

        {error && (
          <p className="text-xs text-red-400 px-1">
            {error}
            {attempts >= 3 && t("unlock.errorCapsLock")}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !password}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg py-2.5 transition-colors"
        >
          {loading ? t("unlock.submitting") : t("unlock.submit")}
        </button>
      </form>

      <button
        onClick={() => setShowReset(true)}
        className="mt-6 text-xs text-slate-600 hover:text-slate-400 transition-colors"
      >
        {t("reset.link")}
      </button>

      {showReset && (
        <ResetVaultModal
          onConfirmed={onReset}
          onCancel={() => setShowReset(false)}
        />
      )}
    </div>
  );
}
