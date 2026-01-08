"use client";

import { toast, type Toast } from "react-hot-toast";

export type AlertKind = "info" | "success" | "error" | "warning" | "dark";

export interface GlobalAlertDetail {
  type: AlertKind;
  message: string;
  title?: string;
  durationMs?: number;
}

const ICON_PATHS: Record<AlertKind, string> = {
  success: "M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.53-9.47-4 4a.75.75 0 0 1-1.06 0l-2-2a.75.75 0 1 1 1.06-1.06L9 11.69l3.47-3.47a.75.75 0 0 1 1.06 1.06Z",
  error:
    "M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm1.53-10.53a.75.75 0 0 1 1.06 1.06L11.06 10l1.53 1.47a.75.75 0 1 1-1.06 1.06L10 11.06l-1.47 1.47a.75.75 0 1 1-1.06-1.06L8.94 10 7.41 8.53a.75.75 0 0 1 1.06-1.06L10 8.94l1.53-1.47Z",
  warning:
    "M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-5.25a.75.75 0 0 1-1.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5Zm0-5a.75.75 0 0 1-1.5 0v-.5a.75.75 0 1 1 1.5 0v.5Z",
  info:
    "M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-4.25a.75.75 0 0 1-1.5 0V10a.75.75 0 0 1 1.5 0v3.75ZM10 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z",
  dark:
    "M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-4.25a.75.75 0 0 1-1.5 0V9.5a.75.75 0 0 1 1.5 0v4.25ZM10 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z",
};

const ICON_LABELS: Record<AlertKind, string> = {
  success: "Success",
  error: "Error",
  warning: "Warning",
  info: "Information",
  dark: "Notice",
};

export function showGlobalAlert(detail: GlobalAlertDetail) {
  if (typeof window === "undefined") return;

  const { durationMs, message, title, type } = detail;
  const duration = durationMs ?? 5000;

  toast.custom(
    (t: Toast) => (
      <div
        role="alert"
        aria-live={type === "error" ? "assertive" : "polite"}
        className={`pointer-events-auto w-full max-w-md rounded-xl border border-white/15 bg-gradient-to-r from-blue-500 to-blue-600 px-5 py-4 text-white backdrop-blur-sm transition-all ${
          t.visible ? "animate-toast-in" : "animate-toast-out"
        }`}
        data-toast-type={type}
      >
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20"
            aria-label={ICON_LABELS[type]}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
            >
              <path d={ICON_PATHS[type]} />
            </svg>
          </span>
          <div className="flex-1 text-sm leading-5">
            {title && <p className="font-semibold text-white">{title}</p>}
            <p className="text-white/90">{message}</p>
          </div>
          <button
            type="button"
            onClick={() => toast.dismiss(t.id)}
            className="ml-2 shrink-0 rounded-xl px-2 py-1 text-xs font-semibold uppercase tracking-wide text-white/80 transition hover:bg-white/15 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/40 focus:ring-offset-2 focus:ring-offset-blue-500/0"
          >
            Dismiss
          </button>
        </div>
        <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-white/20">
          <div
            className="toast-progress-bar h-full bg-white/80"
            style={{ animationDuration: `${duration}ms` }}
          />
        </div>
      </div>
    ),
    {
      duration,
      position: "top-center",
    }
  );
}


