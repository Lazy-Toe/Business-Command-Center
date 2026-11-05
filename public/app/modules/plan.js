import { html, Text, Tools, AddButton, ui, dragProps, dropProps, pressable, mq, useEscape, useCollapse, Head, uiChanged, DueInput } from "../core/ui.js";
import { register } from "../core/registry.js";
import { children, findSection, patch, add, moveBefore, nextPosition, shift } from "../core/store.js";
import { useState } from "../../vendor/htm-preact.js";
import { fmtDate, isLate, todayISO, ownerOf } from "../core/today.js";
import { PersonSelect } from "../people.js";

export const focus = { p: "", ws: "" };
export function toggleFocusPhase(id) { focus.p = focus.p === id ? "" : id; uiChanged(); }
function toggleWs(id) { focus.ws = focus.ws === id ? "" : id; uiChanged(); }

export function planParts() {
  const s = findSection("plan"); if (!s) return null;
  const phases = children(s.id, "phase"), streams = children(s.id, "stream");
  // Jos vaihe tai työvirta on poistettu, tehtävät näkyvät ensimmäisessä jäljellä olevassa eivätkä katoa.
  const tasks = children(s.id, "task").map((t) => {
    const phase = phases.some((p) => p.id === t.data.phase) ? t.data.phase : phases[0] && phases[0].id;
    const stream = streams.some((w) => w.id === t.data.stream) ? t.data.stream : streams[0] && streams[0].id;
    return phase === t.data.phase && stream === t.data.stream ? t : Object.assign({}, t, { data: Object.assign({}, t.data, { phase, stream }) });
  });
  const sc = findSection("scorecards");
  return { section: s, phases, streams, tasks, roles: sc ? children(sc.id, "role") : [] };
}
export function taskCounts(parts, phaseId) {
  const list = parts.tasks.filter((t) => t.data.phase === phaseId);
  return { total: list.length, done: list.filter((t) => t.data.status === "done").length };
}
// Vaiheiden värit: ensimmäinen vaalea, viimeinen tumma, välissä keskitaso.
export const phaseClass = (i, n) => (i === n - 1 && n > 1 ? "p3" : i === 0 ? "p1" : "p2");
const COLORS = ["kate", "tekno", "kanava", "bc", "ihmiset", "myynti"];
export const wsColor = (s) => "var(--ws-" + (s && s.data.color || "ihmiset") + ")";

