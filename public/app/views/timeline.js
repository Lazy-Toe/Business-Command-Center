// Aikajana: viikot sarakkeina, tehtävä palkkina aloituksesta lopetukseen. Aloituksen ja lopetuksen muokkaus samalla valikolla kuin Tehtävät-taulukossa.
import { html } from "../../vendor/htm-preact.js";
import { state } from "../core/store.js";
import { taskRows, periodOptions } from "../core/tasks-table.js";
import { fmtSpan, fmtStart, fmtDue, monthLabel } from "../core/today.js";
import { timelineModel } from "../core/weekboard.js";
import { FieldMenu, applyChange } from "../fieldmenu.js";

const INFO = 330, COL = 52;
const color = (lane) => "var(--ws-" + (lane.data.color || "ihmiset") + ")";

export function Timeline({ tasks, today, by, open, onMsg }) {
  const model = timelineModel(tasks, today, by), rowsBy = new Map(taskRows(state.overview ? state.overview.items : [], state.plans).map((r) => [r.key, r]));
  const periods = periodOptions(today), names = [];
  const apply = (change, what, rows) => { const r = applyChange(change, what, rows); if (r.error && onMsg) onMsg(r.error); };
  const menu = (t, field, text, extra) => { const row = rowsBy.get(t.plan_id + "/" + t.id); return row ? html`<${FieldMenu} field=${field} title=${text + " ▾"} rows=${[row]} scope="vain tätä tehtävää" names=${names} periods=${periods} apply=${apply} applyPatches=${() => {}} cls=${"cell" + (extra || "")} />` : null; };
  const n = model.weeks.length, nowIdx = model.weeks.findIndex((w) => w.now), width = INFO + n * COL;
  const grid = { gridTemplateColumns: INFO + "px repeat(" + n + ", " + COL + "px)", minWidth: width + "px" };
  const lines = { backgroundImage: (nowIdx >= 0 ? "linear-gradient(var(--accent-soft), var(--accent-soft)), " : "") + "repeating-linear-gradient(to right, transparent 0, transparent " + (COL - 1) + "px, var(--line) " + (COL - 1) + "px, var(--line) " + COL + "px)",
    backgroundSize: (nowIdx >= 0 ? COL + "px 100%, " : "") + (n * COL) + "px 100%", backgroundPosition: (nowIdx >= 0 ? INFO + nowIdx * COL + "px 0, " : "") + INFO + "px 0", backgroundRepeat: "no-repeat" };
  const info = (t, lane) => html`<div class="tl-info"><button type="button" class="ttitle" title=${t.data.title || ""} onClick=${() => open && open(t.plan_id, t)}>${t.data.title || "Nimetön tehtävä"}</button>
    <span class="tl-menus">${menu(t, "start", t.data.start ? fmtStart(t.data.start) : "Aloitus", t.data.start ? "" : " none")}${menu(t, "due", t.data.due ? fmtDue(t.data.due) : "Loppu", t.data.due ? "" : " none")}</span></div>`;
  if (!tasks.length) return html`<p class="tclear">Ei avoimia tehtäviä.</p>`;
  return html`<div class="tl-wrap"><div class="tl" style=${{ minWidth: width + "px" }}>
    <div class="tl-head" style=${grid}><div class="tl-corner">Tehtävä · aloitus · loppu</div>
      ${model.months.map((m) => html`<div key=${m.key} class="tl-month" style=${{ gridColumn: "span " + m.span }}>${monthLabel(m.key)}</div>`)}</div>
    <div class="tl-head tl-weeks" style=${grid}><div class="tl-corner"></div>${model.weeks.map((w) => html`<div key=${w.start} class=${"tl-wk" + (w.now ? " now" : "")} title=${w.start + " – " + w.end}>${w.n}</div>`)}</div>
    ${model.lanes.map((lane) => html`<section key=${lane.id} class="tl-lane">
      <div class="tl-lanehead"><span class="dot" style=${{ background: color(lane) }}></span><b>${lane.data.label}</b> <span class="num">${lane.rows.length}</span></div>
      ${lane.rows.map((r) => html`<div key=${r.task.plan_id + r.task.id} class="tl-row" style=${Object.assign({}, grid, lines)}>
        ${info(r.task, lane)}
        <div class=${"tl-bar st-" + (r.task.data.status || "todo") + (r.late ? " late" : "") + (r.clipL ? " clipl" : "") + (r.clipR ? " clipr" : "")} style=${{ gridColumn: (2 + r.from) + " / span " + (r.to - r.from + 1), "--c": color(lane) }} title=${fmtSpan(r.task.data.start, r.task.data.due)}><span>${fmtSpan(r.task.data.start, r.task.data.due)}</span></div>
      </div>`)}
    </section>`)}
    ${model.undated.length ? html`<section class="tl-lane"><div class="tl-lanehead"><b>Ei aikataulua</b> <span class="num">${model.undated.length}</span><span class="gs"> · anna aloitus tai loppu, niin tehtävä tulee aikajanalle</span></div>
      ${model.undated.map((t) => html`<div key=${t.plan_id + t.id} class="tl-row undated" style=${grid}>${info(t, null)}</div>`)}</section>` : null}
  </div></div>`;
}
