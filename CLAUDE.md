# Business Command Center

Yksityinen johtamisen keskipiste: yhdessä paikassa suunnitelmat, vastuut, mittarit ja se, mitä pitää tehdä tänään. Yhdellä alustalla voi olla useita suunnitelmia, ja jokainen suunnitelma koostuu moduuleista. Sisältö on tietokannassa, ei koodissa.

## Rakenne
- `public/`: julkaistavat tiedostot. Vain tämä kansio näkyy verkossa.
- `public/app/main.js`: sovelluksen runko: yläpalkki, välilehdet, osioiden asettelu. `public/app/rail.js` on vasen kuvakepalkki (Tänään, Tehtävät, Oma työpöytä, Kokonaisuus, Asetukset sekä alhaalla Muutoshistoria ja Henkilöt, kuvakkeet omia SVG-kuvia) ja Kokonaisuuden osiolista (`SubNav`: ryhmät Osiot ja Vastuualueet, otsikot tulevat funktiosta `core/nav.js`, korostus seuraa sivun rullausta, lista voidaan piilottaa ja kiinnittää, ja vastuualueen valinta rullaa scorecardiin). Jäsenellä ei ole palkkia. Palkin punainen merkki on myöhässä olevien tehtävien määrä.
- `public/app/core/`: `store.js` (tiedot ja tallennus), `ui.js` (muokattava teksti, työkalut, raahaus), `calc.js` (laskenta ilman näkymää), `registry.js` (moduulirekisteri).
- `public/app/modules/`: yksi tiedosto per osiotyyppi. Rekisteröinti `index.js`:ssä.
- `public/app/views/settings.js`: Asetukset, jossa yhteiset tavoitteet ja mittarimallit määritellään. `core/formula.js` on kaavatulkki (ei `eval`ia: jäsentäjä hyväksyy vain luvut, + - * / ja sulut, muuttujat RANGE_MIN, RANGE_MAX, TARGET, ACTUAL sekä funktiot min, max, abs, round, clamp) ja `core/scorecard.js` tavoiterivien laskenta ja jako.
- `public/app/forms-ui.js` ja `core/forms.js`: tallennetut lomakkeet (valinta, selaus, luonnos, kopiointi, ehdotuksen päätös). `views/settings-pay.js` ja `core/pay.js`: euromoduuli. Palvelin ja käyttöliittymä käyttävät samoja puhtaita funktioita, ja ne on testattu tiedostoissa `test/forms.test.mjs` ja `test/pay.test.mjs`.
- `public/app/views/tasks.js` ja `core/tasks-table.js`: Tehtävät, kaikki tehtävät kaikista suunnitelmista yhdessä taulukossa (suodatus, rivin muokkaus, massamuutos vastuulle, määräpäivälle ja tilalle, kumoaminen). Massamuutos kulkee `store.patchManyIn`:n kautta, ja vain muuttuvat kentät päivitetään. Vastuu on tehtävän oma tai sen vastuualueen omistaja, jonka työvirta on sama (`inherited`), ja `PersonSelect` näyttää perityn vastuun kursiivilla.
- `public/app/views/today.js`: etusivu, joka kokoaa kaikkien suunnitelmien tehtävät, mittarit ja riskit (`/api/overview`). Luokittelu on tiedostossa `core/today.js`.
- `public/vendor/htm-preact.js`: käyttöliittymäkirjasto. Ei käännösvaihetta.
- `worker.js` ja `wrangler.jsonc`: Worker tarkistaa Cloudflare Accessin tunnisteen ja sallitun sähköpostin ja käyttää Supabasea salaisella avaimella. Salaisuudet (SUPABASE_SECRET_KEY, ALLOWED_EMAILS, valinnaiset MEMBER_EMAILS ja ACCESS_AUD) ovat vain Cloudflaressa.
- `supabase/schema.sql`: tietokannan rakenne. `002_alusta.sql` on kertaluonteinen siirto vanhasta `bcc_status`-taulusta, ja `001_kopio.sql` on historiaa.
- `dev/`: paikallinen palvelin ja tietokanta. `test/`: testit.

