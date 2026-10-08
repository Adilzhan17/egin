import { useEffect, useRef, useState } from "react";
import rawCatalog from "../../api/src/catalog.json";
import { Cabinet, PortalLogin } from "./Cabinet";
import { api, Copy, Icon, Modal, type User } from "./shared";
type Parameter = {
  name: string;
  type: string;
  description: string;
  required: boolean;
  where: string;
};
type Method = {
  id: string;
  group: string;
  title: string;
  method: string;
  path: string;
  description: string;
  auth: string;
  scope: string | null;
  request: Record<string, unknown> | null;
  response: unknown;
  params: Parameter[];
  headers: Parameter[];
  status: number;
};
const catalog = rawCatalog as Method[];
const groups = [...new Set(catalog.map((m) => m.group))];
const current = () => location.hash.slice(1) || "/overview";
const titles: Record<string, string> = {
  "/overview": "Обзор",
  "/authentication": "Авторизация",
  "/limits": "Лимиты и ошибки",
  "/integrations": "Статус интеграций",
  "/keys": "Кабинет разработчика",
};
const publicMethods = catalog.filter((m) => m.path.startsWith("/v1/"));
const fieldDescriptions: Record<string, string> = {
  name: "Название, до 80 символов.",
  latitude: "Широта от −90 до 90.",
  longitude: "Долгота от −180 до 180.",
  area: "Площадь в гектарах, от 0 до 1 000 000.",
  crop: "Культура: wheat, tomato, apple или sunflower.",
  title: "Заголовок записи, до 120 символов.",
  text: "Наблюдения, до 10 000 символов.",
  date: "Дата в формате YYYY-MM-DD.",
  fieldId: "ID участка или пустая строка.",
  assets: "ID ранее загруженных вложений. Не больше 8.",
  serial: "Серийный номер: буквы, цифры, дефис и подчёркивание; 3–64 символа.",
  type: "moisture, temperature или weather.",
  scopes: "Список прав ключа.",
  days: "Срок действия: 7, 30, 90 или 365 дней.",
  flow: "Одноразовый идентификатор WebAuthn-запроса.",
  response: "Подписанный WebAuthn-ответ из браузера.",
  records: "Пакет записей для синхронизации.",
  id: "Идентификатор запроса или ресурса.",
  code: "Одноразовый код.",
  endpoint: "URL подписки на уведомления.",
  keys: "Ключи push-подписки.",
};
function Code({ value }: { value: string }) {
  return (
    <pre className="code-lines">
      <code>
        {value.split("\n").map((line, i) => (
          <span className="code-line" key={i}>
            <span className="line-number" aria-hidden="true">
              {i + 1}
            </span>
            <span>
              {line
                .split(
                  /("(?:[^"\\]|\\.)*"|'[^']*'|\b(?:true|false|null)\b|\b\d+(?:\.\d+)?\b|\$[A-Z_]+)/g,
                )
                .map((token, j) => (
                  <span
                    key={j}
                    className={
                      /^['"]|^\$/.test(token)
                        ? "syntax-string"
                        : /^(true|false|null|\d)/.test(token)
                          ? "syntax-value"
                          : ""
                    }
                  >
                    {token || " "}
                  </span>
                ))}
            </span>
          </span>
        ))}
      </code>
    </pre>
  );
}
function requestCode(item: Method, language: string, appOrigin: string) {
  const root =
    item.path.startsWith("/api/") && !item.path.startsWith("/api/developer/")
      ? appOrigin
      : location.origin;
  let path = item.path.replace("{id}", "RECORD_ID");
  if (item.id === "weather") path += "?latitude=51.1694&longitude=71.4491";
  else if (item.id.endsWith("-list")) path += "?limit=20";
  const url = root + path;
  const headers: Record<string, string> = {};
  if (item.auth === "key") {
    headers["X-EGIN-Key"] = "$EGIN_OPEN_KEY";
    headers.Authorization = "Bearer $EGIN_SECRET_KEY";
  }
  for (const header of item.headers)
    headers[header.name] =
      header.name === "If-Match"
        ? '"1"'
        : header.name === "X-EGIN"
          ? "1"
          : header.name === "Content-Type"
            ? "image/jpeg"
            : header.name;
  const binary = !!item.request?.$binary;
  if (item.request && !binary) headers["Content-Type"] = "application/json";
  if (item.auth === "app" || item.auth === "portal")
    headers.Cookie =
      (item.auth === "portal" ? "egin_developer" : "egin_session") +
      "=$SESSION_COOKIE";
  if (language === "JavaScript") {
    const entries = Object.entries(headers)
      .filter(([name]) => name !== "Cookie")
      .map(
        ([name, value]) =>
          `    ${JSON.stringify(name)}: ${value.startsWith("Bearer $") ? "`Bearer ${process.env.EGIN_SECRET_KEY}`" : value.startsWith("$") ? "process.env." + value.slice(1) : JSON.stringify(value)}`,
      );
    return `${item.auth === "key" ? "// Выполняйте на сервере, не в браузере\n" : ""}const response = await fetch(${JSON.stringify(url)}, {\n  method: ${JSON.stringify(item.method)},\n  headers: {\n${entries.join(",\n")}\n  }${item.auth === "app" || item.auth === "portal" ? ",\n  credentials: 'include'" : ""}${item.request ? `,\n  body: ${binary ? "fileBuffer" : `JSON.stringify(${JSON.stringify(item.request, null, 2)})`}` : ""}\n});\nconst ${(item.response as any)?.$binary ? "file = await response.arrayBuffer()" : "data = await response.json()"};`;
  }
  if (language === "Python")
    return `import os\nimport requests\n\nresponse = requests.request(\n    ${JSON.stringify(item.method)},\n    ${JSON.stringify(url)},\n    headers={\n${Object.entries(
      headers,
    )
      .map(
        ([name, value]) =>
          `        ${JSON.stringify(name)}: ${value.startsWith("Bearer $") ? '"Bearer " + os.environ["EGIN_SECRET_KEY"]' : value.startsWith("$") ? `os.environ[${JSON.stringify(value.slice(1))}]` : JSON.stringify(value)}`,
      )
      .join(
        ",\n",
      )}\n    },${item.request ? "\n    " + (binary ? 'data=open("plant.jpg", "rb"),' : "json=" + JSON.stringify(item.request, null, 2).replaceAll("true", "True").replaceAll("false", "False").replaceAll("null", "None") + ",") : ""}\n    timeout=20,\n)\nresponse.raise_for_status()\nprint(response.${(item.response as any)?.$binary ? "content" : "json()"})`;
  return [
    `curl --request ${item.method}`,
    `  --url '${url}'`,
    ...Object.entries(headers).map(
      ([name, value]) => `  --header ${JSON.stringify(name + ": " + value)}`,
    ),
    ...(item.request
      ? [
          binary
            ? "  --data-binary @plant.jpg"
            : `  --data '${JSON.stringify(item.request, null, 2)}'`,
        ]
      : []),
  ].join(" \\\n");
}
function MethodPage({
  item,
  language,
  setLanguage,
  appOrigin,
}: {
  item: Method;
  language: string;
  setLanguage: (s: string) => void;
  appOrigin: string;
}) {
  const code = requestCode(item, language, appOrigin);
  const response =
    (item.response as any)?.$binary || JSON.stringify(item.response, null, 2);
  const markdown = `# ${item.title}\n\n\`${item.method} ${item.path}\`\n\n${item.description}\n\n${item.scope ? "Право: `" + item.scope + "`\n\n" : ""}\`\`\`\n${code}\n\`\`\`\n\n## Ответ ${item.status}\n\n\`\`\`json\n${response}\n\`\`\``;
  return (
    <>
      <div className="doc-toolbar">
        <div className="breadcrumbs">
          <a href="#/overview">API Reference</a>
          <Icon name="chevron" size={14} />
          <span>{item.group}</span>
        </div>
        <Copy text={markdown} label="Copy Markdown" />
      </div>
      <header className="method-heading">
        <h1>{item.title}</h1>
        <div className="endpoint">
          <span className={"method " + item.method.toLowerCase()}>
            {item.method}
          </span>
          <code>{item.path}</code>
          <Copy text={item.path} compact />
        </div>
      </header>
      <div className="reference-columns">
        <article className="method-description">
          <p className="lead-small">{item.description}</p>
          <section className="doc-section">
            <h2>Авторизация</h2>
            <div className="security-box">
              <Icon name="shield" />
              <div>
                <strong>
                  {item.auth === "key"
                    ? "Open Key + Secret Key"
                    : item.auth === "app"
                      ? "Сессия основного приложения"
                      : item.auth === "portal"
                        ? "Сессия кабинета"
                        : "Без API-ключа"}
                </strong>
                <p>
                  {item.auth === "key"
                    ? "Передавайте оба заголовка. Ключ имеет доступ только к данным своего владельца."
                    : item.auth === "app"
                      ? "Сначала войдите в EGIN через passkey. Эти методы не принимают серверные API-ключи."
                      : item.auth === "portal"
                        ? "Войдите в кабинет по QR и подтвердите passkey в EGIN."
                        : item.path.includes("/qr/")
                          ? "Одноразовый запрос QR; для опроса и отмены нужна cookie создавшего его браузера."
                          : item.path.includes("/auth/")
                            ? "Одноразовый запрос WebAuthn или код восстановления."
                            : "Публичный метод. Авторизация не требуется."}
                </p>
                {item.auth === "key" && (
                  <>
                    <code>X-EGIN-Key: YOUR_OPEN_KEY</code>
                    <code>Authorization: Bearer YOUR_SECRET_KEY</code>
                  </>
                )}
              </div>
            </div>
            {item.scope && (
              <p className="permission-label">
                Необходимое право <code>{item.scope}</code>
              </p>
            )}
          </section>
          {[...item.params, ...item.headers].length > 0 && (
            <section className="doc-section">
              <h2>Параметры запроса</h2>
              <div className="parameter-list">
                {[...item.params, ...item.headers].map((p) => (
                  <div className="parameter" key={p.name}>
                    <div>
                      <strong>{p.name}</strong>
                      <code>{p.type}</code>
                      <span>{p.where}</span>
                      {p.required && <em>обязательный</em>}
                    </div>
                    <p>{p.description}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
          {item.request && (
            <section className="doc-section">
              <h2>
                Тело запроса{" "}
                <span className="subtle-tag">
                  {item.request.$binary ? "BINARY" : "JSON"}
                </span>
              </h2>
              {item.request.$binary ? (
                <p className="muted">
                  Передайте содержимое файла. Имя файла в примере — placeholder.
                </p>
              ) : (
                <div className="parameter-list">
                  {Object.entries(
                    item.method === "PATCH"
                      ? catalog.find(
                          (m) =>
                            m.method === "POST" &&
                            m.path === item.path.replace("/{id}", ""),
                        )?.request || item.request
                      : item.request,
                  ).map(([name, value]) => (
                    <div className="parameter" key={name}>
                      <div>
                        <strong>{name}</strong>
                        <code>
                          {Array.isArray(value) ? "array" : typeof value}
                        </code>
                        {item.method === "POST" &&
                          !item.path.startsWith("/api/") && (
                            <em>обязательный</em>
                          )}
                      </div>
                      <p>
                        {fieldDescriptions[name] || "Значение в JSON-запросе."}
                      </p>
                    </div>
                  ))}
                  {!Object.keys(item.request).length && (
                    <p className="muted">
                      Пустой JSON-объект: <code>{"{}"}</code>.
                    </p>
                  )}
                </div>
              )}
            </section>
          )}
          <section className="doc-section">
            <h2>Ответ</h2>
            <p className="response-description">
              <span className="status-code">{item.status}</span> Успешное
              выполнение запроса
            </p>
            {item.path.startsWith("/v1/") &&
              !(item.response as any)?.$binary && (
                <div className="parameter-list">
                  {[
                    ["success", "boolean", "Результат выполнения запроса."],
                    [
                      "result",
                      Array.isArray((item.response as any)?.result)
                        ? "array"
                        : "object",
                      "Данные ответа. Состав показан в примере.",
                    ],
                    [
                      "request_id",
                      "string",
                      "Идентификатор для диагностики запроса.",
                    ],
                  ].map(([name, type, desc]) => (
                    <div className="parameter" key={name}>
                      <div>
                        <strong>{name}</strong>
                        <code>{type}</code>
                      </div>
                      <p>{desc}</p>
                    </div>
                  ))}
                </div>
              )}
          </section>
          <section className="doc-section">
            <h2>Ошибки</h2>
            <div className="error-list">
              {[
                ["400", "Проверьте параметры и формат запроса."],
                ["401", "Войдите в аккаунт или проверьте ключ."],
                ["403", "Недостаточно прав."],
                ["404", "Ресурс не найден в вашем профиле."],
                ...(["PATCH", "DELETE"].includes(item.method)
                  ? [
                      ["409", "Версия записи изменилась."],
                      ["428", "Нужен заголовок If-Match."],
                    ]
                  : []),
                ["429", "Повторите запрос после Retry-After."],
              ].map(([status, text]) => (
                <p key={status}>
                  <code>{status}</code>
                  <span>{text}</span>
                </p>
              ))}
            </div>
          </section>
          <div className="doc-footer">
            EGIN API · v1 beta
            <a href="#/keys">
              Управлять ключами
              <Icon name="arrow" size={15} />
            </a>
          </div>
        </article>
        <aside className="examples" aria-label="Примеры кода">
          <div className="example-card">
            <div className="example-heading">
              <span>
                <Icon name="code" />
                {item.title}
              </span>
              <div>
                <select
                  aria-label="Язык примера"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  {["HTTP", "JavaScript", "Python"].map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
                <Copy text={code} compact />
              </div>
            </div>
            <Code value={code} />
          </div>
          <div className="example-response">
            <div className="example-heading">
              <span>
                <span className="status-dot" />
                {item.status} · пример ответа
              </span>
              <Copy text={response} compact />
            </div>
            <Code value={response} />
          </div>
          <p className="example-note">
            Данные в примерах иллюстративные. Запросы здесь не выполняются
            автоматически.
          </p>
        </aside>
      </div>
    </>
  );
}
function Overview() {
  return (
    <>
      <div className="breadcrumbs">
        Документация <Icon name="chevron" size={14} /> Обзор
      </div>
      <div className="overview-hero">
        <span className="eyebrow">EGIN ДЛЯ РАЗРАБОТЧИКОВ</span>
        <h1>
          Данные EGIN.
          <br />
          <span>Ваши интеграции.</span>
        </h1>
        <p className="lead">
          Работайте с участками, наблюдениями и погодой через единый API.
          Подключайте свои сервисы к данным EGIN.
        </p>
        <div className="hero-buttons">
          <a className="button primary" href="#/keys">
            Получить ключ
            <Icon name="arrow" />
          </a>
          <a className="button secondary" href="#/reference/fields-list">
            <Icon name="book" />
            Справочник API
          </a>
        </div>
        <div className="hero-meta">
          <span>
            <span className="status-dot" />
            v1 · открытая beta
          </span>
          <span>REST / JSON</span>
          <span>HTTPS</span>
        </div>
      </div>
      <div className="overview-stats">
        <div>
          <strong>{publicMethods.length}</strong>
          <span>метода внешнего API</span>
        </div>
        <div>
          <strong>7</strong>
          <span>групп разрешений</span>
        </div>
        <div>
          <strong>1</strong>
          <span>аккаунт с приложением</span>
        </div>
      </div>
      <section className="overview-section">
        <div className="section-title">
          <h2>Начните с данных</h2>
          <a href="#/reference/fields-list">
            Все методы
            <Icon name="arrow" size={15} />
          </a>
        </div>
        <div className="resource-grid">
          {[
            [
              "fields-list",
              "Участки",
              "Координаты, площадь и культуры. Данные синхронизируются с приложением.",
              "leaf",
            ],
            [
              "journal-list",
              "Дневник",
              "Наблюдения, фотографии и голосовые заметки с привязкой к участку.",
              "book",
            ],
            [
              "weather",
              "Погода",
              "Текущие условия и прогноз Open-Meteo на три дня.",
              "sun",
            ],
            [
              "sensors-list",
              "Датчики",
              "Реестр устройств, серийные номера и привязка к участкам.",
              "qr",
            ],
          ].map(([id, title, desc, icon]) => (
            <a className="resource-card" href={"#/reference/" + id} key={id}>
              <Icon name={icon as "leaf"} size={23} />
              <h3>
                {title}
                <Icon name="arrow" size={18} />
              </h3>
              <p>{desc}</p>
            </a>
          ))}
        </div>
      </section>
      <section className="quickstart">
        <div>
          <span className="eyebrow">ПЕРВЫЙ ЗАПРОС</span>
          <h2>
            От ключа до ответа
            <br />
            за несколько шагов
          </h2>
          <ol>
            <li>Войдите через QR из приложения EGIN.</li>
            <li>
              Создайте ключ с правом <code>fields:read</code>.
            </li>
            <li>Передайте Open Key и Secret Key в заголовках.</li>
          </ol>
          <a href="#/authentication">
            Как устроена авторизация
            <Icon name="arrow" size={15} />
          </a>
        </div>
        <div className="example-card">
          <div className="example-heading">
            <span>
              <Icon name="code" />
              Получить участки
            </span>
            <Copy
              text={requestCode(
                catalog.find((m) => m.id === "fields-list")!,
                "HTTP",
                "",
              )}
              compact
            />
          </div>
          <Code
            value={requestCode(
              catalog.find((m) => m.id === "fields-list")!,
              "HTTP",
              "",
            )}
          />
        </div>
      </section>
      <div className="callout">
        <Icon name="shield" />
        <p>
          Публичный API предоставляет доступ только к данным владельца ключа.
          Телеметрия датчиков, Google Weather и eGov пока{" "}
          <a href="#/integrations">в разработке</a>.
        </p>
      </div>
    </>
  );
}
function Guide({ path }: { path: string }) {
  return (
    <div className="guide">
      <div className="breadcrumbs">
        Документация <Icon name="chevron" size={14} /> {titles[path]}
      </div>
      <h1>{titles[path]}</h1>
      {path === "/authentication" ? (
        <>
          <p className="lead">
            Один профиль EGIN. Отдельные ключи для каждого сервиса.
          </p>
          <section className="doc-section">
            <h2>Вход в кабинет</h2>
            <p>
              Нажмите «Получить ключ» и откройте QR камерой телефона или
              сканером входа в EGIN. Сверьте код и адрес кабинета, затем
              подтвердите passkey. QR действует две минуты и используется один
              раз. Сессия кабинета действует 12 часов.
            </p>
          </section>
          <section className="doc-section">
            <h2>Три значения ключа</h2>
            <div className="parameter-list">
              {[
                [
                  "Open Key",
                  "Публичный идентификатор. Передавайте в X-EGIN-Key. Сам по себе доступ не открывает.",
                ],
                [
                  "Secret ID",
                  "Идентификатор записи ключа для замены и отзыва. Не является секретом авторизации.",
                ],
                [
                  "Secret Key",
                  "Секрет для Authorization: Bearer. Показывается только при создании или замене; сервер хранит его хеш.",
                ],
              ].map(([title, text]) => (
                <div className="parameter" key={title}>
                  <strong>{title}</strong>
                  <p>{text}</p>
                </div>
              ))}
            </div>
          </section>
          <section className="doc-section">
            <h2>Права, срок и отзыв</h2>
            <p>
              Создавайте отдельный ключ для каждой интеграции. Чтение и запись
              разрешаются независимо. Срок: 7, 30, 90 или 365 дней. Замена
              выдаёт новую пару ключей и немедленно отзывает старую.
            </p>
            <p>
              Секреты храните в переменных окружения своего сервера. Не
              помещайте их в фронтенд, мобильное приложение, URL или Git.
            </p>
          </section>
          <a className="button primary" href="#/keys">
            Перейти к ключам
            <Icon name="arrow" />
          </a>
        </>
      ) : path === "/limits" ? (
        <>
          <p className="lead">Предсказуемые ограничения и понятные ответы.</p>
          <div className="parameter-list">
            {[
              [
                "60 запросов / минуту",
                "На один ключ. X-RateLimit-Remaining показывает остаток. После 429 следуйте Retry-After.",
              ],
              [
                "500 запросов / минуту",
                "Общий предел на IP; запросы входа ограничены отдельно.",
              ],
              [
                "100 записей",
                "Максимальный размер страницы. Используйте next_cursor для продолжения.",
              ],
              [
                "10 активных ключей",
                "На один профиль. Истёкшие и отозванные ключи не учитываются.",
              ],
              ["8 МБ / файл", "Общий объём вложений профиля — 128 МБ."],
              [
                "10 000 записей",
                "Общий предел записей профиля, включая помеченные удалёнными.",
              ],
              [
                "If-Match",
                "PATCH и DELETE требуют актуальную версию из ETag. Без версии — 428, при конфликте — 409.",
              ],
              [
                "7 дней",
                "Журнал хранит до 500 последних запросов. Заголовки с секретами и тела запросов не записываются.",
              ],
            ].map(([title, text]) => (
              <div className="parameter" key={title}>
                <strong>{title}</strong>
                <p>{text}</p>
              </div>
            ))}
          </div>
          <section className="doc-section">
            <h2>Формат ошибки</h2>
            <div className="example-card">
              <Code
                value={JSON.stringify(
                  {
                    success: false,
                    errors: [
                      {
                        code: "insufficient_scope",
                        message: "Ключу требуется право fields:read.",
                      },
                    ],
                    request_id: "req_example",
                  },
                  null,
                  2,
                )}
              />
            </div>
          </section>
        </>
      ) : (
        <>
          <p className="lead">
            Что уже доступно и что мы подключаем следующим.
          </p>
          <div className="integration-grid">
            {[
              [
                "Данные профиля",
                "Доступно",
                "Участки, дневник, вложения и реестр датчиков. Изменения поступают в приложение при синхронизации.",
              ],
              [
                "Open-Meteo",
                "Доступно",
                "Прогноз на 3 дня, текущие условия, почасовые и суточные данные.",
              ],
              [
                "ElDala",
                "Доступно",
                "Новости с фотографиями и ссылками на первоисточник.",
              ],
              [
                "Телеметрия датчиков",
                "В разработке",
                "Приём измерений от физических устройств и мониторинг состояния. Реестр датчиков уже доступен.",
              ],
              [
                "Google Weather",
                "В разработке",
                "Будущее подключение провайдера Google. Пока прогноз предоставляет Open-Meteo.",
              ],
              [
                "eGov",
                "В разработке",
                "Ожидается официальная интеграция. Сейчас вход работает через passkey и QR EGIN.",
              ],
            ].map(([title, status, text]) => (
              <article className="resource-card" key={title}>
                <span className="subtle-tag">{status}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
export function App() {
  const [path, setPath] = useState(current),
    [language, setLanguage] = useState("HTTP"),
    [search, setSearch] = useState(false),
    [query, setQuery] = useState(""),
    [drawer, setDrawer] = useState(false),
    [login, setLogin] = useState(false),
    [user, setUser] = useState<User | null>(null),
    [appOrigin, setAppOrigin] = useState("https://egin.perricheno.com"),
    [theme, setTheme] = useState(() => {
      try {
        return localStorage.getItem("egin.api.theme") || "light";
      } catch {
        return "light";
      }
    });
  const searchInput = useRef<HTMLInputElement>(null);
  const item = catalog.find((m) => "/reference/" + m.id === path);
  const valid = !!item || !!titles[path];
  useEffect(() => {
    const update = () => {
      setPath(current());
      setDrawer(false);
      window.scrollTo(0, 0);
    };
    const key = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "k" &&
        !document.querySelector("[role=dialog]")
      ) {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener("hashchange", update);
    window.addEventListener("keydown", key);
    void api("/session")
      .then((s) => {
        setUser(s.user);
        if (s.app_origin) setAppOrigin(s.app_origin);
      })
      .catch(() => {});
    return () => {
      window.removeEventListener("hashchange", update);
      window.removeEventListener("keydown", key);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("egin.api.theme", theme);
    } catch {}
  }, [theme]);
  useEffect(() => {
    document.title =
      (item?.title || titles[path] || "Страница не найдена") + " · EGIN API";
  }, [path]);
  useEffect(() => {
    if (search) {
      const timer = setTimeout(() => searchInput.current?.focus(), 30);
      return () => clearTimeout(timer);
    }
  }, [search]);
  const links = [
    ["/overview", "Обзор", "book"],
    ["/authentication", "Авторизация", "shield"],
    ["/limits", "Лимиты и ошибки", "clock"],
    ["/integrations", "Статус интеграций", "leaf"],
  ];
  const sidebar = (
    <>
      <div className="sidebar-top">
        <label className="language-switch">
          <Icon name="code" />
          <select
            aria-label="Язык запросов"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {["HTTP", "JavaScript", "Python"].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
      </div>
      <nav aria-label="Справочник API">
        <div className="nav-section-label">Документация</div>
        {links.map(([href, label, icon]) => (
          <a
            key={href}
            href={"#" + href}
            className={"sidebar-link " + (path === href ? "selected" : "")}
            onClick={() => setDrawer(false)}
          >
            <Icon name={icon as "book"} size={17} />
            {label}
          </a>
        ))}
        <div className="nav-section-label">
          API Reference <span>{catalog.length}</span>
        </div>
        {groups.map((group) => (
          <details
            className="nav-group"
            key={group}
            open={
              group === item?.group ||
              [
                "Профиль",
                "Участки",
                "Дневник",
                "Датчики",
                "Погода и новости",
              ].includes(group)
                ? true
                : undefined
            }
          >
            <summary>
              {group}
              <Icon name="down" size={13} />
            </summary>
            <div>
              {catalog
                .filter((m) => m.group === group)
                .map((m) => (
                  <a
                    key={m.id}
                    className={
                      "endpoint-link " + (item?.id === m.id ? "selected" : "")
                    }
                    href={"#/reference/" + m.id}
                    onClick={() => setDrawer(false)}
                  >
                    <span className={"verb-icon " + m.method.toLowerCase()}>
                      {m.method === "GET"
                        ? "↙"
                        : m.method === "DELETE"
                          ? "×"
                          : "↗"}
                    </span>
                    <span>{m.title}</span>
                  </a>
                ))}
            </div>
          </details>
        ))}
      </nav>
      <a
        className="sidebar-download"
        href="/openapi.json"
        target="_blank"
        rel="noreferrer"
      >
        <Icon name="download" />
        OpenAPI 3.1
        <Icon name="arrow" size={14} />
      </a>
    </>
  );
  return (
    <>
      <a
        className="skip-link"
        href="#content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("content")?.focus();
        }}
      >
        К содержимому
      </a>
      <header className="portal-header">
        <div className="header-brand">
          <button
            className="icon-button mobile-menu"
            aria-label="Открыть меню"
            onClick={() => setDrawer(true)}
          >
            <Icon name="menu" />
          </button>
          <a className="brand" href="#/overview">
            <span className="brand-mark">
              <i />
              <i />
              <i />
            </span>
            <strong>
              egin<span>.</span>
            </strong>
            <span className="brand-divider" />
            API
          </a>
          <span className="beta-badge">v1 beta</span>
        </div>
        <div className="header-tools">
          <button
            className="search-launcher"
            onClick={() => {
              setQuery("");
              setSearch(true);
            }}
          >
            <Icon name="search" />
            <span>Поиск по документации</span>
            <kbd>Ctrl K</kbd>
          </button>
          <button
            className="icon-button theme-toggle"
            aria-label="Переключить тему"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            <Icon name="sun" />
          </button>
          <a className="button primary header-account" aria-label={user?"Кабинет":"Получить ключ"} href="#/keys">
            <Icon name={user ? "user" : "key"} />
            <span>{user ? "Кабинет" : "Получить ключ"}</span>
          </a>
        </div>
      </header>
      <aside className="portal-sidebar">{sidebar}</aside>
      <main className="portal-main" id="content" tabIndex={-1}>
        {location.hostname.startsWith("dev-") && (
          <div className="staging-notice">
            Тестовая среда · отдельные профили и ключи
          </div>
        )}
        {path === "/keys" ? (
          <Cabinet
            user={user}
            onLogin={() => setLogin(true)}
            onLogout={() => {
              return api("/logout", {}).then(() => setUser(null));
            }}
          />
        ) : item ? (
          <MethodPage
            item={item}
            language={language}
            setLanguage={setLanguage}
            appOrigin={appOrigin}
          />
        ) : path === "/overview" ? (
          <Overview />
        ) : valid ? (
          <Guide path={path} />
        ) : (
          <div className="guide">
            <h1>Метод не найден</h1>
            <p>Выберите раздел справочника или воспользуйтесь поиском.</p>
            <a className="button secondary" href="#/overview">
              К обзору
            </a>
          </div>
        )}
      </main>
      {drawer && (
        <Modal title="Документация" onClose={() => setDrawer(false)}>
          <div className="mobile-sidebar">{sidebar}</div>
        </Modal>
      )}
      {search && (
        <Modal
          title="Поиск по документации"
          onClose={() => setSearch(false)}
          wide
        >
          <div className="search-input">
            <Icon name="search" />
            <input
              ref={searchInput}
              aria-label="Поиск по документации"
              placeholder="Метод, ресурс или путь…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd>Esc</kbd>
          </div>
          <div className="search-results">
            {catalog
              .filter((m) =>
                (m.title + " " + m.path + " " + m.group + " " + (m.scope || ""))
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .slice(0, 14)
              .map((m) => (
                <a
                  href={"#/reference/" + m.id}
                  key={m.id}
                  onClick={() => setSearch(false)}
                >
                  <span className="method small">{m.method}</span>
                  <span>
                    <strong>{m.title}</strong>
                    <code>{m.path}</code>
                  </span>
                  <Icon name="arrow" size={15} />
                </a>
              ))}
            {!catalog.some((m) =>
              (m.title + " " + m.path + " " + m.group + " " + (m.scope || ""))
                .toLowerCase()
                .includes(query.toLowerCase()),
            ) && (
              <p className="empty-search">
                Ничего не найдено. Попробуйте «участки» или «weather».
              </p>
            )}
          </div>
        </Modal>
      )}
      {login && (
        <PortalLogin
          onClose={() => setLogin(false)}
          onLogin={(value) => {
            setUser(value);
            setLogin(false);
            location.hash = "/keys";
          }}
        />
      )}
    </>
  );
}
