// Oma työpöytä: omat tehtävät suunnitelmittain samalla taulukomponentilla kuin Kokonaisuuden suunnitelmataulu (BoardBody).
import { html } from "../../vendor/htm-preact.js";
import { state, patchIn, addIn } from "../core/store.js";
import { BoardBody } from "../modules/plan.js";

// Jokaisella suunnitelman taululla on oma tila (valittu vaihe, työvirta, laajennus, valmiit piilossa), joka säilyy uudelleenpiirrossa.
const focusByPlan = new Map();
const focusOf = (planId) => { if (!focusByPlan.has(planId)) focusByPlan.set(planId, { p: "", ws: "", wide: "", hideDone: false }); return focusByPlan.get(planId); };

export function MyBoards({ boards, open, me }) {
  const member = state.role === "member";
  const name = (id) => { const p = state.plans.find((x) => x.id === id); return p ? p.title : ""; };
  return boards.map((b) => {
    const parts = Object.assign({}, b, { focus: focusOf(b.plan_id), save: (task, data) => patchIn(b.plan_id, task.id, data), ownerLocked: member, addTask: b.section && me ? (title, phase, stream) => addIn(b.plan_id, b.section.id, { title, detail: "", phase, stream, status: "todo", note: "", owner: me }) : null });
    const left = b.tasks.filter((t) => t.data.status !== "done").length;
    return html`<section key=${b.plan_id} class="tgroup myboard">
      <h2>${boards.length > 1 ? name(b.plan_id) || "Tehtävät" : "Tehtävät"} <span class="num">${left}</span>
        ${open && b.firstTask ? html`<button type="button" class="barbtn" onClick=${() => open(b.plan_id, { id: b.firstTask.id, kind: "task", parent_id: b.firstTask.parent_id })}>Avaa suunnitelmassa</button>` : null}</h2>
      <${BoardBody} parts=${parts} />
    </section>`;
  });
}
