import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api, Copy, date, Icon, Message, Modal, type User } from "./shared";
type Key = {
  id: string;
  name: string;
  open_key: string;
  secret_hint: string;
  secret_key?: string;
  scopes: string[];
  created: number;
  expires: number;
  revoked: number | null;
  last_used: number | null;
};
const scopeNames: Record<string, string> = {
  profile: "Профиль",
  fields: "Участки",
  journal: "Дневник",
  sensors: "Датчики",
  assets: "Вложения",
  weather: "Погода",
  news: "Новости",
};
export function PortalLogin({
  onClose,
  onLogin,
}: {
  onClose: () => void;
  onLogin: (u: User) => void;
}) {
  const [qr, setQR] = useState<{
      id: string;
      code: string;
      expires: number;
      url: string;
    } | null>(null),
    [image, setImage] = useState(""),
    [error, setError] = useState(""),
    [seconds, setSeconds] = useState(120),
    [revision, setRevision] = useState(0),
    [status, setStatus] = useState("loading");
  useEffect(() => {
    let alive = true,
      id = "",
      expires = 0,
      polling = false;
    setQR(null);
    setImage("");
    setError("");
    setStatus("loading");
    setSeconds(120);
    void api("/qr/start", {})
      .then(async (value) => {
        id = value.id;
        expires = value.expires;
        if (!alive) {
          await api("/qr/cancel", { id }).catch(() => {});
          return;
        }
        setQR(value);
        setStatus("pending");
        const src = await QRCode.toDataURL(value.url, {
          width: 256,
          margin: 3,
          color: { dark: "#214d36", light: "#ffffff" },
        });
        if (alive) setImage(src);
      })
      .catch((e) => {
        if (alive) {
          setError(e.message);
          setStatus("error");
        }
      });
    const clock = setInterval(() => {
      if (expires && alive)
        setSeconds(Math.max(0, Math.ceil((expires - Date.now()) / 1000)));
    }, 1000);
    const poll = setInterval(async () => {
      if (!id || !alive || polling) return;
      if (Date.now() >= expires) {
        clearInterval(poll);
        setStatus("expired");
        return;
      }
      polling = true;
      try {
        const value = await api("/qr/poll", { id });
        if (!alive) return;
        setError("");
        if (value.status === "complete") {
          id = "";
          clearInterval(poll);
          onLogin(value.user);
        } else if (value.status === "denied") {
          clearInterval(poll);
          setStatus("denied");
          setError("Вы отклонили вход в приложении.");
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        polling = false;
      }
    }, 5000);
    return () => {
      alive = false;
      clearInterval(clock);
      clearInterval(poll);
      if (id) void api("/qr/cancel", { id }).catch(() => {});
    };
  }, [revision]);
  const testEnvironment = location.hostname === 'dev-api-egin.perricheno.com';
  const confirmationHost = qr ? new URL(qr.url).host : '';
  return (
    <Modal title="Войти в EGIN API" onClose={onClose}>
      <p className="muted login-lead">
        {testEnvironment ? 'Вы открыли тестовый кабинет. Для него нужен профиль тестового EGIN.' : 'Подтвердите вход через основной EGIN. Аккаунт и passkey остаются в приложении.'}
      </p>
      {testEnvironment && <div className="callout qr-environment" role="note"><Icon name="shield"/><p><strong>Это QR тестовой версии</strong><br/>Ключ основного EGIN здесь не подойдёт. Для обычного входа откройте на ноутбуке <a href="https://api-egin.perricheno.com/#/keys">основной кабинет API</a> и создайте новый QR.</p></div>}
      {confirmationHost && <p className="qr-caption">Подтверждение на телефоне: <strong className="qr-destination">{confirmationHost}</strong></p>}
      <div className="portal-qr">
        {image && seconds > 0 && status === "pending" ? (
          <img
            src={image}
            width="256"
            height="256"
            alt="QR входа в кабинет разработчика"
          />
        ) : (
          <span>
            {status === "loading"
              ? "Создаём QR…"
              : status === "denied"
                ? "Вход отклонён"
                : "Создайте новый QR"}
          </span>
        )}
      </div>
      {qr && seconds > 0 && status === "pending" && (
        <>
          <p className="qr-caption">Сверьте код на телефоне</p>
          <strong className="qr-code">{qr.code}</strong>
          <p className="qr-caption">Ещё {seconds} сек.</p>
          <a
            className="button secondary full"
            href={qr.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Открыть EGIN на этом устройстве
            <Icon name="arrow" />
          </a>
        </>
      )}
      <ol className="login-steps">
        <li>Откройте камеру телефона или сканер входа в EGIN.</li>
        <li>Сверьте адрес кабинета и шестизначный код.</li>
        <li>Подтвердите своим passkey и вернитесь сюда.</li>
      </ol>
      <Message>{error}</Message>
      {(seconds === 0 || ["error", "denied", "expired"].includes(status)) && (
        <button
          className="button primary full"
          onClick={() => setRevision((v) => v + 1)}
        >
          Создать новый QR
        </button>
      )}
    </Modal>
  );
}
export function Cabinet({
  user,
  onLogin,
  onLogout,
}: {
  user: User | null;
  onLogin: () => void;
  onLogout: () => Promise<void>;
}) {
  const [keys, setKeys] = useState<Key[]>([]),
    [scopes, setScopes] = useState<string[]>([]),
    [usage, setUsage] = useState<any[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [creating, setCreating] = useState(false),
    [secret, setSecret] = useState<Key | null>(null),
    [confirm, setConfirm] = useState<{
      key: Key;
      action: "revoke" | "rotate";
    } | null>(null);
  const [name, setName] = useState(""),
    [days, setDays] = useState(90),
    [chosen, setChosen] = useState(["fields:read", "weather:read"]),
    [tab, setTab] = useState("keys");
  async function load() {
    try {
      const [list, log] = await Promise.all([api("/keys"), api("/usage")]);
      setKeys(list.keys);
      setScopes(list.scopes);
      setUsage(log.requests);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (user) void load();
    else {
      setKeys([]);
      setUsage([]);
      setSecret(null);
    }
  }, [user?.id]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="cabinet">
      <div className="breadcrumbs">
        EGIN API <Icon name="chevron" size={14} /> Кабинет разработчика
      </div>
      <div className="cabinet-heading">
        <div>
          <span className="eyebrow">ВАШИ ИНТЕГРАЦИИ</span>
          <h1>Ключи доступа</h1>
          <p className="lead">Подключайте свои сервисы к данным EGIN.</p>
        </div>
        {user && (
          <button
            className="button primary"
            onClick={() => {
              setName("");
              setChosen(["fields:read", "weather:read"]);
              setCreating(true);
            }}
          >
            <Icon name="key" />
            Создать ключ
          </button>
        )}
      </div>
      {!user ? (
        <div className="login-card">
          <span className="round-icon">
            <Icon name="qr" size={28} />
          </span>
          <h2>Один аккаунт для приложения и API</h2>
          <p>
            Войдите через QR из основного EGIN, чтобы получить Open Key и Secret
            Key, выбрать права и управлять доступом.
          </p>
          <button className="button primary" onClick={onLogin}>
            Войти через EGIN
            <Icon name="arrow" />
          </button>
          <div className="login-card-foot">
            <Icon name="shield" />
            Доступ только к данным вашего профиля
          </div>
        </div>
      ) : (
        <>
          <div className="account-strip">
            <span className="avatar">{user.name.slice(0, 1)}</span>
            <span>
              <strong>{user.name}</strong>
              <small>Профиль EGIN</small>
            </span>
            <button
              className="text-button"
              onClick={() => {
                void onLogout().catch((e) => setError(e.message));
              }}
            >
              <Icon name="logout" />
              Выйти
            </button>
          </div>
          <div className="cabinet-tabs" role="tablist" aria-label="Кабинет">
            <button
              role="tab"
              aria-selected={tab === "keys"}
              onClick={() => setTab("keys")}
            >
              Мои ключи{" "}
              <span>
                {
                  keys.filter((k) => !k.revoked && k.expires > Date.now())
                    .length
                }
              </span>
            </button>
            <button
              role="tab"
              aria-selected={tab === "usage"}
              onClick={() => {
                setTab("usage");
                void load();
              }}
            >
              Журнал запросов
            </button>
          </div>
          <Message>{error}</Message>
          {tab === "keys" ? (
            <>
              {keys.length === 0 ? (
                <div className="empty-card">
                  <Icon name="key" size={28} />
                  <h2>Начните с первого ключа</h2>
                  <p>Выберите только нужные права. Секрет покажем один раз.</p>
                  <button
                    className="button secondary"
                    onClick={() => setCreating(true)}
                  >
                    Создать ключ
                  </button>
                </div>
              ) : (
                <div className="key-list">
                  {keys.map((key) => (
                    <article className="key-card" key={key.id}>
                      <div className="key-heading">
                        <span className="key-symbol">
                          <Icon name="key" />
                        </span>
                        <div>
                          <h3>{key.name}</h3>
                          <span className="muted">
                            Создан {date(key.created)}
                          </span>
                        </div>
                        <span
                          className={
                            "key-status " +
                            (key.revoked || key.expires < Date.now()
                              ? "inactive"
                              : "")
                          }
                        >
                          {key.revoked
                            ? "Отозван"
                            : key.expires < Date.now()
                              ? "Истёк"
                              : "Активен"}
                        </span>
                      </div>
                      <dl className="key-values">
                        <div>
                          <dt>Open Key</dt>
                          <dd>
                            <code>{key.open_key}</code>
                            <Copy text={key.open_key} compact />
                          </dd>
                        </div>
                        <div>
                          <dt>Secret ID</dt>
                          <dd>
                            <code>{key.id}</code>
                            <Copy text={key.id} compact />
                          </dd>
                        </div>
                        <div>
                          <dt>Secret Key</dt>
                          <dd>
                            <code>{key.secret_hint}</code>
                            <small>Скрыт после создания</small>
                          </dd>
                        </div>
                      </dl>
                      <div className="scope-tags">
                        {key.scopes.map((s) => (
                          <span key={s}>{s}</span>
                        ))}
                      </div>
                      <div className="key-footer">
                        <small>
                          До {date(key.expires)} ·{" "}
                          {key.last_used
                            ? "Использован " + date(key.last_used)
                            : "Ещё не использован"}
                        </small>
                        {!key.revoked && key.expires > Date.now() && (
                          <div>
                            <button
                              className="text-button"
                              onClick={() =>
                                setConfirm({ key, action: "rotate" })
                              }
                            >
                              Заменить
                            </button>
                            <button
                              className="text-button"
                              onClick={() =>
                                setConfirm({ key, action: "revoke" })
                              }
                            >
                              Отозвать
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
              <div className="callout">
                <Icon name="shield" />
                <p>
                  Open Key и Secret ID — идентификаторы. Для запросов также
                  нужен Secret Key. Храните его на своём сервере; не добавляйте
                  в код сайта или мобильного приложения.
                </p>
              </div>
            </>
          ) : (
            <div className="usage-panel">
              <div className="usage-head">
                <p>Последние 50 запросов · хранение до 7 дней</p>
                <button className="text-button" onClick={() => void load()}>
                  Обновить
                </button>
              </div>
              {usage.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Время</th>
                        <th>Запрос</th>
                        <th>Ключ</th>
                        <th>Ответ</th>
                        <th>Время, мс</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usage.map((row) => (
                        <tr key={row.id}>
                          <td>
                            {new Date(row.created).toLocaleTimeString("ru-RU")}
                          </td>
                          <td>
                            <span className="method small">{row.method}</span>{" "}
                            <code>{row.path}</code>
                          </td>
                          <td>{row.name}</td>
                          <td>
                            <span className="status-code">{row.status}</span>
                          </td>
                          <td>{row.duration}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-card">
                  <Icon name="clock" size={28} />
                  <h2>Запросов пока нет</h2>
                  <p>
                    После первого обращения к API здесь появятся метод, статус и
                    время ответа.
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {creating && (
        <Modal
          title="Создать ключ доступа"
          onClose={() => {
            if (!busy) setCreating(false);
          }}
          wide
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                const key = await api<Key>("/keys", {
                  name,
                  scopes: chosen,
                  days,
                });
                setSecret(key);
                setCreating(false);
              });
            }}
          >
            <label className="form-label">
              Название
              <input
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например, сервер хозяйства"
              />
            </label>
            <label className="form-label">
              Срок действия
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              >
                {[7, 30, 90, 365].map((n) => (
                  <option key={n} value={n}>
                    {n} дней
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="scope-picker">
              <legend>Разрешения</legend>
              <p className="muted">Чтение и запись включаются независимо.</p>
              {Object.entries(scopeNames).map(([resource, label]) => (
                <div className="scope-row" key={resource}>
                  <strong>{label}</strong>
                  <div>
                    {scopes
                      .filter((s) => s.startsWith(resource + ":"))
                      .map((scope) => (
                        <label key={scope}>
                          <input
                            type="checkbox"
                            checked={chosen.includes(scope)}
                            onChange={(e) =>
                              setChosen((old) =>
                                e.target.checked
                                  ? [...old, scope]
                                  : old.filter((s) => s !== scope),
                              )
                            }
                          />
                          {scope.endsWith(":read") ? "Чтение" : "Запись"}
                        </label>
                      ))}
                  </div>
                </div>
              ))}
            </fieldset>
            <Message>{error}</Message>
            <button
              className="button primary full"
              disabled={busy || !name.trim() || !chosen.length}
            >
              {busy ? "Создаём…" : "Создать ключ"}
            </button>
          </form>
        </Modal>
      )}
      {secret && (
        <Modal title="Ключ создан" onClose={() => setSecret(null)} wide>
          <div className="callout">
            <Icon name="shield" />
            <p>
              Сохраните Secret Key сейчас. После закрытия мы больше не сможем
              его показать.
            </p>
          </div>
          {[
            ["Open Key", secret.open_key],
            ["Secret ID", secret.id],
            ["Secret Key", secret.secret_key!],
          ].map(([label, value]) => (
            <div className="secret-value" key={label}>
              <span>{label}</span>
              <div>
                <code>{value}</code>
                <Copy text={value} compact />
              </div>
            </div>
          ))}
          <p className="muted">
            Secret ID — номер записи ключа. Он не заменяет секрет в
            Authorization.
          </p>
          <button
            className="button primary full"
            onClick={() => setSecret(null)}
          >
            <Icon name="check" />
            Секрет сохранён
          </button>
        </Modal>
      )}
      {confirm && (
        <Modal
          title={
            confirm.action === "revoke" ? "Отозвать ключ?" : "Заменить ключ?"
          }
          onClose={() => {
            if (!busy) setConfirm(null);
          }}
        >
          <p className="lead-small">{confirm.key.name}</p>
          <p className="muted">
            {confirm.action === "revoke"
              ? "Запросы с этим ключом сразу перестанут работать. Данные профиля сохранятся."
              : "Старые Open Key и Secret Key сразу перестанут работать. Новый секрет покажем один раз; обновите его в своей интеграции."}
          </p>
          <Message>{error}</Message>
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Отмена
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  if (confirm.action === "rotate")
                    setSecret(
                      await api("/keys/" + confirm.key.id + "/rotate", {}),
                    );
                  else
                    await api("/keys/" + confirm.key.id, undefined, "DELETE");
                  setConfirm(null);
                })
              }
            >
              {busy
                ? "Сохраняем…"
                : confirm.action === "revoke"
                  ? "Подтвердить отзыв"
                  : "Заменить ключ"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
