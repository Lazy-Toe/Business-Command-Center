-- Aja kerran Supabasen SQL Editorissa Business Command Center -projektissa.
-- Luo alustan taulut ja tuo nykyisen sivun sisällön ja tiedot niihin. Vanha bcc_status ei muutu.

-- Alustan tietokantarakenne. Kaikki sisältö on yleisiä rivejä: suunnitelma (bcc_plans) ja
-- sen osat (bcc_items). Uusi moduuli ei vaadi uusia tauluja, vain uuden kind-arvon.

create table if not exists public.bcc_plans (
  id text primary key,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.bcc_items (
  plan_id text not null references public.bcc_plans (id) on delete cascade,
  id text not null,
  kind text not null,
  parent_id text,
  position double precision not null default 0,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (plan_id, id)
);
create index if not exists bcc_items_plan_parent on public.bcc_items (plan_id, parent_id, position);

-- Muutoshistoria: jokaisen muutoksen tai poiston edeltävä tila säilyy 180 päivää.
create table if not exists public.bcc_item_history (
  hist_id bigint generated always as identity primary key,
  plan_id text not null,
  id text not null,
  kind text not null,
  parent_id text,
  position double precision not null,
  data jsonb not null,
  op text not null,
  changed_at timestamptz not null default now()
);
create index if not exists bcc_item_history_item on public.bcc_item_history (plan_id, id, changed_at desc);

create or replace function public.bcc_log_item() returns trigger
language plpgsql set search_path = public as $fn$
begin
  insert into bcc_item_history (plan_id, id, kind, parent_id, position, data, op)
  values (old.plan_id, old.id, old.kind, old.parent_id, old.position, old.data, lower(tg_op));
  return null;
end $fn$;

drop trigger if exists bcc_items_log_update on public.bcc_items;
create trigger bcc_items_log_update after update on public.bcc_items
  for each row when (old.data is distinct from new.data) execute function public.bcc_log_item();
drop trigger if exists bcc_items_log_delete on public.bcc_items;
create trigger bcc_items_log_delete after delete on public.bcc_items
  for each row execute function public.bcc_log_item();

-- Muutokset ajetaan yhtenä transaktiona: joko kaikki tai ei mitään.
--   put:   luo tai korvaa rivin
--   patch: yhdistää kentät dataan, voi siirtää (parent_id, position)
--   del:   poistaa rivin ja sen kaikki alirivit
create or replace function public.bcc_apply_batch(p_plan text, p_ops jsonb) returns integer
language plpgsql set search_path = public as $fn$
declare
  o jsonb;
  n integer := 0;
begin
  if not exists (select 1 from bcc_plans where id = p_plan and archived_at is null) then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;
  for o in select * from jsonb_array_elements(p_ops) loop
    if o->>'op' = 'put' then
      insert into bcc_items (plan_id, id, kind, parent_id, position, data)
      values (p_plan, o->>'id', o->>'kind', o->>'parent_id', coalesce((o->>'position')::double precision, 0), coalesce(o->'data', '{}'::jsonb))
      on conflict (plan_id, id) do update
        set kind = excluded.kind, parent_id = excluded.parent_id, position = excluded.position, data = excluded.data, updated_at = now();
    elsif o->>'op' = 'patch' then
      update bcc_items set
        data = data || coalesce(o->'data', '{}'::jsonb),
        parent_id = case when o ? 'parent_id' then o->>'parent_id' else parent_id end,
        position = coalesce((o->>'position')::double precision, position),
        updated_at = now()
      where plan_id = p_plan and id = o->>'id';
    elsif o->>'op' = 'del' then
      with recursive tree as (
        select i.id from bcc_items i where i.plan_id = p_plan and i.id = o->>'id'
        union all
        select c.id from bcc_items c join tree t on c.parent_id = t.id where c.plan_id = p_plan
      )
      delete from bcc_items d using tree where d.plan_id = p_plan and d.id = tree.id;
    else
      raise exception 'bad_op' using errcode = '22023';
    end if;
    n := n + 1;
  end loop;
  update bcc_plans set updated_at = now() where id = p_plan;
  delete from bcc_item_history where changed_at < now() - interval '180 days';
  return n;
end $fn$;

-- Monistaa suunnitelman. Tunnisteet ovat suunnitelmakohtaisia, joten ne säilyvät sellaisina.
create or replace function public.bcc_duplicate_plan(p_source text, p_id text, p_title text) returns text
language plpgsql set search_path = public as $fn$
begin
  insert into bcc_plans (id, title) values (p_id, p_title);
  insert into bcc_items (plan_id, id, kind, parent_id, position, data)
  select p_id, id, kind, parent_id, position, data from bcc_items where plan_id = p_source;
  return p_id;
end $fn$;

-- Ei suoria oikeuksia: vain Worker pääsee tietoihin salaisella avaimella.
alter table public.bcc_plans enable row level security;
alter table public.bcc_items enable row level security;
alter table public.bcc_item_history enable row level security;
revoke all on public.bcc_plans, public.bcc_items, public.bcc_item_history from anon, authenticated;
grant all on public.bcc_plans, public.bcc_items, public.bcc_item_history to service_role;
revoke all on function public.bcc_apply_batch(text, jsonb) from public, anon, authenticated;
revoke all on function public.bcc_duplicate_plan(text, text, text) from public, anon, authenticated;
revoke all on function public.bcc_log_item() from public, anon, authenticated;
grant execute on function public.bcc_apply_batch(text, jsonb) to service_role;
grant execute on function public.bcc_duplicate_plan(text, text, text) to service_role;

-- Tuodaan nykyinen THE EmCe 100 päivää -sisältö ja kaikki tallennetut tilat vanhasta bcc_status-taulusta.
-- Ajetaan vain kerran: jos suunnitelma on jo olemassa, mitään ei muuteta. bcc_status säilyy varmuuskopiona.
do $seed$
declare
  p constant text := 'emce-100';
  st jsonb;
  k text;
  v jsonb;
begin
  if exists (select 1 from public.bcc_plans where id = p) then
    raise notice 'Suunnitelma on jo tuotu, ei muutoksia.';
    return;
  end if;

  insert into public.bcc_plans (id, title) values (p, 'THE EmCe 100 päivää');

  insert into public.bcc_items (plan_id, id, kind, parent_id, position, data)
  select p, e->>'id', e->>'kind', e->>'parent_id', (e->>'position')::double precision, e->'data'
  from jsonb_array_elements($json$[{"id":"sec-hero","kind":"section","parent_id":null,"position":1000,"data":{"type":"hero","eyebrow":"EmCe · liiketoimintajohtajan ensimmäiset 100 päivää","title":"Myynti kääntyy, kate seuraa","lede":"Vuonna 2027 EmCen omien tuotteiden myynti kääntyy kasvuun siellä, missä EmCen syvyys voittaa: palkoissa, järjestöissä ja tilitoimistokanavassa. Suunta testataan 30 päivässä ja päätetään yhdessä johtoryhmän kanssa.","byline":"Mika Mäkelä · 28.10.2026 · Hypoteesi ulkopuolisen tiedon pohjalta, tarkentuu 30 päivässä"}},{"id":"stat-1","kind":"stat","parent_id":"sec-hero","position":1000,"data":{"value":"7,6 M€","label":"liikevaihto 2025, vuonna 2019 8,1 M€","source":""}},{"id":"stat-2","kind":"stat","parent_id":"sec-hero","position":2000,"data":{"value":"−13,5 %","label":"liikevaihdon muutos Q1/2026","source":"Lähde: Administer Q1/2026 -katsaus 13.5.2026 (1,8 M€)"}},{"id":"stat-3","kind":"stat","parent_id":"sec-hero","position":3000,"data":{"value":"2,8 %","label":"tilikauden tulos liikevaihdosta 2025","source":""}},{"id":"stat-4","kind":"stat","parent_id":"sec-hero","position":4000,"data":{"value":"5 / 3","label":"EmCen omat tuotteet / BC, arvioitu suhde","source":""}},{"id":"sec-goals","kind":"section","parent_id":null,"position":2000,"data":{"type":"goals","eyebrow":"Tavoitetaso","title":"Kasvutavoitteet","intro":"Liikevaihto ja kate liiketoimintalinjoittain, kokonaisuus lasketaan automaattisesti. Sovitaan toimitusjohtajan kanssa, kun lähtötasot ovat selvillä.","baseYear":"2026","targetYear":"2027","unit":"M€","revName":"Liikevaihto","estTotal":"6.574","lineHead":"Liiketoimintalinja","totalName":"EmCe yhteensä","kpiHead":"Omat tuotteet: asiakkaat ja pito","custLabel":"Asiakasmäärän kasvu, % / v","arrLabel":"Toistuva osuus liikevaihdosta, %","churnLabel":"Churn, % toistuvasta (ARR/MRR)","nrrLabel":"Nettopito, %","projHead":"Jos tahti pysyy","projYears":[2027,2028,2029],"projNrr":"Nykyasiakkaiden liikevaihto","projCust":"Asiakasmäärä, indeksi 2026 = 100","r40Label":"Rule of 40, omat tuotteet","note1":"≈ = arvio. Kirjoita EmCe yhteensä -riville vuoden 2026 liikevaihto, niin se jaetaan linjoille osuuksien suhteella (omat tuotteet 5, BC 3). Ilman lukua arvio on liikevaihto 2025 × (1 + liikevaihdon muutos), 7,6 × 0,865. Linjan luvun voi myös kirjoittaa suoraan.","note2":"Laskelma olettaa, että kasvu- ja pitoprosentit pysyvät samoina joka vuosi vuodesta 2026 alkaen. Nykyasiakkaiden liikevaihto = omien tuotteiden 2026 liikevaihto nettopidolla."}},{"id":"line-own","kind":"line","parent_id":"sec-goals","position":1000,"data":{"name":"EmCen omat tuotteet","share":"5"}},{"id":"line-bc","kind":"line","parent_id":"sec-goals","position":2000,"data":{"name":"Business Central","share":"3"}},{"id":"sec-levers","kind":"section","parent_id":null,"position":3000,"data":{"type":"levers","eyebrow":"Mihin keskityn","title":"Kolme vipua, tässä järjestyksessä","intro":"Pullonkaula on konversiossa ja pidossa, ei kysynnässä. Siksi ensin kaupallinen ydin: kenelle myydään, millä viestillä ja millä hinnalla."}},{"id":"lever-1","kind":"lever","parent_id":"sec-levers","position":1000,"data":{"name":"Kaupallinen ydin","big":"≈ {perus*0.05:2} M€","bigFallback":"","text":"ICP, kanava ja viesti lukkoon. Playbook ja myynnin rytmi käyttöön. Paketointi ja hinta kuntoon: 5 % hinnankorotus omiin tuotteisiin ≈ koko vuoden 2025 tulos."}},{"id":"lever-2","kind":"lever","parent_id":"sec-levers","position":2000,"data":{"name":"EmCen omien tuotteiden fokus","big":"{~}{perus:1} M€ → {tavoite:1} M€","bigFallback":"{~}{perus:1} M€","text":"Suurin liiketoiminta. Jokaiselle tuotteelle rooli: kasvu, puolustus tai ylläpito. Kehitys ja myynti keskitetään kasvutuotteisiin, ja tekniikkaan investoidaan siellä, missä rooli on kasvu."}},{"id":"lever-3","kind":"lever","parent_id":"sec-levers","position":3000,"data":{"name":"Nykyasiakkaat: pito ja ristiinmyynti","big":"Nettopito → {nettopito:a} %","bigFallback":"Nettopito ↑","text":"Jokaiselle asiakkaalle omistaja ja säännöllinen arvokeskustelu. BC-asiakkaille EmCen palkat paketiksi: sama asiakas, korkeampi kate ja vähemmän syitä vaihtaa."}},{"id":"principle-1","kind":"principle","parent_id":"sec-levers","position":4000,"data":{"title":"80 % tietoa riittää","text":"Linjaukset tehdään datalla, ei yksittäisillä tarinoilla."}},{"id":"principle-2","kind":"principle","parent_id":"sec-levers","position":5000,"data":{"title":"Johtoryhmä rakentaa, minä päätän","text":"Fasilitoidut työpajat, selkeä vastuu päätöksistä."}},{"id":"principle-3","kind":"principle","parent_id":"sec-levers","position":6000,"data":{"title":"Arkkitehtuuri laajenee, ei uudistu","text":"Pala kerrallaan, vain kun takaisinmaksu on perusteltu."}},{"id":"sec-scorecards","kind":"section","parent_id":null,"position":4000,"data":{"type":"scorecards","eyebrow":"Johtamismalli","title":"Scorecard jokaiselle johtoryhmän jäsenelle","intro":"Jokaisella luvulla on omistaja. Scorecard määrää tahdin: viikolla katsotaan suunta, kuukaudessa tulos ja kvartaalissa korjataan kurssia."}},{"id":"role-johtaja","kind":"role","parent_id":"sec-scorecards","position":1000,"data":{"title":"Liiketoimintajohtaja","owner":"Mika","mission":"Kokonaisuuden tulos ja johtamisen rytmi.","stream":"ws-ihmiset"}},{"id":"johtaja-m1","kind":"metric","parent_id":"role-johtaja","position":1000,"data":{"name":"Käyttökate","cad":"kuukausi"}},{"id":"johtaja-m2","kind":"metric","parent_id":"role-johtaja","position":2000,"data":{"name":"Liikevaihdon kasvu","cad":"kuukausi"}},{"id":"johtaja-m3","kind":"metric","parent_id":"role-johtaja","position":3000,"data":{"name":"Nettopito","cad":"kuukausi"}},{"id":"role-myynti","kind":"role","parent_id":"sec-scorecards","position":2000,"data":{"title":"Myynti","owner":"Mika","mission":"Kaupallinen ydin: kenelle myydään, millä viestillä ja millä hinnalla.","stream":"ws-kate"}},{"id":"myynti-m1","kind":"metric","parent_id":"role-myynti","position":1000,"data":{"name":"Pipeline-kattavuus","cad":"viikko"}},{"id":"myynti-m2","kind":"metric","parent_id":"role-myynti","position":2000,"data":{"name":"Konversio","cad":"kuukausi"}},{"id":"myynti-m3","kind":"metric","parent_id":"role-myynti","position":3000,"data":{"name":"Uusmyynti, toistuva","cad":"kuukausi"}},{"id":"role-bc","kind":"role","parent_id":"sec-scorecards","position":3000,"data":{"title":"Business Central","owner":"Johtoryhmä","mission":"Tulos, NAV-siirrot ja rakennepäätös.","stream":"ws-bc"}},{"id":"bc-m1","kind":"metric","parent_id":"role-bc","position":1000,"data":{"name":"Laskutusaste","cad":"kuukausi"}},{"id":"bc-m2","kind":"metric","parent_id":"role-bc","position":2000,"data":{"name":"NAV-siirrot","cad":"kuukausi"}},{"id":"bc-m3","kind":"metric","parent_id":"role-bc","position":3000,"data":{"name":"BC:n käyttökate","cad":"kuukausi"}},{"id":"role-teknologia","kind":"role","parent_id":"sec-scorecards","position":4000,"data":{"title":"Teknologia ja tuote","owner":"Johtoryhmä","mission":"EmCen omat tuotteet: roadmap, AI ja kate.","stream":"ws-tekno"}},{"id":"teknologia-m1","kind":"metric","parent_id":"role-teknologia","position":1000,"data":{"name":"Roadmapin toteuma","cad":"kuukausi"}},{"id":"teknologia-m2","kind":"metric","parent_id":"role-teknologia","position":2000,"data":{"name":"AI:n hyödyntäminen","cad":"kvartaali"}},{"id":"teknologia-m3","kind":"metric","parent_id":"role-teknologia","position":3000,"data":{"name":"Hosting per käyttäjä","cad":"kuukausi"}},{"id":"role-asiakaskokemus","kind":"role","parent_id":"sec-scorecards","position":5000,"data":{"title":"Asiakaskokemus","owner":"Johtoryhmä","mission":"Pito, NPS ja asiakasomistajuus.","stream":"ws-kanava"}},{"id":"asiakaskokemus-m1","kind":"metric","parent_id":"role-asiakaskokemus","position":1000,"data":{"name":"NPS","cad":"kvartaali"}},{"id":"asiakaskokemus-m2","kind":"metric","parent_id":"role-asiakaskokemus","position":2000,"data":{"name":"Churn","cad":"kuukausi"}},{"id":"asiakaskokemus-m3","kind":"metric","parent_id":"role-asiakaskokemus","position":3000,"data":{"name":"Tuen ratkaisuaika","cad":"kuukausi"}},{"id":"cadence-1","kind":"cadence","parent_id":"sec-scorecards","position":6000,"data":{"title":"Viikko","text":"30 min scorecard-läpikäynti, vain poikkeamat"}},{"id":"cadence-2","kind":"cadence","parent_id":"sec-scorecards","position":7000,"data":{"title":"Kuukausi","text":"Tulos, ennuste ja korjaavat toimet"}},{"id":"cadence-3","kind":"cadence","parent_id":"sec-scorecards","position":8000,"data":{"title":"Kvartaali","text":"Tavoitteet ja vivut tarkistetaan"}},{"id":"sec-plan","kind":"section","parent_id":null,"position":5000,"data":{"type":"plan","hint":"Klikkaa tehtävää vaihtaaksesi tilaa: ei aloitettu → käynnissä → valmis. Muutokset tallentuvat heti.","eyebrow":"Suunnitelma","title":"Kolme vipua, BC-päätös ja johtaminen","intro":"Jokainen vipu on oma rivinsä. Lue rivi vasemmalta oikealle nähdäksesi, miten se etenee. Valitse vaihe aikajanalta tai työvirta alta tarkentaaksesi."}},{"id":"ph-1","kind":"phase","parent_id":"sec-plan","position":1000,"data":{"label":"PÄIVÄT 1–30","title":"Kuuntele ja mittaa","note":"Diagnoosi dataksi, muutosviesti heti","weight":30,"gateNum":"30","gateShort":"Diagnoosi vahvistettu","gateLabel":"PÄIVÄ 30","gateTitle":"Diagnoosi vahvistettu","gateText":"Kolmen talouden P&L, pito ja churn näkyvissä. Hypoteesit hyväksytty tai hylätty."}},{"id":"ph-2","kind":"phase","parent_id":"sec-plan","position":2000,"data":{"label":"PÄIVÄT 31–60","title":"Päätä","note":"Johtoryhmä tekee valinnat yhdessä","weight":30,"gateNum":"60","gateShort":"Suunta lukittu","gateLabel":"PÄIVÄ 60","gateTitle":"Suunta lukittu","gateText":"ICP, viesti sekä hinnoittelu- ja pakettimalli päätetty. Myynnin rytmi käytössä."}},{"id":"ph-3","kind":"phase","parent_id":"sec-plan","position":3000,"data":{"label":"PÄIVÄT 61–100","title":"Toimeenpane","note":"Muutos näkyy rahassa","weight":40,"gateNum":"100","gateShort":"Muutos rahassa","gateLabel":"PÄIVÄ 100","gateTitle":"Muutos näkyy rahassa","gateText":"Uudet hinnat voimassa, NAV-siirrot käynnissä, BC:n rakennesuositus johdolla, scorecard rytmissä."}},{"id":"ws-kate","kind":"stream","parent_id":"sec-plan","position":4000,"data":{"label":"1 Kaupallinen ydin","color":"kate"}},{"id":"ws-tekno","kind":"stream","parent_id":"sec-plan","position":5000,"data":{"label":"2 EmCen omat tuotteet","color":"tekno"}},{"id":"ws-kanava","kind":"stream","parent_id":"sec-plan","position":6000,"data":{"label":"3 Nykyasiakkaat","color":"kanava"}},{"id":"ws-bc","kind":"stream","parent_id":"sec-plan","position":7000,"data":{"label":"BC: tulos ja rakenne","color":"bc"}},{"id":"ws-ihmiset","kind":"stream","parent_id":"sec-plan","position":8000,"data":{"label":"Ihmiset ja johtaminen","color":"ihmiset"}},{"id":"1-ihmiset-1","kind":"task","parent_id":"sec-plan","position":9000,"data":{"title":"Muutosviesti ensimmäisellä viikolla","detail":"Miksi, mihin suuntaan ja mitä emme tee","phase":"ph-1","stream":"ws-ihmiset","status":"todo","note":""}},{"id":"1-ihmiset-2","kind":"task","parent_id":"sec-plan","position":10000,"data":{"title":"Kahdenkeskiset jokaisen kanssa","detail":"Johtoryhmä ensimmäisellä viikolla","phase":"ph-1","stream":"ws-ihmiset","status":"todo","note":""}},{"id":"1-ihmiset-3","kind":"task","parent_id":"sec-plan","position":11000,"data":{"title":"Scorecard-luonnos jokaiselle johtoryhmän jäsenelle","detail":"3–5 mittaria, omistaja ja lähtötaso","phase":"ph-1","stream":"ws-ihmiset","status":"todo","note":""}},{"id":"1-ihmiset-4","kind":"task","parent_id":"sec-plan","position":12000,"data":{"title":"Kate tulovirroittain","detail":"Ohjelmisto, käyttöönotot ja BC-palvelut erikseen: scorecardien lähtötaso","phase":"ph-1","stream":"ws-ihmiset","status":"todo","note":""}},{"id":"1-kate-1","kind":"task","parent_id":"sec-plan","position":13000,"data":{"title":"ICP voitetuista ja hävityistä kaupoista","detail":"Kenelle EmCe voittaa: palkat, järjestöt, tilitoimistot","phase":"ph-1","stream":"ws-kate","status":"todo","note":""}},{"id":"1-kate-2","kind":"task","parent_id":"sec-plan","position":14000,"data":{"title":"Pipeline-läpikäynti","detail":"Kvalifiointi kaupan koon mukaan: BANT, MEDDIC tai MEDDPICC","phase":"ph-1","stream":"ws-kate","status":"todo","note":""}},{"id":"1-kate-3","kind":"task","parent_id":"sec-plan","position":15000,"data":{"title":"Myyjien kyky ja tahto","detail":"Kehityssuunnitelma jokaiselle","phase":"ph-1","stream":"ws-kate","status":"todo","note":""}},{"id":"1-kanava-1","kind":"task","parent_id":"sec-plan","position":16000,"data":{"title":"Asiakastyytyväisyyskysely ja 10 syvähaastattelua","detail":"Koko kanta: NPS ja lähtöriski. Haastattelut suurimmille, riskiasiakkaille ja menetetyille","phase":"ph-1","stream":"ws-kanava","status":"todo","note":""}},{"id":"1-kanava-2","kind":"task","parent_id":"sec-plan","position":17000,"data":{"title":"Churn ja nettopito tuotteittain","detail":"Lähtötaso pidolle ja riskiasiakkaat","phase":"ph-1","stream":"ws-kanava","status":"todo","note":""}},{"id":"1-kanava-3","kind":"task","parent_id":"sec-plan","position":18000,"data":{"title":"Palkka-asiakkaat alan kyselyyn","detail":"Tulos myyntimateriaaliksi kahdeksi vuodeksi","phase":"ph-1","stream":"ws-kanava","status":"todo","note":""}},{"id":"1-bc-1","kind":"task","parent_id":"sec-plan","position":19000,"data":{"title":"NAV-kannan kartoitus","detail":"Asiakkaat, versiot ja tuen päättymispäivät","phase":"ph-1","stream":"ws-bc","status":"todo","note":""}},{"id":"1-bc-2","kind":"task","parent_id":"sec-plan","position":20000,"data":{"title":"BC:n tulos erikseen näkyviin","detail":"Liikevaihto, kate, laskutusaste ja jaettujen kulujen kohdistus","phase":"ph-1","stream":"ws-bc","status":"todo","note":""}},{"id":"1-bc-3","kind":"task","parent_id":"sec-plan","position":21000,"data":{"title":"Synergiakartoitus","detail":"Kuinka moni BC-asiakas käyttää EmCen palkkoja tai taloutta, ja päinvastoin","phase":"ph-1","stream":"ws-bc","status":"todo","note":""}},{"id":"1-tekno-1","kind":"task","parent_id":"sec-plan","position":22000,"data":{"title":"Tuoteportfolion läpikäynti","detail":"Palkat, taloushallinto ja lisäosat: liikevaihto, kate, asiakkaat ja churn tuotteittain","phase":"ph-1","stream":"ws-tekno","status":"todo","note":""}},{"id":"1-tekno-2","kind":"task","parent_id":"sec-plan","position":23000,"data":{"title":"Kilpailuasema tuotteittain","detail":"Palkat vs. Mepco ja Netvisor, talous vs. Procountor ja Fennoa","phase":"ph-1","stream":"ws-tekno","status":"todo","note":""}},{"id":"1-tekno-3","kind":"task","parent_id":"sec-plan","position":24000,"data":{"title":"Teknologian nykytila","detail":"Tekninen velka ja hostingin kustannus käyttäjää kohden","phase":"ph-1","stream":"ws-tekno","status":"todo","note":""}},{"id":"2-ihmiset-1","kind":"task","parent_id":"sec-plan","position":25000,"data":{"title":"Johtoryhmän työpajat 4 × 2 h","detail":"Juurisyy, ICP, hinnoittelu, asiakaskokemus","phase":"ph-2","stream":"ws-ihmiset","status":"todo","note":""}},{"id":"2-ihmiset-2","kind":"task","parent_id":"sec-plan","position":26000,"data":{"title":"Vuoden 2027 budjetti","detail":"Konsernin talouden tuella","phase":"ph-2","stream":"ws-ihmiset","status":"todo","note":""}},{"id":"2-ihmiset-3","kind":"task","parent_id":"sec-plan","position":27000,"data":{"title":"Scorecardit sovittu kahdenkeskisesti","detail":"Jokainen hyväksyy omat lukunsa ja tavoitteensa","phase":"ph-2","stream":"ws-ihmiset","status":"todo","note":""}},{"id":"2-kate-1","kind":"task","parent_id":"sec-plan","position":28000,"data":{"title":"ICP, asemointi ja viesti lukkoon","detail":"Materiaalit ja verkkoviesti yhtenäisiksi","phase":"ph-2","stream":"ws-kate","status":"todo","note":""}},{"id":"2-kate-2","kind":"task","parent_id":"sec-plan","position":29000,"data":{"title":"Playbook ja myynnin rytmi","detail":"Viikko, kuukausi ja kvartaali","phase":"ph-2","stream":"ws-kate","status":"todo","note":""}},{"id":"2-kate-3","kind":"task","parent_id":"sec-plan","position":30000,"data":{"title":"Paketointi- ja hinnoittelumalli","detail":"Vaikutuslaskelma ja poistumariski","phase":"ph-2","stream":"ws-kate","status":"todo","note":""}},{"id":"2-kate-4","kind":"task","parent_id":"sec-plan","position":31000,"data":{"title":"Kohdennetut soittokampanjat","detail":"Bookkauspalvelun pilotti ICP-listoille","phase":"ph-2","stream":"ws-kate","status":"todo","note":""}},{"id":"2-kate-5","kind":"task","parent_id":"sec-plan","position":32000,"data":{"title":"Pelisäännöt konsernikanavalle","detail":"Tilitoimistot ja Silta","phase":"ph-2","stream":"ws-kate","status":"todo","note":""}},{"id":"2-kanava-1","kind":"task","parent_id":"sec-plan","position":33000,"data":{"title":"Asiakasomistajuus","detail":"Jokaiselle asiakkaalle omistaja ja arvokeskustelun rytmi","phase":"ph-2","stream":"ws-kanava","status":"todo","note":""}},{"id":"2-kanava-2","kind":"task","parent_id":"sec-plan","position":34000,"data":{"title":"BC + EmCen palkat -paketti","detail":"Kohdelista: BC-asiakkaat ilman EmCen palkkoja, hinta ja kate","phase":"ph-2","stream":"ws-kanava","status":"todo","note":""}},{"id":"2-bc-1","kind":"task","parent_id":"sec-plan","position":35000,"data":{"title":"NAV-siirtokampanjan suunnitelma","detail":"Kapasiteetti, priorisointi ja hinnoittelu","phase":"ph-2","stream":"ws-bc","status":"todo","note":""}},{"id":"2-bc-2","kind":"task","parent_id":"sec-plan","position":36000,"data":{"title":"Rakennevaihtoehdot ja kriteerit","detail":"Nykytila mukaan lukien, samat kriteerit kaikille, sovittu johdon kanssa","phase":"ph-2","stream":"ws-bc","status":"todo","note":""}},{"id":"2-bc-3","kind":"task","parent_id":"sec-plan","position":37000,"data":{"title":"Osaaja- ja kumppaniriskit","detail":"Avainhenkilöriippuvuus ja Microsoft-kumppanistatus","phase":"ph-2","stream":"ws-bc","status":"todo","note":""}},{"id":"2-tekno-1","kind":"task","parent_id":"sec-plan","position":38000,"data":{"title":"Rooli jokaiselle tuotteelle","detail":"Kasvu, puolustus vai ylläpito: investoinnit sen mukaan","phase":"ph-2","stream":"ws-tekno","status":"todo","note":""}},{"id":"2-tekno-2","kind":"task","parent_id":"sec-plan","position":39000,"data":{"title":"Tuotehallinta ja tiekartta","detail":"Tiekartalle omistaja, priorisointi kaupallisin perustein","phase":"ph-2","stream":"ws-tekno","status":"todo","note":""}},{"id":"2-tekno-3","kind":"task","parent_id":"sec-plan","position":40000,"data":{"title":"Asiakkaan selainnäkymä: rajaus ja kustannus","detail":"Ensimmäisen version sisältö, hinta ja takaisinmaksu ennen päätöstä","phase":"ph-2","stream":"ws-tekno","status":"todo","note":""}},{"id":"3-ihmiset-1","kind":"task","parent_id":"sec-plan","position":41000,"data":{"title":"Scorecard johtoryhmän rytmiin","detail":"Rekrytoinnit päätetty: tuotehallinta ja myynnin kapasiteetti","phase":"ph-3","stream":"ws-ihmiset","status":"todo","note":""}},{"id":"3-kate-1","kind":"task","parent_id":"sec-plan","position":42000,"data":{"title":"Uudet paketit ja hinnat voimaan","detail":"Asiakasviestintä huolellisesti, poistuma seurannassa","phase":"ph-3","stream":"ws-kate","status":"todo","note":""}},{"id":"3-kate-2","kind":"task","parent_id":"sec-plan","position":43000,"data":{"title":"Ensimmäinen kvartaalikatselmointi","detail":"Ennustetarkkuus mitattu, playbook päivitetty","phase":"ph-3","stream":"ws-kate","status":"todo","note":""}},{"id":"3-kate-3","kind":"task","parent_id":"sec-plan","position":44000,"data":{"title":"Tilitoimistojen kumppanimalli pilottiin","detail":"Yksi toimisto, kymmeniä loppuasiakkaita","phase":"ph-3","stream":"ws-kate","status":"todo","note":""}},{"id":"3-kanava-1","kind":"task","parent_id":"sec-plan","position":45000,"data":{"title":"Paketti myynnissä BC-asiakkaille","detail":"Ensimmäiset kaupat ja katevaikutus mitattu","phase":"ph-3","stream":"ws-kanava","status":"todo","note":""}},{"id":"3-kanava-2","kind":"task","parent_id":"sec-plan","position":46000,"data":{"title":"Pidon viikkoseuranta","detail":"Churn-riskit johtoryhmän rytmiin","phase":"ph-3","stream":"ws-kanava","status":"todo","note":""}},{"id":"3-bc-1","kind":"task","parent_id":"sec-plan","position":47000,"data":{"title":"NAV-siirtokampanja käynnissä","detail":"Siirrot projektituloksi ja jatkuvaksi tueksi","phase":"ph-3","stream":"ws-bc","status":"todo","note":""}},{"id":"3-bc-2","kind":"task","parent_id":"sec-plan","position":48000,"data":{"title":"Rakennesuositus johdolle","detail":"Vertailu, tulosvaikutus, synergiat ja muutoksen kustannus","phase":"ph-3","stream":"ws-bc","status":"todo","note":""}},{"id":"3-tekno-1","kind":"task","parent_id":"sec-plan","position":49000,"data":{"title":"12 kuukauden tiekartta asiakkaille ja myynnille","detail":"Tukee hinnoittelua ja pitoa","phase":"ph-3","stream":"ws-tekno","status":"todo","note":""}},{"id":"3-tekno-2","kind":"task","parent_id":"sec-plan","position":50000,"data":{"title":"Asiakkaan selainnäkymä pilottiasiakkailla","detail":"Jos takaisinmaksu on perusteltu: testaus ja iterointi","phase":"ph-3","stream":"ws-tekno","status":"todo","note":""}},{"id":"sec-decision","kind":"section","parent_id":null,"position":6000,"data":{"type":"decision","critLabel":"Kriteerit","choice":"","eyebrow":"Päätös päivään 100","title":"Eriytetäänkö Business Central?","intro":"Avoin kysymys, ei kanta. Omat tuotteet ja BC ovat eri talouksia, mutta niillä on yhteisiä asiakkaita. Nykytila on yhtä lailla vaihtoehto, ja myös muutoksella on hintansa. Aikaraja on silti kiinteä: NAV 2018 -tuki päättyy 11.1.2028."}},{"id":"opt-A","kind":"option","parent_id":"sec-decision","position":1000,"data":{"letter":"A","title":"Integroitu","text":"Nykytila, yhteinen johto ja myynti.","when":"Oikea, jos ristiinmyynti ja asiakkaiden päällekkäisyys ovat merkittäviä."}},{"id":"opt-B","kind":"option","parent_id":"sec-decision","position":2000,"data":{"letter":"B","title":"Oma tulosyksikkö","text":"Oma P&L ja vetäjä, yhteinen asiakkuus ja myynti.","when":"Oikea, jos BC on kannattava mutta tarvitsee oman johtamisen."}},{"id":"opt-C","kind":"option","parent_id":"sec-decision","position":3000,"data":{"letter":"C","title":"Oma yhtiö konsernissa","text":"Erillinen yhtiö, palvelusopimus EmCen kanssa.","when":"Oikea, jos kasvulogiikka eroaa ja konserni haluaa arvon näkyviin."}},{"id":"opt-D","kind":"option","parent_id":"sec-decision","position":4000,"data":{"letter":"D","title":"Yhdistäminen tai myynti","text":"Toisen BC-kumppanin kanssa tai sille.","when":"Oikea, jos kriittinen massa ei riitä ja BC sitoo johdon aikaa."}},{"id":"crit-1","kind":"criterion","parent_id":"sec-decision","position":5000,"data":{"text":"Käyttökate ja kasvu"}},{"id":"crit-2","kind":"criterion","parent_id":"sec-decision","position":6000,"data":{"text":"Ristiinmyynnin osuus"}},{"id":"crit-3","kind":"criterion","parent_id":"sec-decision","position":7000,"data":{"text":"Asiakkaiden päällekkäisyys"}},{"id":"crit-4","kind":"criterion","parent_id":"sec-decision","position":8000,"data":{"text":"Microsoft-kumppanuus ja osaajat"}},{"id":"crit-5","kind":"criterion","parent_id":"sec-decision","position":9000,"data":{"text":"Johdon aika"}},{"id":"crit-6","kind":"criterion","parent_id":"sec-decision","position":10000,"data":{"text":"Konsernin strategia"}},{"id":"sec-metrics","kind":"section","parent_id":null,"position":7000,"data":{"type":"metrics","width":"half","eyebrow":"Mittaristo","title":"Millä onnistuminen mitataan","intro":"Lähtötasot päivään 30, tavoitteet toimitusjohtajan kanssa."}},{"id":"m1","kind":"row","parent_id":"sec-metrics","position":1000,"data":{"state":"","name":"EmCen omat tuotteet: toistuva liikevaihto tuotteittain","cad":"kuukausi","why":"Suurin liiketoimintalinja, noin 5 M€. Kasvu ratkaisee EmCen arvon.","target":"Päivä 100: lähtötaso ja kasvutavoite tuotteittain sovittu"}},{"id":"m2","kind":"row","parent_id":"sec-metrics","position":2000,"data":{"state":"","name":"EmCen omat tuotteet: kehityspanos roolin mukaan","cad":"kvartaali","why":"Investoinnit kasvutuotteisiin, ei tasajakoon.","target":"Päivä 100: tiekartta ja kehitysbudjetti roolitettu"}},{"id":"m3","kind":"row","parent_id":"sec-metrics","position":3000,"data":{"state":"","name":"Käyttökate liiketoiminnoittain","cad":"kuukausi","why":"Omat ohjelmat ja BC ovat eri talouksia.","target":"Päivä 100: erillisseuranta käytössä"}},{"id":"m4","kind":"row","parent_id":"sec-metrics","position":4000,"data":{"state":"","name":"Nettopito ja churn","cad":"kuukausi","why":"Pullonkaula on pidossa ja konversiossa.","target":"Päivä 100: lähtötaso ja tavoite sovittu"}},{"id":"m5","kind":"row","parent_id":"sec-metrics","position":5000,"data":{"state":"","name":"NPS ja asiakaskokemus","cad":"kvartaali","why":"Yhteinen mittari asiakaspalvelun kanssa.","target":"Päivä 100: ensimmäinen mittaus tehty"}},{"id":"m6","kind":"row","parent_id":"sec-metrics","position":6000,"data":{"state":"","name":"Pipeline-kattavuus ja konversio","cad":"viikko","why":"Ennusteen luotettavuus.","target":"Päivä 100: kvalifioitu putki"}},{"id":"m7","kind":"row","parent_id":"sec-metrics","position":7000,"data":{"state":"","name":"Ristiinmyynnin osuus","cad":"kuukausi","why":"BC:n rakennepäätöksen tärkein peruste.","target":"Päivä 100: mitattu molempiin suuntiin"}},{"id":"m8","kind":"row","parent_id":"sec-metrics","position":8000,"data":{"state":"","name":"NAV-siirrot ja BC:n laskutusaste","cad":"kuukausi","why":"Tuen päättyminen on ajallisesti rajattu tilaisuus.","target":"Päivä 100: siirtokampanja käynnissä"}},{"id":"m9","kind":"row","parent_id":"sec-metrics","position":9000,"data":{"state":"","name":"Hostingin kustannus käyttäjää kohden","cad":"kuukausi","why":"Hostatun mallin katevipu.","target":"Päivä 100: mittari käytössä"}},{"id":"sec-risks","kind":"section","parent_id":null,"position":8000,"data":{"type":"risks","width":"half","eyebrow":"Riskit","title":"Mikä voi mennä pieleen","intro":"Jokaiselle riskille on vastatoimi jo suunnitelmassa. Taso 0 = hallinnassa, 1 = seurattava, 2 = toteutumassa."}},{"id":"r1","kind":"risk","parent_id":"sec-risks","position":1000,"data":{"state":"","name":"Hinnankorotus nostaa poistumaa","action":"Paketointi ensin, porrastettu käyttöönotto ja pidon viikkoseuranta."}},{"id":"r2","kind":"risk","parent_id":"sec-risks","position":2000,"data":{"state":"","name":"Avainhenkilöitä lähtee muutoksessa","action":"Muutosviesti ensimmäisellä viikolla ja kahdenkeskiset jokaisen kanssa."}},{"id":"r3","kind":"risk","parent_id":"sec-risks","position":3000,"data":{"state":"","name":"BC-kapasiteetti ei riitä siirtoihin","action":"Kanta priorisoidaan tuen päättymisen ja asiakasarvon mukaan."}},{"id":"r4","kind":"risk","parent_id":"sec-risks","position":4000,"data":{"state":"","name":"Kanavaristiriita konsernin kanssa","action":"Pelisäännöt tilitoimistoille ja Sillalle päivään 60 mennessä."}},{"id":"r5","kind":"risk","parent_id":"sec-risks","position":5000,"data":{"state":"","name":"Kehitys maksaa enemmän kuin tuottaa","action":"Jokaiselle askeleelle kustannusarvio ja takaisinmaksu, ei sitoutumista kokonaisuudistukseen."}},{"id":"r6","kind":"risk","parent_id":"sec-risks","position":6000,"data":{"state":"","name":"Eriyttäminen katkaisee ristiinmyynnin","action":"Synergiat mitataan ennen päätöstä, ei sen jälkeen."}},{"id":"r7","kind":"risk","parent_id":"sec-risks","position":7000,"data":{"state":"","name":"Myynnin este on tahto eikä kyky","action":"Kyky valmennetaan playbookilla, tahto käsitellään johtamisena."}},{"id":"sec-asks","kind":"section","parent_id":null,"position":9000,"data":{"type":"asks","sources":"Lähteet: Administerin tilinpäätöstiedote 2025 ja liiketoimintakatsaus Q1/2026, EmCe Solution Partner Oy:n tilinpäätös 2025, Taloushallintoliiton ohjelmistotutkimukset 2025 ja 2026, Microsoft Lifecycle. Liiketoimintakohtaiset luvut tarkentuvat ensimmäisen 30 päivän aikana.","eyebrow":"Edellytykset","title":"Mitä tarvitsen konsernilta","intro":""}},{"id":"ask-1","kind":"ask","parent_id":"sec-asks","position":1000,"data":{"lead":"Omistajastrategia EmCelle:","text":"kasvuliiketoiminta, konsernin palveluiden alusta vai kassavirtaliiketoiminta"}},{"id":"ask-2","kind":"ask","parent_id":"sec-asks","position":2000,"data":{"lead":"","text":"Onnistumisen mittarit ja aikajänne, jotka ohjaavat investointeja ja BC:n rakennetta"}},{"id":"ask-3","kind":"ask","parent_id":"sec-asks","position":3000,"data":{"lead":"","text":"Mandaatti hinnoitteluun, rekrytointeihin ja kehitysbudjettiin"}},{"id":"ask-4","kind":"ask","parent_id":"sec-asks","position":4000,"data":{"lead":"","text":"Käyttökate liiketoiminnoittain ja sisäiset veloitukset lähtötasoksi"}},{"id":"ask-5","kind":"ask","parent_id":"sec-asks","position":5000,"data":{"lead":"","text":"Pelisäännöt konsernikanavalle: tilitoimistot ja Silta"}}]$json$::jsonb) e;

  -- Tehtävien tilat ja muistiinpanot
  update public.bcc_items i set data = i.data || jsonb_build_object('status', coalesce(nullif(s.data->>'s', ''), 'todo'), 'note', coalesce(s.data->>'n', ''))
  from public.bcc_status s where i.plan_id = p and i.kind = 'task' and i.id = s.id;

  -- Lähtötilanteen luvut
  select data into st from public.bcc_status where id = 'lahtotilanne';
  if st is not null then
    for i in 1..4 loop
      update public.bcc_items set data = data
        || case when st ? ('v' || i) then jsonb_build_object('value', st->>('v' || i)) else '{}'::jsonb end
        || case when st ? ('l' || i) then jsonb_build_object('label', st->>('l' || i)) else '{}'::jsonb end
      where plan_id = p and id = 'stat-' || i;
    end loop;
  end if;

  -- Kasvutavoitteet
  select data into st from public.bcc_status where id = 'tavoitteet';
  if st is not null then
    update public.bcc_items set data = data || jsonb_strip_nulls(jsonb_build_object(
      'targetYear', st->>'h', 'totRev', st->>'tot_rev', 'cust', st->>'cust', 'churn', st->>'churn', 'nrr', st->>'nrr'))
    where plan_id = p and id = 'sec-goals';
    update public.bcc_items set data = data || jsonb_strip_nulls(jsonb_build_object(
      'rev', st->>'own_rev', 'g', st->>'own_g', 'm', st->>'own_m', 'arr', st->>'own_arr'))
    where plan_id = p and id = 'line-own';
    update public.bcc_items set data = data || jsonb_strip_nulls(jsonb_build_object(
      'rev', st->>'bc_rev', 'g', st->>'bc_g', 'm', st->>'bc_m', 'arr', st->>'bc_arr'))
    where plan_id = p and id = 'line-bc';
  end if;

  -- Mittarien ja riskien arviot
  select data into st from public.bcc_status where id = 'mittarit';
  if st is not null then
    update public.bcc_items set data = data || jsonb_build_object('state', st->>id)
    where plan_id = p and kind in ('row', 'risk') and st ? id;
  end if;

  -- Rakennepäätöksen valinta
  select data into st from public.bcc_status where id = 'eriyttaminen';
  if st is not null and coalesce(st->>'choice', '') <> '' then
    update public.bcc_items set data = data || jsonb_build_object('choice', 'opt-' || (st->>'choice'))
    where plan_id = p and id = 'sec-decision';
  end if;

  -- Vastuualueiden nimet, vastuuhenkilöt ja tehtävät
  select data into st from public.bcc_status where id = 'roolit';
  if st is not null then
    for k, v in select * from jsonb_each(st) where jsonb_typeof(value) = 'object' loop
      update public.bcc_items set data = data || jsonb_strip_nulls(jsonb_build_object('title', v->>'t', 'owner', v->>'o', 'mission', v->>'m'))
      where plan_id = p and id = 'role-' || k;
    end loop;
  end if;

  -- Scorecardien luvut ja itse lisätyt mittarit
  for k, st in select substr(id, 4), data from public.bcc_status where id like 'sc-%' loop
    update public.bcc_items i set data = i.data || jsonb_strip_nulls(jsonb_build_object(
        'base', st->(split_part(i.id, '-', 2))->>'b', 'target', st->(split_part(i.id, '-', 2))->>'t',
        'actual', st->(split_part(i.id, '-', 2))->>'a', 'state', st->(split_part(i.id, '-', 2))->>'s'))
    where i.plan_id = p and i.kind = 'metric' and i.parent_id = 'role-' || k;
    insert into public.bcc_items (plan_id, id, kind, parent_id, position, data)
    select p, k || '-' || e.key, 'metric', 'role-' || k, 100000 + row_number() over (order by e.key), jsonb_strip_nulls(jsonb_build_object(
      'name', coalesce(e.value->>'n', 'Uusi mittari'), 'cad', coalesce(e.value->>'r', 'kuukausi'),
      'base', e.value->>'b', 'target', e.value->>'t', 'actual', e.value->>'a', 'state', e.value->>'s'))
    from jsonb_each(st) e
    where e.key ~ '^x[0-9]+$' and exists (select 1 from public.bcc_items r where r.plan_id = p and r.id = 'role-' || k);
  end loop;
end $seed$;
