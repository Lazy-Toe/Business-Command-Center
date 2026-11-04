// Kehityspalvelin: ajaa oikean worker.js:n ja public/-kansion paikallista tietokantaa vasten.
// Käynnistys: npm run dev. Tiedot ovat muistissa ja katoavat, kun palvelin suljetaan.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../worker.js";
import { createDb, fakeSupabase } from "./db.mjs";

const PUBLIC = fileURLToPath(new URL("../public/", import.meta.url));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".json": "application/json" };
const BASE = "http://supabase.local";

export async function startDev(port, oldRows) {
  const pg = await createDb(oldRows);
  const fake = fakeSupabase(pg, BASE);
  const realFetch = globalThis.fetch;
  globalThis.fetch = (u, i) => fake.fetchImpl(u, i || {});
  const env = { SUPABASE_URL: BASE, SUPABASE_SECRET_KEY: "dev-secret", ALLOWED_EMAILS: "dev@example.test", MEMBER_EMAILS: "jasen@example.test", ACCESS_TEAM: fake.team };
  const rules = readFileSync(join(PUBLIC, "_headers"), "utf8").split("\n").filter((l) => /^\s+\S+:/.test(l)).map((l) => { const i = l.indexOf(":"); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; });
  env.ASSETS = { fetch: async (request) => {
    let p = new URL(request.url).pathname; if (p === "/") p = "/index.html";
    const f = normalize(join(PUBLIC, p));
    if (!f.startsWith(PUBLIC) || !existsSync(f) || statSync(f).isDirectory()) return new Response("", { status: 404 });
    return new Response(readFileSync(f), { headers: { ...Object.fromEntries(rules), "content-type": TYPES[extname(f)] || "application/octet-stream" } });
  } };
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const headers = new Headers(req.headers);
    headers.set("Cf-Access-Jwt-Assertion", fake.token(req.headers["x-dev-email"] || process.env.DEV_EMAIL || "dev@example.test"));
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const r = await worker.fetch(new Request("http://localhost:" + port + req.url, { method: req.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined }), env);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  });
  await new Promise((ok) => server.listen(port, ok));
  return { server, pg, fake, env, close: () => { globalThis.fetch = realFetch; server.close(); return pg.close(); } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = +(process.env.PORT || 8788);
  await startDev(port, []);
  console.log("Kehityspalvelin: http://localhost:" + port);
}
