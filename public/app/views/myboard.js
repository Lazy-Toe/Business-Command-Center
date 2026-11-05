// Oma työpöytä: omat tehtävät samoina korteina ja samassa vaihe × työvirta -asettelussa kuin suunnitelman taulussa.
import { html, useState } from "../../vendor/htm-preact.js";
import { pressable, mq, DueInput } from "../core/ui.js";
import { state, patchIn } from "../core/store.js";
import { fmtDate, isLate, todayISO } from "../core/today.js";
import { PersonSelect } from "../people.js";
import { LABEL, NEXT, CAL_ICON, phaseClass, wsColor } from "../modules/plan.js";

function Card({ t, planId, color, tag, member }) {
  const [meta, setMeta] = useState(false);
  const st = LABEL[t.data.status] ? t.data.status : "todo", late = isLate(t, todayISO());
  const save = (data) => patchIn(planId, t.id, data);
  const stop = (e) => e.stopPropagation();
  return html`<div class=${"item clickable s-" + st} style=${{ "--c": color }} ...${pressable(() => save({ status: NEXT[st] }))} title=${LABEL[st] + " · klikkaa vaihtaaksesi"} aria-label=${(t.data.title || "") + ": " + LABEL[st]}>
    ${tag ? html`<span class="mtag">${tag}</span>` : null}
    <p class="it">${t.data.title || "Nimetön tehtävä"}</p>
    ${t.data.detail ? html`<p class="io">${t.data.detail}</p>` : null}
    ${t.data.due ? html`<span class="taskinfo"><span class=${"duechip" + (late ? " late" : "")}>${late ? "Myöhässä · " : ""}${fmtDate(t.data.due)}</span></span>` : null}
    <button type="button" class=${"dbtn" + (t.data.due ? " has" : "")} title="Määräpäivä" aria-label="Määräpäivä" aria-expanded=${meta ? "true" : "false"} onClick=${(e) => { stop(e); setMeta(!meta); }}>${CAL_ICON}</button>
    ${meta ? html`<span class="taskmeta" onClick=${stop} onKeyDown=${stop}>
      <label>Määräpäivä <${DueInput} value=${t.data.due} onSave=${(v) => save({ due: v })} /></label>
      ${member ? null : html`<label>Vastuu <${PersonSelect} label="Vastuu" value=${t.data.owner || ""} onPick=${(v) => save({ owner: v })} /></label>`}
    </span>` : null}
    ${t.data.note ? html`<p class="inote">${t.data.note}</p>` : null}
  </div>`;
}

