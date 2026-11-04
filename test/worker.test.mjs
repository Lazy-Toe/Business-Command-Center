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
  env = { SUPABASE_URL: BASE, SUPABASE_SECRET_KEY: "dev-secret", ALLOWED_EMAILS: "Owner@example.test, toinen@example.test", MEMBER_EMAILS: "Jasen@example.test, jasen2@example.test, toinen@example.test", ACCESS_TEAM: fake.team, ASSETS: { fetch: async () => new Response("sivu") } };
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

const JASEN = "jasen@example.test", JASEN2 = "jasen2@example.test";
const asJasen = (path, opts = {}) => req(path, { ...opts, token: fake.token(opts.email || JASEN) });
const put = (id, kind, data, parent_id, plan = "jplan") => ({ op: "put", id, kind, parent_id: parent_id || null, position: 1, data });

async function setupMember() {
  if ((await q("select 1 from bcc_plans where id = 'jplan'")).length) return;
  for (const [id, title] of [["jplan", "Jäsenen suunnitelma"], ["pmuu", "Muiden suunnitelma"]]) await req("/plans", { method: "POST", body: { id, title } });
  const ops = [
    put("s1", "stream", { label: "Oma työvirta" }), put("s2", "stream", { label: "Muiden työvirta" }),
    put("rJ", "role", { title: "Jäsenen vastuualue", owner: "Jasen", stream: "s1" }), put("rM", "role", { title: "Muiden vastuualue", owner: "Muu", stream: "s2" }),
    put("mJ", "metric", { name: "Oma mittari", actual: "1" }, "rJ"), put("mM", "metric", { name: "Muiden mittari" }, "rM"),
    put("tOwn", "task", { title: "Oma tehtävä", owner: "Jasen", status: "todo" }), put("tInh", "task", { title: "Peritty tehtävä", stream: "s1", status: "todo" }),
    put("tOther", "task", { title: "Muun salainen tehtävä", owner: "Muu", status: "todo" }), put("tOtherS", "task", { title: "Muiden työvirran tehtävä", stream: "s2" }),
    put("sec", "section", { title: "Muiden salainen osio" })
  ];
  assert.equal((await req("/plans/jplan/items", { method: "POST", body: { ops } })).status, 200);
  assert.equal((await req("/plans/pmuu/items", { method: "POST", body: { ops: [put("pt", "task", { title: "Toisen suunnitelman salainen", owner: "Muu" })] } })).status, 200);
  await req("/people", { method: "POST", body: { name: "Jasen" } });
  assert.equal((await req("/people/email", { method: "POST", body: { name: "Jasen", email: " Jasen@Example.test " } })).status, 200, "ylläpitäjä liittää jäsenen");
}

test("jäsen näkee vain omat rivit, ei muiden sisältöä eikä suunnitelmia", async () => {
  await setupMember();
  const r = await asJasen("/mine");
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.deepEqual(b.items.map((i) => i.id).sort(), ["mJ", "rJ", "s1", "tInh", "tOwn"]);
  assert.deepEqual(b.plans.map((p) => p.id), ["jplan"], "vain suunnitelma, jossa on jäsenen rivejä");
  assert.equal(b.items.find((i) => i.id === "tInh").data.owner, "Jasen");
  const text = JSON.stringify(b);
  for (const secret of ["Muu", "salainen", "Muiden", "Toisen", "emce"]) assert.ok(!text.includes(secret), "vuotaa: " + secret);
  const me = await (await asJasen("/people")).json();
  assert.deepEqual(me, { role: "member", me: { email: JASEN, person: "Jasen" }, people: [] });
});