const LABEL = { todo: "Ei aloitettu", doing: "Käynnissä", done: "Valmis" };
const NEXT = { todo: "doing", doing: "done", done: "todo" };
const NOTE_ICON = html`<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;

const CAL_ICON = html`<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>`;

// Määräpäivä ja vastuuhenkilö. Ilman omaa vastuuhenkilöä käytetään työvirran vastuualueen omistajaa.
function TaskMeta({ task, inherited }) {
  return html`<span class="taskmeta" onClick=${(e) => e.stopPropagation()} onKeyDown=${(e) => e.stopPropagation()}>
    <label>Määräpäivä <${DueInput} value=${task.data.due} onSave=${(v) => patch(task.id, { due: v })} /></label>
    <label>Vastuu <${PersonSelect} label="Vastuu" value=${task.data.owner || ""} empty=${inherited || "Ei vastuuhenkilöä"} onPick=${(v) => patch(task.id, { owner: v })} /></label>
  </span>`;
}

function Note({ task, close }) {
  return html`<textarea class="nta" rows="2" maxlength="2000" aria-label="Muistiinpano" defaultValue=${task.data.note || ""} ref=${(n) => { if (n && document.activeElement !== n && !n.dataset.f) { n.dataset.f = "1"; n.focus(); } }}
    onClick=${(e) => e.stopPropagation()}
    onBlur=${(e) => { const v = e.target.value.trim(); if (v !== (task.data.note || "")) patch(task.id, { note: v }); close(); }}
    onKeyDown=${(e) => {
      e.stopPropagation();
      if (e.key === "Escape") { e.target.value = task.data.note || ""; e.target.blur(); }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.target.blur();
    }}></textarea>`;
}

export function Task({ task, list, parts, withTag }) {
  const [noting, setNoting] = useState(false);
  const [meta, setMeta] = useState(false);
  const inherited = parts.roles ? ownerOf({ data: { stream: task.data.stream } }, parts.roles) : "";
  const shownOwner = task.data.owner || inherited;
  const late = isLate(task, todayISO());
  const st = LABEL[task.data.status] ? task.data.status : "todo";
  const stream = parts.streams.find((s) => s.id === task.data.stream);
  const cycle = () => patch(task.id, { status: NEXT[st] });
  const dim = (focus.p && task.data.phase !== focus.p) || (focus.ws && task.data.stream !== focus.ws);
  const work = ui.edit ? {} : Object.assign(pressable(cycle), { title: LABEL[st] + " · klikkaa vaihtaaksesi", "aria-label": task.data.title + ": " + LABEL[st] });
  return html`<div data-item=${task.id} class=${"item s-" + st + (ui.edit ? " edit" : " clickable")} style=${{ "--c": wsColor(stream) }} ...${work} ...${dragProps(task, "task")}
    ...${dropProps("task", (id) => { if (id !== task.id) moveBefore(id, task.id, parts.tasks.filter((t) => t.data.phase === task.data.phase && t.data.stream === task.data.stream), { phase: task.data.phase, stream: task.data.stream }); })}>
    ${withTag ? html`<span class="mtag">${stream ? stream.data.label : ""}</span>` : null}
    <${Text} item=${task} field="title" tag="p" cls="it" ph="Tehtävä" />
    <${Text} item=${task} field="detail" tag="p" cls="io" ph="Tarkennus" />
    ${task.data.due || task.data.owner ? html`<span class="taskinfo">${task.data.due ? html`<span class=${"duechip" + (late ? " late" : "")}>${late ? "Myöhässä · " : ""}${fmtDate(task.data.due)}</span>` : null}${task.data.owner || (task.data.due && shownOwner) ? html`<span class="ownerchip">${shownOwner}</span>` : null}</span>` : null}
    <button type="button" class=${"dbtn" + (task.data.due ? " has" : "")} title="Määräpäivä ja vastuuhenkilö" aria-label="Määräpäivä ja vastuuhenkilö" aria-expanded=${meta ? "true" : "false"} onClick=${(e) => { e.stopPropagation(); setMeta(!meta); }}>${CAL_ICON}</button>
    ${meta ? html`<${TaskMeta} task=${task} inherited=${inherited} />` : null}
    ${!noting ? html`<button type="button" class=${"nbtn" + (task.data.note ? " has" : "")} title=${task.data.note ? "Muokkaa muistiinpanoa" : "Lisää muistiinpano"} aria-label=${task.data.note ? "Muokkaa muistiinpanoa" : "Lisää muistiinpano"} onClick=${(e) => { e.stopPropagation(); setNoting(true); }}>${NOTE_ICON}</button>` : null}
    ${noting ? html`<${Note} task=${task} close=${() => setNoting(false)} />` : task.data.note ? html`<p class="inote">${task.data.note}</p>` : null}
    ${ui.edit ? html`<span class="tasksel" onClick=${(e) => e.stopPropagation()}>
      <select aria-label="Vaihe" value=${task.data.phase} onChange=${(e) => patch(task.id, { phase: e.target.value }, { position: nextPosition(task.parent_id, "task") })}>${parts.phases.map((p) => html`<option key=${p.id} value=${p.id}>${p.data.title}</option>`)}</select>
      <select aria-label="Työvirta" value=${task.data.stream} onChange=${(e) => patch(task.id, { stream: e.target.value }, { position: nextPosition(task.parent_id, "task") })}>${parts.streams.map((p) => html`<option key=${p.id} value=${p.id}>${p.data.label}</option>`)}</select>
    </span>` : null}
    <${Tools} item=${task} list=${list} label=${task.data.title} />
  </div>`;
}

function newTask(parts, phase, stream) { add("task", parts.section.id, { title: "", detail: "", phase, stream, status: "todo", note: "" }); }
const cellDrop = (parts, phase, stream) => dropProps("task", (id) => moveBefore(id, null, parts.tasks.filter((t) => t.data.phase === phase && t.data.stream === stream), { phase, stream }));

function GateCell({ ph, dim }) {
  return html`<div class=${"gc" + (dim ? " dim" : "")}>
    <${Text} item=${ph} field="gateLabel" cls="d" ph="Päivä" />
    <${Text} item=${ph} field="gateTitle" tag="b" ph="Päätösportti" />
    <${Text} item=${ph} field="gateText" ph="Mitä on valmista" multi=${true} />
  </div>`;
}

function PhaseHead({ ph, i, n, parts }) {
  const dim = focus.p && focus.p !== ph.id;
  const props = ui.edit ? {} : Object.assign(pressable(() => toggleFocusPhase(ph.id)), { title: "Valitse tai poista vaihe" });
  return html`<div class=${"mh " + (ui.edit ? "" : "clickable ") + phaseClass(i, n) + (dim ? " dim" : "")} ...${props}>
    <${Text} item=${ph} field="label" cls="d" ph="Ajanjakso" /><${Text} item=${ph} field="title" cls="t" ph="Vaihe" />
    <${Tools} item=${ph} list=${parts.phases} label=${ph.data.title} />
  </div>`;
}

function StreamHead({ w, parts }) {
  const dim = focus.ws && focus.ws !== w.id;
  const Tag = ui.edit ? "div" : "button";
  return html`<${Tag} class=${"rl" + (dim ? " dim" : "")} type=${ui.edit ? undefined : "button"} style=${{ "--c": wsColor(w) }} onClick=${() => { if (!ui.edit) toggleWs(w.id); }}>
    <span class="dot"></span>
    <span class="rlt"><${Text} item=${w} field="label" cls="rln" ph="Työvirta" />
    <span class="rprog">${parts.phases.map((ph) => {
      const lst = parts.tasks.filter((t) => t.data.phase === ph.id && t.data.stream === w.id);
      if (!lst.length) return null;
      const dn = lst.reduce((a, t) => a + (t.data.status === "done" ? 1 : t.data.status === "doing" ? 0.5 : 0), 0), pc = Math.round(100 * dn / lst.length);
      return html`<span key=${ph.id} class=${"rpl" + (pc === 100 ? " full" : "")}><span class="rpd">${(ph.data.label || "").replace(/^[^\d]*/, "")}</span><span class="rpb"><i style=${{ width: pc + "%" }}></i></span><span class="rpp">${pc} %</span></span>`;
    })}</span></span>
    <${Tools} item=${w} list=${parts.streams} label=${w.data.label} />
  </${Tag}>`;
}

function Desktop({ parts }) {
  const { phases, streams, tasks } = parts;
  return html`<div class="matrix" style=${{ gridTemplateColumns: "210px repeat(" + Math.max(phases.length, 1) + ", minmax(0, 1fr))" }}>
    <div class="corner"></div>
    ${phases.map((ph, i) => html`<${PhaseHead} key=${ph.id} ph=${ph} i=${i} n=${phases.length} parts=${parts} />`)}
    ${streams.map((w) => [
      html`<${StreamHead} key=${w.id} w=${w} parts=${parts} />`,
      ...phases.map((ph) => {
        const list = tasks.filter((t) => t.data.phase === ph.id && t.data.stream === w.id);
        const dim = (focus.p && focus.p !== ph.id) || (focus.ws && focus.ws !== w.id);
        return html`<div key=${w.id + ph.id} class=${"cell" + (dim ? " dim" : "")} ...${cellDrop(parts, ph.id, w.id)}>
          ${list.map((t) => html`<${Task} key=${t.id} task=${t} list=${list} parts=${parts} />`)}
          <${AddButton} label="Tehtävä" onAdd=${() => newTask(parts, ph.id, w.id)} cls="small" />
        </div>`;
      })
    ])}
    <div class="gl"><i class="diamond"></i>Päätösportti</div>
    ${phases.map((ph) => html`<${GateCell} key=${ph.id} ph=${ph} dim=${focus.p && focus.p !== ph.id} />`)}
  </div>`;
}

function Mobile({ parts }) {
  return html`<div>${parts.phases.map((ph, i) => {
    const list = parts.tasks.filter((t) => t.data.phase === ph.id);
    return html`<div key=${ph.id} class=${"mphase" + (focus.p && focus.p !== ph.id ? " dim" : "")}>
      <${PhaseHead} ph=${ph} i=${i} n=${parts.phases.length} parts=${parts} />
      <div class="mlist">${list.map((t) => html`<${Task} key=${t.id} task=${t} list=${list} parts=${parts} withTag=${true} />`)}
        ${parts.streams[0] ? html`<${AddButton} label="Tehtävä" onAdd=${() => newTask(parts, ph.id, parts.streams[0].id)} cls="small" />` : null}</div>
      <${GateCell} ph=${ph} />
    </div>`;
  })}</div>`;
}

function View({ section }) {
  const parts = planParts();
  const small = mq("(max-width: 900px)");
  const { c, toggle } = useCollapse(section);
  useEscape(() => { if (focus.p || focus.ws) { focus.p = ""; focus.ws = ""; uiChanged(); } });
  const active = focus.p ? parts.phases.find((p) => p.id === focus.p) : null;
  const done = parts.tasks.filter((t) => t.data.status === "done").length, doing = parts.tasks.filter((t) => t.data.status === "doing").length;
  return html`<div class=${"modbody" + (c ? " is-collapsed" : "")} id="plan-anchor">
    <${Head} section=${section} c=${c} toggle=${toggle} />
    <div class="filters" role="group" aria-label="Työvirta">
      ${active ? html`<button type="button" class="chip pchip" aria-label="Poista vaihevalinta" onClick=${() => toggleFocusPhase(active.id)}>Vaihe: ${active.data.title} <span aria-hidden="true">×</span></button>` : null}
      ${parts.streams.map((w) => html`<button key=${w.id} type="button" class="chip" style=${{ "--c": wsColor(w) }} aria-pressed=${focus.ws === w.id ? "true" : "false"} onClick=${() => toggleWs(w.id)}><span class="dot"></span>${w.data.label}</button>`)}
      ${focus.p || focus.ws ? html`<button type="button" class="clear" onClick=${() => { focus.p = ""; focus.ws = ""; uiChanged(); }}>Näytä kaikki</button>` : null}
      <${AddButton} label="Työvirta" cls="small" onAdd=${() => add("stream", section.id, { label: "Uusi työvirta", color: COLORS[parts.streams.length % COLORS.length] })} />
      <${AddButton} label="Vaihe" cls="small" onAdd=${() => add("phase", section.id, { label: "AJANJAKSO", title: "Uusi vaihe", note: "", weight: 30, gateTitle: "", gateText: "" })} />
    </div>
    <div class="statusbar"><span class="tot num">${done} / ${parts.tasks.length} valmis · ${doing} käynnissä</span>
      <${Text} item=${section} field="hint" cls="save" ph="Ohje" /></div>
    <div class="matrix-wrap">${small ? html`<${Mobile} parts=${parts} />` : html`<${Desktop} parts=${parts} />`}</div>
  </div>`;
}

register({
  type: "plan", label: "Suunnitelma", hint: "Vaiheet, työvirrat, tehtävät ja päätösportit", single: true,
  create: () => ({
    data: { eyebrow: "Suunnitelma", title: "Mitä tehdään ja milloin", intro: "", hint: "Klikkaa tehtävää vaihtaaksesi tilaa: ei aloitettu → käynnissä → valmis. Muutokset tallentuvat heti." },
    children: [
      { kind: "phase", data: { label: "VAIHE 1", title: "Selvitä", note: "", weight: 30, gateNum: "1", gateShort: "Tilanne selvä", gateLabel: "VAIHE 1", gateTitle: "Tilanne selvä", gateText: "" } },
      { kind: "phase", data: { label: "VAIHE 2", title: "Päätä", note: "", weight: 30, gateNum: "2", gateShort: "Suunta päätetty", gateLabel: "VAIHE 2", gateTitle: "Suunta päätetty", gateText: "" } },
      { kind: "phase", data: { label: "VAIHE 3", title: "Toteuta", note: "", weight: 40, gateNum: "3", gateShort: "Tulos näkyy", gateLabel: "VAIHE 3", gateTitle: "Tulos näkyy", gateText: "" } },
      { kind: "stream", data: { label: "Työvirta 1", color: "kate" } },
      { kind: "stream", data: { label: "Työvirta 2", color: "tekno" } }
    ]
  }),
  View
});
