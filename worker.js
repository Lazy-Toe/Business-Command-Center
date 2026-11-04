// Alustan rajapinta. Cloudflare Access päästää sivulle vain sinut ja liittää jokaiseen
// pyyntöön allekirjoitetun tunnisteen (Cf-Access-Jwt-Assertion). Tämä Worker tarkistaa
// tunnisteen ja sähköpostin ja vasta sitten lukee tai kirjoittaa Supabaseen salaisella avaimella.
// Salainen avain ja sallitut osoitteet ovat Cloudflaren salaisuuksina, eivät repossa:
//   SUPABASE_SECRET_KEY  Supabasen secret key (sb_secret_...)
//   ALLOWED_EMAILS       sallitut osoitteet pilkulla eroteltuna
//   ACCESS_AUD           (valinnainen) Access-sovelluksen AUD-tunniste

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const KIND_RE = /^[a-z][a-z0-9_-]{0,31}$/;
const MAX_BODY = 1024 * 1024;
const MAX_OPS = 1000;
const HISTORY_LIMIT = 200;
const MAX_HISTORY = 500;
let certCache = { at: 0, keys: [] };

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }
  });
}

function b64url(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function accessKeys(env, force) {
  if (!force && certCache.keys.length && Date.now() - certCache.at < 3600e3) return certCache.keys;
  const r = await fetch("https://" + env.ACCESS_TEAM + ".cloudflareaccess.com/cdn-cgi/access/certs");
  if (!r.ok) throw new Error("certs " + r.status);
  certCache = { at: Date.now(), keys: (await r.json()).keys || [] };
  return certCache.keys;
}

export async function verifyAccess(request, env) {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(b64url(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(b64url(parts[1])));
  } catch (e) { return null; }
  if (header.alg !== "RS256") return null;
  let keys = await accessKeys(env, false);
  let jwk = keys.find(function (k) { return k.kid === header.kid; });
  if (!jwk) { keys = await accessKeys(env, true); jwk = keys.find(function (k) { return k.kid === header.kid; }); }
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
  if (!ok) return null;
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) return null;
  if (payload.nbf && payload.nbf > now + 60) return null;
  if (payload.iss !== "https://" + env.ACCESS_TEAM + ".cloudflareaccess.com") return null;
  if (env.ACCESS_AUD) {
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (aud.indexOf(env.ACCESS_AUD) < 0) return null;
  }
  const email = String(payload.email || "").toLowerCase();
  const allowed = String(env.ALLOWED_EMAILS || "").toLowerCase().split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  if (!email || allowed.indexOf(email) < 0) return null;
  return email;
}

function sbHeaders(env, extra) {
  const k = env.SUPABASE_SECRET_KEY, h = { apikey: k, "content-type": "application/json" };
  if (k.indexOf("eyJ") === 0) h.authorization = "Bearer " + k;
  return Object.assign(h, extra || {});
}

