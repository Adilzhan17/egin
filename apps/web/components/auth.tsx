"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sprout, ArrowUpRight, MapPinned, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { api, useApi } from "@/lib/api";
import { resetAppSession } from "@/lib/app-store";
import type { Region, User } from "@/lib/types";
import { Button, ErrorBox } from "./ui";
export function AuthPage({ register = false }: { register?: boolean }) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const d = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const schema = z.object({
        email: register ? z.email() : z.string().min(3),
        password: z
          .string()
          .min(register ? 10 : 1)
          .max(128),
        ...(register ? { name: z.string().min(2) } : {}),
      });
      const parsed = schema.safeParse(d);
      if (!parsed.success)
        throw Error(parsed.error.issues.map((i) => i.message).join("; "));
      await api("/auth/" + (register ? "register" : "login"), {
        method: "POST",
        body: JSON.stringify(d),
      });
      localStorage.removeItem("egin-pending-logout");
      await resetAppSession();
      router.push(register ? "/onboarding" : "/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-story">
        <Link href="/" className="brand light">
          <span className="brand-mark">
            <Sprout />
          </span>
          egin<span className="brand-dot">.</span>
        </Link>
        <div>
          <div className="eyebrow">СОЗДАНО ДЛЯ ЗЕМЛИ КАЗАХСТАНА</div>
          <h1>
            Ваша земля.
            <br />
            Больше ясности.
          </h1>
          <p>
            Поля, погода и решения —<br />в одном рабочем пространстве.
          </p>
          <div className="story-features">
            <span>
              <MapPinned size={18} /> Настоящие геоданные
            </span>
            <span>
              <ShieldCheck size={18} /> Ваши хозяйства под контролем
            </span>
          </div>
        </div>
        <div className="contour-art" aria-hidden="true">
          {Array.from({ length: 9 }, (_, i) => (
            <i
              key={i}
              style={{
                inset: `${i * 22}px`,
                transform: `rotate(${i * 4 - 20}deg)`,
              }}
            />
          ))}
        </div>
        <small>ЗЕМЛЯ. ДАННЫЕ. РЕШЕНИЯ.</small>
      </div>
      <main className="auth-form">
        <div className="mobile-brand">
          <Sprout /> egin.
        </div>
        <span className="eyebrow">ДОБРО ПОЖАЛОВАТЬ В EGIN</span>
        <h1>{register ? "Начнём с знакомства" : "С возвращением"}</h1>
        <p className="muted">
          {register
            ? "Создайте аккаунт и добавьте первое поле."
            : "Войдите, чтобы увидеть свои поля и хозяйства."}
        </p>
        <form onSubmit={submit}>
          {register && (
            <label>
              Ваше имя
              <input
                name="name"
                required
                minLength={2}
                autoComplete="name"
                placeholder="Как к вам обращаться"
              />
            </label>
          )}
          <label>
            {register ? "Email" : "Email или телефон"}
            <input
              name="email"
              type={register ? "email" : "text"}
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </label>
          <label>
            Пароль
            <input
              name="password"
              type="password"
              required
              minLength={register ? 10 : 1}
              maxLength={128}
              autoComplete={register ? "new-password" : "current-password"}
              placeholder={register ? "Минимум 10 символов" : "Введите пароль"}
            />
          </label>
          {error && <ErrorBox message={error} />}
          <Button busy={busy} type="submit">
            {register ? "Создать аккаунт" : "Войти в EGIN"}
            <ArrowUpRight size={18} />
          </Button>
        </form>
        <p className="auth-switch">
          {register ? "Уже есть аккаунт?" : "Впервые здесь?"}{" "}
          <Link href={register ? "/login" : "/register"}>
            {register ? "Войти" : "Создать аккаунт"}
          </Link>
        </p>
        <div className="local-note">
          <span className="status-dot" /> Локальная версия · данные сохраняются
          на вашем компьютере
        </div>
      </main>
    </div>
  );
}
export function Onboarding({
  user,
  onDone,
}: {
  user: User;
  onDone: () => Promise<void>;
}) {
  const { data: regions } = useApi<Region[]>("/admin/regions");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const created = useRef(false);
  const router = useRouter();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      if (!created.current) {
        await api("/onboarding", {
          method: "POST",
          body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
        });
        created.current = true;
      }
      await onDone();
      router.push("/map?new=1");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="onboarding">
      <div className="step-badge">ШАГ 01 / 02 · ВАШЕ ХОЗЯЙСТВО</div>
      <Sprout size={42} />
      <h1>Дайте земле имя</h1>
      <p>Пара деталей — и можно переходить к первому полю.</p>
      <form className="panel" onSubmit={submit}>
        <label>
          Ваше имя
          <input name="name" defaultValue={user.name} minLength={2} required />
        </label>
        <label>
          Название хозяйства
          <input
            name="farm_name"
            placeholder="Например, КХ «Степное»"
            minLength={2}
            required
          />
        </label>
        <div className="form-grid">
          <label>
            Язык профиля
            <select name="language" defaultValue="ru">
              <option value="ru">Русский</option>
              <option value="kk">Қазақша</option>
            </select>
          </label>
          <label>
            Область
            <select name="region" required>
              <option value="">Выберите область</option>
              {regions?.map((r) => (
                <option key={r.id}>{r.name_ru}</option>
              ))}
            </select>
          </label>
        </div>
        <small className="muted">
          Интерфейс MVP — на русском. Язык профиля и казахские названия
          сохраняются.
        </small>
        {error && <ErrorBox message={error} />}
        <Button busy={busy} type="submit">
          Далее — нарисовать поле <ArrowUpRight size={18} />
        </Button>
      </form>
    </main>
  );
}
