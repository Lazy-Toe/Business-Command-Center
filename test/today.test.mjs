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

test("kuukausijako: kuluva kuukausi ja viisi seuraavaa aina mukana, tehtävät kuukausiin ja yli menevät erikseen", async () => {
  const { monthBuckets, monthLabel } = await import("../public/app/core/today.js");
  const t = (id, due) => ({ id, data: { due } });
  const B = monthBuckets([t("a", "2026-11-30"), t("b", "2026-12-01"), t("c", "2027-01-31"), t("d", "2027-04-05"), t("e", "2027-06-01"), t("f", "2026-11-06")], "2026-11-05", 6);
  assert.deepEqual(B.months.map((m) => m.label), ["Marraskuu 2026", "Joulukuu 2026", "Tammikuu 2027", "Helmikuu 2027", "Maaliskuu 2027", "Huhtikuu 2027"]);
  assert.deepEqual(B.months.map((m) => m.list.map((x) => x.id)), [["f", "a"], ["b"], ["c"], [], [], ["d"]], "tyhjätkin kuukaudet näkyvät, ja kuukauden sisällä päivän mukaan");
  assert.deepEqual(B.beyond.map((x) => x.id), ["e"]);
  assert.equal(B.months[0].current, true);
  assert.equal(monthLabel("2027-02"), "Helmikuu 2027");
  assert.equal(monthBuckets([], "2026-12-15", 3).months.map((m) => m.key).join(), "2026-12,2027-01,2027-02", "vuodenvaihde");
});

test("jaksovalinnat: myöhässä, tänään, huomenna, viikot, kuukausi ja ei päivää", async () => {
  const { inPeriod, weekRange, monthGrid, byDueFirst } = await import("../public/app/core/today.js");
  const T = "2026-11-05"; // torstai
  const t = (due) => ({ data: due ? { due } : {} });
  assert.deepEqual(weekRange(T, 0), ["2026-11-02", "2026-11-08"]);
  assert.deepEqual(weekRange(T, 1), ["2026-11-09", "2026-11-15"]);
  const hit = (key) => ["2026-11-01", "2026-11-05", "2026-11-06", "2026-11-08", "2026-11-09", "2026-12-24", ""].filter((d) => inPeriod(t(d), key, T));
  assert.deepEqual(hit("late"), ["2026-11-01"]);
  assert.deepEqual(hit("today"), ["2026-11-05"]);
  assert.deepEqual(hit("tomorrow"), ["2026-11-06"]);
  assert.deepEqual(hit("week"), ["2026-11-05", "2026-11-06", "2026-11-08"]);
  assert.deepEqual(hit("nextweek"), ["2026-11-09"]);
  assert.deepEqual(hit("m:2026-12"), ["2026-12-24"]);
  assert.deepEqual(hit("none"), [""]);
  assert.equal(hit("todo").length, 6, "kaikki päivälliset");
  assert.deepEqual([t(""), t("2026-12-01"), t("2026-11-01")].sort(byDueFirst).map((x) => x.data.due || ""), ["2026-11-01", "2026-12-01", ""]);
  const g = monthGrid([t("2026-11-05"), t("2026-11-05"), t("2026-12-01")], 2026, 11);
  assert.equal(g[0][0].date, "2026-10-26", "viikko alkaa maanantaista");
  assert.equal(g.flat().find((d) => d.date === "2026-11-05").tasks.length, 2);
  assert.ok(g.every((w) => w.length === 7) && g.length >= 5);
});

test("viikkotaso: viikon numero, viikon loppu, viikkoteksti ja valittavat viikot", async () => {
  const { weekNumber, weekEnd, isWeekDue, fmtDue, weekSpan, weekOptions } = await import("../public/app/core/today.js");
  assert.deepEqual(["2026-11-05", "2026-11-02", "2026-11-08", "2027-01-01", "2026-12-28", "2027-01-03", "2026-01-01", "2027-01-04"].map(weekNumber), [45, 45, 45, 53, 53, 53, 1, 1]);
  assert.equal(weekEnd("2026-11-05"), "2026-11-08");
  assert.equal(weekEnd("2026-11-08"), "2026-11-08", "sunnuntai on viikon loppu");
  assert.equal(weekEnd("2026-11-09"), "2026-11-15");
  assert.equal(isWeekDue("2026-11-08"), true);
  assert.equal(isWeekDue("2026-11-06"), false);
  assert.equal(fmtDue("2026-11-15"), "vko 46");
  assert.equal(fmtDue("2026-11-13"), "13.11.2026");
  assert.equal(fmtDue(""), "");
  assert.equal(weekSpan("2026-11-12"), "9.–15.11.");
  assert.equal(weekSpan("2026-12-02"), "30.11.–6.12.");
  const o = weekOptions("2026-11-05", 3);
  assert.deepEqual(o.map((x) => x.value), ["2026-11-08", "2026-11-15", "2026-11-22"]);
  assert.equal(o[0].label, "Vko 45 (2.–8.11.)");
});

test("kesto: aloitus ja lopetus tekstinä, ja kuukausikalenterissa tehtävä näkyy koko kestonsa ajan", async () => {
  const { fmtSpan, fmtStart, isWeekStart, monthGrid } = await import("../public/app/core/today.js");
  assert.equal(isWeekStart("2026-11-02"), true);
  assert.equal(isWeekStart("2026-11-03"), false);
  assert.equal(fmtStart("2026-11-02"), "vko 45");
  assert.equal(fmtStart("2026-11-03"), "3.11.2026");
  assert.equal(fmtSpan("2026-11-02", "2026-11-22"), "vko 45 – vko 47");
  assert.equal(fmtSpan("2026-11-03", "2026-11-13"), "3.11.2026 – 13.11.2026");
  assert.equal(fmtSpan("", "2026-11-13"), "13.11.2026");
  assert.equal(fmtSpan("2026-11-09", ""), "alk. vko 46");
  assert.equal(fmtSpan("2026-11-13", "2026-11-13"), "13.11.2026");
  const t = { data: { start: "2026-11-10", due: "2026-11-12" } }, u = { data: { due: "2026-11-11" } };
  const g = monthGrid([t, u], 2026, 11).flat();
  assert.deepEqual(g.filter((d) => d.tasks.includes(t)).map((d) => d.date), ["2026-11-10", "2026-11-11", "2026-11-12"]);
  assert.equal(g.find((d) => d.date === "2026-11-11").tasks.length, 2);
});

test("viikon valinta asettaa maanantain alkuun ja sunnuntain loppuun", async () => {
  const { weekChange } = await import("../public/app/core/today.js");
  assert.deepEqual(weekChange("2026-11-08"), { start: "2026-11-02", due: "2026-11-08" });
  assert.deepEqual(weekChange("2026-11-05"), { start: "2026-11-02", due: "2026-11-08" }, "mikä tahansa viikon päivä");
  assert.deepEqual(weekChange("2026-11-02"), { start: "2026-11-02", due: "2026-11-08" });
});
