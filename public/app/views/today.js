// Etusivu: kaikkien suunnitelmien myöhässä olevat ja seuraavat tehtävät sekä huomiota vaativat luvut.
import { html, useEffect, useState } from "../../vendor/htm-preact.js";
import { ui, uiChanged } from "../core/ui.js";
import { state, loadOverview, patchIn } from "../core/store.js";
import { buildToday, todayISO, fmtLong } from "../core/today.js";
import { PersonSelect } from "../people.js";

const planName = (id) => { const p = state.plans.find((x) => x.id === id); return p ? p.title : ""; };

function markDone(t) {
  const prev = t.data.status || "todo";
  patchIn(t.plan_id, t.id, { status: "done" });
  ui.undo = { label: "Merkitty valmiiksi: " + (t.data.title || "tehtävä"), run: () => patchIn(t.plan_id, t.id, { status: prev }) };
  uiChanged();
}

export function Row({ t, open, late }) {
  return html`<li class=${"trow" + (late ? " late" : "")} style=${{ "--c": "var(--ws-" + ((t.stream && t.stream.data.color) || "ihmiset") + ")" }}>
    <button type="button" class="tcheck" title="Merkitse valmiiksi" aria-label=${"Merkitse valmiiksi: " + (t.data.title || "tehtävä")} onClick=${() => markDone(t)}></button>
    <div class="tmain">
      <button type="button" class="ttitle" title="Avaa suunnitelmassa" onClick=${() => open(t.plan_id, t)}>${t.data.title || "Nimetön tehtävä"}</button>
      <span class="tsub">${planName(t.plan_id)}${t.stream ? " · " + t.stream.data.label : ""}${t.data.status === "doing" ? " · käynnissä" : ""}</span>
    </div>
    <div class="tfields">
      <label class="tfield"><span>Vastuu</span><${PersonSelect} label=${"Vastuu: " + (t.data.title || "")} value=${t.data.owner || ""} empty=${t.owner ? "Perii: " + t.owner : "Ei vastuuhenkilöä"} onPick=${(v) => patchIn(t.plan_id, t.id, { owner: v })} /></label>
      <label class="tfield"><span>Määräpäivä</span><input type="date" value=${t.data.due || ""} aria-label=${"Määräpäivä: " + (t.data.title || "")} onChange=${(e) => patchIn(t.plan_id, t.id, { due: e.target.value })} /></label>
    </div>
  </li>`;
}

export function Group({ title, list, open, late, hint }) {
  if (!list.length) return null;
  return html`<section class="tgroup"><h2>${title} <span class="num">${list.length}</span></h2>${hint ? html`<p class="gs">${hint}</p>` : null}
    <ul class="tlist">${list.map((t) => html`<${Row} key=${t.plan_id + t.id} t=${t} open=${open} late=${late} />`)}</ul></section>`;
}

const ATT_LABEL = { row: "Mittari", metric: "Scorecard", risk: "Riski" };
function Attention({ list, open }) {
  return html`<aside class="tattn" aria-label="Vaatii huomiota">
    <h2>Vaatii huomiota <span class="num">${list.length}</span></h2>
    ${list.length ? html`<ul>${list.map((a) => html`<li key=${a.plan_id + a.id}>
      <button type="button" onClick=${() => open(a.plan_id, a)}>
        <span class="attk">${ATT_LABEL[a.kind]}${a.kind === "risk" ? " · taso 2" : " · huono"}</span>
        <b>${a.data.name || "Nimetön"}</b>
        <span class="tsub">${planName(a.plan_id)}${a.role ? " · " + a.role.data.title : ""}${a.owner ? " · " + a.owner : ""}</span>
      </button></li>`)}</ul>` : html`<p class="gs">Ei huonoksi arvioituja mittareita tai tason 2 riskejä.</p>`}
  </aside>`;
}

