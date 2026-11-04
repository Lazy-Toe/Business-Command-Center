// Ajaa oikean worker.js:n ja oikeat SQL-tiedostot paikallista PostgreSQL:ää vasten.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import worker, { cleanOps } from "../worker.js";
import { createDb, fakeSupabase, sql } from "../dev/db.mjs";
import { groupHistory, restoreOps } from "../public/app/core/history.js";

const BASE = "http://supabase.local", ME = "owner@example.test";
let pg, fake, env, realFetch;

const req = (path, { method = "GET", body, token, headers } = {}) => {
  const h = new Headers(headers);
  if (token !== null) h.set("Cf-Access-Jwt-Assertion", token || fake.token(ME));
  return worker.fetch(new Request("http://app.test/api" + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
};
const q = async (s, p) => (await pg.query(s, p)).rows;

before(async () => {
  pg = await createDb([
    { id: "1-kate-2", data: { s: "doing", n: "muistio" } },
    { id: "tavoitteet", data: { h: "2028", own_g: "15", own_m: "12", bc_g: "10", nrr: "101" } },
    { id: "mittarit", data: { m1: "good", r1: "bad" } },
    { id: "eriyttaminen", data: { choice: "B" } },
    { id: "lahtotilanne", data: { v1: "8,0 M€" } },
    { id: "roolit", data: { myynti: { t: "Sales Director" }, bc: { o: "Harri" } } },
    { id: "sc-myynti", data: { m1: { b: "3x", s: "mid" }, x1: { n: "Oma", r: "viikko", a: "5" } } }
  ]);
  fake = fakeSupabase(pg, BASE);
  realFetch = globalThis.fetch;
  globalThis.fetch = (u, i) => fake.fetchImpl(u, i || {});
  env = { SUPABASE_URL: BASE, SUPABASE_SECRET_KEY: "dev-secret", ALLOWED_EMAILS: "Owner@example.test, toinen@example.test", ACCESS_TEAM: fake.team, ASSETS: { fetch: async () => new Response("sivu") } };
});
after(async () => { globalThis.fetch = realFetch; await pg.close(); });

test("migraatio tuo sisällön ja vanhat tilat", async () => {
  const by = async (id) => (await q("select data from bcc_items where plan_id = 'emce-100' and id = $1", [id]))[0].data;
  assert.equal((await q("select count(*)::int n from bcc_items where kind = 'task'"))[0].n, 42);
  assert.deepEqual([(await by("1-kate-2")).status, (await by("1-kate-2")).note], ["doing", "muistio"]);
  assert.equal((await by("1-kate-1")).status, "todo");
  assert.equal((await by("sec-goals")).targetYear, "2028");
  assert.equal((await by("sec-goals")).nrr, "101");
  assert.equal((await by("line-own")).g, "15");
  assert.equal((await by("m1")).state, "good");
  assert.equal((await by("r1")).state, "bad");
  assert.equal((await by("sec-decision")).choice, "opt-B");
  assert.equal((await by("stat-1")).value, "8,0 M€");
  assert.equal((await by("role-myynti")).title, "Sales Director");
  assert.equal((await by("role-bc")).owner, "Harri");
  assert.equal((await by("myynti-m1")).base, "3x");
  assert.equal((await by("myynti-x1")).name, "Oma");
});

test("toinen ajo ei muuta mitään, vanha taulu säilyy", async () => {
  await pg.query("update bcc_items set data = data || '{\"note\":\"uusi\"}' where id = '1-kate-2'");
  await pg.exec(sql("002_alusta.sql"));
  assert.equal((await q("select data->>'note' n from bcc_items where id = '1-kate-2'"))[0].n, "uusi");
  assert.equal((await q("select count(*)::int n from bcc_status"))[0].n, 7);
});

test("anon ja authenticated eivät pääse tauluihin eivätkä funktioihin", async () => {
  const r = (await q(`select
    has_table_privilege('anon', 'bcc_items', 'select') a, has_table_privilege('authenticated', 'bcc_plans', 'update') b,
    has_function_privilege('anon', 'bcc_apply_batch(text, jsonb)', 'execute') c, has_function_privilege('authenticated', 'bcc_duplicate_plan(text, text, text)', 'execute') d,
    has_function_privilege('service_role', 'bcc_apply_batch(text, jsonb)', 'execute') e`))[0];
  assert.deepEqual(r, { a: false, b: false, c: false, d: false, e: true });
  assert.equal((await q("select count(*)::int n from pg_class where relname in ('bcc_items','bcc_plans','bcc_item_history') and relrowsecurity"))[0].n, 3);
});

test("pääsy vaatii kelvollisen tunnisteen ja sallitun osoitteen", async () => {
  assert.equal((await req("/plans", { token: null })).status, 403);
  assert.equal((await req("/plans", { token: "roskaa" })).status, 403);
  assert.equal((await req("/plans", { token: fake.token("vieras@example.test") })).status, 403);
  assert.equal((await req("/plans", { token: fake.token(ME, 1000) })).status, 403);
  assert.equal((await req("/plans", { token: fake.token(ME, 0, { nbf: Math.floor(Date.now() / 1000) + 3600 }) })).status, 403, "ei vielä voimassa");
  const t = fake.token(ME), parts = t.split(".");
  parts[1] = Buffer.from(JSON.stringify({ email: ME, iss: "https://" + fake.team + ".cloudflareaccess.com", exp: 9999999999 })).toString("base64url");
  assert.equal((await req("/plans", { token: parts.join(".") })).status, 403, "muokattu tunniste");
  const ok = await req("/plans");
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).plans[0].id, "emce-100");
});

