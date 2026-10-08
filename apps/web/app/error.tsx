"use client";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <main className="empty">
      <h1>Не удалось открыть страницу</h1>
      <p>Попробуйте ещё раз. Сохранённые данные остаются в базе.</p>
      <button className="button primary" onClick={reset}>
        Повторить
      </button>
    </main>
  );
}
