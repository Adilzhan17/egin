/* eslint-disable @next/next/no-img-element -- Images are resized and re-encoded by the local StorageAdapter. */
"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Heart,
  Plus,
  Search,
  Tractor,
  ShoppingBag,
  Wrench,
  Briefcase,
  MapPin,
  ArrowUpRight,
  ArrowLeft,
  ImagePlus,
  MessageCircle,
  Pencil,
  Archive,
  X,
} from "lucide-react";
import { api, useApi, fmt } from "@/lib/api";
import type { Listing, User, Region } from "@/lib/types";
import { Button, Loading, ErrorBox, Empty, PageHead } from "./ui";
const types = [
  { id: "", name: "Все предложения", icon: ShoppingBag },
  { id: "product", name: "Продажа", icon: ShoppingBag },
  { id: "machinery_rental", name: "Аренда техники", icon: Tractor },
  { id: "service", name: "Услуги", icon: Wrench },
  { id: "job", name: "Работа", icon: Briefcase },
];
export function ListingVisual({ item }: { item: Listing }) {
  const Icon = types.find((t) => t.id === item.type)?.icon || ShoppingBag;
  return item.images.length ? (
    <img src={"/api" + item.images[0].path} alt={item.title} loading="lazy" />
  ) : (
    <div className={"listing-placeholder " + item.type}>
      <Icon size={48} strokeWidth={1} />
      <span>Фото не добавлено</span>
    </div>
  );
}
export function MarketPage() {
  const params = useSearchParams();
  const [type, setType] = useState(params.get("type") || ""),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [favorites, setFavorites] = useState(false),
    [mine, setMine] = useState(false),
    [region, setRegion] = useState(""),
    [error, setError] = useState("");
  const regions = useApi<Region[]>("/admin/regions");
  const list = useApi<Listing[]>(
    `/listings?type=${type}&q=${encodeURIComponent(search)}&favorites=${favorites}&mine=${mine}&region=${encodeURIComponent(region)}`,
  );
  async function favorite(l: Listing) {
    try {
      await api(`/listings/${l.id}/favorite`, {
        method: l.is_favorite ? "DELETE" : "POST",
      });
      list.setData(
        (old) =>
          old?.map((x) =>
            x.id === l.id ? { ...x, is_favorite: !x.is_favorite } : x,
          ) || null,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div>
      <PageHead
        eyebrow="ЛЮДИ И РЕСУРСЫ РЯДОМ"
        title="Рынок для своих"
        description="Всё для хозяйства: от семян до опытных специалистов."
        action={
          <Link href="/market/new" className="button primary">
            <Plus size={18} />
            Подать объявление
          </Link>
        }
      />
      <div className="market-banner">
        <Tractor size={38} strokeWidth={1.4} />
        <div>
          <strong>Нужное найдётся ближе, чем кажется.</strong>
          <p>Покупайте, арендуйте и договаривайтесь напрямую.</p>
        </div>
        <span className="tag">Без комиссии · MVP</span>
      </div>
      <div className="category-tabs">
        {types.map((t) => (
          <button
            className={type === t.id ? "active" : ""}
            key={t.id}
            onClick={() => setType(t.id)}
          >
            <t.icon size={19} />
            {t.name}
          </button>
        ))}
      </div>
      <div className="market-filters">
        <form
          className="search-input"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(query);
          }}
        >
          <Search size={18} />
          <input
            aria-label="Поиск объявлений"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Что нужно вашему хозяйству?"
          />
          <button type="submit">Найти</button>
        </form>
        <select
          aria-label="Регион объявлений"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        >
          <option value="">Все регионы</option>
          {regions.data?.map((r) => (
            <option key={r.id}>{r.name_ru}</option>
          ))}
        </select>
        <button
          className={"filter-button " + (favorites ? "active" : "")}
          onClick={() => setFavorites(!favorites)}
        >
          <Heart size={17} />
          Избранное
        </button>
        <button
          className={"filter-button " + (mine ? "active" : "")}
          onClick={() => setMine(!mine)}
        >
          Мои
        </button>
      </div>
      {error && <ErrorBox message={error} />}{" "}
      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
      <div className="results-line">
        <span>
          {list.loading
            ? "Ищем предложения…"
            : `${list.data?.length || 0} предложений`}
        </span>
        <small>Сначала новые</small>
      </div>
      {list.loading ? (
        <Loading />
      ) : list.data?.length ? (
        <div className="listing-grid">
          {list.data.map((l) => (
            <article className="listing-card" key={l.id}>
              <Link className="listing-image" href={"/market/" + l.id}>
                <ListingVisual item={l} />
                {l.is_demo && <span className="demo-sticker">Демо</span>}
                {l.status === "archived" && (
                  <span className="archive-sticker">В архиве</span>
                )}
              </Link>
              <button
                className={"favorite-button " + (l.is_favorite ? "active" : "")}
                onClick={() => favorite(l)}
                aria-label={
                  l.is_favorite ? "Убрать из избранного" : "В избранное"
                }
              >
                <Heart
                  size={19}
                  fill={l.is_favorite ? "currentColor" : "none"}
                />
              </button>
              <div className="listing-body">
                <span className="listing-category">
                  {types.find((t) => t.id === l.type)?.name}
                </span>
                <Link href={"/market/" + l.id}>
                  <h3>{l.title}</h3>
                </Link>
                <strong className="listing-price">
                  {fmt(Number(l.price), 0)} <span>{l.unit}</span>
                </strong>
                <p>
                  <MapPin size={13} />
                  {l.region}
                </p>
                <div className="listing-seller">
                  <span className="avatar tiny">{l.seller_name[0]}</span>
                  {l.seller_name}
                  <ArrowUpRight size={15} />
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty title="Пока нет предложений">
          <p>Измените фильтры или создайте своё объявление.</p>
          <Link href="/market/new" className="button secondary">
            Создать объявление
          </Link>
        </Empty>
      )}
    </div>
  );
}
export function ListingPage({ id, user }: { id: string; user: User }) {
  const l = useApi<Listing>("/listings/" + id),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [image, setImage] = useState(0),
    [archive, setArchive] = useState(false);
  const router = useRouter();
  if (l.loading) return <Loading />;
  if (l.error) return <ErrorBox message={l.error} onRetry={l.reload} />;
  if (!l.data) return null;
  const item = l.data;
  async function contact() {
    setBusy(true);
    try {
      const c = await api<{ id: string }>("/conversations", {
        method: "POST",
        body: JSON.stringify({
          kind: "direct",
          title: item.title.slice(0, 100),
          member_ids: [item.user_id],
        }),
      });
      router.push("/community?chat=" + c.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function archiveItem() {
    setBusy(true);
    try {
      await api("/listings/" + id, { method: "DELETE" });
      l.reload();
      setArchive(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <Link className="back-link" href="/market">
        <ArrowLeft size={16} />
        Все объявления
      </Link>
      <PageHead
        eyebrow={types.find((t) => t.id === item.type)?.name}
        title={item.title}
        description={item.region}
      />
      {error && <ErrorBox message={error} />}
      <div className="listing-detail">
        <section>
          <div className="detail-image">
            {item.images.length ? (
              <img
                src={
                  "/api" +
                  item.images[Math.min(image, item.images.length - 1)].path
                }
                alt={item.title}
              />
            ) : (
              <ListingVisual item={item} />
            )}
          </div>
          <div className="image-thumbs">
            {item.images.map((im, i) => (
              <button
                key={im.id}
                onClick={() => setImage(i)}
                aria-label={"Фото " + (i + 1)}
              >
                <img alt={"Фото " + (i + 1)} src={"/api" + im.path} />
              </button>
            ))}
          </div>
          <section className="panel">
            <h2>Описание</h2>
            <p className="preserve-lines">{item.description}</p>
            {item.is_demo && (
              <div className="note">
                Демонстрационное объявление. Это не реальное предложение.
              </div>
            )}
          </section>
        </section>
        <aside className="panel listing-contact">
          <span className="tag">
            {item.status === "active" ? "Активно" : "В архиве"}
          </span>
          <strong className="detail-price">
            {fmt(Number(item.price), 0)}
            <small>{item.unit}</small>
          </strong>
          <div className="seller-profile">
            <span className="avatar">{item.seller_name[0]}</span>
            <div>
              <strong>{item.seller_name}</strong>
              <span>Автор объявления</span>
            </div>
          </div>
          {item.user_id === user.id ? (
            <>
              <Link
                className="button secondary"
                href={"/market/" + id + "/edit"}
              >
                <Pencil size={16} />
                Редактировать
              </Link>
              {archive ? (
                <>
                  <p>Снять объявление с публикации?</p>
                  <Button variant="danger" busy={busy} onClick={archiveItem}>
                    Архивировать
                  </Button>
                  <Button variant="ghost" onClick={() => setArchive(false)}>
                    Отмена
                  </Button>
                </>
              ) : (
                item.status === "active" && (
                  <Button variant="ghost" onClick={() => setArchive(true)}>
                    <Archive size={16} />В архив
                  </Button>
                )
              )}
            </>
          ) : (
            <Button busy={busy} onClick={contact}>
              <MessageCircle size={18} />
              Написать автору
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                await api("/listings/" + id + "/favorite", {
                  method: item.is_favorite ? "DELETE" : "POST",
                });
                l.reload();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Heart
              size={17}
              fill={item.is_favorite ? "currentColor" : "none"}
            />
            {item.is_favorite ? "В избранном" : "Сохранить"}
          </Button>
          <p className="muted small">
            Договоритесь об условиях напрямую в чате. Оплата через EGIN не
            подключена.
          </p>
        </aside>
      </div>
    </div>
  );
}
export function ListingForm({ id }: { id?: string }) {
  const existing = useApi<Listing>(id ? "/listings/" + id : null),
    regions = useApi<Region[]>("/admin/regions");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [files, setFiles] = useState<File[]>([]),
    [createdId, setCreatedId] = useState<string | null>(null);
  const router = useRouter();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const saved = await api<Listing>(
        id || createdId ? "/listings/" + (id || createdId) : "/listings",
        {
          method: id || createdId ? "PUT" : "POST",
          body: JSON.stringify({
            ...form,
            price: Number(form.price),
            lat: form.lat ? Number(form.lat) : null,
            lon: form.lon ? Number(form.lon) : null,
          }),
        },
      );
      setCreatedId(saved.id);
      for (const file of files) {
        const d = new FormData();
        d.append("file", file);
        await api("/listings/" + saved.id + "/images", {
          method: "POST",
          body: d,
        });
        setFiles((f) => f.filter((x) => x !== file));
      }
      router.push("/market/" + saved.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (id && existing.loading) return <Loading />;
  if (existing.error) return <ErrorBox message={existing.error} />;
  const item = existing.data;
  return (
    <div className="form-page">
      <Link className="back-link" href="/market">
        <ArrowLeft size={16} />
        На рынок
      </Link>
      <PageHead
        eyebrow="ОБЪЯВЛЕНИЕ"
        title={id ? "Редактировать предложение" : "Что вы предлагаете?"}
        description="Заполните детали — и вас смогут найти другие фермеры."
      />
      <form className="panel stack" onSubmit={submit}>
        <div className="form-grid">
          <label>
            Раздел
            <select name="type" defaultValue={item?.type || "product"}>
              {types
                .filter((t) => t.id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Регион
            <select name="region" defaultValue={item?.region || ""} required>
              <option value="">Выберите область</option>
              {regions.data?.map((r) => (
                <option key={r.id}>{r.name_ru}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Название
          <input
            name="title"
            defaultValue={item?.title}
            required
            minLength={3}
            maxLength={160}
            placeholder="Например, аренда трактора с оператором"
          />
        </label>
        <label>
          Описание
          <textarea
            name="description"
            defaultValue={item?.description}
            required
            minLength={5}
            maxLength={6000}
            rows={5}
            placeholder="Состояние, объём, условия и всё, что важно покупателю"
          />
        </label>
        <div className="form-grid">
          <label>
            Стоимость
            <input
              name="price"
              type="number"
              min={0}
              max={999999999999}
              step="0.01"
              defaultValue={item?.price}
              required
            />
          </label>
          <label>
            Единица цены
            <input
              name="unit"
              defaultValue={item?.unit || "₸"}
              required
              maxLength={30}
              placeholder="₸ / час"
            />
          </label>
        </div>
        <details>
          <summary>Координаты для поиска рядом (необязательно)</summary>
          <div className="form-grid">
            <label>
              Широта
              <input
                name="lat"
                type="number"
                min={40}
                max={56}
                step="any"
                defaultValue={item?.lat ?? ""}
              />
            </label>
            <label>
              Долгота
              <input
                name="lon"
                type="number"
                min={45}
                max={88}
                step="any"
                defaultValue={item?.lon ?? ""}
              />
            </label>
          </div>
        </details>
        {item?.images.map((im) => (
          <div className="row" key={im.id}>
            <img
              width={60}
              height={45}
              src={"/api" + im.path}
              alt="Фото объявления"
            />
            <Button
              type="button"
              variant="ghost"
              onClick={async () => {
                try {
                  await api(`/listings/${id}/images/${im.id}`, {
                    method: "DELETE",
                  });
                  existing.reload();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <X size={16} />
              Удалить фото
            </Button>
          </div>
        ))}
        <label className="upload-zone">
          <ImagePlus size={28} />
          <strong>Добавьте фотографии</strong>
          <span>JPEG, PNG, WebP · до 5 МБ · максимум 6 фото</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(e) =>
              setFiles(Array.from(e.target.files || []).slice(0, 6))
            }
          />
        </label>
        {files.length > 0 && (
          <p className="small">
            Выбрано: {files.map((f) => f.name).join(", ")}
          </p>
        )}
        {error && <ErrorBox message={error} />}
        <Button busy={busy} type="submit">
          {id ? "Сохранить изменения" : "Опубликовать объявление"}
          <ArrowUpRight size={18} />
        </Button>
      </form>
    </div>
  );
}