test("toiselta sivulta tuleva muutos hylätään", async () => {
  const r = await req("/plans/emce-100/items", { method: "POST", headers: { origin: "https://evil.test" }, body: { ops: [{ op: "del", id: "sec-hero" }] } });
  assert.equal(r.status, 403);
  assert.ok((await q("select 1 from bcc_items where id = 'sec-hero'")).length);
});

test("virheelliset muutokset hylätään", async () => {
  for (const ops of [[], "x", [{ op: "drop", id: "a" }], [{ op: "put", id: "a b", kind: "x" }], [{ op: "put", id: "a", kind: "X!" }], [{ op: "patch", id: "a", data: [] }], [{ op: "patch", id: "a", position: "1" }], [{ op: "patch", id: "a", parent_id: "a" }]]) {
    assert.throws(() => cleanOps(ops), undefined, JSON.stringify(ops));
  }
  assert.equal((await req("/plans/emce-100/items", { method: "POST", body: { ops: [{ op: "put", id: "x y", kind: "task" }] } })).status, 400);
  assert.equal((await req("/plans/ei;ole/items")).status, 400);
});

test("muutokset ovat atomisia, poisto vie alirivit ja jättää historian", async () => {
  await pg.exec("alter table bcc_items add constraint t_kind check (kind <> 'kielletty')");
  const bad = await req("/plans/emce-100/items", { method: "POST", body: { ops: [{ op: "put", id: "at1", kind: "task" }, { op: "put", id: "at2", kind: "kielletty" }] } });
  assert.equal(bad.status, 502);
  assert.equal((await q("select count(*)::int n from bcc_items where id = 'at1'"))[0].n, 0);
  await pg.exec("alter table bcc_items drop constraint t_kind");
  const before = (await q("select count(*)::int n from bcc_item_history where id = 'myynti-m2'"))[0].n;
  const ok = await req("/plans/emce-100/items", { method: "POST", body: { ops: [{ op: "del", id: "role-myynti" }] } });
  assert.equal(ok.status, 200);
  assert.equal((await q("select count(*)::int n from bcc_items where parent_id = 'role-myynti'"))[0].n, 0);
  assert.equal((await q("select count(*)::int n from bcc_item_history where id = 'myynti-m2' and op = 'delete'"))[0].n, before + 1);
});

