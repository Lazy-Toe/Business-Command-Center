// Omat: kirjautuneen henkilön tehtävät ja scorecardit kaikista suunnitelmista.
import { html, useEffect, useState } from "../../vendor/htm-preact.js";
import { Input } from "../core/ui.js";
import { state, loadOverview, patchIn, setRowIn, linkMe, unlinkMe } from "../core/store.js";
import { fmt } from "../core/calc.js";
import { periodText, totals } from "../core/scorecard.js";
import { buildMine } from "../core/mine.js";
import { todayISO, fmtLong } from "../core/today.js";
import { Group } from "./today.js";
import { PersonSelect } from "../people.js";

const planName = (id) => { const p = state.plans.find((x) => x.id === id); return p ? p.title : ""; };

const save = (sc, row, data) => setRowIn(sc.plan_id, row, data);

// Tavoiterivi: mallin tavoite ja rajat luetaan, toteuma kirjataan. Tulos tulee mallin kaavasta.
function GoalRow({ sc, x }) {
  const { def, row, score } = x, name = def.data.name || "Nimetön";
  return html`<tr class=${score.below ? "m-bad" : ""}>
    <td class="nmtd">${name}</td>
    <td class="gs">${periodText(score.start, score.end) || "–"}</td>
    <td class="num">${score.target || "–"}</td><td class="num">${score.min || "–"}</td><td class="num">${score.max || "–"}</td>
    <td><${Input} maxlength="30" placeholder="–" aria-label=${name + ": toteuma"} value=${row.data.actual || ""}
      onChange=${(e) => save(sc, row, { actual: e.target.value.trim().slice(0, 30) })} onKeyDown=${(e) => { if (e.key === "Enter") e.target.blur(); }} /></td>
    <td class="num" title=${score.error || ""}>${score.error ? "Kaavavirhe" : fmt(score.result, 2)}</td>
    <td class="num">${score.weight ? score.weight + " %" : "–"}</td>
    <td class="num">${fmt(score.weighted, 3)}</td>
  </tr>`;
}

function FreeRow({ sc, m }) {
  const v = m.data, name = v.name || "";
  return html`<tr><td class="nmtd">${name}</td><td class="gs">${v.cad || ""}</td><td class="num">${v.base || "–"}</td><td class="num">${v.target || "–"}</td>
    <td><${Input} maxlength="30" placeholder="–" aria-label=${name + ": toteuma"} value=${v.actual || ""}
      onChange=${(e) => patchIn(sc.plan_id, m.id, { actual: e.target.value.trim().slice(0, 30) })} onKeyDown=${(e) => { if (e.key === "Enter") e.target.blur(); }} /></td></tr>`;
}

function Scorecard({ sc, open }) {
  const r = sc.role, t = totals(sc.rows);
  return html`<article class="mrole">
    <div class="mrhead">
      <div><h3>${r.data.title || "Vastuualue"}</h3><span class="tsub">${planName(sc.plan_id)}${r.data.mission ? " · " + r.data.mission : ""}</span>
        ${t.count ? html`<p class="final">Lopputulos <b>${fmt(t.weighted, 3)}</b><span class="gs"> · painot yhteensä ${fmt(t.weight, 0)} %</span></p>` : null}</div>
      ${open ? html`<button type="button" class="barbtn" onClick=${() => open(sc.plan_id, r)}>Avaa suunnitelmassa</button>` : null}
    </div>
    ${sc.rows.length ? html`<div class="gtable-wrap"><table class="gtable sctable">
      <thead><tr><th>Tavoite</th><th>Jakso</th><th>Tavoite</th><th>Alaraja</th><th>Yläraja</th><th>Toteuma</th><th>Tulos</th><th>Paino</th><th>Painotettu</th></tr></thead>
      <tbody>${sc.rows.map((x) => html`<${GoalRow} key=${x.def.id} sc=${sc} x=${x} />`)}</tbody>
      ${t.count ? html`<tfoot><tr><td colspan="7"><b>Lopputulos</b></td><td class="num">${fmt(t.weight, 0)}</td><td class="num"><b>${fmt(t.weighted, 3)}</b></td></tr></tfoot>` : null}
    </table></div>` : null}
    ${sc.free.length ? html`<div class="gtable-wrap"><table class="gtable sctable">
      <thead><tr><th>Oma mittari</th><th>Rytmi</th><th>Lähtötaso</th><th>Tavoite</th><th>Toteuma</th></tr></thead>
      <tbody>${sc.free.map((m) => html`<${FreeRow} key=${m.id} sc=${sc} m=${m} />`)}</tbody></table></div>` : null}
    ${!sc.rows.length && !sc.free.length ? html`<p class="gs">Vastuualueella ei ole vielä tavoitteita.</p>` : null}
  </article>`;
}