test("jäsenelle kaikki ylläpitäjän reitit ovat kiellettyjä", async () => {
  await setupMember();
  const body = { name: "X", id: "x", title: "X", ops: [{ op: "del", id: "tOwn" }] };
  for (const [method, path] of [
    ["GET", "/plans"], ["POST", "/plans"], ["PATCH", "/plans/jplan"], ["DELETE", "/plans/jplan"],
    ["GET", "/plans/jplan/items"], ["GET", "/plans/pmuu/items"], ["GET", "/plans/jplan/history"], ["GET", "/overview"],
    ["POST", "/people"], ["PUT", "/me"], ["DELETE", "/me"], ["POST", "/people/rename"], ["POST", "/people/delete"], ["POST", "/people/email"],
    ["GET", "/tuntematon"]
  ]) {
    const r = await asJasen(path, { method, body: method === "GET" ? undefined : body });
    assert.equal(r.status, 403, method + " " + path);
    assert.deepEqual(await r.json(), { error: "forbidden" });
  }
  assert.equal((await q("select count(*)::int n from bcc_items where plan_id = 'jplan'"))[0].n, 11, "mitään ei poistunut");
});

test("jäsen muuttaa vain omia rivejään sallituilla kentillä, kaikki muu hylätään kokonaan", async () => {
  await setupMember();
  const post = (plan, ops, email) => asJasen("/plans/" + plan + "/items", { method: "POST", body: { ops }, email });
  const data = async (id) => (await q("select data from bcc_items where id = $1", [id]))[0].data;
  assert.equal((await post("jplan", [{ op: "patch", id: "tOwn", data: { status: "done", due: "2026-11-05" } }, { op: "patch", id: "mJ", data: { actual: "9 %" } }])).status, 200);
  assert.deepEqual([(await data("tOwn")).status, (await data("tOwn")).due, (await data("mJ")).actual, (await data("mJ")).state], ["done", "2026-11-05", "9 %", undefined]);
  assert.equal((await post("jplan", [{ op: "patch", id: "mJ", data: { state: "good" } }])).status, 422, "mittarin tilaa jäsen ei muuta");
  assert.equal((await data("tOwn")).title, "Oma tehtävä", "muut kentät säilyvät");
  assert.equal((await post("jplan", [{ op: "patch", id: "tInh", data: { status: "doing" } }])).status, 200, "peritty tehtävä on oma");

  for (const [plan, ops] of [
    ["jplan", [{ op: "patch", id: "tOther", data: { status: "done" } }]],
    ["jplan", [{ op: "patch", id: "mM", data: { actual: "1" } }]],
    ["jplan", [{ op: "patch", id: "rJ", data: { title: "Vallattu" } }]],
    ["jplan", [{ op: "patch", id: "tOwn", data: { owner: "Muu" } }]],
    ["jplan", [{ op: "patch", id: "tOwn", data: { title: "Uusi nimi" } }]],
    ["jplan", [{ op: "patch", id: "tOwn", data: { status: "done" }, parent_id: "rM" }]],
    ["jplan", [{ op: "patch", id: "tOwn", data: { status: "done" }, position: 99 }]],
    ["jplan", [{ op: "patch", id: "tOwn", data: { status: "keksitty" } }]],
    ["jplan", [{ op: "del", id: "tOwn" }]],
    ["jplan", [put("uusi", "task", { title: "Luotu" })]],
    ["jplan", [put("tOther", "task", { title: "Ylikirjoitettu" })]],
    ["jplan", [{ op: "patch", id: "tOwn", data: { status: "todo" } }, { op: "patch", id: "tOther", data: { status: "done" } }]],
    ["pmuu", [{ op: "patch", id: "pt", data: { status: "done" } }]],
    ["pmuu", [{ op: "patch", id: "tOwn", data: { status: "todo" } }]],
    ["ei-ole", [{ op: "patch", id: "tOwn", data: { status: "todo" } }]]
  ]) {
    const r = await post(plan, ops);
    assert.equal(r.status, 422, plan + " " + JSON.stringify(ops));
    assert.deepEqual(await r.json(), { error: "out_of_scope" });
  }
  assert.equal((await data("tOwn")).status, "done", "hylätty erä ei muuttanut hyväksyttyäkään osaa");
  assert.equal((await data("tOther")).status, "todo");
  assert.equal((await data("tOwn")).owner, "Jasen");
  assert.equal((await q("select count(*)::int n from bcc_items where id in ('uusi')"))[0].n, 0);
});

