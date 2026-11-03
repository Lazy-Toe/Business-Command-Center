// Tallennusrajapinta. Cloudflare Access päästää sivulle vain sinut ja liittää jokaiseen
// pyyntöön allekirjoitetun tunnisteen (Cf-Access-Jwt-Assertion). Tämä Worker tarkistaa
// tunnisteen ja sähköpostin ja vasta sitten lukee tai kirjoittaa Supabaseen salaisella avaimella.
// Salainen avain ja sallitut osoitteet ovat Cloudflaren salaisuuksina, eivät repossa:
//   SUPABASE_SECRET_KEY  Supabasen secret key (sb_secret_...)
//   ALLOWED_EMAILS       sallitut osoitteet pilkulla eroteltuna
//   ACCESS_AUD           (valinnainen) Access-sovelluksen AUD-tunniste

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_BODY = 32 * 1024;
let certCache = { at: 0, keys: [] };

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
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

async function api(request, env, url) {
  if (!env.SUPABASE_SECRET_KEY || !env.ALLOWED_EMAILS || !env.ACCESS_TEAM || !env.TABLE) return json({ error: "not_configured" }, 503);
  const email = await verifyAccess(request, env);
  if (!email) return json({ error: "forbidden" }, 403);
  const base = env.SUPABASE_URL + "/rest/v1/" + (env.TABLE || "status");

  if (url.pathname === "/api/status" && request.method === "GET") {
    const r = await fetch(base + "?select=id,data", { headers: sbHeaders(env) });
    if (!r.ok) return json({ error: "db", status: r.status }, 502);
    return json({ email: email, rows: await r.json() });
  }

  const m = url.pathname.match(/^\/api\/status\/([^/]+)$/);
  if (m && request.method === "PUT") {
    const id = decodeURIComponent(m[1]);
    if (!ID_RE.test(id)) return json({ error: "bad_id" }, 400);
    const text = await request.text();
    if (text.length > MAX_BODY) return json({ error: "too_large" }, 413);
    let data;
    try { data = JSON.parse(text); } catch (e) { return json({ error: "bad_json" }, 400); }
    if (!data || typeof data !== "object" || Array.isArray(data)) return json({ error: "bad_json" }, 400);
    const r = await fetch(base, {
      method: "POST",
      headers: sbHeaders(env, { prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({ id: id, data: data, updated_at: new Date().toISOString() })
    });
    if (!r.ok) return json({ error: "db", status: r.status }, 502);
    return json({ ok: true });
  }
  return json({ error: "not_found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.indexOf("/api/") === 0) {
      try { return await api(request, env, url); } catch (e) { return json({ error: "server" }, 500); }
    }
    return env.ASSETS.fetch(request);
  }
};
