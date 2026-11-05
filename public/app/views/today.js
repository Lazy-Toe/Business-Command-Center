// Etusivu: kaikkien suunnitelmien myöhässä olevat ja seuraavat tehtävät sekä huomiota vaativat luvut.
import { html, useEffect, useState } from "../../vendor/htm-preact.js";
import { ui, uiChanged, DueInput } from "../core/ui.js";
import { state, loadOverview, patchIn } from "../core/store.js";
import { buildToday, todayISO, fmtLong, inPeriod, byDueFirst, monthGrid, monthLabel } from "../core/today.js";
import { taskRows } from "../core/tasks-table.js";
import { PersonSelect } from "../people.js";
import { TaskTable } from "../tasktable.js";

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
      ${open ? html`<button type="button" class="ttitle" title="Avaa suunnitelmassa" onClick=${() => open(t.plan_id, t)}>${t.data.title || "Nimetön tehtävä"}</button>` : html`<span class="ttitle">${t.data.title || "Nimetön tehtävä"}</span>`}
      <span class="tsub">${planName(t.plan_id)}${t.stream ? " · " + t.stream.data.label : ""}${t.data.status === "doing" ? " · käynnissä" : ""}</span>
    </div>
    <div class="tfields">
      <label class="tfield"><span>Vastuu</span>${state.role === "member" ? html`<span class="tfixed">${t.owner || ""}</span>` : html`<${PersonSelect} label=${"Vastuu: " + (t.data.title || "")} value=${t.data.owner || ""} empty="Ei vastuuhenkilöä" onPick=${(v) => patchIn(t.plan_id, t.id, { owner: v })} />`}</label>
      <label class="tfield"><span>Lopetus</span><${DueInput} value=${t.data.due} aria-label=${"Lopetus: " + (t.data.title || "")} onSave=${(v) => patchIn(t.plan_id, t.id, { due: v })} /></label>
    </div>
  </li>`;
}

export function Group({ title, list, open, late, hint }) {
  if (!list.length) return null;
  return html`<section class="tgroup"><h2>${title} <span class="num">${list.length}</span></h2>${hint ? html`<p class="gs">${hint}</p>` : null}
    <ul class="tlist">${list.map((t) => html`<${Row} key=${t.plan_id + t.id} t=${t} open=${open} late=${late} />`)}</ul></section>`;
}

const ATT_LABEL = { row: "Mittari", metric: "Scorecard", risk: "Riski", form: "Ehdotus" };
function Attention({ list, open }) {
  return html`<aside class="tattn" aria-label="Vaatii huomiota">
    <h2>Vaatii huomiota <span class="num">${list.length}</span></h2>
    ${list.length ? html`<ul>${list.map((a) => html`<li key=${a.plan_id + a.id}>
      <button type="button" onClick=${() => open(a.plan_id, a)}>
        <span class="attk">${ATT_LABEL[a.kind]}${a.kind === "risk" ? " · taso 2" : a.kind === "metric" ? " · alle alarajan" : a.kind === "form" ? " · avoin" : " · huono"}</span>
        <b>${a.title || a.data.name || "Nimetön"}</b>
        <span class="tsub">${planName(a.plan_id)}${a.role ? " · " + a.role.data.title : ""}${a.owner ? " · " + a.owner : ""}</span>
      </button></li>`)}</ul>` : html`<p class="gs">Ei huonoksi arvioituja mittareita tai tason 2 riskejä.</p>`}
  </aside>`;
}

const lsGet = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ei pakollinen */ } };
const WEEKDAYS = ["Ma", "Ti", "Ke", "To", "Pe", "La", "Su"];
const monthKey = (today, i) => { const [y, m] = today.slice(0, 7).split("-").map(Number), t = y * 12 + (m - 1) + i; return Math.floor(t / 12) + "-" + String((t % 12) + 1).padStart(2, "0"); };

// Kuukausinäkymä: päivän tehtävät nimeltä, myöhässä punaisella.
function Calendar({ list, today, open }) {
  const [cur, setCur] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }));
  const move = (d) => setCur((c) => { const t = c.y * 12 + (c.m - 1) + d; return { y: Math.floor(t / 12), m: (t % 12) + 1 }; });
  const weeks = monthGrid(list, cur.y, cur.m), key = cur.y + "-" + String(cur.m).padStart(2, "0");
  return html`<div class="accal">
    <div class="accal-nav"><button type="button" class="barbtn" aria-label="Edellinen kuukausi" onClick=${() => move(-1)}>‹</button><b>${monthLabel(key)}</b><button type="button" class="barbtn" aria-label="Seuraava kuukausi" onClick=${() => move(1)}>›</button>
      <button type="button" class="barbtn" onClick=${() => setCur({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) })}>Tänään</button></div>
    <div class="accal-grid">${WEEKDAYS.map((d) => html`<div key=${d} class="accal-wd">${d}</div>`)}
      ${weeks.flat().map((d) => html`<div key=${d.date} class=${"accal-day" + (d.inMonth ? "" : " out") + (d.date === today ? " today" : "")}>
        <span class="accal-n">${Number(d.date.slice(8))}</span>
        ${d.tasks.slice(0, 4).map((t) => html`<button type="button" key=${t.plan_id + t.id} class=${"accal-t" + (d.date < today ? " late" : "")} style=${{ "--c": "var(--ws-" + ((t.stream && t.stream.data.color) || "ihmiset") + ")" }} title=${t.data.title} onClick=${() => open && open(t.plan_id, t)}>${t.data.title || "Nimetön"}</button>`)}
        ${d.tasks.length > 4 ? html`<span class="gs">+${d.tasks.length - 4} muuta</span>` : null}</div>`)}</div>
  </div>`;
}

export function TodayView({ open }) {
  const [owner, setOwner] = useState("");
  const [plan, setPlanState] = useState(() => lsGet("bcc-today-plan", ""));
  const setPlan = (v) => { setPlanState(v); lsSet("bcc-today-plan", v); };
  const [period, setPeriodState] = useState(() => lsGet("bcc-today-period", "todo"));
  const setPeriod = (v) => { setPeriodState(v); lsSet("bcc-today-period", v); };
  const [mode, setModeState] = useState(() => (lsGet("bcc-today-mode", "list") === "cal" ? "cal" : "list"));
  const setMode = (v) => { setModeState(v); lsSet("bcc-today-mode", v); };
  useEffect(() => { state.overviewActive = true; loadOverview(); return () => { state.overviewActive = false; }; }, []);
  const today = todayISO();
  const ov = state.overview;
  if (!ov) return html`<div class="wrap today"><p class="gs">${state.overviewError || "Ladataan…"}</p></div>`;
  const planOk = !plan || state.plans.some((p) => p.id === plan);
  const R = buildToday(ov.items, today, { owner, plan: planOk ? plan : "" });
  const all = [...R.late, ...R.today, ...R.week, ...R.later, ...R.doing, ...R.noDate].sort(byDueFirst);
  const periods = [["todo", "Aikataulutetut"], ["late", "Myöhässä"], ["today", "Tänään"], ["tomorrow", "Huomenna"], ["week", "Tämä viikko"], ["nextweek", "Ensi viikko"],
    ...[0, 1, 2].map((i) => { const k = monthKey(today, i); return ["m:" + k, monthLabel(k).split(" ")[0]]; }), ["none", "Ei päivää"]];
  // Lista: sama taulukko ja massamuutokset kuin Tehtävät-näkymässä (TaskTable). Vain avoimet tehtävät, rajattuna vastuulla, suunnitelmalla ja jaksolla.
  const open_ = taskRows(ov.items, state.plans).filter((r) => r.status !== "done" && (!owner || r.owner === owner) && (!planOk || !plan || r.plan_id === plan));
  const inP = (r, k) => inPeriod({ data: { due: r.due } }, k, today);
  const rowsAll = open_.slice().sort((a, b) => (a.due ? (b.due ? (a.due < b.due ? -1 : a.due > b.due ? 1 : 0) : -1) : b.due ? 1 : 0));
  const count = (k) => rowsAll.filter((r) => inP(r, k)).length, listRows = rowsAll.filter((r) => inP(r, period));
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
    <div class="actoolbar">
      <div class="acviews" role="group" aria-label="Näkymä"><button type="button" class=${mode === "list" ? "on" : ""} aria-pressed=${mode === "list" ? "true" : "false"} onClick=${() => setMode("list")}>Lista</button><button type="button" class=${mode === "cal" ? "on" : ""} aria-pressed=${mode === "cal" ? "true" : "false"} onClick=${() => setMode("cal")}>Kalenteri</button></div>
      <span class="grow"></span>
      <b class="account">${mode === "list" ? listRows.length : all.filter((t) => t.data.due).length} tehtävää</b>
      <label class="gyear">Vastuu <select value=${owner} onChange=${(e) => setOwner(e.target.value)}><option value="">Kaikki</option>${R.owners.map((o) => html`<option key=${o} value=${o}>${o}</option>`)}</select></label>
      ${state.plans.length > 1 ? html`<label class="gyear">Suunnitelma <select value=${planOk ? plan : ""} onChange=${(e) => setPlan(e.target.value)}><option value="">Kaikki</option>${state.plans.map((p) => html`<option key=${p.id} value=${p.id}>${p.title}</option>`)}</select></label>` : null}
      ${state.overviewError ? html`<span class="savestate bad">${state.overviewError}</span>` : null}
    </div>
    ${mode === "list" ? html`<div class="acperiods" role="group" aria-label="Jakso">${periods.map(([k, l]) => html`<button type="button" key=${k} class=${period === k ? "on" : ""} aria-pressed=${period === k ? "true" : "false"} onClick=${() => setPeriod(k)}>${l} <span class="num">${count(k)}</span></button>`)}</div>` : null}
    <div class="tgrid full">
      <div class="tcol-main">
        ${mode === "cal" ? html`<${Calendar} list=${all} today=${today} open=${open} />`
          : html`<${TaskTable} groups=${[{ key: "", label: "", rows: listRows }]} by="" allRows=${rowsAll} items=${ov.items} open=${open} today=${today}
              hint='Klikkaa arvoa muuttaaksesi yhden tehtävän. Sarakkeen "Kaikille" muuttaa kaikki näkyvät tehtävät (rajaa ensin jaksolla) tai valitut rivit.' emptyText=${rowsAll.length ? "Ei tehtäviä tällä valinnalla." : "Ei avoimia tehtäviä."} />`}
      </div>
      <${Attention} list=${R.attention} open=${open} />
    </div>
  </div>`;
}