test("tavoitemallit: jäsen näkee oman roolinsa mallit vain luettavina ja kirjaa ensimmäisen toteuman tallentamattomalle riville", async () => {
  await setupMember();
  const admin = (ops) => req("/plans/jplan/items", { method: "POST", body: { ops } });
  assert.equal((await admin([
    put("gg", "goal", { name: "Liikevaihto" }), put("dA", "metricdef", { name: "Oma malli", stream: "s1", target: "100", min: "80", max: "150", weight: "20", formula: "ACTUAL / TARGET" }, "gg"),
    put("dB", "metricdef", { name: "Muiden malli SALAINEN", stream: "s2", target: "7" }, "gg"), put("dC", "metricdef", { name: "Piilotettu", stream: "s1" }, "gg")
  ])).status, 200);
  assert.equal((await admin([{ op: "patch", id: "rJ", data: { hide: ["dC"] } }])).status, 200);
  const post = (ops, plan = "jplan") => asJasen("/plans/" + plan + "/items", { method: "POST", body: { ops } });
  const dbRow = async (id) => (await q("select kind, parent_id, data from bcc_items where plan_id = 'jplan' and id = $1", [id]))[0];

  const m = await (await asJasen("/mine")).json();
  assert.deepEqual(m.items.filter((i) => i.kind === "metricdef").map((i) => i.id), ["dA"], "vain oman työvirran, piilottamaton malli");
  assert.ok(!JSON.stringify(m).includes("SALAINEN") && !JSON.stringify(m).includes("Liikevaihto"), "muiden mallit ja katalogi eivät vuoda");

  const vid = "v-rJ-dA", put1 = (o) => ({ op: "put", id: vid, kind: "metric", parent_id: "rJ", data: { def: "dA", actual: "90" }, ...o });
  for (const bad of [
    put1({ id: "v-rJ-dB" }), put1({ id: "v-rJ-dC" }), put1({ parent_id: "rM" }), put1({ kind: "task" }), put1({ position: 5 }),
    put1({ data: { def: "dB", actual: "1" } }), put1({ data: { def: "dA", actual: "1", target: "1" } }), put1({ id: "tOwn", kind: "task", parent_id: null, data: { status: "done" } })
  ]) assert.equal((await post([bad])).status, 422, JSON.stringify(bad));
  assert.equal((await dbRow(vid)), undefined, "hylätty ei tallennu");

  assert.equal((await post([put1()])).status, 200);
  assert.deepEqual(await dbRow(vid), { kind: "metric", parent_id: "rJ", data: { def: "dA", actual: "90" } });
  assert.equal((await post([put1({ data: { def: "dA", actual: "1" } })])).status, 422, "tallennetun rivin voi enää vain päivittää");
  assert.equal((await post([{ op: "patch", id: vid, data: { actual: "95" } }])).status, 200);
  assert.equal((await dbRow(vid)).data.actual, "95");
  assert.equal((await post([{ op: "patch", id: vid, data: { target: "1" } }])).status, 422, "tavoitetta ei muuteta jäsenenä");
  assert.equal((await post([{ op: "patch", id: vid, data: { def: "dB" } }])).status, 422, "mallia ei vaihdeta");

  const after = await (await asJasen("/mine")).json();
  assert.ok(after.items.some((i) => i.id === vid), "tallennettu rivi näkyy nyt tavallisena rivinä");
  assert.equal((await req("/plans/jplan/items", { method: "POST", body: { ops: [{ op: "patch", id: vid, data: { target: "120" } }] } })).status, 200, "ylläpitäjä voi asettaa henkilökohtaisen tavoitteen");
});

test("liittämätön jäsen ei näe eikä muuta mitään", async () => {
  await setupMember();
  const b = await (await asJasen("/mine", { email: JASEN2 })).json();
  assert.deepEqual(b, { plans: [], items: [] });
  assert.equal((await asJasen("/plans/jplan/items", { method: "POST", email: JASEN2, body: { ops: [{ op: "patch", id: "tOwn", data: { status: "todo" } }] } })).status, 422);
  assert.equal((await (await asJasen("/people", { email: JASEN2 })).json()).me.person, null);
});

