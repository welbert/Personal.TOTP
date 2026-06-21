import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { XIcon } from "./icons";

interface Entry {
  id: number;
  name: string;
  issuer: string;
  algorithm: string;
  digits: number;
  period: number;
}

interface Props {
  entry: Entry;
  onClose: () => void;
  onSaved: () => void;
}

const inputCls = "w-full bg-theme-raised border border-theme-border rounded-lg px-3 py-2 text-sm text-theme-1 placeholder-theme-4 outline-none focus:border-emerald-500 transition-colors";
const selectCls = "w-full bg-theme-raised border border-theme-border rounded-lg px-2 py-2 text-sm text-theme-1 outline-none focus:border-emerald-500";
const labelCls = "block text-xs text-theme-3 mb-1";

export default function EditEntryModal({ entry, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(entry.name);
  const [issuer, setIssuer] = useState(entry.issuer);
  const [newSecret, setNewSecret] = useState("");
  const [algorithm, setAlgorithm] = useState(entry.algorithm);
  const [digits, setDigits] = useState(String(entry.digits));
  const [period, setPeriod] = useState(String(entry.period));
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError(t("editEntry.errorName"));
      return;
    }

    setLoading(true);
    try {
      await invoke("update_entry", {
        id: entry.id,
        name: name.trim(),
        issuer: issuer.trim(),
        newSecret: newSecret.trim() || null,
        algorithm,
        digits: parseInt(digits),
        period: parseInt(period),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4 fade-in">
      <div className="bg-theme-surface border border-theme-border rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-theme-line">
          <h2 className="text-sm font-semibold text-theme-1">{t("editEntry.title")}</h2>
          <button onClick={onClose} className="text-theme-4 hover:text-theme-2 transition-colors">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className={labelCls}>{t("editEntry.name")}</label>
            <input
              type="text"
              placeholder={t("editEntry.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>{t("editEntry.issuer")}</label>
            <input
              type="text"
              placeholder={t("editEntry.issuerPlaceholder")}
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>{t("editEntry.secret")}</label>
            <input
              type="text"
              placeholder={t("editEntry.secretPlaceholder")}
              value={newSecret}
              onChange={(e) => setNewSecret(e.target.value.toUpperCase())}
              className={`${inputCls} font-mono`}
            />
            <p className="text-xs text-theme-5 mt-1">{t("editEntry.secretHint")}</p>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-xs text-theme-4 hover:text-theme-2 transition-colors"
          >
            {showAdvanced ? t("editEntry.hideAdvanced") : t("editEntry.showAdvanced")}
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-3 gap-2 fade-in">
              <div>
                <label className={labelCls}>{t("editEntry.algorithm")}</label>
                <select value={algorithm} onChange={(e) => setAlgorithm(e.target.value)} className={selectCls}>
                  <option>SHA1</option>
                  <option>SHA256</option>
                  <option>SHA512</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>{t("editEntry.digits")}</label>
                <select value={digits} onChange={(e) => setDigits(e.target.value)} className={selectCls}>
                  <option value="6">6</option>
                  <option value="8">8</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>{t("editEntry.period")}</label>
                <select value={period} onChange={(e) => setPeriod(e.target.value)} className={selectCls}>
                  <option value="30">30</option>
                  <option value="60">60</option>
                </select>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-theme-raised hover:bg-theme-hover text-theme-2 text-sm font-medium rounded-lg py-2 transition-colors"
            >
              {t("editEntry.cancel")}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg py-2 transition-colors"
            >
              {loading ? t("editEntry.submitting") : t("editEntry.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