function Board({ b, title, open, member }) {
  const small = mq("(max-width: 900px)");
  const [focus, setFocus] = useState(b.focus);
  // wide: vaihe, joka on avattu koko taulun leveydelle (tietokoneella). Pienellä näytöllä vaiheen otsikko vain korostaa vaihetta.
  const [wide, setWide] = useState("");
  const toggle = (id) => (small ? setFocus((f) => (f === id ? "" : id)) : setWide((w) => (w === id ? "" : id)));
  const n = b.phases.length;
  const head = (ph, i) => {
    const dim = !wide && focus && focus !== ph.id, open = wide === ph.id;
    return html`<div key=${ph.id} class=${"mh clickable " + phaseClass(i, n) + (dim ? " dim" : "") + (open ? " open" : "")} ...${pressable(() => toggle(ph.id))} title=${small ? "Korosta tai poista korostus" : open ? "Palaa kaikkiin vaiheisiin" : "Avaa koko leveydelle"}>
      <span class="d">${ph.label}</span><span class="t">${ph.title}</span></div>`;
  };
  const wideIdx = b.phases.findIndex((p) => p.id === wide), wideLanes = wideIdx >= 0 ? b.lanes.filter((l) => l.cells[wide].length) : [];
  const wideBody = wideIdx < 0 ? null : html`<div>
    <div class="phasetabs" role="group" aria-label="Vaihe">
      ${b.phases.map((p, i) => html`<button key=${p.id} type="button" class="chip" aria-pressed=${p.id === wide ? "true" : "false"} onClick=${() => setWide(p.id)}>${p.title} <span class="num">${b.phaseCounts[p.id] || 0}</span></button>`)}
      <button type="button" class="clear" onClick=${() => setWide("")}>Näytä kaikki vaiheet</button>
    </div>
    <div class="matrix wide" style=${{ gridTemplateColumns: "210px minmax(0, 1fr)" }}>
      <div class="corner"></div>
      ${head(b.phases[wideIdx], wideIdx)}
      ${wideLanes.map((l) => [
        html`<div key=${l.id} class="rl" style=${{ "--c": wsColor({ data: l }) }}><span class="dot"></span><span class="rlt"><span class="rln">${l.label || "Tehtävät"}</span><span class="gs">${l.cells[wide].length} avointa</span></span></div>`,
        html`<div key=${l.id + "w"} class="cell wide">${l.cells[wide].map((t) => html`<${Card} key=${t.id} t=${t} planId=${b.plan_id} color=${wsColor({ data: l })} member=${member} />`)}</div>`
      ])}
      ${wideLanes.length ? null : html`<div class="gs" style=${{ gridColumn: "1 / -1", padding: "16px" }}>Ei avoimia tehtäviä tässä vaiheessa.</div>`}
    </div></div>`;
  const body = !small && wideBody ? wideBody : small
    ? html`<div>${b.phases.map((ph, i) => {
      const list = b.lanes.flatMap((l) => l.cells[ph.id].map((t) => ({ t, l })));
      return html`<div key=${ph.id} class=${"mphase" + (focus && focus !== ph.id ? " dim" : "")}>${head(ph, i)}
        <div class="mlist">${list.length ? list.map(({ t, l }) => html`<${Card} key=${t.id} t=${t} planId=${b.plan_id} color=${wsColor({ data: l })} tag=${l.label} member=${member} />`) : html`<p class="gs">Ei avoimia tehtäviä.</p>`}</div></div>`;
    })}</div>`
    : html`<div class="matrix" style=${{ gridTemplateColumns: "210px repeat(" + Math.max(n, 1) + ", minmax(0, 1fr))" }}>
      <div class="corner"></div>
      ${b.phases.map(head)}
      ${b.lanes.map((l) => [
        html`<div key=${l.id} class=${"rl" + (false ? " dim" : "")} style=${{ "--c": wsColor({ data: l }) }}><span class="dot"></span><span class="rlt"><span class="rln">${l.label || "Tehtävät"}</span><span class="gs">${l.count} avointa</span></span></div>`,
        ...b.phases.map((ph) => html`<div key=${l.id + ph.id} class=${"cell" + (focus && focus !== ph.id ? " dim" : "")}>
          ${l.cells[ph.id].map((t) => html`<${Card} key=${t.id} t=${t} planId=${b.plan_id} color=${wsColor({ data: l })} member=${member} />`)}</div>`)
      ])}
    </div>`;
  return html`<section class="tgroup myboard">
    <h2>${title} <span class="num">${b.open}</span>${b.done ? html`<span class="gs"> · ${b.done} valmista</span>` : null}
      ${open && b.firstTask ? html`<button type="button" class="barbtn" onClick=${() => open(b.plan_id, { id: b.firstTask.id, kind: "task", parent_id: b.firstTask.parent_id })}>Avaa suunnitelmassa</button>` : null}</h2>
    ${b.lanes.length ? html`<div class="matrix-wrap">${body}</div>` : html`<p class="tclear">Kaikki tehtävät tässä suunnitelmassa on tehty.</p>`}
  </section>`;
}

export function MyBoards({ boards, open }) {
  const member = state.role === "member";
  const name = (id) => { const p = state.plans.find((x) => x.id === id); return p ? p.title : ""; };
  return boards.map((b) => html`<${Board} key=${b.plan_id} b=${b} title=${(boards.length > 1 ? name(b.plan_id) : "Tehtävät") || "Tehtävät"} open=${open} member=${member} />`);
}