test("roolit: ylläpitäjä voittaa, tuntematon ei pääse sisään, jäsen ei pääse ylläpitäjän reiteille", async () => {
  assert.equal((await req("/plans", { token: fake.token("toinen@example.test") })).status, 200, "molemmissa listoissa oleva on ylläpitäjä");
  assert.equal((await req("/plans", { token: fake.token("vieras@example.test") })).status, 403);
  assert.equal((await req("/mine", { token: fake.token("vieras@example.test") })).status, 403);
  assert.equal((await (await req("/people")).json()).role, "admin");
  assert.equal((await req("/mine")).status, 404, "ylläpitäjä ei käytä jäsenen reittiä");
  assert.equal((await asJasen("/plans", { method: "POST", body: { id: "x", title: "X" }, headers: { origin: "https://evil.test" } })).status, 403);
  assert.equal((await worker.fetch(new Request("http://app.test/api/mine"), { ...env, MEMBER_EMAILS: "" })).status, 403, "ilman tunnistetta ei pääse");
  const r = await req("/mine", { token: fake.token(JASEN), });
  assert.equal(r.status, 200);
  env.MEMBER_EMAILS = "";
  try { assert.equal((await asJasen("/mine")).status, 403, "poistettu jäsen menettää pääsyn heti"); } finally { env.MEMBER_EMAILS = "Jasen@example.test, jasen2@example.test, toinen@example.test"; }
});

test("henkilöhallinta: nimen muutos päivittää vastuut kaikkiin suunnitelmiin ja historiaan, poisto vain käyttämättömälle", async () => {
  await setupMember();
  await req("/people", { method: "POST", body: { name: "Muu" } });
  await req("/people", { method: "POST", body: { name: "Käyttämätön" } });
  await req("/people", { method: "POST", body: { name: "Toinen Henkilö" } });
  const owners = async (name) => (await q("select count(*)::int n from bcc_items where kind in ('role','task') and data->>'owner' = $1", [name]))[0].n;
  const before = await owners("Muu");
  assert.ok(before >= 3);

  assert.equal((await req("/people/rename", { method: "POST", body: { from: "Jasen", to: "Toinen Henkilö" } })).status, 409, "nimi on jo käytössä");
  assert.equal((await req("/people/rename", { method: "POST", body: { from: "Olematon", to: "Uusi" } })).status, 404);
  assert.equal((await req("/people/rename", { method: "POST", body: { from: "Jasen", to: " " } })).status, 400);
  const r = await req("/people/rename", { method: "POST", body: { from: "muu", to: "Muu Uusi" } });
  assert.deepEqual(await r.json(), { ok: true, name: "Muu Uusi" });
  assert.equal(await owners("Muu"), 0);
  assert.equal(await owners("Muu Uusi"), before, "kaikki vastuut uudella nimellä, myös toisessa suunnitelmassa");
  assert.equal((await q("select count(*)::int n from bcc_item_history where data->>'owner' = 'Muu'"))[0].n >= before, true, "muutos on palautettavissa historiasta");

  assert.equal((await req("/people/delete", { method: "POST", body: { name: "Muu Uusi" } })).status, 409, "käytössä olevaa ei poisteta");
  assert.equal((await req("/people/delete", { method: "POST", body: { name: "Käyttämätön" } })).status, 200);
  assert.equal((await q("select count(*)::int n from bcc_people where name = 'Käyttämätön'"))[0].n, 0);

  assert.equal((await req("/people/email", { method: "POST", body: { name: "Toinen Henkilö", email: JASEN } })).status, 409, "sähköposti kuuluu yhdelle");
  assert.equal((await req("/people/email", { method: "POST", body: { name: "Toinen Henkilö", email: "ei sähköposti" } })).status, 400);
  assert.equal((await req("/people/email", { method: "POST", body: { name: "Olematon", email: "a@b.fi" } })).status, 404);
  const all = await (await req("/people")).json();
  assert.equal(all.people.find((p) => p.name === "Jasen").email, JASEN);
  assert.equal((await req("/people/email", { method: "POST", body: { name: "Jasen", email: "" } })).status, 200, "tyhjä poistaa liitoksen");
  assert.deepEqual(await (await asJasen("/mine")).json(), { plans: [], items: [] }, "liitoksen poiston jälkeen jäsen ei näe mitään");
  await req("/people/email", { method: "POST", body: { name: "Jasen", email: JASEN } });
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