## Tietomalli
- `bcc_plans`: suunnitelmat. Poisto arkistoi (`archived_at`), tiedot säilyvät.
- `bcc_items`: kaikki sisältö yleisinä riveinä: `kind`, `parent_id`, `position`, `data` (jsonb). Tunniste on yksilöllinen suunnitelman sisällä, joten monistus säilyttää tunnisteet.
- `bcc_item_history`: rivin edeltävä tila jokaisesta sisältömuutoksesta ja poistosta, 180 päivää. Palautus tehdään SQL:llä.
- `bcc_people`: henkilöt (nimi, valinnainen kirjautumisen sähköposti). Vastuuhenkilöt nimetään vastuualueiden otsikossa, ja tehtävän vastuu valitaan vain nimetyistä. Vastuukentät (`owner`) tallentavat henkilön nimen, ja Oma työpöytä -näkymä kohdistuu liittämällä kirjautuminen henkilöön (`/api/me`). Kirjautuminen ei rajaa pääsyä: sallitut osoitteet määrää edelleen `ALLOWED_EMAILS`. Rakenne on tiedostossa `003_kayttajat.sql` ja hallintafunktiot (nimen muutos, poisto, sähköpostin liitos) tiedostossa `004_henkilohallinta.sql`. Nimen muutos päivittää vastuut kaikkiin suunnitelmiin.
- Tavoitekatalogi (suunnitelmakohtainen, ei tietokantamuutosta): `goal` (yhteinen tavoite, ei yläriviä) ja sen alla `metricdef` (mittarimalli: `name`, `stream`, `start`, `end`, `target`, `min`, `max`, `weight`, `formula`, `lock`). Roolin `metric`-rivi viittaa malliin kentällä `def` ja sisältää toteuman (`actual`) sekä lukitsemattomien kenttien omat arvot. Saman työvirran (`stream`) vastuualueille mallit tulevat automaattisesti ilman tallennettua riviä: tallentamaton rivi on virtuaalinen ja saa kiinteän tunnisteen `v-<rooli>-<malli>`, ja rivi tallentuu ensimmäisellä kirjauksella. Rooli voi piilottaa mallin (`hide`) tai lisätä toisen työvirran mallin käsin. Tulos on kaavan arvo, painotettu tulos on tulos kertaa paino prosentteina, ja "alle alarajan" tarkoittaa toteumaa alle `min`-arvon (Tänään-näkymän huomio). Hymiötiloja ei ole.
- Lomakkeet (suunnitelmakohtaisia, ei tietokantamuutosta): `formtype` (lomaketyyppi, ei yläriviä: `name`, `memberCreate`, `memberView`, `table`, `proposal`, `score`) ja `form` (roolin alla: `type`, `typeName`, `comment`, `rows`, `at`, `by`, `byPerson`, `status`, `decidedBy`, `decidedAt`). Tyypit ovat dataa, eikä koodissa ole kiinteitä tyyppejä. Lomake on jäädytetty kuva: `rows` sisältää syöttöarvot ja kaavan kopion, ei tuloksia, ja tulos lasketaan näytettäessä. Tekijä, päivä ja tila kirjataan palvelimella (`POST /api/plans/:id/forms`), ja ehdotuksen päätös on vain ylläpitäjän (`.../forms/:id/decide`: open, accepted, rejected, applied). Käyttöönotto kopioi tavoitteen, rajat ja painon roolin riveille mutta ei toteumaa eikä lukittua kenttää.
- Euromoduuli (globaali, tiedosto `005_euromoduuli.sql`): `bcc_people.pay` (henkilön sääntö ja kenttien arvot), `bcc_settings` (`pay_fields` ja `pay_rules`) ja `bcc_pay_log` (kuka muutti mitä, vanha ja uusi arvo). Kaikki kulkee RPC-funktioiden (`bcc_pay_*`) kautta, ja rajapinnat `/api/pay*` ovat vain ylläpitäjän. `SCORE` on henkilön roolien viimeisimmän pisteytystyypin (`score`) lomakkeen lopputulosten keskiarvo. Euro-tietoa ei tallenneta sisältöriveihin, historiaan, koostenäkymään eikä selaimeen.
- `bcc_status`: vanha taulu, varmuuskopio. Älä kirjoita siihen.

Tehtävän `data`: `title`, `detail`, `phase`, `stream`, `status`, `note`, `due` (VVVV-KK-PP), `owner`. Ilman omaa vastuuhenkilöä käytetään roolin omistajaa, jonka työvirta on sama.

## Käyttöoikeudet
- Kaksi tasoa. Ylläpitäjä (`ALLOWED_EMAILS`) näkee ja muuttaa kaiken. Jäsen (`MEMBER_EMAILS`) näkee ja muuttaa vain omat tehtävänsä, vastuualueensa ja mittarinsa. Osoite molemmissa listoissa on ylläpitäjä.
- Rajaus tehdään Workerissa (`memberApi`, `public/app/core/scope.js`), ei käyttöliittymässä. Jäsenen reittijoukko on oletuksena kieltävä: uusi reitti on vain ylläpitäjän, ellei sitä erikseen lisätä `memberApi`:in. Jäsen saa muuttaa vain tehtävän `status`, `due` ja `note` sekä mittarin `actual` (`MEMBER_FIELDS`) ja luoda tallentamattoman tavoiterivin ensimmäisellä kirjauksella (`put` vain kentillä `def` ja `actual`, sovitulla tunnisteella). Jäsen näkee oman roolinsa mallit vain luettavina. Yksikin sääntöjen ulkopuolinen muutos hylkää koko pyynnön (422).
- Jäsenen lisääminen: 1) lisää osoite Cloudflaren salaisuuteen `MEMBER_EMAILS` ja Access-sääntöön, 2) nimeä henkilö vastuualueen vastuuhenkilöksi, 3) liitä sähköposti henkilöön vasemman palkin Henkilöt-kuvakkeesta. Ilman liitosta jäsen ei näe mitään. Älä lisää jäsenen osoitetta `ALLOWED_EMAILS`-listaan.
- Lomakkeet: jäsen voi luoda lomakkeen vain omalle roolilleen ja vain tyypillä, jonka `memberCreate` on päällä, ja näkee roolillaan tyypit, joiden `memberView` on päällä, sekä omat lomakkeensa. Jäsen ei voi muuttaa, poistaa tai päättää lomakkeita eikä muokata tyyppejä. Lomakkeella näytetään tekijän nimi, ei koskaan sähköpostia.
- Euro-tiedot (palkka ym.) ovat vain ylläpitäjän. Jäsenen reittijoukko ei sisällä `/api/pay*`-reittejä, ja sen pitää pysyä niin. Jokainen euro-muutos kirjautuu lokiin tekijän sähköpostilla samassa transaktiossa kuin muutos.
- Muutos `memberApi`:in tai `scope.js`:ään vaatii testit tiedostoihin `test/scope.test.mjs` ja `test/worker.test.mjs` (jäsenen kielletyt reitit ja kielletyt muutokset).

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
