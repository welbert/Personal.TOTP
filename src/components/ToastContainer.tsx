import type { Toast } from "../hooks/useToast";
import { CheckCircleIcon, XCircleIcon } from "./icons";

interface Props {
  toasts: Toast[];
}

export default function ToastContainer({ toasts }: Props) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 items-center pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-2.5 px-4 py-3 rounded-xl shadow-xl text-sm max-w-[340px] w-max animate-slide-up border ${
            t.type === "success"
              ? "bg-slate-800 border-emerald-600/40 text-slate-100"
              : "bg-slate-800 border-red-600/40 text-slate-100"
          }`}
        >
          {t.type === "success" ? (
            <CheckCircleIcon className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <XCircleIcon className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          )}
          <span className="leading-snug break-all">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
