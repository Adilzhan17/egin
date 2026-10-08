import { readFileSync } from "node:fs";
export const catalog = JSON.parse(
  readFileSync(new URL("./catalog.json", import.meta.url), "utf8"),
);
function schema(value) {
  if (value === null) return { type: "null" };
  if (Array.isArray(value))
    return { type: "array", items: value.length ? schema(value[0]) : {} };
  if (typeof value === "object")
    return {
      type: "object",
      properties: Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, schema(v)]),
      ),
    };
  return {
    type:
      typeof value === "number"
        ? Number.isInteger(value)
          ? "integer"
          : "number"
        : typeof value,
  };
}
export function openAPI(origin, appOrigin) {
  const paths = {};
  for (const item of catalog) {
    const binary = item.request?.$binary,
      responseBinary = item.response?.$binary;
    const operation = {
      operationId: item.id,
      summary: item.title,
      description: item.description,
      tags: [item.group],
      parameters: [...item.params, ...item.headers].map((p) => ({
        name: p.name,
        in: p.where,
        required: p.required,
        description: p.description,
        schema: { type: p.type },
      })),
      security:
        item.auth === "key"
          ? [{ OpenKey: [], SecretKey: [] }]
          : item.auth === "app"
            ? [{ AppSession: [] }]
            : item.auth === "portal"
              ? [{ DeveloperSession: [] }]
              : [],
      ...(item.scope ? { "x-required-scope": item.scope } : {}),
      responses: {
        [item.status]: {
          description: "Успешный ответ",
          content: {
            [responseBinary ? item.responseContentType || "application/octet-stream" : "application/json"]:
              {
                schema: responseBinary
                  ? { type: "string", format: "binary" }
                  : schema(item.response),
                ...(!responseBinary ? { example: item.response } : {}),
              },
          },
        },
        ...(item.auth === "key"
          ? {
              401: { description: "Ключ недействителен" },
              403: { description: "Недостаточно прав" },
              429: { description: "Лимит запросов" },
            }
          : {}),
      },
    };
    if (item.request !== null) {
      let bodySchema = binary
        ? { type: "string", format: "binary" }
        : schema(item.request);
      if (item.path.startsWith("/v1/") && item.method === "POST" && !binary)
        bodySchema.required = Object.keys(item.request);
      // PATCH accepts any subset of the same fields as creation.
      if (item.path.startsWith("/v1/") && item.method === "PATCH") {
        const create = catalog.find(
          (m) =>
            m.path === item.path.replace("/{id}", "") && m.method === "POST",
        );
        if (create)
          bodySchema = {
            ...schema(create.request),
            minProperties: 1,
            additionalProperties: false,
          };
      }
      operation.requestBody = {
        required: true,
        content: {
          [binary ? "image/jpeg" : "application/json"]: {
            schema: bodySchema,
            ...(!binary ? { example: item.request } : {}),
          },
        },
      };
    }
    if (item.path.startsWith("/api/"))
      operation.servers = [
        { url: item.path.startsWith("/api/developer") ? origin : appOrigin },
      ];
    (paths[item.path] ??= {})[item.method.toLowerCase()] = operation;
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "EGIN API",
      version: "1.0.0-beta",
      description:
        "API вашего профиля EGIN. Реестр датчиков доступен; телеметрия, Google Weather и eGov находятся в разработке.",
    },
    servers: [{ url: origin }],
    paths,
    components: {
      securitySchemes: {
        OpenKey: { type: "apiKey", in: "header", name: "X-EGIN-Key" },
        SecretKey: {
          type: "http",
          scheme: "bearer",
          description: "Secret Key, показанный при создании ключа.",
        },
        AppSession: { type: "apiKey", in: "cookie", name: "egin_session" },
        DeveloperSession: {
          type: "apiKey",
          in: "cookie",
          name: "egin_developer",
        },
      },
    },
  };
}