export function TodayView({ open }) {
  const [owner, setOwner] = useState("");
  const [plan, setPlanState] = useState(() => { try { return localStorage.getItem("bcc-today-plan") || ""; } catch (e) { return ""; } });
  const setPlan = (v) => { setPlanState(v); try { localStorage.setItem("bcc-today-plan", v); } catch (e) { /* ei pakollinen */ } };
  const [showAll, setShowAll] = useState(false);
  useEffect(() => { state.overviewActive = true; loadOverview(); return () => { state.overviewActive = false; }; }, []);
  const today = todayISO();
  const ov = state.overview;
  if (!ov) return html`<div class="wrap today"><p class="gs">${state.overviewError || "Ladataan…"}</p></div>`;
  const planOk = !plan || state.plans.some((p) => p.id === plan);
  const R = buildToday(ov.items, today, { owner, plan: planOk ? plan : "" });
  const clear = !R.late.length && !R.today.length && !R.week.length;
  return html`<div class="wrap today">
    <header class="thead">
      <div><p class="eyebrow">Johtamisen keskipiste</p><h1>Tänään</h1><p class="lede">${fmtLong(today)}</p></div>
      <div class="ledger tcount" aria-label="Yhteenveto">
        <div class="stat-cell"><b class=${"num" + (R.late.length ? " neg" : "")}>${R.late.length}</b><span>myöhässä</span></div>
        <div class="stat-cell"><b class="num">${R.today.length}</b><span>tänään</span></div>
        <div class="stat-cell"><b class="num">${R.week.length}</b><span>seuraavat 7 päivää</span></div>
        <div class="stat-cell"><b class=${"num" + (R.attention.length ? " neg" : "")}>${R.attention.length}</b><span>vaatii huomiota</span></div>
      </div>
    </header>
    <div class="tfilters">
      <label class="gyear">Vastuu <select value=${owner} onChange=${(e) => setOwner(e.target.value)}><option value="">Kaikki</option>${R.owners.map((o) => html`<option key=${o} value=${o}>${o}</option>`)}</select></label>
      ${state.plans.length > 1 ? html`<label class="gyear">Suunnitelma <select value=${planOk ? plan : ""} onChange=${(e) => setPlan(e.target.value)}><option value="">Kaikki</option>${state.plans.map((p) => html`<option key=${p.id} value=${p.id}>${p.title}</option>`)}</select></label>` : null}
      ${state.overviewError ? html`<span class="savestate bad">${state.overviewError}</span>` : null}
    </div>
    <div class="tgrid">
      <div class="tcol-main">
        ${clear ? html`<p class="tclear">${R.noDate.length || R.doing.length ? "Ei määräpäiviä seuraavalle viikolle. Anna tärkeimmille tehtäville päivä, niin ne nousevat tähän." : "Ei avoimia tehtäviä."}</p>` : null}
        <${Group} title="Myöhässä" list=${R.late} open=${open} late=${true} />
        <${Group} title="Tänään" list=${R.today} open=${open} />
        <${Group} title="Seuraavat 7 päivää" list=${R.week} open=${open} />
        <${Group} title="Käynnissä ilman päivää" list=${R.doing} open=${open} />
        <${Group} title="Myöhemmin" list=${R.later} open=${open} />
        ${R.noDate.length ? html`<section class="tgroup"><h2><button type="button" class="ctog" aria-expanded=${showAll ? "true" : "false"} onClick=${() => setShowAll(!showAll)}>Ei määräpäivää <span class="num">${R.noDate.length}</span><span class="chev" aria-hidden="true" style=${showAll ? null : { transform: "rotate(-45deg)" }}></span></button></h2>
          ${showAll ? html`<ul class="tlist">${R.noDate.map((t) => html`<${Row} key=${t.plan_id + t.id} t=${t} open=${open} />`)}</ul>` : null}</section>` : null}
      </div>
      <${Attention} list=${R.attention} open=${open} />
    </div>
  </div>`;
}
