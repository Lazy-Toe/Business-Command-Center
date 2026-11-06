import { html, Text, Tools, AddButton, ui, dragProps, dropProps, pressable, mq, useEscape, useCollapse, Head, uiChanged, DueInput } from "../core/ui.js";
import { register } from "../core/registry.js";
import { children, findSection, patch, add, moveBefore, nextPosition, shift } from "../core/store.js";
import { useState } from "../../vendor/htm-preact.js";
import { fmtSpan, isLate, todayISO, suggestedOwner } from "../core/today.js";
import { PersonSelect } from "../people.js";
import { QuickAdd } from "../quickadd.js";
import { visibleTasks, visibleStreams } from "../core/myboard.js";

// Taulun tila: p = valittu vaihe (muut himmennetään), ws = valittu työvirta, wide = koko leveydelle avattu vaihe, hideDone = valmiit piilossa.
// Suunnitelman taululla on yksi yhteinen tila (focus), ja Oma työpöytä antaa jokaiselle taululle oman (parts.focus).
export const focus = { p: "", ws: "", wide: "", hideDone: false };
const F = (parts) => (parts && parts.focus) || focus;
// Muokkaus (nimet, lisäys, siirto) kuuluu vain suunnitelman omalle taululle. Oma työpöytä (parts.readonly) vain vaihtaa tilan, päivän ja vastuun.
const editing = (parts) => ui.edit && !(parts && parts.readonly);
const saveTask = (parts, task, data, extra) => (parts && parts.save ? parts.save(task, data) : patch(task.id, data, extra));
export function toggleFocusPhase(id, f = focus) { f.p = f.p === id ? "" : id; uiChanged(); }
function toggleWs(id, f = focus) { f.ws = f.ws === id ? "" : id; uiChanged(); }
function toggleWide(id, f = focus) { f.wide = f.wide === id ? "" : id; uiChanged(); }
// Klikkaus sarakkeen vapaaseen kohtaan (ei korttiin, painikkeeseen tai kenttään) valitsee vaiheen. Vain laajennuskuvake laajentaa.
const pickPhase = (parts, ph) => (e) => {
  if (editing(parts) || e.target.closest(".item, button, input, select, textarea, a, label")) return;
  toggleFocusPhase(ph.id, F(parts));
};

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

