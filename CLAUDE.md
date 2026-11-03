# Business Command Center

Yksityinen suunnittelu- ja johtamisalusta. Yhdellä alustalla voi olla useita suunnitelmia, ja jokainen suunnitelma koostuu moduuleista. Sisältö on tietokannassa, ei koodissa.

## Rakenne
- `public/`: julkaistavat tiedostot. Vain tämä kansio näkyy verkossa.
- `public/app/main.js`: sovelluksen runko: yläpalkki, välilehdet, osioiden asettelu.
- `public/app/core/`: `store.js` (tiedot ja tallennus), `ui.js` (muokattava teksti, työkalut, raahaus), `calc.js` (laskenta ilman näkymää), `registry.js` (moduulirekisteri).
- `public/app/modules/`: yksi tiedosto per osiotyyppi. Rekisteröinti `index.js`:ssä.
- `public/vendor/htm-preact.js`: käyttöliittymäkirjasto. Ei käännösvaihetta.
- `worker.js` ja `wrangler.jsonc`: Worker tarkistaa Cloudflare Accessin tunnisteen ja sallitun sähköpostin ja käyttää Supabasea salaisella avaimella. Salaisuudet (SUPABASE_SECRET_KEY, ALLOWED_EMAILS, valinnainen ACCESS_AUD) ovat vain Cloudflaressa.
- `supabase/schema.sql`: tietokannan rakenne. `002_alusta.sql` on kertaluonteinen siirto vanhasta `bcc_status`-taulusta, ja `001_kopio.sql` on historiaa.
- `dev/`: paikallinen palvelin ja tietokanta. `test/`: testit.

## Tietomalli
- `bcc_plans`: suunnitelmat. Poisto arkistoi (`archived_at`), tiedot säilyvät.
- `bcc_items`: kaikki sisältö yleisinä riveinä: `kind`, `parent_id`, `position`, `data` (jsonb). Tunniste on yksilöllinen suunnitelman sisällä, joten monistus säilyttää tunnisteet.
- `bcc_item_history`: rivin edeltävä tila jokaisesta sisältömuutoksesta ja poistosta, 180 päivää. Palautus tehdään SQL:llä.
- `bcc_status`: vanha taulu, varmuuskopio. Älä kirjoita siihen.

## Uusi moduuli
1. Tee `public/app/modules/<nimi>.js` ja kutsu siinä `register({ type, label, hint, create, View })`. Sopimus on kuvattu tiedostossa `core/registry.js`, ja `text.js` on pienin esimerkki.
2. Lisää tuontirivi tiedostoon `modules/index.js`.
3. Tekstit `Text`-komponentilla, rivien lisäys `add`-funktiolla, työkalut `Tools`-komponentilla. Uusi `kind`-arvo ei vaadi tietokantamuutosta.
4. Laskenta omaksi puhtaaksi funktioksi ja testi `test/`-kansioon.

Sisältöä, nimiä tai lukuja ei kirjoiteta moduulin koodiin. Ainoa poikkeus on `create`-funktion neutraali oletussisältö. Asiakas- tai yrityskohtaista sisältöä ei lisätä koodiin.

## Kehitys ja julkaisu
- `npm install`, `npm test`, `npm run dev` (http://localhost:8788, tiedot muistissa).
- Push `main`-haaraan julkaisee automaattisesti Cloudflareen (Worker business-command-center).
- Tietokantamuutos on ajettava Supabasessa ennen koodin julkaisua. Projekti on `xmnbdxlmnemrgniniqva`.
- Sivu on Cloudflare Accessin takana (All traffic). Ei erillistä kirjautumista.

## Säännöt
- Kieli suomi. Tyyli analyyttinen ja tiivis. Ei ajatusviivoja (– tai —) teksteissä; päivä- ja lukuvälien yhdysmerkki (1–30) on sallittu.
- Ammattimainen ulkoasu: IBM Plex Sans, laivastonsininen, vähäiset pyöristykset. Värit vain `:root`-tokeneista, tumma teema ylläpidetään.
- Älä koskaan lisää sähköpostiosoitteita, salasanoja tai salaisia avaimia repoon.
- Käyttäjän teksti näytetään aina tekstinä. Ei `innerHTML`-käyttöä käyttäjän datalle.
- Kaikki skriptit tulevat omalta palvelimelta (`public/vendor/`). `public/_headers` määrittää tiukan sisältöpolitiikan: älä lisää ulkoisia skriptejä.
- Tallentamattomat muutokset säilyvät selaimessa (`bcc-queue`), kunnes palvelin on vahvistanut ne.
- Commitit noreply-osoitteella: `Lazy-Toe@users.noreply.github.com`.
- Aja `npm test` ja `node --check worker.js` ennen pushia.
