import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { createApp } from "../src/server.mjs";
import { SCOPES } from "../src/developer.mjs";
const hash = (s) => createHash("sha256").update(s).digest("hex");
test('field API preserves imported boundaries and unverified cadastral provenance', async t => {
  const {request,issue} = await fixture(t);
  const key = await issue(['fields:read','fields:write']);
  const data = {name:'Контур',latitude:51.105,longitude:71.105,area:77.5,crop:'unknown',boundary:{type:'Polygon',coordinates:[[[71.1,51.1],[71.11,51.1],[71.11,51.11],[71.1,51.11],[71.1,51.1]]]},cadastre:{source:'public-map',number:'05071008125',importedAt:'2026-10-09T00:00:00.000Z'}};
  const created = await request('/v1/fields',{method:'POST',key,body:data});
  assert.equal(created.status,201);
  const row = (await created.json()).result;
  assert.deepEqual(row.boundary,data.boundary);assert.deepEqual(row.cadastre,data.cadastre);
  const read = (await (await request('/v1/fields/'+row.id,{key})).json()).result;
  assert.deepEqual(read.boundary,data.boundary);
  const changed = await request('/v1/fields/'+row.id,{method:'PATCH',key,body:{name:'Новое имя'},headers:{'If-Match':'"1"'}});
  assert.equal(changed.status,200);assert.deepEqual((await changed.json()).result.boundary,data.boundary);
  const invalid = await request('/v1/fields',{method:'POST',key,body:{...data,boundary:{type:'Polygon',coordinates:[[[71,51],[72,52],[71,52],[72,51],[71,51]]]}}});
  assert.equal(invalid.status,400);
});
async function fixture(t) {
  const dir = mkdtempSync(tmpdir() + "/egin-developer-");
  const { app, db } = createApp({
    dataDir: dir,
    origins: ["http://app.test"],
    rpID: "app.test",
    portalOrigin: "http://portal.test",
  });
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const base = "http://127.0.0.1:" + server.address().port;
  for (const id of ["alice", "bob"]) {
    db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(
      id,
      id,
      null,
      Date.now(),
    );
    db.prepare("INSERT INTO developer_sessions VALUES(?,?,?)").run(
      hash(id),
      id,
      Date.now() + 60000,
    );
    db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
      hash(id),
      id,
      Date.now() + 60000,
    );
  }
  const request = (
    path,
    { method = "GET", body, user = "alice", key, headers = {} } = {},
  ) =>
    fetch(base + path, {
      method,
      headers: {
        ...(key
          ? {
              "X-EGIN-Key": key.open_key,
              Authorization: "Bearer " + key.secret_key,
            }
          : {
              Cookie: "egin_developer=" + user,
              Origin: "http://portal.test",
              "X-EGIN": "1",
            }),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  const issue = async (scopes = SCOPES, user = "alice") => {
    const r = await request("/api/developer/keys", {
      method: "POST",
      body: { name: "Test", scopes, days: 7 },
      user,
    });
    assert.equal(r.status, 201);
    return r.json();
  };
  return { app, db, request, issue, base };
}
test("developer keys: hashes only, owner isolation, scopes, expiration, rotation, revocation and logs", async (t) => {
  const { db, request, issue } = await fixture(t);
  const key = await issue();
  assert.match(key.secret_key, /^egin_sk_/);
  assert.equal(
    db.prepare("SELECT secret_hash FROM api_keys WHERE id=?").get(key.id)
      .secret_hash,
    hash(key.secret_key),
  );
  const listed = await (await request("/api/developer/keys")).json();
  assert.equal(JSON.stringify(listed).includes(key.secret_key), false);
  assert.equal(JSON.stringify(listed).includes("secret_hash"), false);
  assert.equal(
    (await (await request("/api/developer/keys", { user: "bob" })).json()).keys
      .length,
    0,
  );
  assert.equal(
    (
      await request("/api/developer/keys/" + key.id, {
        user: "bob",
        method: "DELETE",
      })
    ).status,
    404,
  );
  assert.equal(
    (await request("/api/developer/keys", { user: "none" })).status,
    401,
  );
  assert.equal(
    (await request("/api/session")).status,
    403,
    "portal origin cannot call app session",
  );
  assert.equal((await request("/v1/me", { key })).status, 200);
  const limited = await issue(["fields:read"]);
  assert.equal((await request("/v1/me", { key: limited })).status, 403);
  assert.equal(
    (
      await request("/v1/me", {
        key: { ...key, secret_key: limited.secret_key },
      })
    ).status,
    401,
  );
  const replacement = await (
    await request("/api/developer/keys/" + key.id + "/rotate", {
      method: "POST",
      body: {},
    })
  ).json();
  assert.equal((await request("/v1/me", { key })).status, 401);
  assert.equal((await request("/v1/me", { key: replacement })).status, 200);
  const logs = await (await request("/api/developer/usage")).json();
  assert.ok(logs.requests.some((r) => r.path === "/v1/me" && r.status === 200));
  assert.equal(JSON.stringify(logs).includes(replacement.secret_key), false);
  assert.equal(
    (await (await request("/api/developer/usage", { user: "bob" })).json())
      .requests.length,
    0,
  );
  await request("/api/developer/keys/" + replacement.id, { method: "DELETE" });
  assert.equal((await request("/v1/me", { key: replacement })).status, 401);
  db.prepare("UPDATE api_keys SET expires=0 WHERE id=?").run(limited.id);
  assert.equal((await request("/v1/fields", { key: limited })).status, 401);
});
test("external records share app sync, enforce version conflicts, scope and ownership, and support attachments", async (t) => {
  const { db, request, issue, base } = await fixture(t);
  const key = await issue(),
    bob = await issue(SCOPES, "bob");
  const created = await request("/v1/fields", {
    key,
    method: "POST",
    body: {
      name: "North",
      latitude: 51,
      longitude: 71,
      area: 60,
      crop: "wheat",
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get("etag"), '"1"');
  const field = (await created.json()).result;
  assert.equal(
    (await request("/v1/fields/" + field.id, { key: bob })).status,
    404,
  );
  assert.equal(
    (
      await request("/v1/fields/" + field.id, {
        key,
        method: "PATCH",
        body: { name: "Updated" },
      })
    ).status,
    428,
  );
  assert.equal(
    (
      await request("/v1/fields/" + field.id, {
        key,
        method: "PATCH",
        headers: { "If-Match": '"7"' },
        body: { name: "Updated" },
      })
    ).status,
    409,
  );
  const patched = await request("/v1/fields/" + field.id, {
    key,
    method: "PATCH",
    headers: { "If-Match": '"1"' },
    body: { name: "Updated" },
  });
  assert.equal(patched.status, 200);
  assert.equal((await patched.json()).result.version, 2);
  const synced = await fetch(base + "/api/sync?cursor=0", {
    headers: { Cookie: "egin_session=alice", Origin: "http://app.test" },
  });
  assert.ok(
    (await synced.json()).records.some(
      (r) => r.id === field.id && r.version === 2 && r.data.name === "Updated",
    ),
  );
  const upload = await fetch(base + "/v1/assets", {
    method: "POST",
    headers: {
      "X-EGIN-Key": key.open_key,
      Authorization: "Bearer " + key.secret_key,
      "Content-Type": "image/png",
    },
    body: Buffer.from([137, 80, 78, 71]),
  });
  assert.equal(upload.status, 201);
  const asset = (await upload.json()).result;
  assert.equal(
    (await request("/v1/assets/" + asset.id, { key: bob })).status,
    404,
  );
  assert.equal((await request("/v1/assets/" + asset.id, { key })).status, 200);
  const entry = {
    title: "Test",
    text: "Observation",
    date: "2026-10-08",
    fieldId: field.id,
    assets: [asset.id],
  };
  assert.equal(
    (await request("/v1/journal", { key: bob, method: "POST", body: entry }))
      .status,
    400,
  );
  assert.equal(
    (await request("/v1/journal", { key, method: "POST", body: entry })).status,
    201,
  );
  assert.equal(
    (
      await request("/v1/sensors", {
        key: bob,
        method: "POST",
        body: {
          name: "Soil",
          serial: "TEST-001",
          fieldId: field.id,
          type: "moisture",
        },
      })
    ).status,
    400,
  );
  assert.equal((await request("/v1/fields?limit=101", { key })).status, 400);
  const del = await request("/v1/fields/" + field.id, {
    key,
    method: "DELETE",
    headers: { "If-Match": '"2"' },
  });
  assert.equal(del.status, 200);
  assert.equal(
    db.prepare("SELECT deleted FROM records WHERE id=?").get(field.id).deleted,
    1,
  );
  assert.equal((await request("/v1/fields/" + field.id, { key })).status, 404);
  const bad = await fetch(base + "/v1/fields", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).success, false);
});
test("API limits persist in SQLite and reference covers every installed method", async (t) => {
  const { app, db, request, issue } = await fixture(t);
  const key = await issue();
  db.prepare("INSERT INTO api_limits VALUES(?,?,?)").run(
    key.id,
    Math.floor(Date.now() / 60000),
    60,
  );
  const rate = await request("/v1/me", { key });
  assert.equal(rate.status, 429);
  assert.ok(Number(rate.headers.get("Retry-After")) > 0);
  const spec = await (await request("/openapi.json")).json();
  assert.equal(spec.openapi, "3.1.0");
  const actual=[];
  for (const layer of app.router.stack) {
    const routes=layer.route?[{route:layer.route,prefix:''}]:layer.name==='router'?layer.handle.stack.filter(l=>l.route).map(l=>({route:l.route,prefix:'/v1'})):[];
    for(const {route,prefix} of routes) for(const method of Object.keys(route.methods)) actual.push(method.toUpperCase()+' '+prefix+route.path.replace(/:([a-zA-Z]+)/g,'{$1}'));
  }
  const documented=Object.entries(spec.paths).flatMap(([path,methods])=>Object.keys(methods).map(method=>method.toUpperCase()+' '+path));
  assert.deepEqual(actual.sort(),documented.sort(),'reference must cover exactly the installed routes');

  assert.ok(Object.keys(spec.paths).length > 35);
  assert.equal(
    spec.paths["/v1/fields"].post.requestBody.content["application/json"].schema
      .required.length,
    5,
  );
  assert.equal(
    spec.paths["/api/auth/qr/{id}/verify"].post.servers[0].url,
    "http://app.test",
  );
  assert.equal(
    spec.paths["/api/developer/keys"].get.servers[0].url,
    "http://portal.test",
  );
  for (let n = 0; n < 9; n++) await issue(["fields:read"]);
  assert.equal(
    (
      await request("/api/developer/keys", {
        method: "POST",
        body: { name: "Too many", scopes: ["fields:read"], days: 7 },
      })
    ).status,
    409,
  );
});
test("developer QR is browser and audience bound and issues only a separate portal session", async (t) => {
  const { db, request, base } = await fixture(t);
  const response = await request("/api/developer/qr/start", {
    method: "POST",
    body: {},
  });
  const qr = await response.json();
  const cookie = response.headers.getSetCookie()[0].split(";")[0];
  assert.ok(
    response.headers.getSetCookie()[0].includes("Path=/api/developer/qr"),
  );
  assert.ok(qr.url.startsWith("http://app.test/#/auth/confirm/"));
  const details = await fetch(base + "/api/auth/qr/" + qr.id, {
    headers: { Cookie: "egin_session=alice", Origin: "http://app.test" },
  });
  const info = await details.json();
  assert.equal(info.audience, "developer");
  assert.equal(info.target_origin, "http://portal.test");
  assert.equal(
    (
      await request("/api/developer/qr/poll", {
        method: "POST",
        body: { id: qr.id },
      })
    ).status,
    403,
  );
  const cross = await fetch(base + "/api/auth/qr/poll", {
    method: "POST",
    headers: {
      "X-EGIN": "1",
      "Content-Type": "application/json",
      Cookie: cookie.replace("egin_developer_qr", "egin_qr"),
    },
    body: JSON.stringify({ id: qr.id }),
  });
  assert.equal(cross.status, 403);
  db.prepare(
    "UPDATE qr_logins SET status='approved',user_id='alice' WHERE id=?",
  ).run(hash(qr.id));
  const finish = await request("/api/developer/qr/poll", {
    method: "POST",
    body: { id: qr.id },
    headers: { Cookie: cookie },
  });
  assert.equal(finish.status, 200);
  const cookies = finish.headers.getSetCookie();
  assert.ok(
    cookies.some(
      (c) => c.startsWith("egin_developer=") && c.includes("HttpOnly"),
    ),
  );
  assert.ok(!cookies.some((c) => c.startsWith("egin_session=")));
  assert.equal(
    (
      await request("/api/developer/qr/poll", {
        method: "POST",
        body: { id: qr.id },
        headers: { Cookie: cookie },
      })
    ).status,
    410,
  );
  const sessionCookie = cookies
    .find((c) => c.startsWith("egin_developer="))
    .split(";")[0];
  assert.equal(
    (
      await (
        await request("/api/developer/session", {
          headers: { Cookie: sessionCookie },
        })
      ).json()
    ).user.id,
    "alice",
  );
  await request("/api/developer/logout", {
    method: "POST",
    body: {},
    headers: { Cookie: sessionCookie },
  });
  assert.equal(
    (
      await (
        await request("/api/developer/session", {
          headers: { Cookie: sessionCookie },
        })
      ).json()
    ).user,
    null,
  );
});