export const LABEL = { todo: "Ei aloitettu", doing: "Käynnissä", done: "Valmis" };
export const NEXT = { todo: "doing", doing: "done", done: "todo" };
const NOTE_ICON = html`<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;

export const CAL_ICON = html`<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>`;

// Määräpäivä ja vastuuhenkilö. Tehtävä kuuluu henkilölle vain valitun vastuuhenkilön kautta.
function TaskMeta({ task, parts }) {
  return html`<span class="taskmeta" onClick=${(e) => e.stopPropagation()} onKeyDown=${(e) => e.stopPropagation()}>
    ${parts.ownerLocked ? null : html`<label>Aloitus <${DueInput} value=${task.data.start} onSave=${(v) => saveTask(parts, task, { start: v })} /></label>`}
    <label>Lopetus <${DueInput} value=${task.data.due} onSave=${(v) => saveTask(parts, task, { due: v })} /></label>
    ${parts.ownerLocked ? null : html`<label>Vastuu <${PersonSelect} label="Vastuu" value=${task.data.owner || ""} empty="Ei vastuuhenkilöä" onPick=${(v) => saveTask(parts, task, { owner: v })} /></label>`}
  </span>`;
}

function Note({ task, close, parts }) {
  return html`<textarea class="nta" rows="2" maxlength="2000" aria-label="Muistiinpano" defaultValue=${task.data.note || ""} ref=${(n) => { if (n && document.activeElement !== n && !n.dataset.f) { n.dataset.f = "1"; n.focus(); } }}
    onClick=${(e) => e.stopPropagation()}
    onBlur=${(e) => { const v = e.target.value.trim(); if (v !== (task.data.note || "")) saveTask(parts, task, { note: v }); close(); }}
    onKeyDown=${(e) => {
      e.stopPropagation();
      if (e.key === "Escape") { e.target.value = task.data.note || ""; e.target.blur(); }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.target.blur();
    }}></textarea>`;
}

export function Task({ task, list, parts, withTag }) {
  const [noting, setNoting] = useState(false);
  const [meta, setMeta] = useState(false);
  const late = isLate(task, todayISO());
  const st = LABEL[task.data.status] ? task.data.status : "todo";
  const stream = parts.streams.find((s) => s.id === task.data.stream);
  const f = F(parts), ed = editing(parts), mode = parts.readonly ? "view" : "edit";
  const cycle = () => saveTask(parts, task, { status: NEXT[st] });
  const dim = (f.p && task.data.phase !== f.p) || (f.ws && task.data.stream !== f.ws);
  const work = ed ? {} : Object.assign(pressable(cycle), { title: LABEL[st] + " · klikkaa vaihtaaksesi", "aria-label": task.data.title + ": " + LABEL[st] });
  return html`<div data-item=${task.id} class=${"item s-" + st + (ed ? " edit" : " clickable")} style=${{ "--c": wsColor(stream) }} ...${work} ...${ed ? dragProps(task, "task") : moveDrag(parts, task)}
    ...${ed ? dropProps("task", (id) => { if (id !== task.id) moveBefore(id, task.id, parts.tasks.filter((t) => t.data.phase === task.data.phase && t.data.stream === task.data.stream), { phase: task.data.phase, stream: task.data.stream }); }) : {}}>
    ${withTag || parts.cardTag ? html`<span class="mtag">${parts.cardTag ? parts.cardTag(task) : stream ? stream.data.label : ""}</span>` : null}
    <${Text} item=${task} field="title" tag="p" cls="it" ph="Tehtävä" mode=${mode} />
    <${Text} item=${task} field="detail" tag="p" cls="io" ph="Tarkennus" mode=${mode} />
    ${task.data.due || task.data.owner ? html`<span class="taskinfo">${task.data.due ? html`<span class=${"duechip" + (late ? " late" : "")}>${late ? "Myöhässä · " : ""}${fmtSpan(task.data.start, task.data.due)}</span>` : null}${task.data.owner ? html`<span class="ownerchip">${task.data.owner}</span>` : null}</span>` : null}
    <button type="button" class=${"dbtn" + (task.data.due ? " has" : "")} title="Aloitus, lopetus ja vastuuhenkilö" aria-label="Aloitus, lopetus ja vastuuhenkilö" aria-expanded=${meta ? "true" : "false"} onClick=${(e) => { e.stopPropagation(); setMeta(!meta); }}>${CAL_ICON}</button>
    ${meta ? html`<${TaskMeta} task=${task} parts=${parts} />` : null}
    ${!noting ? html`<button type="button" class=${"nbtn" + (task.data.note ? " has" : "")} title=${task.data.note ? "Muokkaa muistiinpanoa" : "Lisää muistiinpano"} aria-label=${task.data.note ? "Muokkaa muistiinpanoa" : "Lisää muistiinpano"} onClick=${(e) => { e.stopPropagation(); setNoting(true); }}>${NOTE_ICON}</button>` : null}
    ${noting ? html`<${Note} task=${task} parts=${parts} close=${() => setNoting(false)} />` : task.data.note ? html`<p class="inote">${task.data.note}</p>` : null}
    ${ed ? html`<span class="tasksel" onClick=${(e) => e.stopPropagation()}>
      <select aria-label="Vaihe" value=${task.data.phase} onChange=${(e) => patch(task.id, { phase: e.target.value }, { position: nextPosition(task.parent_id, "task") })}>${parts.phases.map((p) => html`<option key=${p.id} value=${p.id}>${p.data.title}</option>`)}</select>
      <select aria-label="Työvirta" value=${task.data.stream} onChange=${(e) => patch(task.id, { stream: e.target.value }, { position: nextPosition(task.parent_id, "task") })}>${parts.streams.map((p) => html`<option key=${p.id} value=${p.id}>${p.data.label}</option>`)}</select>
    </span>` : null}
    ${ed ? html`<${Tools} item=${task} list=${list} label=${task.data.title} />` : null}
  </div>`;
}

// Uuden tehtävän vastuuhenkilöksi esitäytetään saman työvirran vastuualueen omistaja. Se on tavallinen valinta, jonka voi vaihtaa tai tyhjentää.
export function newTask(parts, phase, stream, title = "") { add("task", parts.section.id, { title, detail: "", phase, stream, status: "todo", note: "", owner: suggestedOwner(stream, parts.roles) }); }
// Lisäystapa taululle: suunnitelman taululla suoraan suunnitelmaan, Oma työpöytä antaa oman (parts.addTask). Jäsen ei lisää.
export const taskAdder = (parts) => (!parts || parts.ownerLocked ? null : parts.addTask ? parts.addTask : parts.readonly || !parts.section ? null : (title, phase, stream) => newTask(parts, phase, stream, title));
// Raahaus sarakkeiden ja rivien välillä ilman muokkaustilaa: kortin pudotus toiseen soluun vaihtaa tehtävän vaiheen ja työvirran.
// Sama molemmilla tauluilla (Kokonaisuus ja Oma työpöytä). Jäsen ei raahaa (parts.ownerLocked), koska hän ei saa vaihtaa vaihetta.
// Tallennus kulkee saveTaskin kautta, joten Oma työpöytä tallentaa omalla tavallaan. parts.onMove ohittaa oletuksen.
let moving = null;
const taskKey = (t) => (t.plan_id || "") + "/" + t.id;
const canMove = (parts) => !ui.edit && !parts.ownerLocked;
const moveTo = (parts, key, phase, stream) => {
  if (parts.onMove) return parts.onMove(key, phase, stream);
  const t = parts.tasks.find((x) => taskKey(x) === key);
  if (!t || (t.data.phase === phase && t.data.stream === stream)) return;
  saveTask(parts, t, { phase, stream });
};
const moveDrag = (parts, task) => (canMove(parts) ? {
  draggable: true,
  onDragStart: (e) => { moving = taskKey(task); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", moving); },
  onDragEnd: () => { moving = null; }
} : {});
const moveDrop = (parts, col, lane) => (canMove(parts) ? {
  onDragOver: (e) => { if (moving) { e.preventDefault(); e.currentTarget.classList.add("dropover"); } },
  onDragLeave: (e) => e.currentTarget.classList.remove("dropover"),
  onDrop: (e) => { e.currentTarget.classList.remove("dropover"); if (!moving) return; e.preventDefault(); const k = moving; moving = null; moveTo(parts, k, col, lane); }
} : {});
const cellDrop = (parts, phase, stream) => dropProps("task", (id) => moveBefore(id, null, parts.tasks.filter((t) => t.data.phase === phase && t.data.stream === stream), { phase, stream }));

function GateCell({ ph, dim, parts, onPick }) {
  const mode = parts && parts.readonly ? "view" : "edit";
  return html`<div class=${"gc" + (dim ? " dim" : "") + (onPick && !editing(parts) ? " pick" : "")} onClick=${onPick}>
    <${Text} item=${ph} field="gateLabel" cls="d" ph="Päivä" mode=${mode} />
    <${Text} item=${ph} field="gateTitle" tag="b" ph="Päätösportti" mode=${mode} />
    <${Text} item=${ph} field="gateText" ph="Mitä on valmista" multi=${true} mode=${mode} />
  </div>`;
}

// Vaiheen otsikko: klikkaus valitsee vaiheen (muut himmennetään), pieni kuvake avaa vaiheen koko taulun leveydelle.
function PhaseHead({ ph, i, n, parts }) {
  const f = F(parts), ed = editing(parts), mode = parts.readonly ? "view" : "edit";
  const dim = !f.wide && f.p && f.p !== ph.id, sel = f.p === ph.id, wide = f.wide === ph.id;
  const props = ed ? {} : Object.assign(pressable(() => toggleFocusPhase(ph.id, f)), { title: sel ? "Poista vaiheen valinta" : "Valitse vaihe" });
  return html`<div class=${"mh " + (ed ? "" : "clickable ") + phaseClass(i, n) + (dim ? " dim" : "") + (sel || wide ? " open" : "")} ...${props}>
    <${Text} item=${ph} field="label" cls="d" ph="Ajanjakso" mode=${mode} /><${Text} item=${ph} field="title" cls="t" ph="Vaihe" mode=${mode} />
    ${ed ? null : html`<button type="button" class="mhx" title=${wide ? "Palaa kaikkiin vaiheisiin" : "Avaa koko leveydelle"} aria-label=${(wide ? "Palaa kaikkiin vaiheisiin: " : "Avaa koko leveydelle: ") + (ph.data.title || "")} aria-pressed=${wide ? "true" : "false"} onClick=${(e) => { e.stopPropagation(); toggleWide(ph.id, f); }}>${wide ? "⤡" : "⤢"}</button>`}
    ${ed ? html`<${Tools} item=${ph} list=${parts.phases} label=${ph.data.title} />` : null}
  </div>`;
}

function StreamHead({ w, parts }) {
  const f = F(parts), ed = editing(parts), mode = parts.readonly ? "view" : "edit";
  const dim = f.ws && f.ws !== w.id;
  const Tag = ed ? "div" : "button";
  return html`<${Tag} class=${"rl" + (dim ? " dim" : "")} type=${ed ? undefined : "button"} style=${{ "--c": wsColor(w) }} onClick=${() => { if (!ed) toggleWs(w.id, f); }}>
    <span class="dot"></span>
    <span class="rlt"><${Text} item=${w} field="label" cls="rln" ph="Työvirta" mode=${mode} />
    <span class="rprog">${parts.phases.map((ph) => {
      const lst = parts.tasks.filter((t) => t.data.phase === ph.id && t.data.stream === w.id);
      if (!lst.length) return null;
      const dn = lst.reduce((a, t) => a + (t.data.status === "done" ? 1 : t.data.status === "doing" ? 0.5 : 0), 0), pc = Math.round(100 * dn / lst.length);
      return html`<span key=${ph.id} class=${"rpl" + (pc === 100 ? " full" : "")}><span class="rpd">${ph.data.short || (ph.data.label || "").replace(/^[^\d]*/, "")}</span><span class="rpb"><i style=${{ width: pc + "%" }}></i></span><span class="rpp">${pc} %</span></span>`;
    })}</span></span>
    ${ed ? html`<${Tools} item=${w} list=${parts.streams} label=${w.data.label} />` : null}
  </${Tag}>`;
}

// Koko leveydelle avattu vaihe (f.wide): kortit rinnakkain, vaihevälilehdet ja paluu kaikkiin vaiheisiin.
function Wide({ parts, idx }) {
  const { phases, streams } = parts, ph = phases[idx], f = F(parts), ed = editing(parts), adder = taskAdder(parts);
  const tasks = visibleTasks(parts.tasks, f.hideDone), lanes = visibleStreams(streams, tasks, parts.hideEmptyLanes);
  const left = (id) => parts.tasks.filter((t) => t.data.phase === id && t.data.status !== "done").length;
  return html`<div>
    <div class="phasetabs" role="group" aria-label="Vaihe">
      ${phases.map((p) => html`<button key=${p.id} type="button" class="chip" aria-pressed=${p.id === ph.id ? "true" : "false"} onClick=${() => { f.wide = p.id; uiChanged(); }}>${p.data.title} <span class="num">${left(p.id)}</span></button>`)}
      <button type="button" class="clear" onClick=${() => { f.wide = ""; uiChanged(); }}>Näytä kaikki vaiheet</button>
    </div>
    <div class="matrix wide" style=${{ gridTemplateColumns: "210px minmax(0, 1fr)" }}>
      <div class="corner"></div>
      <${PhaseHead} ph=${ph} i=${idx} n=${phases.length} parts=${parts} />
      ${lanes.map((w) => {
        const list = tasks.filter((t) => t.data.phase === ph.id && t.data.stream === w.id), dim = f.ws && f.ws !== w.id;
        return [
          html`<${StreamHead} key=${w.id} w=${w} parts=${parts} />`,
          html`<div key=${w.id + "w"} class=${"cell wide" + (dim ? " dim" : "")} ...${ed ? cellDrop(parts, ph.id, w.id) : moveDrop(parts, ph.id, w.id)}>
            ${list.map((t) => html`<${Task} key=${(t.plan_id || "") + t.id} task=${t} list=${list} parts=${parts} />`)}
            ${adder ? html`<${QuickAdd} label="Tehtävä" cls="small" onAdd=${(t) => adder(t, ph.id, w.id)} />` : null}
          </div>`
        ];
      })}
      ${parts.noGates ? null : html`<div class="gl"><i class="diamond"></i>Päätösportti</div>
      <${GateCell} ph=${ph} dim=${false} parts=${parts} />`}
    </div></div>`;
}

function Desktop({ parts }) {
  const { phases, streams } = parts, f = F(parts), ed = editing(parts), adder = taskAdder(parts);
  const wideIdx = f.wide ? phases.findIndex((p) => p.id === f.wide) : -1;
  if (wideIdx >= 0) return html`<${Wide} parts=${parts} idx=${wideIdx} />`;
  const tasks = visibleTasks(parts.tasks, f.hideDone), lanes = visibleStreams(streams, tasks, parts.hideEmptyLanes);
  return html`<div class="matrix" style=${{ gridTemplateColumns: "210px repeat(" + Math.max(phases.length, 1) + ", minmax(" + (parts.minCol || 0) + "px, 1fr))", minWidth: parts.minCol ? 210 + phases.length * parts.minCol + "px" : undefined }}>
    <div class="corner"></div>
    ${phases.map((ph, i) => html`<${PhaseHead} key=${ph.id} ph=${ph} i=${i} n=${phases.length} parts=${parts} />`)}
    ${lanes.map((w) => [
      html`<${StreamHead} key=${w.id} w=${w} parts=${parts} />`,
      ...phases.map((ph) => {
        const list = tasks.filter((t) => t.data.phase === ph.id && t.data.stream === w.id);
        const dim = (f.p && f.p !== ph.id) || (f.ws && f.ws !== w.id);
        return html`<div key=${w.id + ph.id} class=${"cell" + (dim ? " dim" : "") + (ed ? "" : " pick")} onClick=${pickPhase(parts, ph)} ...${ed ? cellDrop(parts, ph.id, w.id) : moveDrop(parts, ph.id, w.id)}>
          ${list.map((t) => html`<${Task} key=${t.plan_id + t.id} task=${t} list=${list} parts=${parts} />`)}
          ${adder ? html`<${QuickAdd} label="Tehtävä" cls="small" onAdd=${(t) => adder(t, ph.id, w.id)} />` : null}
        </div>`;
      })
    ])}
    ${parts.noGates ? null : html`<div class="gl"><i class="diamond"></i>Päätösportti</div>
    ${phases.map((ph) => html`<${GateCell} key=${ph.id} ph=${ph} dim=${f.p && f.p !== ph.id} parts=${parts} onPick=${pickPhase(parts, ph)} />`)}`}
  </div>`;
}

function Mobile({ parts }) {
  const f = F(parts), ed = editing(parts), tasks = visibleTasks(parts.tasks, f.hideDone), adder = taskAdder(parts);
  return html`<div>${parts.phases.map((ph, i) => {
    const list = tasks.filter((t) => t.data.phase === ph.id);
    return html`<div key=${ph.id} class=${"mphase" + (f.p && f.p !== ph.id ? " dim" : "")}>
      <${PhaseHead} ph=${ph} i=${i} n=${parts.phases.length} parts=${parts} />
      <div class="mlist">${list.map((t) => html`<${Task} key=${(t.plan_id || "") + t.id} task=${t} list=${list} parts=${parts} withTag=${true} />`)}
        ${adder && parts.streams[0] ? html`<${QuickAdd} label="Tehtävä" cls="small" onAdd=${(t) => adder(t, ph.id, parts.streams[0].id)} />` : null}</div>
      <${GateCell} ph=${ph} parts=${parts} />
    </div>`;
  })}</div>`;
}

// Taulun runko, jota käyttävät sekä suunnitelman taulu (Kokonaisuus) että Oma työpöytä: suodatinrivi, tilarivi ja matriisi.
// section: vain suunnitelman taululla (lisäys ja ohjeteksti muokattavissa).
export function BoardBody({ parts, section }) {
  const small = mq("(max-width: 900px)");
  const f = F(parts), ed = editing(parts);
  useEscape(() => { if (f.p || f.ws || f.wide) { f.p = ""; f.ws = ""; f.wide = ""; uiChanged(); } });
  const active = f.p ? parts.phases.find((p) => p.id === f.p) : null;
  const done = parts.tasks.filter((t) => t.data.status === "done").length, doing = parts.tasks.filter((t) => t.data.status === "doing").length;
  const hint = "Klikkaa tehtävää vaihtaaksesi tilaa: ei aloitettu → käynnissä → valmis. Muutokset tallentuvat heti.";
  return html`
    <div class="filters" role="group" aria-label="Työvirta">
      ${active ? html`<button type="button" class="chip pchip" aria-label="Poista vaihevalinta" onClick=${() => toggleFocusPhase(active.id, f)}>Vaihe: ${active.data.title} <span aria-hidden="true">×</span></button>` : null}
      ${parts.streams.map((w) => html`<button key=${w.id} type="button" class="chip" style=${{ "--c": wsColor(w) }} aria-pressed=${f.ws === w.id ? "true" : "false"} onClick=${() => toggleWs(w.id, f)}><span class="dot"></span>${w.data.label}</button>`)}
      ${f.p || f.ws || f.wide ? html`<button type="button" class="clear" onClick=${() => { f.p = ""; f.ws = ""; f.wide = ""; uiChanged(); }}>Näytä kaikki</button>` : null}
      ${done ? html`<button type="button" class="chip" aria-pressed=${f.hideDone ? "true" : "false"} onClick=${() => { f.hideDone = !f.hideDone; uiChanged(); }}>${f.hideDone ? "Näytä valmiit (" + done + ")" : "Piilota valmiit"}</button>` : null}
      ${ed && section ? html`<${AddButton} label="Työvirta" cls="small" onAdd=${() => add("stream", section.id, { label: "Uusi työvirta", color: COLORS[parts.streams.length % COLORS.length] })} />
      <${AddButton} label="Vaihe" cls="small" onAdd=${() => add("phase", section.id, { label: "AJANJAKSO", title: "Uusi vaihe", note: "", weight: 30, gateTitle: "", gateText: "" })} />` : null}
    </div>
    <div class="statusbar">${parts.noStatus ? null : html`<span class="tot num">${done} / ${parts.tasks.length} valmis · ${doing} käynnissä</span>`}
      ${section ? html`<${Text} item=${section} field="hint" cls="save" ph="Ohje" />` : html`<span class="save">${parts.hint || hint}</span>`}</div>
    <div class="matrix-wrap" style=${parts.minCol ? { overflowX: "auto" } : undefined}>${small ? html`<${Mobile} parts=${parts} />` : html`<${Desktop} parts=${parts} />`}</div>`;
}

function View({ section }) {
  const parts = planParts();
  const { c, toggle } = useCollapse(section);
  return html`<div class=${"modbody" + (c ? " is-collapsed" : "")} id="plan-anchor">
    <${Head} section=${section} c=${c} toggle=${toggle} />
    <${BoardBody} parts=${parts} section=${section} />
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
