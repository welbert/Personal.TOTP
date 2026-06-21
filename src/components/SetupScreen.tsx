import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { LockIcon } from "./icons";

interface Props {
  onDone: () => void;
}

export default function SetupScreen({ onDone }: Props) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError(t("setup.errorMinLength"));
      return;
    }
    if (password !== confirm) {
      setError(t("setup.errorMismatch"));
      return;
    }

    setLoading(true);
    try {
      await invoke("setup_password", { password });
      onDone();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-theme-bg px-8 fade-in">
      <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-5">
        <LockIcon className="w-6 h-6 text-emerald-400" />
      </div>

      <h1 className="text-lg font-semibold text-theme-1 mb-1">{t("setup.title")}</h1>
      <p className="text-sm text-theme-3 mb-6 text-center">{t("setup.subtitle")}</p>

      <form onSubmit={handleSubmit} className="w-full space-y-3">
        <input
          type="password"
          placeholder={t("setup.password")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          className="w-full bg-theme-raised border border-theme-border rounded-lg px-3 py-2.5 text-sm text-theme-1 placeholder-theme-4 outline-none focus:border-emerald-500 transition-colors"
        />
        <input
          type="password"
          placeholder={t("setup.confirm")}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full bg-theme-raised border border-theme-border rounded-lg px-3 py-2.5 text-sm text-theme-1 placeholder-theme-4 outline-none focus:border-emerald-500 transition-colors"
        />

        {error && <p className="text-xs text-red-400 px-1">{error}</p>}

        <button
          type="submit"
          disabled={loading || !password || !confirm}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg py-2.5 transition-colors"
        >
          {loading ? t("setup.submitting") : t("setup.submit")}
        </button>
      </form>
    </div>
  );
}
