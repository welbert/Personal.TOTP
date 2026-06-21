import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation, Trans } from "react-i18next";
import { XIcon } from "./icons";

interface Props {
  onClose: () => void;
  onAdded: () => void;
}

interface FormState {
  name: string;
  issuer: string;
  secret: string;
  algorithm: string;
  digits: string;
  period: string;
}

function parseOtpauthUrl(url: string): Partial<FormState> {
  try {
    const withProtocol = url.replace("otpauth://", "http://otpauth/");
    const u = new URL(withProtocol);
    const params = u.searchParams;
    const rawLabel = decodeURIComponent(u.pathname.slice(1));
    const [labelIssuer, labelName] = rawLabel.includes(":")
      ? rawLabel.split(":", 2)
      : ["", rawLabel];

    return {
      name: params.get("issuer") || labelIssuer || rawLabel,
      issuer: labelName || "",
      secret: (params.get("secret") || "").toUpperCase(),
      algorithm: params.get("algorithm") || "SHA1",
      digits: params.get("digits") || "6",
      period: params.get("period") || "30",
    };
  } catch {
    return {};
  }
}

const inputCls = "w-full bg-theme-raised border border-theme-border rounded-lg px-3 py-2 text-sm text-theme-1 placeholder-theme-4 outline-none focus:border-emerald-500 transition-colors";
const selectCls = "w-full bg-theme-raised border border-theme-border rounded-lg px-2 py-2 text-sm text-theme-1 outline-none focus:border-emerald-500";
const labelCls = "block text-xs text-theme-3 mb-1";

export default function AddEntryModal({ onClose, onAdded }: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>({
    name: "",
    issuer: "",
    secret: "",
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  function set(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSecretPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text").trim();
    if (text.startsWith("otpauth://")) {
      e.preventDefault();
      const parsed = parseOtpauthUrl(text);
      setForm((f) => ({ ...f, ...parsed }));
      if (parsed.algorithm !== "SHA1" || parsed.digits !== "6" || parsed.period !== "30") {
        setShowAdvanced(true);
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.name.trim()) { setError(t("addEntry.errorName")); return; }
    if (!form.secret.trim()) { setError(t("addEntry.errorSecret")); return; }

    setLoading(true);
    try {
      await invoke("add_entry", {
        name: form.name.trim(),
        issuer: form.issuer.trim(),
        secret: form.secret.trim(),
        algorithm: form.algorithm,
        digits: parseInt(form.digits),
        period: parseInt(form.period),
      });
      onAdded();
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
          <h2 className="text-sm font-semibold text-theme-1">{t("addEntry.title")}</h2>
          <button onClick={onClose} className="text-theme-4 hover:text-theme-2 transition-colors">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <p className="text-xs text-theme-4 -mt-1 mb-1">
            <Trans i18nKey="addEntry.otpauthHint">
              Cole uma URL <code className="text-emerald-400">otpauth://</code> no campo Secret para preencher automaticamente.
            </Trans>
          </p>

          <div>
            <label className={labelCls}>{t("addEntry.name")}</label>
            <input
              type="text"
              placeholder={t("addEntry.namePlaceholder")}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              autoFocus
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>{t("addEntry.issuer")}</label>
            <input
              type="text"
              placeholder={t("addEntry.issuerPlaceholder")}
              value={form.issuer}
              onChange={(e) => set("issuer", e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>{t("addEntry.secret")}</label>
            <input
              type="text"
              placeholder={t("addEntry.secretPlaceholder")}
              value={form.secret}
              onChange={(e) => set("secret", e.target.value.toUpperCase())}
              onPaste={handleSecretPaste}
              className={`${inputCls} font-mono`}
            />
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-xs text-theme-4 hover:text-theme-2 transition-colors"
          >
            {showAdvanced ? t("addEntry.hideAdvanced") : t("addEntry.showAdvanced")}
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-3 gap-2 fade-in">
              <div>
                <label className={labelCls}>{t("addEntry.algorithm")}</label>
                <select value={form.algorithm} onChange={(e) => set("algorithm", e.target.value)} className={selectCls}>
                  <option>SHA1</option>
                  <option>SHA256</option>
                  <option>SHA512</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>{t("addEntry.digits")}</label>
                <select value={form.digits} onChange={(e) => set("digits", e.target.value)} className={selectCls}>
                  <option value="6">6</option>
                  <option value="8">8</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>{t("addEntry.period")}</label>
                <select value={form.period} onChange={(e) => set("period", e.target.value)} className={selectCls}>
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
              {t("addEntry.cancel")}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg py-2 transition-colors"
            >
              {loading ? t("addEntry.submitting") : t("addEntry.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
