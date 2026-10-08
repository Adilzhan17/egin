import { useEffect, useRef, useState, type ReactNode } from "react";
export type User = { id: string; name: string };
export const icons = {
  search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  close: "M6 6l12 12 M6 18 18 6",
  arrow: "M7 17 17 7 M7 7h10v10",
  copy: "M8 8h12v13H8V8Z M16 4V2H2v14h2",
  check: "M4 12l5 5L20 5",
  key: "M14 8a5 5 0 1 1-2 4L4 20H1v-3l8-8 M18 6h.01",
  code: "M8 6l-6 6 6 6 M16 6l6 6-6 6 M14 3l-4 18",
  book: "M3 3h7l2 2 2-2h7v17h-7l-2 2-2-2H3V3Z M12 5v17",
  sun: "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1 1 M18 18l1 1 M5 19l1-1 M18 6l1-1",
  chevron: "M9 5l7 7-7 7",
  down: "M5 9l7 7 7-7",
  qr: "M3 3h6v6H3V3Z M15 3h6v6h-6V3Z M3 15h6v6H3v-6Z M15 15h3v3h3v3h-6v-3 M21 12v3 M12 12h3",
  user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2",
  leaf: "M19 3C8 2 3 7 5 14c1 4 6 5 9 3 5-3 5-9 5-14Z M3 21l11-11",
  download: "M12 3v12 M7 10l5 5 5-5 M3 17v4h18v-4",
  logout: "M9 3H3v18h6 M10 12h12 M17 7l5 5-5 5",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v5l3 2",
  shield: "M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Z M8 12l3 3 5-6",
};
export function Icon({
  name,
  size = 18,
}: {
  name: keyof typeof icons;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={icons[name]} />
    </svg>
  );
}
export async function api<T = any>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  const response = await fetch("/api/developer" + path, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-EGIN": "1" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(18000),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("Сервер недоступен. Попробуйте позже.");
  }
  if (!response.ok)
    throw Object.assign(new Error(result.error || "Запрос не выполнен."), {
      status: response.status,
    });
  return result;
}
export const date = (value: number) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
export function Copy({
  text,
  label = "Копировать",
  compact = false,
}: {
  text: string;
  label?: string;
  compact?: boolean;
}) {
  const [state, setState] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <button
      className={"copy-button " + (compact ? "icon-button" : "")}
      aria-label={state || label}
      onClick={() => {
        void navigator.clipboard
          .writeText(text)
          .then(() => setState("Скопировано"))
          .catch(() => setState("Не удалось скопировать"));
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setState(""), 2200);
      }}
    >
      <Icon name={state === "Скопировано" ? "check" : "copy"} />
      {!compact && (state || label)}
      {compact && (
        <span className="sr-only" role="status">
          {state}
        </span>
      )}
    </button>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
      }
      if (e.key === "Tab") {
        const list = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
          ) || [],
        );
        const first = list[0],
          last = list.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        className={"modal " + (wide ? "modal-wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Закрыть"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Message({ children }: { children: ReactNode }) {
  return children ? (
    <p className="message" role="alert">
      {children}
    </p>
  ) : null;
}
