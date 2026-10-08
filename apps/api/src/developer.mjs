import express from "express";
import {
  randomBytes,
  randomUUID,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { catalog, openAPI } from "./reference.mjs";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const random = () => randomBytes(32).toString("base64url");
const fail = (status, message, code = "request_error") =>
  Object.assign(new Error(message), { status, code });
export const SCOPES = [
  "profile:read",
  "fields:read",
  "fields:write",
  "journal:read",
  "journal:write",
  "sensors:read",
  "sensors:write",
  "assets:read",
  "assets:write",
  "weather:read",
  "news:read",
];
export function installDeveloperAPI({
  app,
  db,
  portalOrigin,
  appOrigin,
  validateRecord,
  getNews,
}) {
  db.exec(`CREATE TABLE IF NOT EXISTS developer_sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS api_keys(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),name TEXT NOT NULL,open_key TEXT UNIQUE NOT NULL,secret_hash TEXT NOT NULL,hint TEXT NOT NULL,scopes TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL,revoked INTEGER,last_used INTEGER);
 CREATE TABLE IF NOT EXISTS api_usage(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL,key_id TEXT NOT NULL,method TEXT NOT NULL,path TEXT NOT NULL,status INTEGER NOT NULL,created INTEGER NOT NULL,duration INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS api_usage_owner ON api_usage(user_id,id);
 CREATE TABLE IF NOT EXISTS api_limits(key_id TEXT PRIMARY KEY,window INTEGER NOT NULL,count INTEGER NOT NULL);`);
  const secure = portalOrigin.startsWith("https:");
  const cookie = (req) =>
    (req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("egin_developer="))
      ?.slice(15);
  function portalSession(res, user) {
    const secret = random();
    db.prepare("DELETE FROM developer_sessions WHERE expires<=?").run(
      Date.now(),
    );
    db.prepare("INSERT INTO developer_sessions VALUES(?,?,?)").run(
      digest(secret),
      user,
      Date.now() + 12 * 3600000,
    );
    res.append(
      "Set-Cookie",
      `egin_developer=${secret}; HttpOnly; Path=/api/developer; SameSite=Strict; Max-Age=43200${secure ? "; Secure" : ""}`,
    );
  }
  app.use("/api/developer", (req, res, next) => {
    const sid = cookie(req);
    if (sid)
      req.developer = db
        .prepare(
          "SELECT users.id,users.name FROM users JOIN developer_sessions ON users.id=developer_sessions.user_id WHERE developer_sessions.id=? AND expires>?",
        )
        .get(digest(sid), Date.now());
    next();
  });
  const required = (req, res, next) =>
    req.developer
      ? next()
      : res.status(401).json({ error: "Войдите через QR в приложении EGIN." });
  const wrap = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res)).catch(next);
  app.get("/api/developer/session", (req, res) =>
    res.json({
      user: req.developer || null,
      origin: portalOrigin,
      app_origin: appOrigin,
    }),
  );
  app.post("/api/developer/logout", (req, res) => {
    const sid = cookie(req);
    if (sid)
      db.prepare("DELETE FROM developer_sessions WHERE id=?").run(digest(sid));
    res
      .append(
        "Set-Cookie",
        `egin_developer=; HttpOnly; Path=/api/developer; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`,
      )
      .json({ ok: true });
  });
  const publicKey = (k) => ({
    id: k.id,
    name: k.name,
    open_key: k.open_key,
    secret_hint: "••••" + k.hint,
    scopes: JSON.parse(k.scopes),
    created: k.created,
    expires: k.expires,
    revoked: k.revoked,
    last_used: k.last_used,
  });
  function issue(user, name, scopes, days) {
    const id = "key_" + randomUUID(),
      open_key = "egin_pk_" + randomBytes(18).toString("base64url"),
      secret_key = "egin_sk_" + random();
    const created = Date.now(),
      expires = created + days * 86400000;
    db.prepare("INSERT INTO api_keys VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(
      id,
      user,
      name,
      open_key,
      digest(secret_key),
      secret_key.slice(-4),
      JSON.stringify(scopes),
      created,
      expires,
      null,
      null,
    );
    return {
      ...publicKey(db.prepare("SELECT * FROM api_keys WHERE id=?").get(id)),
      secret_key,
    };
  }
  app.get("/api/developer/keys", required, (req, res) =>
    res.json({
      keys: db
        .prepare(
          "SELECT * FROM api_keys WHERE user_id=? ORDER BY (revoked IS NULL) DESC,expires DESC LIMIT 100",
        )
        .all(req.developer.id)
        .map(publicKey),
      scopes: SCOPES,
    }),
  );
  app.post("/api/developer/keys", required, (req, res) => {
    const { name, scopes, days = 90 } = req.body;
    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 80 ||
      !Array.isArray(scopes) ||
      !scopes.length ||
      scopes.length > SCOPES.length ||
      !scopes.every((s) => SCOPES.includes(s)) ||
      ![7, 30, 90, 365].includes(days)
    )
      throw fail(400, "Укажите название, права и срок действия ключа.");
    db.exec("BEGIN IMMEDIATE");
    try {
      if (
        db
          .prepare(
            "SELECT count(*) n FROM api_keys WHERE user_id=? AND revoked IS NULL AND expires>?",
          )
          .get(req.developer.id, Date.now()).n >= 10
      )
        throw fail(
          409,
          "Не больше 10 активных ключей. Отзовите ненужный ключ.",
        );
      const value = issue(
        req.developer.id,
        name.trim(),
        [...new Set(scopes)],
        days,
      );
      db.exec("COMMIT");
      res.status(201).json(value);
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  });
  app.delete("/api/developer/keys/:id", required, (req, res) => {
    const changed = db
      .prepare(
        "UPDATE api_keys SET revoked=? WHERE id=? AND user_id=? AND revoked IS NULL",
      )
      .run(Date.now(), req.params.id, req.developer.id);
    if (!changed.changes) throw fail(404, "Ключ не найден или уже отозван.");
    res.json({ ok: true });
  });
  app.post("/api/developer/keys/:id/rotate", required, (req, res) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const old = db
        .prepare(
          "SELECT * FROM api_keys WHERE id=? AND user_id=? AND revoked IS NULL AND expires>?",
        )
        .get(req.params.id, req.developer.id, Date.now());
      if (!old) throw fail(404, "Активный ключ не найден.");
      db.prepare("UPDATE api_keys SET revoked=? WHERE id=?").run(
        Date.now(),
        old.id,
      );
      const value = issue(
        old.user_id,
        old.name,
        JSON.parse(old.scopes),
        (old.expires - Date.now()) / 86400000,
      );
      db.exec("COMMIT");
      res.status(201).json(value);
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  });
  app.get("/api/developer/usage", required, (req, res) =>
    res.json({
      requests: db
        .prepare(
          "SELECT api_usage.*,api_keys.name FROM api_usage LEFT JOIN api_keys ON api_usage.key_id=api_keys.id WHERE api_usage.user_id=? AND api_usage.created>? ORDER BY api_usage.id DESC LIMIT 50",
        )
        .all(req.developer.id, Date.now()-7*86400000),
    }),
  );
  app.get("/api/developer/reference", (req, res) => res.json(catalog));
  app.get("/openapi.json", (req, res) =>
    res.json(openAPI(portalOrigin, appOrigin)),
  );
  const v1 = express.Router();
  app.use("/v1", v1);
  v1.use((req, res, next) => {
    req.requestId ||= randomUUID();
    res.set("X-Request-ID", req.requestId);
    next();
  });
  v1.get("/health", (req, res) =>
    res.json({
      success: true,
      result: { status: "ok", version: "v1" },
      request_id: req.requestId,
    }),
  );
  v1.use((req, res, next) => {
    const open = req.headers["x-egin-key"],
      secret = req.headers.authorization?.match(
        /^Bearer (egin_sk_[A-Za-z0-9_-]{43})$/,
      )?.[1];
    const key =
      typeof open === "string" && open.length < 100
        ? db.prepare("SELECT * FROM api_keys WHERE open_key=?").get(open)
        : null;
    if (
      !key ||
      !secret ||
      key.revoked ||
      key.expires <= Date.now() ||
      !timingSafeEqual(
        Buffer.from(key.secret_hash, "hex"),
        Buffer.from(digest(secret), "hex"),
      )
    )
      return next(
        fail(401, "Ключ недействителен, отозван или истёк.", "invalid_key"),
      );
    req.apiKey = key;
    const start = Date.now();
    res.on("finish", () => {
      try {
        db.prepare(
          "INSERT INTO api_usage(user_id,key_id,method,path,status,created,duration) VALUES(?,?,?,?,?,?,?)",
        ).run(
          key.user_id,
          key.id,
          req.method,
          "/v1" + (req.route?.path || "/unknown"),
          res.statusCode,
          Date.now(),
          Date.now() - start,
        );
        db.prepare(
          "DELETE FROM api_usage WHERE user_id=? AND (created<? OR id NOT IN (SELECT id FROM api_usage WHERE user_id=? ORDER BY id DESC LIMIT 500))",
        ).run(key.user_id, Date.now() - 7 * 86400000, key.user_id);
      } catch {
        /* Logging must not interrupt completed requests. */
      }
    });
    const minute = Math.floor(Date.now() / 60000);
    const usage = db
      .prepare(
        "INSERT INTO api_limits VALUES(?,?,1) ON CONFLICT(key_id) DO UPDATE SET window=excluded.window,count=CASE WHEN api_limits.window=excluded.window THEN api_limits.count+1 ELSE 1 END RETURNING count",
      )
      .get(key.id, minute);
    res
      .set("X-RateLimit-Limit", "60")
      .set("X-RateLimit-Remaining", String(Math.max(0, 60 - usage.count)));
    if (usage.count > 60) {
      res.set("Retry-After", String(60 - (Math.floor(Date.now() / 1000) % 60)));
      return next(
        fail(429, "Лимит — 60 запросов в минуту на ключ.", "rate_limit"),
      );
    }
    db.prepare("UPDATE api_keys SET last_used=? WHERE id=?").run(
      Date.now(),
      key.id,
    );
    next();
  });
  const scope = (name) => (req, res, next) =>
    JSON.parse(req.apiKey.scopes).includes(name)
      ? next()
      : next(fail(403, `Ключу требуется право ${name}.`, "insufficient_scope"));
  const result = (req, res, value, status = 200, extra = {}) =>
    res
      .status(status)
      .json({
        success: true,
        result: value,
        ...extra,
        request_id: req.requestId,
      });
  v1.get("/me", scope("profile:read"), (req, res) => {
    const user = db
      .prepare("SELECT id,name FROM users WHERE id=?")
      .get(req.apiKey.user_id);
    result(req, res, user);
  });
  const exposed = (row) => ({
    id: row.id,
    ...JSON.parse(row.data),
    version: row.version,
  });
  const find = (req, kind) => {
    const row = db
      .prepare(
        "SELECT * FROM records WHERE user_id=? AND id=? AND kind=? AND deleted=0",
      )
      .get(req.apiKey.user_id, req.params.id, kind);
    if (!row) throw fail(404, "Запись не найдена.", "not_found");
    return row;
  };
  function store(req, kind, data, old = null, deleted = false) {
    const record = {
      id: old?.id || randomUUID(),
      kind,
      data,
      version: old?.version || 0,
      deleted,
    };
    validateRecord(record);
    if (
      !old &&
      db
        .prepare("SELECT count(*) n FROM records WHERE user_id=?")
        .get(req.apiKey.user_id).n >= 10000
    )
      throw fail(413, "Лимит записей профиля достигнут.");
    if (kind === "entry" && !deleted)
      for (const id of data.assets)
        if (
          !db
            .prepare("SELECT id FROM assets WHERE user_id=? AND id=?")
            .get(req.apiKey.user_id, id)
        )
          throw fail(400, "Вложение не найдено в вашем профиле.");
    if (
      !deleted &&
      kind !== "field" &&
      data.fieldId &&
      !db
        .prepare(
          "SELECT id FROM records WHERE user_id=? AND id=? AND kind='field' AND deleted=0",
        )
        .get(req.apiKey.user_id, data.fieldId)
    )
      throw fail(400, "Участок не найден в вашем профиле.");
    const seq = db.prepare("UPDATE sequence SET n=n+1 RETURNING n").get().n;
    db.prepare(
      "INSERT INTO records VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET data=excluded.data,deleted=excluded.deleted,version=excluded.version,seq=excluded.seq",
    ).run(
      req.apiKey.user_id,
      record.id,
      kind,
      JSON.stringify(data),
      Number(deleted),
      record.version + 1,
      seq,
    );
    return { id: record.id, ...data, version: record.version + 1 };
  }
  const properties = {
    field: ["name", "latitude", "longitude", "area", "crop", "boundary", "cadastre"],
    entry: ["title", "text", "date", "fieldId", "assets"],
    sensor: ["name", "serial", "fieldId", "type"],
  };
  for (const [resource, kind] of [
    ["fields", "field"],
    ["journal", "entry"],
    ["sensors", "sensor"],
  ]) {
    v1.get("/" + resource, scope(resource + ":read"), (req, res) => {
      const limit = Number(req.query.limit || 20),
        cursor = Number(req.query.cursor || 0);
      if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100 ||
        !Number.isSafeInteger(cursor) ||
        cursor < 0
      )
        throw fail(400, "limit: 1–100; cursor: целое число ≥ 0.");
      const rows = db
        .prepare(
          "SELECT * FROM records WHERE user_id=? AND kind=? AND deleted=0 AND seq>? ORDER BY seq LIMIT ?",
        )
        .all(req.apiKey.user_id, kind, cursor, limit + 1);
      result(req, res, rows.slice(0, limit).map(exposed), 200, {
        next_cursor: rows.length > limit ? rows[limit - 1].seq : null,
      });
    });
    v1.get("/" + resource + "/:id", scope(resource + ":read"), (req, res) => {
      const row = find(req, kind);
      res.set("ETag", `"${row.version}"`);
      result(req, res, exposed(row));
    });
    v1.post("/" + resource, scope(resource + ":write"), (req, res) => {
      if (
        !req.body ||
        typeof req.body !== "object" ||
        Array.isArray(req.body) ||
        Object.keys(req.body).some((k) => !properties[kind].includes(k))
      )
        throw fail(400, "Проверьте поля JSON.");
      db.exec("BEGIN IMMEDIATE");
      try {
        const value = store(req, kind, req.body);
        db.exec("COMMIT");
        res.set("ETag", `"${value.version}"`);
        result(req, res, value, 201);
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    });
    for (const method of ["patch", "delete"])
      v1[method](
        "/" + resource + "/:id",
        scope(resource + ":write"),
        (req, res) => {
          const raw = req.headers["if-match"];
          if (!raw)
            throw fail(
              428,
              "Передайте версию из ETag в If-Match.",
              "precondition_required",
            );
          if (!/^"?\d+"?$/.test(raw))
            throw fail(400, "If-Match должен содержать номер версии.");
          db.exec("BEGIN IMMEDIATE");
          try {
            const row = find(req, kind);
            if (Number(raw.replaceAll('"', "")) !== row.version)
              throw fail(
                409,
                "Запись изменилась. Загрузите её заново.",
                "version_conflict",
              );
            if (
              method === "patch" &&
              (!req.body ||
                typeof req.body !== "object" ||
                Array.isArray(req.body) ||
                !Object.keys(req.body).length ||
                Object.keys(req.body).some(
                  (k) => !properties[kind].includes(k),
                ))
            )
              throw fail(400, "Проверьте поля JSON.");
            const value = store(
              req,
              kind,
              method === "delete"
                ? JSON.parse(row.data)
                : { ...JSON.parse(row.data), ...req.body },
              row,
              method === "delete",
            );
            db.exec("COMMIT");
            res.set("ETag", `"${value.version}"`);
            result(
              req,
              res,
              method === "delete"
                ? { id: row.id, deleted: true, version: value.version }
                : value,
            );
          } catch (e) {
            db.exec("ROLLBACK");
            throw e;
          }
        },
      );
  }
  v1.get("/assets/:id", scope("assets:read"), (req, res) => {
    const value = db
      .prepare("SELECT * FROM assets WHERE user_id=? AND id=?")
      .get(req.apiKey.user_id, req.params.id);
    if (!value) throw fail(404, "Вложение не найдено.");
    res
      .set("Content-Type", value.mime)
      .set("Content-Disposition", "inline")
      .send(Buffer.from(value.data));
  });
  v1.post(
    "/assets",
    scope("assets:write"),
    express.raw({ type: () => true, limit: "8mb" }),
    (req, res) => {
      const mime = (req.headers["content-type"] || "").split(";")[0];
      if (
        ![
          "image/jpeg",
          "image/png",
          "image/webp",
          "audio/webm",
          "audio/ogg",
          "audio/mp4",
          "audio/mpeg",
          "audio/wav",
        ].includes(mime) ||
        !Buffer.isBuffer(req.body) ||
        !req.body.length
      )
        throw fail(400, "Нужен бинарный файл поддерживаемого формата.");
      db.exec("BEGIN IMMEDIATE");
      try {
        const size = db
          .prepare(
            "SELECT coalesce(sum(length(data)),0) n FROM assets WHERE user_id=?",
          )
          .get(req.apiKey.user_id).n;
        if (size + req.body.length > 128 * 1024 * 1024)
          throw fail(413, "Лимит вложений профиля: 128 МБ.");
        const id = randomUUID();
        db.prepare("INSERT INTO assets VALUES(?,?,?,?)").run(
          req.apiKey.user_id,
          id,
          mime,
          req.body,
        );
        db.exec("COMMIT");
        result(req, res, { id, mime, size: req.body.length }, 201);
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  );
  v1.get(
    "/news",
    scope("news:read"),
    wrap(async (req, res) => result(req, res, await getNews())),
  );
  const cache = new Map();
  v1.get(
    "/weather",
    scope("weather:read"),
    wrap(async (req, res) => {
      const lat = Number(req.query.latitude),
        lon = Number(req.query.longitude);
      if (
        !req.query.latitude ||
        !req.query.longitude ||
        !Number.isFinite(lat) ||
        Math.abs(lat) > 90 ||
        !Number.isFinite(lon) ||
        Math.abs(lon) > 180
      )
        throw fail(400, "Укажите latitude (−90…90) и longitude (−180…180).");
      const id = `${lat.toFixed(4)},${lon.toFixed(4)}`;
      const saved = cache.get(id);
      if (saved && saved.until > Date.now())
        return result(req, res, saved.data);
      const params = new URLSearchParams({
        latitude: lat.toFixed(4),
        longitude: lon.toFixed(4),
        timezone: "Asia/Almaty",
        forecast_days: "3",
        current:
          "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
        hourly:
          "temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,pressure_msl,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index",
        daily:
          "temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum",
        wind_speed_unit: "kmh",
        temperature_unit: "celsius",
        precipitation_unit: "mm",
      });
      try {
        const response = await fetch(
          "https://api.open-meteo.com/v1/forecast?" + params,
          { signal: AbortSignal.timeout(12000) },
        );
        if (!response.ok) throw new Error("Provider unavailable");
        const forecast = await response.json();
        if (!forecast.current || !forecast.hourly)
          throw new Error("Invalid weather");
        const data = {
          provider: "Open-Meteo",
          fetched_at: new Date().toISOString(),
          ...forecast,
        };
        if (cache.size >= 200) cache.delete(cache.keys().next().value);
        cache.set(id, { data, until: Date.now() + 600000 });
        result(req, res, data);
      } catch {
        throw fail(
          502,
          "Провайдер погоды временно недоступен.",
          "upstream_error",
        );
      }
    }),
  );
  v1.use((req, res, next) =>
    next(fail(404, "Метод API не найден.", "not_found")),
  );
  v1.use((err, req, res, next) => {
    const status = err.status || 500;
    res
      .status(status)
      .json({
        success: false,
        errors: [
          {
            code: err.code || "request_error",
            message:
              status === 500 ? "Не удалось выполнить запрос." : err.message,
          },
        ],
        request_id: req.requestId,
      });
  });
  return { portalSession };
}
