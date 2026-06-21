import { useState, useCallback } from "react";

export interface Toast {
  id: number;
  message: string;
  type: "success" | "error";
}

let _id = 0;

export function useToast(duration = 4000) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback(
    (message: string, type: "success" | "error" = "success") => {
      const id = ++_id;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
    },
    [duration],
  );

  return { toasts, show };
}