async function db(env, path, init) {
  const r = await fetch(env.SUPABASE_URL + "/rest/v1/" + path, Object.assign({}, init, { headers: sbHeaders(env, (init || {}).headers) }));
  if (!r.ok) {
    const e = new Error("db"); e.status = r.status;
    try { e.detail = (await r.json()).message; } catch (x) {}
    throw e;
  }
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

// Supabase palauttaa enintään tuhat riviä kerralla, joten haku tehdään sivuittain.
async function fetchAll(env, path) {
  const PAGE = 1000, out = [];
  for (let offset = 0; offset < PAGE * 100; offset += PAGE) {
    const rows = await db(env, path + "&limit=" + PAGE + "&offset=" + offset);
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
  throw new Error("too_many_rows");
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) throw Object.assign(new Error("too_large"), { http: 413 });
  try { return JSON.parse(text); } catch (e) { throw Object.assign(new Error("bad_json"), { http: 400 }); }
}

function bad(code) { return Object.assign(new Error(code), { http: 400 }); }

// Tarkistaa muutokset ennen tietokantaa. Datan sisältö on moduulien asia, rakenne ei.
export function cleanOps(ops) {
  if (!Array.isArray(ops) || !ops.length || ops.length > MAX_OPS) throw bad("bad_ops");
  return ops.map(function (o) {
    if (!o || typeof o !== "object" || !ID_RE.test(o.id || "")) throw bad("bad_id");
    if (o.op === "del") return { op: "del", id: o.id };
    if (o.op !== "put" && o.op !== "patch") throw bad("bad_op");
    const out = { op: o.op, id: o.id };
    if (o.data !== undefined) {
      if (!o.data || typeof o.data !== "object" || Array.isArray(o.data)) throw bad("bad_data");
      out.data = o.data;
    }
    if (o.position !== undefined) {
      if (typeof o.position !== "number" || !isFinite(o.position)) throw bad("bad_position");
      out.position = o.position;
    }
    if (o.parent_id !== undefined) {
      if (o.parent_id !== null && (!ID_RE.test(o.parent_id) || o.parent_id === o.id)) throw bad("bad_parent");
      out.parent_id = o.parent_id;
    }
    if (o.op === "put") {
      if (!KIND_RE.test(o.kind || "")) throw bad("bad_kind");
      out.kind = o.kind;
    }
    return out;
  });
}

function cleanTitle(v) {
  const t = String(v || "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!t) throw bad("bad_title");
  return t;
}

const PLAN_COLS = "id,title,created_at,updated_at";
const OVERVIEW_KINDS = "task,row,risk,metric,role,stream,section";

async function api(request, env, url) {
  if (!env.SUPABASE_SECRET_KEY || !env.ALLOWED_EMAILS || !env.ACCESS_TEAM || !env.SUPABASE_URL) return json({ error: "not_configured" }, 503);
  const email = await verifyAccess(request, env);
  if (!email) return json({ error: "forbidden" }, 403);

  const method = request.method;
  // Muutospyyntöjen on tultava omalta sivulta.
  if (method !== "GET") {
    const origin = request.headers.get("origin");
    if (origin && origin !== url.origin) return json({ error: "forbidden" }, 403);
  }

  if (url.pathname === "/api/plans") {
    if (method === "GET") {
      const plans = await db(env, "bcc_plans?select=" + PLAN_COLS + "&archived_at=is.null&order=created_at");
      return json({ email: email, plans: plans });
    }
    if (method === "POST") {
      const b = await readJson(request);
      if (!ID_RE.test(b.id || "")) throw bad("bad_id");
      const title = cleanTitle(b.title);
      if (b.from !== undefined) {
        if (!ID_RE.test(b.from)) throw bad("bad_id");
        await db(env, "rpc/bcc_duplicate_plan", { method: "POST", body: JSON.stringify({ p_source: b.from, p_id: b.id, p_title: title }) });
      } else {
        await db(env, "bcc_plans", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ id: b.id, title: title }) });
      }
      return json({ ok: true, id: b.id });
    }
  }

  // Tänään-näkymän tiedot kaikista aktiivisista suunnitelmista.
  if (url.pathname === "/api/overview" && method === "GET") {
    const plans = await db(env, "bcc_plans?select=" + PLAN_COLS + "&archived_at=is.null&order=created_at");
    const active = new Set(plans.map(function (p) { return p.id; }));
    const rows = await fetchAll(env, "bcc_items?select=plan_id,id,kind,parent_id,position,data&kind=in.(" + OVERVIEW_KINDS + ")&order=plan_id,position,id");
    return json({ plans: plans, items: rows.filter(function (r) { return active.has(r.plan_id); }) });
  }

  const m = url.pathname.match(/^\/api\/plans\/([^/]+)(\/items|\/history)?$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (!ID_RE.test(id)) return json({ error: "bad_id" }, 400);
    const q = encodeURIComponent(id);
    if (m[2] === "/history") {
      // Uusimmat muutokset ja poistot. Palautus tehdään tavallisella tallennuksella.
      if (method === "GET") {
        const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit"), 10) || HISTORY_LIMIT, 1), MAX_HISTORY);
        const rows = await db(env, "bcc_item_history?select=hist_id,id,kind,parent_id,position,data,op,changed_at&plan_id=eq." + q + "&order=changed_at.desc,hist_id.desc&limit=" + limit);
        return json({ history: rows });
      }
    } else if (m[2]) {
      if (method === "GET") {
        const items = await fetchAll(env, "bcc_items?select=id,kind,parent_id,position,data&plan_id=eq." + q + "&order=position,id");
        return json({ items: items });
      }
      if (method === "POST") {
        const b = await readJson(request);
        const n = await db(env, "rpc/bcc_apply_batch", { method: "POST", body: JSON.stringify({ p_plan: id, p_ops: cleanOps(b.ops) }) });
        return json({ ok: true, applied: n });
      }
    } else {
      if (method === "PATCH") {
        const b = await readJson(request);
        await db(env, "bcc_plans?id=eq." + q, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ title: cleanTitle(b.title), updated_at: new Date().toISOString() }) });
        return json({ ok: true });
      }
      // Poisto arkistoi: tiedot säilyvät tietokannassa ja ovat palautettavissa.
      if (method === "DELETE") {
        await db(env, "bcc_plans?id=eq." + q, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ archived_at: new Date().toISOString() }) });
        return json({ ok: true });
      }
    }
  }
  return json({ error: "not_found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.indexOf("/api/") === 0) {
      try { return await api(request, env, url); } catch (e) {
        if (e.http) return json({ error: e.message }, e.http);
        // Tietokannan virheviesti jää lokiin eikä päädy vastaukseen.
        if (e.message === "db" && e.detail === "plan_not_found") return json({ error: "plan_not_found" }, 409);
        console.error(e.message, e.status || "", e.detail || "");
        if (e.message === "db") return json({ error: "db", status: e.status }, 502);
        return json({ error: "server" }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
  // Pitää ilmaisen Supabase-projektin aktiivisena, jotta se ei keskeydy käyttämättömänä.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(db(env, "bcc_plans?select=id&limit=1"));
  }
};
