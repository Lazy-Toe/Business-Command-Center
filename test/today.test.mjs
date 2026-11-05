import test from "node:test";
import assert from "node:assert/strict";
import { buildToday, addDays, fmtDate, fmtLong, ownerOf, isLate, todayISO } from "../public/app/core/today.js";

const T = "2026-11-04";
const task = (id, data, plan = "a") => ({ plan_id: plan, id, kind: "task", parent_id: "s", data: { status: "todo", ...data } });
const items = [
  { plan_id: "a", id: "w1", kind: "stream", data: { label: "Myynti", color: "kate" } },
  { plan_id: "a", id: "r1", kind: "role", data: { title: "Sales", owner: "Mika", stream: "w1" } },
  task("late", { due: "2026-11-03", stream: "w1", owner: "Mika" }),
  task("now", { due: T, owner: "Iida" }),
  task("wk", { due: "2026-11-11", stream: "w1" }),
  task("far", { due: "2026-11-12" }),
  task("done", { due: "2026-01-01", status: "done" }),
  task("doing", { status: "doing" }),
  task("none", {}),
  task("bad", { due: "ei päivä" }),
  task("other", { due: T, owner: "Harri" }, "b"),
  { plan_id: "a", id: "m1", kind: "row", data: { name: "NPS", state: "bad" } },
  { plan_id: "a", id: "m2", kind: "row", data: { name: "Churn", state: "good" } },
  { plan_id: "b", id: "x1", kind: "risk", data: { name: "Riski", state: "bad" } },
  { plan_id: "a", id: "d1", kind: "metricdef", parent_id: "g", data: { name: "Konversio", target: "10", min: "8" } },
  { plan_id: "a", id: "k1", kind: "metric", parent_id: "r1", data: { def: "d1", actual: "5" } },
  { plan_id: "a", id: "k2", kind: "metric", parent_id: "r1", data: { def: "d1", actual: "9" } },
  { plan_id: "a", id: "k3", kind: "metric", parent_id: "r1", data: { def: "d1" } },
  { plan_id: "a", id: "k4", kind: "metric", parent_id: "r1", data: { name: "Vanha mittari", state: "bad" } }
];
const ids = (l) => l.map((x) => x.id);

test("tehtävä kertoo myös vastuualueen oman omistajan, vaikka vastuu olisi asetettu käsin", () => {
  const r = buildToday(items, T), by = (id) => [...r.late, ...r.today, ...r.week, ...r.later, ...r.doing, ...r.noDate].find((x) => x.id === id);
  assert.deepEqual([by("now").owner, by("now").suggested], ["Iida", ""], "t: oma vastuu, tehtävällä ei ole työvirtaa");
  assert.deepEqual([by("late").owner, by("late").suggested], ["Mika", "Mika"], "ehdotus on vastuualueen omistaja");
});

test("avoin ehdotus nousee huomioon, päätetty ei, ja vain ehdotustyypin lomake", () => {
  const more = [
    { plan_id: "a", id: "t-eh", kind: "formtype", data: { name: "Ehdotus", proposal: true } }, { plan_id: "a", id: "t-ko", kind: "formtype", data: { name: "Kommentti" } },
    { plan_id: "a", id: "f1", kind: "form", parent_id: "r1", data: { type: "t-eh", typeName: "Ehdotus", status: "open" } },
    { plan_id: "a", id: "f2", kind: "form", parent_id: "r1", data: { type: "t-eh", typeName: "Ehdotus", status: "accepted" } },
    { plan_id: "a", id: "f3", kind: "form", parent_id: "r1", data: { type: "t-ko", typeName: "Kommentti", status: "open" } }
  ];
  const r = buildToday(items.concat(more), T);
  const f = r.attention.find((a) => a.id === "f1");
  assert.ok(f && f.owner === "Mika" && f.title === "Ehdotus · Sales");
  assert.deepEqual(ids(r.attention).filter((x) => x.startsWith("f")), ["f1"]);
  assert.deepEqual(ids(buildToday(items.concat(more), T, { owner: "Iida" }).attention).filter((x) => x.startsWith("f")), []);
});

test("tehtävät luokitellaan päivän mukaan, valmis ei näy", () => {
  const r = buildToday(items, T);
  assert.deepEqual(ids(r.late), ["late"]);
  assert.deepEqual(ids(r.today).sort(), ["now", "other"]);
  assert.deepEqual(ids(r.week), ["wk"]);
  assert.deepEqual(ids(r.later), ["far"]);
  assert.deepEqual(ids(r.doing), ["doing"]);
  assert.deepEqual(ids(r.noDate), ["none", "bad"]);
});

test("huomio kokoaa vain huonot, vastuu periytyy roolista", () => {
  const r = buildToday(items, T);
  assert.deepEqual(ids(r.attention).sort(), ["k1", "m1", "x1"], "alle alarajan olevat tavoiterivit, ei rajan päällä olevia, ei ilman toteumaa, ei vanhan mittarin tilaa");
  assert.equal(r.attention.find((a) => a.id === "k1").owner, "Mika");
  assert.equal(r.attention.find((a) => a.id === "k1").title, "Konversio", "nimi tulee mallilta");
  assert.equal(r.late[0].owner, "Mika");
  assert.deepEqual(r.owners, ["Harri", "Iida", "Mika"]);
});

test("suodatus vastuun ja suunnitelman mukaan", () => {
  assert.deepEqual(ids(buildToday(items, T, { owner: "Iida" }).today), ["now"]);
  assert.deepEqual(ids(buildToday(items, T, { plan: "b" }).today), ["other"]);
  assert.deepEqual(ids(buildToday(items, T, { plan: "b" }).attention), ["x1"]);
  assert.deepEqual(buildToday(items, T, { owner: "Mika" }).owners, ["Harri", "Iida", "Mika"], "valikko säilyy");
});

test("rajapäivät ja päivälaskenta", () => {
  assert.equal(addDays("2026-12-30", 7), "2027-01-06");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(fmtDate("2026-11-04"), "4.11.2026");
  assert.equal(fmtDate("roskaa"), "");
  assert.equal(fmtLong("2026-11-04"), "keskiviikko 4.11.2026");
  assert.equal(todayISO(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
  assert.equal(isLate(task("x", { due: "2026-11-03" }), T), true);
  assert.equal(isLate(task("x", { due: "2026-11-03", status: "done" }), T), false);
  assert.equal(ownerOf({ data: { stream: "" } }, [{ data: { stream: "", owner: "Väärä" } }]), "");
});

test("tyhjä tietojoukko ei kaadu", () => {
  const r = buildToday([], T);
  assert.equal(r.late.length + r.noDate.length + r.attention.length, 0);
});

test("ownerOf: vain tehtävälle valittu vastuuhenkilö, työvirta ei periydy; suggestedOwner on pelkkä ehdotus", async () => {
  const { suggestedOwner } = await import("../public/app/core/today.js");
  const roles = [{ data: { stream: "w1", owner: "Mika" } }];
  assert.equal(ownerOf({ data: { stream: "w1" } }, roles), "");
  assert.equal(ownerOf({ data: { stream: "w1", owner: " Iida " } }, roles), "Iida");
  assert.equal(suggestedOwner("w1", roles), "Mika");
  assert.equal(suggestedOwner("", roles), "");
});
