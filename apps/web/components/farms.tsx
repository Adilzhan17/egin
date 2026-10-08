"use client";
import { useState } from "react";
import { Plus, Sprout, Search, Users, Check } from "lucide-react";
import { api, useApi } from "@/lib/api";
import type { Farm, Region, User } from "@/lib/types";
import { PageHead, Button, Loading, ErrorBox } from "./ui";
type OrgFarm = Farm & { organization_id: string };
export function Farms({ user }: { user: User }) {
  const farms = useApi<OrgFarm[]>("/farms"),
    regions = useApi<Region[]>("/admin/regions");
  const [create, setCreate] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [org, setOrg] = useState(""),
    [search, setSearch] = useState(""),
    [found, setFound] = useState<{ id: string; name: string }[]>([]),
    [person, setPerson] = useState(""),
    [role, setRole] = useState("viewer"),
    [saved, setSaved] = useState(false);
  const members = useApi<{ user_id: string; name: string; role: string }[]>(
    org ? `/organizations/${org}/members` : null,
  );
  async function addFarm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/farms", {
        method: "POST",
        body: JSON.stringify({
          ...Object.fromEntries(new FormData(e.currentTarget)),
          name: user.name,
          language: user.language,
        }),
      });
      farms.reload();
      setCreate(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function find(e: React.FormEvent) {
    e.preventDefault();
    try {
      setFound(await api("/users/search?q=" + encodeURIComponent(search)));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function add() {
    setBusy(true);
    try {
      await api("/organizations/" + org + "/members", {
        method: "PUT",
        body: JSON.stringify({ user_id: person, role }),
      });
      members.reload();
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <PageHead
        title="Мои хозяйства"
        eyebrow="ЗЕМЛЯ И КОМАНДА"
        description="Управляйте хозяйствами и доступом коллег."
        action={
          <Button onClick={() => setCreate(!create)}>
            <Plus size={18} />
            Создать хозяйство
          </Button>
        }
      />
      {error && <ErrorBox message={error} />}{" "}
      {create && (
        <form className="panel stack" onSubmit={addFarm}>
          <label>
            Название хозяйства
            <input name="farm_name" required minLength={2} />
          </label>
          <label>
            Область
            <select name="region" required>
              {regions.data?.map((r) => (
                <option key={r.id}>{r.name_ru}</option>
              ))}
            </select>
          </label>
          <Button busy={busy} type="submit">
            Сохранить хозяйство
          </Button>
        </form>
      )}
      <div className="two-columns">
        {farms.loading ? (
          <Loading />
        ) : (
          farms.data?.map((f) => (
            <article className="panel stack" key={f.id}>
              <Sprout size={25} />
              <h2>{f.name}</h2>
              <p className="muted">{f.region}</p>
              <span>Ваша роль: {f.role}</span>
              <Button
                variant="secondary"
                onClick={() => {
                  setOrg(f.organization_id);
                  setSaved(false);
                }}
              >
                <Users size={18} />
                Команда
              </Button>
            </article>
          ))
        )}
      </div>
      {org && (
        <section className="panel stack" style={{ marginTop: 24 }}>
          <h2>Участники хозяйства</h2>
          {members.data?.map((m) => (
            <div className="row" key={m.user_id}>
              <span className="avatar small">{m.name[0]}</span>
              <strong>{m.name}</strong>
              <span className="tag">{m.role}</span>
            </div>
          ))}
          {["owner", "admin"].includes(
            farms.data?.find((f) => f.organization_id === org)?.role || "",
          ) && (
            <>
              <form onSubmit={find} className="search-input">
                <Search size={17} />
                <input
                  placeholder="Имя или точный email зарегистрированного коллеги"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  minLength={2}
                />
                <button type="submit">Найти</button>
              </form>
              <div className="form-grid">
                <label>
                  Коллега
                  <select
                    value={person}
                    onChange={(e) => setPerson(e.target.value)}
                  >
                    <option value="">Выберите пользователя</option>
                    {found.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Роль
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  >
                    <option value="viewer">Просмотр</option>
                    <option value="worker">Работник</option>
                    <option value="agronomist">Агроном</option>
                    <option value="admin">Администратор</option>
                  </select>
                </label>
              </div>
              <Button busy={busy} disabled={!person} onClick={add}>
                Предоставить доступ
              </Button>
              <p className="muted small">
                Агроном, администратор и владелец могут изменять поля. Работник
                и наблюдатель видят поля без права редактирования.
              </p>
            </>
          )}
          {saved && (
            <div className="success">
              <Check size={16} />
              Доступ обновлён
            </div>
          )}
        </section>
      )}
    </div>
  );
}
