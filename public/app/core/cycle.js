// Uusi jakso: mitä kopioidusta suunnitelmasta tyhjennetään ilman näkymää. Rakenne (vaiheet, työvirrat, vastuualueet, mittarimallit, rajat, lomaketyypit, portit) säilyy aina.
// opts: tasks "open" (keskeneräiset, nollattuina) | "all" (sellaisenaan) | "none", actuals "clear" | "keep", forms "none" | "keep".
// Palauttaa tehtävälistan toimenpiteistä: { op: "patch", id, data } tai { op: "remove", id }.
export const CYCLE_DEFAULTS = { tasks: "open", actuals: "clear", forms: "none" };

export function cycleOps(items, opts = CYCLE_DEFAULTS) {
  const o = Object.assign({}, CYCLE_DEFAULTS, opts), ops = [];
  items.forEach((i) => {
    if (i.kind === "task") {
      if (o.tasks === "none" || (o.tasks === "open" && i.data.status === "done")) ops.push({ op: "remove", id: i.id });
      else if (o.tasks === "open") {
        const reset = { status: "todo", start: "", due: "", note: "" };
        if (Object.keys(reset).some((k) => (i.data[k] || "") !== reset[k])) ops.push({ op: "patch", id: i.id, data: reset });
      }
    } else if (i.kind === "metric" && o.actuals === "clear" && i.data.actual) ops.push({ op: "patch", id: i.id, data: { actual: "" } });
    else if (i.kind === "form" && o.forms === "none") ops.push({ op: "remove", id: i.id });
  });
  return ops;
}
