import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation, Trans } from "react-i18next";
import jsQR from "jsqr";
import { readImage } from "@tauri-apps/plugin-clipboard-manager";
import { ClipboardIcon, PhotoIcon, XIcon } from "./icons";
import { logger } from "../logger";

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

// Parses otpauth://{type}/{label}?{params} without relying on new URL(),
// which breaks on labels that contain "://" or other edge-case characters.
function parseOtpauthUrl(url: string): Partial<FormState> | null {
  try {
    const withoutScheme = url.slice("otpauth://".length); // "totp/label?params"
    const firstSlash = withoutScheme.indexOf("/");
    if (firstSlash === -1) return null;

    const rest = withoutScheme.slice(firstSlash + 1); // "label?params"
    const qMark = rest.indexOf("?");
    const rawLabel = qMark === -1 ? rest : rest.slice(0, qMark);
    const queryStr = qMark === -1 ? "" : rest.slice(qMark + 1);

    let label: string;
    try { label = decodeURIComponent(rawLabel); } catch { label = rawLabel; }

    const params = new URLSearchParams(queryStr);

    // label is "{issuer}:{account}" or just "{account}"
    const colonIdx = label.indexOf(":");
    const issuerFromLabel = colonIdx !== -1 ? label.slice(0, colonIdx) : "";
    const accountFromLabel = colonIdx !== -1 ? label.slice(colonIdx + 1) : label;

    return {
      name: params.get("issuer") || issuerFromLabel || label,
      issuer: accountFromLabel,
      secret: (params.get("secret") || "").toUpperCase(),
      algorithm: params.get("algorithm") || "SHA1",
      digits: params.get("digits") || "6",
      period: params.get("period") || "30",
    };
  } catch {
    return null;
  }
}

async function decodeQRFromBlob(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        resolve(code?.data ?? null);
      };
      img.onerror = () => resolve(null);
      img.src = reader.result as string;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  function set(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSecretPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text").trim();
    if (text.startsWith("otpauth://")) {
      e.preventDefault();
      const parsed = parseOtpauthUrl(text);
      if (!parsed) return;
      setForm((f) => ({ ...f, ...parsed }));
      if (parsed.algorithm !== "SHA1" || parsed.digits !== "6" || parsed.period !== "30") {
        setShowAdvanced(true);
      }
    }
  }

  async function applyQRBlob(blob: Blob) {
    const data = await decodeQRFromBlob(blob);
    if (!data) {
      logger.warn("add_entry: QR scan failed — no QR code detected in image");
      setError(t("addEntry.errorQrNotFound"));
      return;
    }
    const logUrl = data.includes("?") ? data.slice(0, data.indexOf("?")) : data.slice(0, 120);
    if (!data.startsWith("otpauth://")) {
      logger.warn(`add_entry: QR scan failed — content is not otpauth:// (got: ${logUrl})`);
      setError(t("addEntry.errorQrNotOtpauth"));
      return;
    }
    const parsed = parseOtpauthUrl(data);
    if (!parsed) {
      logger.warn(`add_entry: QR scan failed — could not parse otpauth URL: ${logUrl}`);
      setError(t("addEntry.errorQrNotOtpauth"));
      return;
    }
    setForm((f) => ({ ...f, ...parsed }));
    if (parsed.algorithm !== "SHA1" || parsed.digits !== "6" || parsed.period !== "30") {
      setShowAdvanced(true);
    }
    setError("");
  }

  async function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setError("");
    await applyQRBlob(file);
  }

  async function handleScanFromClipboard() {
    setError("");
    try {
      const img = await readImage();
      const [rgba, size] = await Promise.all([img.rgba(), img.size()]);
      // Use byteOffset+byteLength so the view is correct even if rgba is a slice of a larger buffer
      const pixels = new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength);
      const code = jsQR(pixels, size.width, size.height);
      if (!code?.data) {
        logger.warn("add_entry: QR scan from clipboard failed — no QR code detected in image");
        setError(t("addEntry.errorQrNotFound"));
        return;
      }
      const logUrl = code.data.includes("?") ? code.data.slice(0, code.data.indexOf("?")) : code.data.slice(0, 120);
      if (!code.data.startsWith("otpauth://")) {
        logger.warn(`add_entry: QR scan from clipboard failed — content is not otpauth:// (got: ${logUrl})`);
        setError(t("addEntry.errorQrNotOtpauth"));
        return;
      }
      const parsed = parseOtpauthUrl(code.data);
      if (!parsed) {
        logger.warn(`add_entry: QR scan from clipboard failed — could not parse otpauth URL: ${logUrl}`);
        setError(t("addEntry.errorQrNotOtpauth"));
        return;
      }
      setForm((f) => ({ ...f, ...parsed }));
      if (parsed.algorithm !== "SHA1" || parsed.digits !== "6" || parsed.period !== "30") {
        setShowAdvanced(true);
      }
    } catch (err) {
      logger.warn("add_entry: QR scan from clipboard failed — no image in clipboard or read error", err);
      setError(t("addEntry.errorQrNoImage"));
    }
  }

  // Keep a stable ref so the paste listener always calls the latest version
  const applyQRBlobRef = useRef(applyQRBlob);
  applyQRBlobRef.current = applyQRBlob;

  // Intercept image paste (Ctrl+V) while the modal is open
  useEffect(() => {
    async function handlePaste(e: ClipboardEvent) {
      if (!e.clipboardData) return;
      const items = Array.from(e.clipboardData.items);
      const imageItem = items.find((item) => item.type.startsWith("image/"));
      if (!imageItem) return;
      const file = imageItem.getAsFile();
      if (!file) return;
      e.preventDefault();
      setError("");
      await applyQRBlobRef.current(file);
    }
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, []);

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
      const msg = String(err);
      if (msg.startsWith("SECRET_ALREADY_EXISTS:")) {
        const existingName = msg.slice("SECRET_ALREADY_EXISTS:".length);
        setError(t("addEntry.errorDuplicateSecret", { name: existingName }));
      } else {
        setError(msg);
      }
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
            <div className="flex gap-3 mt-1.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 text-xs text-theme-4 hover:text-emerald-400 transition-colors"
              >
                <PhotoIcon className="w-3.5 h-3.5" />
                {t("addEntry.scanFromFile")}
              </button>
              <button
                type="button"
                onClick={handleScanFromClipboard}
                className="flex items-center gap-1 text-xs text-theme-4 hover:text-emerald-400 transition-colors"
              >
                <ClipboardIcon className="w-3.5 h-3.5" />
                {t("addEntry.scanFromClipboard")}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileInputChange}
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