test("monistus on erillinen, poisto arkistoi", async () => {
  assert.equal((await req("/plans", { method: "POST", body: { id: "kopio1", title: "Kopio", from: "emce-100" } })).status, 200);
  await req("/plans/kopio1/items", { method: "POST", body: { ops: [{ op: "patch", id: "sec-hero", data: { title: "Muutettu" } }] } });
  const get = async (p) => (await (await req("/plans/" + p + "/items")).json()).items.find((i) => i.id === "sec-hero").data.title;
  assert.equal(await get("kopio1"), "Muutettu");
  assert.notEqual(await get("emce-100"), "Muutettu");
  assert.equal((await req("/plans/kopio1", { method: "DELETE" })).status, 200);
  assert.ok(!(await (await req("/plans")).json()).plans.some((p) => p.id === "kopio1"));
  assert.equal((await q("select count(*)::int n from bcc_items where plan_id = 'kopio1'"))[0].n > 0, true);
  assert.equal((await req("/plans/kopio1/items", { method: "POST", body: { ops: [{ op: "del", id: "sec-hero" }] } })).status, 409, "arkistoitua ei muokata");
});

test("historia luetaan rajapinnasta ja poisto palautuu tallennuksella", async () => {
  assert.equal((await req("/plans/emce-100/history", { token: null })).status, 403);
  assert.equal((await req("/plans/ei;ole/history")).status, 400);
  assert.equal((await req("/plans/emce-100/history", { method: "POST", body: {} })).status, 404);
  const { history } = await (await req("/plans/emce-100/history")).json();
  assert.ok(history.length > 0);
  assert.ok(history.every((h, i) => !i || history[i - 1].changed_at >= h.changed_at), "uusin ensin");
  assert.equal((await (await req("/plans/emce-100/history?limit=1")).json()).history.length, 1);

  const group = groupHistory(history).find((g) => g.op === "delete" && g.rows.some((r) => r.id === "role-myynti"));
  assert.ok(group.rows.length > 1, "ylärivi ja alirivit samassa ryhmässä");
  const items = async () => (await (await req("/plans/emce-100/items")).json()).items;
  const now = new Map((await items()).map((i) => [i.id, i]));
  assert.ok(!now.has("role-myynti"));
  const { rows, skipped } = restoreOps(group, (id) => now.get(id));
  assert.deepEqual(skipped, []);
  const r = await req("/plans/emce-100/items", { method: "POST", body: { ops: rows.map((x) => ({ op: "put", ...x })) } });
  assert.equal(r.status, 200);
  const back = await items();
  assert.equal(back.filter((i) => i.id === "role-myynti" || i.parent_id === "role-myynti").length, group.rows.length);
  const lost = group.rows.find((x) => x.id === "myynti-m2");
  assert.deepEqual(back.find((i) => i.id === "myynti-m2").data, lost.data, "sisältö palautui sellaisenaan");
});

test("yli tuhat riviä haetaan kokonaan, arkistoitu ei näy koosteessa", async () => {
  const ops = Array.from({ length: 1000 }, (_, i) => ({ op: "put", id: "iso" + i, kind: "task", position: i, data: { title: "t" + i } }));
  await req("/plans", { method: "POST", body: { id: "iso", title: "Iso" } });
  assert.equal((await req("/plans/iso/items", { method: "POST", body: { ops } })).status, 200);
  assert.equal((await req("/plans/iso/items", { method: "POST", body: { ops: [{ op: "put", id: "lisa", kind: "task", position: 5000 }] } })).status, 200);
  assert.equal((await (await req("/plans/iso/items")).json()).items.length, 1001);
  const o = await (await req("/overview")).json();
  assert.equal(o.items.filter((x) => x.plan_id === "iso").length, 1001);
  assert.ok(!o.items.some((x) => x.plan_id === "kopio1"), "arkistoitu ei näy");
  assert.ok(o.items.every((x) => ["task", "row", "risk", "metric", "role", "stream", "section"].includes(x.kind)));
  assert.equal((await req("/overview", { token: null })).status, 403);
  await req("/plans/iso", { method: "DELETE" });
});

