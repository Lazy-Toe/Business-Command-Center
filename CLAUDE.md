# Business Command Center

Kopio THE EmCe 100 päivää -sivusta (repo the-emce-100-paivaa), jota kehitetään vapaasti eteenpäin. Yksityinen työkalu, ei julkinen sivu.

## Rakenne
- `public/`: julkaistavat tiedostot. Vain tämä kansio näkyy verkossa.
- `public/index.html`: koko sivu (sisältö, tyylit, laskenta). Tehtävät taulukossa `var T = [...]`, työvirrat `var WS`, vaiheet `var PH`, päätösportit `var GATES`, vastuualueet `var ROLES`.
- `public/storage.js`: tallennuskerros. Verkossa rajapinta `/api/status`, paikallisesti selaimen muisti. Sivu käyttää vain `db.doc("status/<id>").set()` ja `db.collection("status").onSnapshot()`.
- `worker.js` ja `wrangler.jsonc`: Worker tarkistaa Cloudflare Accessin tunnisteen ja sallitun sähköpostin ja käyttää Supabasea salaisella avaimella. Taulu on `bcc_status` (muuttuja TABLE). Salaisuudet (SUPABASE_SECRET_KEY, ALLOWED_EMAILS, valinnainen ACCESS_AUD) ovat vain Cloudflaressa.
- `supabase.sql`: taulun luonti ja tietojen kopiointi alkuperäisestä.

## Julkaisu
- Push `main`-haaraan julkaisee automaattisesti Cloudflareen (Worker business-command-center).
- Sivu on Cloudflare Accessin takana. Ei erillistä kirjautumista.

## Säännöt
- Kieli suomi. Tyyli analyyttinen ja tiivis. Ei ajatusviivoja (– tai —) teksteissä; päivä- ja lukuvälien yhdysmerkki (1–30) on sallittu.
- Ammattimainen ulkoasu: IBM Plex Sans, laivastonsininen, vähäiset pyöristykset. Värit vain `:root`-tokeneista, tumma teema ylläpidetään.
- Älä koskaan lisää sähköpostiosoitteita, salasanoja tai salaisia avaimia repoon.
- Älä koskaan kirjoita alkuperäiseen `status`-tauluun.
- Tehtävän tunniste muodostuu järjestyksestä solun sisällä (vaihe-työvirta-järjestysnumero). Lisää uudet tehtävät solun loppuun, jotta tallennetut tilat eivät siirry väärille tehtäville.
- Commitit noreply-osoitteella: `Lazy-Toe@users.noreply.github.com`.
- Tarkista muutoksen jälkeen skriptien syntaksi (`node --check`) ennen pushia, myös worker.js.
