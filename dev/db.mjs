// Paikallinen tietokanta kehitykseen ja testeihin: oikea PostgreSQL (PGlite) ja samat SQL-tiedostot kuin tuotannossa.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { generateKeyPairSync, createSign, randomUUID } from "node:crypto";

const root = new URL("../", import.meta.url);
export const sql = (f) => readFileSync(new URL("supabase/" + f, root), "utf8");

// Vanhan taulun muoto, johon migraatio nojaa.
export async function createDb(oldRows) {
  const pg = new PGlite();
  await pg.exec("create role anon; create role authenticated; create role service_role;");
  await pg.exec("create table public.bcc_status (id text primary key, data jsonb not null, updated_at timestamptz not null default now());");
  for (const r of oldRows || []) await pg.query("insert into public.bcc_status (id, data) values ($1, $2)", [r.id, r.data]);
  await pg.exec(sql("002_alusta.sql"));
  return pg;
}

// Pieni PostgREST-korvike: vain ne kutsut, joita worker.js tekee.
export function fakeSupabase(pg, base) {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const kid = randomUUID();
  const team = "dev-team";
  const iss = "https://" + team + ".cloudflareaccess.com";
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const token = (email, exp, extra) => {
    const body = b64({ alg: "RS256", kid }) + "." + b64({ email, iss, exp: exp || Math.floor(Date.now() / 1000) + 3600, ...extra });
    const s = createSign("RSA-SHA256"); s.update(body);
    return body + "." + s.sign(privateKey).toString("base64url");
  };
  const res = (x, status) => new Response(x === undefined ? null : JSON.stringify(x), { status: status || 200 });
  const eq = (u, k) => (u.searchParams.get(k) || "").replace(/^eq\./, "");
  const fetchImpl = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.href === iss + "/cdn-cgi/access/certs") return res({ keys: [{ ...publicKey.export({ format: "jwk" }), kid, alg: "RS256" }] });
    if (!url.href.startsWith(base)) throw new Error("Odottamaton pyyntö: " + url.href);
    if ((init.headers || {}).apikey !== "dev-secret") return res({ message: "Invalid API key" }, 401);
    const path = url.pathname.replace("/rest/v1/", ""), m = init.method || "GET", body = init.body ? JSON.parse(init.body) : null;
    try {
      if (path === "bcc_plans" && m === "GET") return res((await pg.query("select id, title, created_at, updated_at from bcc_plans where archived_at is null order by created_at")).rows);
      if (path === "bcc_plans" && m === "POST") { await pg.query("insert into bcc_plans (id, title) values ($1, $2)", [body.id, body.title]); return res(undefined, 201); }
      if (path === "bcc_plans" && m === "PATCH") {
        if (body.archived_at) await pg.query("update bcc_plans set archived_at = $2 where id = $1", [eq(url.searchParams && url, "id"), body.archived_at]);
        else await pg.query("update bcc_plans set title = $2 where id = $1", [eq(url, "id"), body.title]);
        return res(undefined, 204);
      }
      if (path === "bcc_items" && m === "GET") {
        const limit = Math.min(+(url.searchParams.get("limit") || 1000), 1000), offset = +(url.searchParams.get("offset") || 0);
        const planId = url.searchParams.get("plan_id");
        if (planId) return res((await pg.query("select id, kind, parent_id, position, data from bcc_items where plan_id = $1 order by position, id limit $2 offset $3", [planId.replace(/^eq\./, ""), limit, offset])).rows);
        const kinds = (url.searchParams.get("kind") || "").replace(/^in\.\(|\)$/g, "").split(",");
        return res((await pg.query("select plan_id, id, kind, parent_id, position, data from bcc_items where kind = any($1) order by plan_id, position, id limit $2 offset $3", [kinds, limit, offset])).rows);
      }
      if (path === "bcc_item_history" && m === "GET") return res((await pg.query("select hist_id::int hist_id, id, kind, parent_id, position, data, op, changed_at from bcc_item_history where plan_id = $1 order by changed_at desc, hist_id desc limit $2", [eq(url, "plan_id"), +url.searchParams.get("limit")])).rows);
      if (path === "rpc/bcc_apply_batch") return res((await pg.query("select bcc_apply_batch($1, $2::jsonb) as n", [body.p_plan, JSON.stringify(body.p_ops)])).rows[0].n);
      if (path === "rpc/bcc_duplicate_plan") return res((await pg.query("select bcc_duplicate_plan($1, $2, $3) as id", [body.p_source, body.p_id, body.p_title])).rows[0].id);
    } catch (e) { return res({ message: e.message }, 400); }
    return res({ message: "ei tuettu: " + m + " " + path }, 404);
  };
  return { fetchImpl, token, team };
}
