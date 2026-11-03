# Business Command Center

Kopio THE EmCe 100 päivää -sivusta. Cloudflare Workers + Cloudflare Access + Supabase.

## Käyttöönotto
1. Supabase, SQL Editor: aja `supabase.sql` (luo taulun `bcc_status` ja kopioi tiedot).
2. Cloudflare, Workers & Pages: Create → Import a repository → tämä repo. Asetukset tulevat `wrangler.jsonc`:stä.
3. Workerin Settings → Variables and Secrets, tyyppi Secret: `SUPABASE_SECRET_KEY` (sb_secret_...) ja `ALLOWED_EMAILS`.
4. Settings → Domains & Routes: workers.dev-osoitteelle Cloudflare Access päälle, Preview URLs pois.
5. Avaa sivu. Jos alareunassa on punainen ilmoitus, sen virhekoodi kertoo puuttuvan kohdan (503 asetukset puuttuvat, 403 sähköposti ei täsmää, 502 tietokanta tai avain).