// Kirjautuminen liitetään henkilöön kerran. Sen jälkeen näkymä kohdistuu automaattisesti.
function WhoAmI({ error }) {
  const [msg, setMsg] = useState("");
  if (state.role === "member") {
    return html`<div class="wrap today"><header class="thead"><div><p class="eyebrow">Omat</p><h1>Ei vielä käytössä</h1></div></header>
      <div class="whoami"><p>Kirjautumistasi${state.email ? " (" + state.email + ")" : ""} ei ole vielä liitetty henkilöön. Pyydä ylläpitäjää liittämään se, niin tehtäväsi ja scorecardisi näkyvät tässä.</p></div></div>`;
  }
  const pick = async (name) => {
    if (!name) return;
    try { setMsg(""); await linkMe(name); } catch (e) { setMsg(e.body && e.body.error === "person_taken" ? "Henkilö on jo liitetty toiseen kirjautumiseen." : "Liittäminen ei onnistunut (" + e.message + ")."); }
  };
  return html`<div class="wrap today">
    <header class="thead"><div><p class="eyebrow">Omat</p><h1>Kuka olet?</h1></div></header>
    <div class="whoami">
      <p>Liitä kirjautumisesi${state.email ? " (" + state.email + ")" : ""} henkilöön. Sen jälkeen tämä näkymä näyttää vain sinun tehtäväsi ja scorecardisi kaikista suunnitelmista.</p>
      <${PersonSelect} cls="whosel" canAdd=${true} label="Valitse henkilö" value="" empty="Valitse henkilö" onPick=${pick} />
      ${msg ? html`<p class="gs bad">${msg}</p>` : null}
      ${error ? html`<p class="gs bad">${error}</p>` : null}
    </div>
  </div>`;
}

export function MineView({ open: openIn }) {
  const open = state.role === "member" ? null : openIn;
  useEffect(() => { state.overviewActive = true; loadOverview(); return () => { state.overviewActive = false; }; }, []);
  const [showAll, setShowAll] = useState(false);
  const me = state.people.me, ov = state.overview;
  if (!state.people.loaded && !state.people.error) return html`<div class="wrap today"><p class="gs">Ladataan…</p></div>`;
  if (!me) return html`<${WhoAmI} error=${state.people.error} />`;
  if (!ov) return html`<div class="wrap today"><p class="gs">${state.overviewError || "Ladataan…"}</p></div>`;
  const today = todayISO(), R = buildMine(ov.items, me, today);
  const bad = R.below;
  return html`<div class="wrap today">
    <header class="thead">
      <div><p class="eyebrow">Omat</p><h1>${me}</h1><p class="lede">${fmtLong(today)}${state.role === "member" ? "" : html` · <button type="button" class="linkbtn" onClick=${() => unlinkMe().catch(() => {})}>Vaihda henkilö</button>`}</p></div>
      <div class="ledger tcount" aria-label="Yhteenveto">
        <div class="stat-cell"><b class=${"num" + (R.late.length ? " neg" : "")}>${R.late.length}</b><span>myöhässä</span></div>
        <div class="stat-cell"><b class="num">${R.today.length}</b><span>tänään</span></div>
        <div class="stat-cell"><b class="num">${R.week.length}</b><span>seuraavat 7 päivää</span></div>
        <div class="stat-cell"><b class=${"num" + (bad ? " neg" : "")}>${bad}</b><span>mittaria alle alarajan</span></div>
      </div>
    </header>
    ${state.overviewError ? html`<span class="savestate bad">${state.overviewError}</span>` : null}
    <div class="tcol-main">
      <section class="tgroup"><h2>Scorecard <span class="num">${R.scorecards.length}</span></h2>
        ${R.scorecards.length ? R.scorecards.map((s) => html`<${Scorecard} key=${s.plan_id + s.role.id} sc=${s} open=${open} />`) : html`<p class="gs">Sinulla ei ole vastuualuetta. Valitse itsesi vastuuhenkilöksi vastuualueen otsikossa, niin scorecard näkyy tässä.</p>`}
      </section>
      ${!R.open ? html`<p class="tclear">Ei sinulle osoitettuja avoimia tehtäviä.</p>` : null}
      <${Group} title="Myöhässä" list=${R.late} open=${open} late=${true} />
      <${Group} title="Tänään" list=${R.today} open=${open} />
      <${Group} title="Seuraavat 7 päivää" list=${R.week} open=${open} />
      <${Group} title="Käynnissä ilman päivää" list=${R.doing} open=${open} />
      <${Group} title="Myöhemmin" list=${R.later} open=${open} />
      ${R.noDate.length ? html`<section class="tgroup"><h2><button type="button" class="ctog" aria-expanded=${showAll ? "true" : "false"} onClick=${() => setShowAll(!showAll)}>Ei määräpäivää <span class="num">${R.noDate.length}</span><span class="chev" aria-hidden="true" style=${showAll ? null : { transform: "rotate(-45deg)" }}></span></button></h2></section>` : null}
      ${showAll ? html`<${Group} title="" list=${R.noDate} open=${open} />` : null}
    </div>
  </div>`;
}
