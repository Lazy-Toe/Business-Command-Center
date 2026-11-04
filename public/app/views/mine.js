// Omat: kirjautuneen henkilön tehtävät ja scorecardit kaikista suunnitelmista.
import { html, useEffect, useState } from "../../vendor/htm-preact.js";
import { Input, FACE, MOODNAME, ORDER, nextIn } from "../core/ui.js";
import { state, loadOverview, patchIn, linkMe, unlinkMe } from "../core/store.js";
import { buildMine } from "../core/mine.js";
import { todayISO, fmtLong } from "../core/today.js";
import { Group } from "./today.js";
import { PersonSelect } from "../people.js";

const planName = (id) => { const p = state.plans.find((x) => x.id === id); return p ? p.title : ""; };

function Metric({ m }) {
  const v = m.data, name = v.name || "";
  const cyc = () => patchIn(m.plan_id, m.id, { state: nextIn(ORDER, v.state) });
  return html`<tr class=${v.state ? "m-" + v.state : ""}>
    <td class="nmtd">${name}</td>
    <td class="cadtd">${v.cad || ""}</td>
    <td>${v.base || "–"}</td>
    <td>${v.target || "–"}</td>
    <td><${Input} maxlength="30" placeholder="–" aria-label=${name + ": toteuma"} value=${v.actual || ""}
      onChange=${(e) => patchIn(m.plan_id, m.id, { actual: e.target.value.trim().slice(0, 30) })} onKeyDown=${(e) => { if (e.key === "Enter") e.target.blur(); }} /></td>
    <td class="st clickable"><button type="button" class="stbtn" title="Vaihda tilaa" aria-label=${name + ": tila " + (MOODNAME[v.state] || "ei arviota")} onClick=${cyc}>${v.state ? html`<span class="moodv" dangerouslySetInnerHTML=${{ __html: FACE[v.state] }}></span>` : html`<span class="st-empty">–</span>`}</button></td>
  </tr>`;
}

function Scorecard({ sc, open }) {
  const r = sc.role;
  return html`<article class="mrole">
    <div class="mrhead">
      <div><h3>${r.data.title || "Vastuualue"}</h3><span class="tsub">${planName(sc.plan_id)}${r.data.mission ? " · " + r.data.mission : ""}</span></div>
      ${open ? html`<button type="button" class="barbtn" onClick=${() => open(sc.plan_id, r)}>Avaa suunnitelmassa</button>` : null}
    </div>
    ${sc.metrics.length ? html`<div class="gtable-wrap"><table class="gtable sctable">
      <thead><tr><th>Mittari</th><th>Rytmi</th><th>Lähtötaso</th><th>Tavoite</th><th>Toteuma</th><th>Tila</th></tr></thead>
      <tbody>${sc.metrics.map((m) => html`<${Metric} key=${m.id} m=${m} />`)}</tbody>
    </table></div>` : html`<p class="gs">Vastuualueella ei ole vielä mittareita.</p>`}
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
  const bad = R.scorecards.reduce((n, s) => n + s.metrics.filter((m) => m.data.state === "bad").length, 0);
  return html`<div class="wrap today">
    <header class="thead">
      <div><p class="eyebrow">Omat</p><h1>${me}</h1><p class="lede">${fmtLong(today)}${state.role === "member" ? "" : html` · <button type="button" class="linkbtn" onClick=${() => unlinkMe().catch(() => {})}>Vaihda henkilö</button>`}</p></div>
      <div class="ledger tcount" aria-label="Yhteenveto">
        <div class="stat-cell"><b class=${"num" + (R.late.length ? " neg" : "")}>${R.late.length}</b><span>myöhässä</span></div>
        <div class="stat-cell"><b class="num">${R.today.length}</b><span>tänään</span></div>
        <div class="stat-cell"><b class="num">${R.week.length}</b><span>seuraavat 7 päivää</span></div>
        <div class="stat-cell"><b class=${"num" + (bad ? " neg" : "")}>${bad}</b><span>mittaria huonolla</span></div>
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
