"use client";
import { LoaderCircle, AlertCircle, ArrowRight, Leaf } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Source } from "@/lib/types";
import { date } from "@/lib/api";
export function Button({
  children,
  className = "",
  variant = "primary",
  busy = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`button ${variant} ${className}`}
    >
      {busy && <LoaderCircle size={17} className="spin" />}
      {children}
    </button>
  );
}
export function Loading() {
  return (
    <div className="skeletons" aria-label="Загрузка" role="status">
      <div />
      <div />
      <div />
    </div>
  );
}
export function ErrorBox({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="error" role="alert">
      <AlertCircle size={20} />
      <span>{message}</span>
      {onRetry && <button onClick={onRetry}>Повторить</button>}
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Leaf size={30} />
      <h3>{title}</h3>
      {children}
    </div>
  );
}
export function PageHead({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow">{eyebrow || "ВАШЕ РАБОЧЕЕ ПРОСТРАНСТВО"}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function SourceLabel({ value }: { value: Source }) {
  const labels = {
    fresh: "Обновлено",
    cached: "Из кэша",
    stale: "Устаревшие данные",
    unavailable: "Недоступно",
  };
  return (
    <div className={`source-label ${value.status}`}>
      <span className="status-dot" />
      {value.source} · {labels[value.status]}
      {value.fetched_at && <span> · {date(value.fetched_at)}</span>}
    </div>
  );
}
export function Arrow() {
  return <ArrowRight size={18} />;
}