test("henkilöt: nykyiset vastuuhenkilöt tulevat listalle, kirjautuminen liitetään yhteen henkilöön", async () => {
  const OTHER = "toinen@example.test";
  const get = async (token) => (await req("/people", { token })).json();
  assert.equal((await req("/people", { token: null })).status, 403);
  const first = await get();
  assert.ok(first.people.some((p) => p.name === "Harri"), "siirretyt vastuuhenkilöt mukana");
  assert.deepEqual(first.me, { email: ME.toLowerCase(), person: null });
  assert.ok(!JSON.stringify(first).includes(OTHER), "toisten osoitteita ei paljasteta");

  assert.equal((await (await req("/people", { method: "POST", body: { name: "  Uusi   Henkilö " } })).json()).name, "Uusi Henkilö");
  assert.equal((await (await req("/people", { method: "POST", body: { name: "uusi henkilö" } })).json()).name, "Uusi Henkilö", "sama nimi kirjainkoosta riippumatta");
  assert.equal((await req("/people", { method: "POST", body: { name: "  " } })).status, 400);
  assert.equal((await q("select count(*)::int n from bcc_people where lower(name) = 'uusi henkilö'"))[0].n, 1);

  assert.equal((await req("/me", { method: "PUT", body: { name: "Harri" } })).status, 200);
  assert.equal((await get()).me.person, "Harri");
  assert.equal((await req("/me", { method: "PUT", body: { name: "harri" }, token: fake.token(OTHER) })).status, 409, "toisen henkilöä ei voi ottaa");
  assert.equal((await get(fake.token(OTHER))).me.person, null);

  assert.equal((await req("/me", { method: "PUT", body: { name: "Uusi Henkilö" } })).status, 200, "vaihto toiseen henkilöön");
  assert.equal((await get()).me.person, "Uusi Henkilö");
  assert.equal((await q("select count(*)::int n from bcc_people where email is not null"))[0].n, 1, "kirjautumisella vain yksi henkilö");
  assert.equal((await req("/me", { method: "PUT", body: { name: "Harri" }, token: fake.token(OTHER) })).status, 200, "vapautunut henkilö otettavissa");

  assert.equal((await req("/me", { method: "PUT", body: { name: "Toinen" }, headers: { origin: "https://evil.test" } })).status, 403, "toiselta sivulta ei muuteta");
  assert.equal((await req("/me", { method: "DELETE", token: fake.token(OTHER) })).status, 200);
  assert.equal((await get(fake.token(OTHER))).me.person, null);
  assert.deepEqual((await q("select has_table_privilege('anon', 'bcc_people', 'select') a, has_function_privilege('anon', 'bcc_link_person(text, text)', 'execute') b"))[0], { a: false, b: false });
});

test("henkilöfunktiot toimivat service_role-oikeuksilla, ei vain pääkäyttäjänä", async () => {
  await pg.exec("set role service_role");
  try {
    assert.equal((await q("select bcc_add_person('  Roolitesti ') n"))[0].n, "Roolitesti");
    assert.equal((await q("select bcc_link_person('rooli@example.test', 'roolitesti') n"))[0].n, "Roolitesti");
    await pg.exec("select bcc_unlink_person('rooli@example.test')");
    assert.equal((await q("select count(*)::int n from bcc_people where lower(name) = 'roolitesti'"))[0].n, 1);
  } finally { await pg.exec("reset role"); }
});

test("ajastus koskettaa tietokantaa", async () => {
  let p; await worker.scheduled({}, env, { waitUntil: (x) => { p = x; } });
  assert.ok(Array.isArray(await p));
});

test("tietokannan virheviesti ei päädy vastaukseen", async () => {
  await pg.exec("alter table bcc_items add constraint t_k check (kind <> 'salainen')");
  const r = await req("/plans/emce-100/items", { method: "POST", body: { ops: [{ op: "put", id: "z1", kind: "salainen" }] } });
  await pg.exec("alter table bcc_items drop constraint t_k");
  assert.deepEqual(await r.json(), { error: "db", status: 400 });
});

test("väärä avain ei paljasta mitään", async () => {
  const k = env.SUPABASE_SECRET_KEY; env.SUPABASE_SECRET_KEY = "vaara";
  const r = await req("/plans");
  env.SUPABASE_SECRET_KEY = k;
  assert.equal(r.status, 502);
  assert.ok(!JSON.stringify(await r.json()).includes("vaara"));
});

test("sivut tulevat ASSETSista, puuttuva asetus ilmoitetaan", async () => {
  assert.equal(await (await worker.fetch(new Request("http://app.test/"), env)).text(), "sivu");
  assert.equal((await worker.fetch(new Request("http://app.test/api/plans"), { ...env, ALLOWED_EMAILS: "" })).status, 503);
});
