// Tallennuskerros. Sivu käyttää vain kahta kutsua:
//   db.doc("status/<id>").set(data)
//   db.collection("status").onSnapshot(callback)
// Verkossa tiedot kulkevat oman rajapinnan /api/status kautta (worker.js), jonka takana on
// Cloudflare Access. Erillistä kirjautumista ei ole. Paikallisesti avattuna (file://)
// tiedot tallentuvat vain tämän selaimen muistiin.
(function () {
  function makeSnap(rows) {
    return {
      docs: Object.keys(rows).map(function (id) {
        var v = rows[id];
        return { id: id, data: function () { return v; } };
      })
    };
  }

  function localStore() {
    var KEY = "bcc-data", rows = null, listeners = [];
    try { rows = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { rows = null; }
    if (!rows) rows = {};
    function persist() { try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch (e) {} }
    function emit() { var s = makeSnap(rows); listeners.forEach(function (fn) { fn(s); }); }
    return {
      canWrite: true,
      db: {
        doc: function (path) {
          var id = path.split("/")[1];
          return { set: function (body) { rows[id] = body; persist(); setTimeout(emit, 0); return Promise.resolve(); } };
        },
        collection: function () {
          return { onSnapshot: function (next) { listeners.push(next); setTimeout(function () { next(makeSnap(rows)); }, 0); return function () {}; } };
        }
      }
    };
  }

  async function apiStore() {
    var first = await fetch("/api/status", { credentials: "same-origin", cache: "no-store" });
    if (!first.ok) throw new Error("HTTP " + first.status);
    var rows = {}, listeners = [], busy = false;
    function take(list) { rows = {}; list.forEach(function (x) { rows[x.id] = x.data; }); }
    function emit() { var s = makeSnap(rows); listeners.forEach(function (fn) { fn(s); }); }
    take((await first.json()).rows || []);
    async function load() {
      if (busy) return; busy = true;
      try {
        var r = await fetch("/api/status", { credentials: "same-origin", cache: "no-store" });
        if (r.ok) { take((await r.json()).rows || []); emit(); }
      } catch (e) {} finally { busy = false; }
    }
    setInterval(function () { if (!document.hidden) load(); }, 20000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) load(); });
    return {
      canWrite: true,
      db: {
        doc: function (path) {
          var id = path.split("/")[1];
          return {
            set: async function (body) {
              rows[id] = body;
              var r = await fetch("/api/status/" + encodeURIComponent(id), {
                method: "PUT", credentials: "same-origin",
                headers: { "content-type": "application/json" }, body: JSON.stringify(body)
              });
              if (!r.ok) throw { code: r.status === 403 ? "invalid_argument" : "error", message: "HTTP " + r.status };
            }
          };
        },
        collection: function () {
          return { onSnapshot: function (next) { listeners.push(next); setTimeout(emit, 0); return function () {}; } };
        }
      }
    };
  }

  function notice(msg) {
    var n = document.createElement("div");
    n.textContent = msg;
    n.style.cssText = "position:fixed;left:16px;right:16px;bottom:16px;z-index:20;font:600 14px/1.4 'IBM Plex Sans',Arial,sans-serif;padding:12px 14px;border-radius:4px;background:var(--neg-soft);color:var(--neg);border:1px solid var(--neg);text-align:center";
    document.body.appendChild(n);
  }

  window.EmceStore = {
    init: async function () {
      if (location.protocol.indexOf("http") !== 0) return localStore();
      try { return await apiStore(); } catch (e) {
        console.error(e);
        notice("Tietoja ei saatu ladattua (" + e.message + "). Muutokset eivät tallennu.");
        return null;
      }
    }
  };
})();
