"use strict";
/* Angler Fish Log: all app logic (IIFE, no modules). Built on the MH Hunting Logs' pattern
   (entry editor + logbook + autosaved draft + save files). Nothing is read from the game:
   every field is free text from the catch card, and data.js only feeds the suggestion lists. */
(function () {
  const DATA = window.ANGLER_DATA || {};
  const LIST = (k) => (Array.isArray(DATA[k]) ? DATA[k] : []);
  const $ = (id) => document.getElementById(id);
  // Every user-supplied string goes in through textContent/.value, never innerHTML.
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const APP_TITLE = "Angler Fish Log";
  const norm = (s) => String(s || "").trim().toLowerCase();
  const alpha = (a, b) => a.localeCompare(b);

  // ── Units ────────────────────────────────────────────────────────────────
  // Values are kept exactly as typed, with the unit they were typed in. Comparisons (bests,
  // the "+" change, sorting) go through a base unit: ounces, inches, °F.
  const W_TO_OZ = { oz: 1, lb: 16, g: 1 / 28.349523125, kg: 1000 / 28.349523125 };
  const L_TO_IN = { in: 1, ft: 12, cm: 1 / 2.54, m: 100 / 2.54 };
  const ozOf = (e) => (e.weight == null ? null : e.weight * (W_TO_OZ[e.weightUnit] || 1));
  const inOf = (e) => (e.length == null ? null : e.length * (L_TO_IN[e.lengthUnit] || 1));
  const fOf = (e) => (e.temp == null ? null : e.tempUnit === "C" ? e.temp * 9 / 5 + 32 : e.temp);
  // Two decimals like the catch card, trailing zeros dropped (56.50 -> 56.5).
  const fmtNum = (n) => String(Math.round(n * 100) / 100);

  const UNITS_KEY = "angler-log-units";
  let unitsMode = "asEntered";
  try { unitsMode = localStorage.getItem(UNITS_KEY) || "asEntered"; } catch (e) {}
  if (!["asEntered", "imperial", "metric"].includes(unitsMode)) unitsMode = "asEntered";

  // Which unit an entry's weight shows in under the current mode. Imperial follows the
  // catch card (ounces under a pound); metric switches to kg at a kilo.
  function weightUnit(e, oz) {
    if (unitsMode === "imperial") return oz < 16 ? "oz" : "lb";
    if (unitsMode === "metric") return oz * 28.349523125 < 1000 ? "g" : "kg";
    return e.weightUnit || "oz";
  }
  function lengthUnit(e, inch) {
    if (unitsMode === "imperial") return "ft";      // the card gives feet even for small fish
    if (unitsMode === "metric") return inch * 2.54 < 100 ? "cm" : "m";
    return e.lengthUnit || "ft";
  }
  const showW = (oz, u) => fmtNum(oz / W_TO_OZ[u]) + " " + u;
  const showL = (inch, u) => fmtNum(inch / L_TO_IN[u]) + " " + u;
  function showTemp(e) {
    if (e.temp == null) return "";
    const u = unitsMode === "imperial" ? "F" : unitsMode === "metric" ? "C" : (e.tempUnit || "F");
    const f = fOf(e);
    return fmtNum(u === "C" ? (f - 32) * 5 / 9 : f) + " °" + u;
  }

  // ── Medals ───────────────────────────────────────────────────────────────
  // Ranked by their order in data.js (worst first). A medal typed that isn't in the list
  // still shows; it just ranks below every known one.
  const MEDALS = LIST("medals");
  const medalRank = (m) => MEDALS.findIndex(x => norm(x) === norm(m));
  function medalChip(m) {
    const c = el("span", "medal", m);
    const known = MEDALS.find(x => norm(x) === norm(m));
    if (known) c.classList.add("m-" + norm(known).replace(/[^a-z0-9]+/g, "-"));
    return c;
  }

  // ── State ────────────────────────────────────────────────────────────────
  let entries = [];      // see normalizeEntry for the shape
  let presets = [];      // { name, rod, reel, bait }
  // History: per text field, every value it has held, newest first. The user's own list,
  // kept apart from the log so a value can be removed (or added by hand) without touching a
  // catch. Saving a catch adds its values; data.js's community lists are offered alongside.
  const HIST_FIELDS = {
    angler: { id: "f_angler", label: "Angler" },
    reserve: { id: "f_reserve", label: "Reserve" },
    species: { id: "f_species", label: "Species" },
    medal: { id: "f_medal", label: "Medal" },
    rod: { id: "f_rod", label: "Rod" },
    reel: { id: "f_reel", label: "Reel" },
    bait: { id: "f_bait", label: "Bait" },
    traits: { id: "f_traits", label: "Traits", multi: true },
    timeOfDay: { id: "f_timeOfDay", label: "Time of Day" },
    weather: { id: "f_weather", label: "Weather" },
  };
  let history = {};      // field -> [value, ...]
  let histVersion = 0;
  let editingId = null;
  let seqCounter = 0;
  let dirty = false;
  let fileHandle = null;
  const STREAK_KEY = "angler-log-samespot";
  let streak = false;
  try { streak = localStorage.getItem(STREAK_KEY) === "1"; } catch (e) {}
  const STAMP_KEY = "angler-log-timestamp";
  let autoStamp = true;
  try { autoStamp = localStorage.getItem(STAMP_KEY) !== "0"; } catch (e) {}
  // The units last saved with, so a fresh form starts in them.
  const LAST_UNITS_KEY = "angler-log-last-units";

  const newId = () => "fl_" + (seqCounter + 1).toString(36) + "_" + Math.random().toString(36).slice(2, 8);

  // ── Toast ────────────────────────────────────────────────────────────────
  let toastTimer = null;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add("hidden"), 2200);
  }

  // ── Dirty tracking + autosave ────────────────────────────────────────────
  const AUTOSAVE_KEY = "angler-log-autosave";
  const SAVE_APP = "angler-fish-log";
  const SAVE_VERSION = 1;
  const serializeSave = () => ({ app: SAVE_APP, version: SAVE_VERSION, entries, presets, history });

  function markDirty() {
    if (!dirty) {
      dirty = true;
      $("dirtyDot").classList.remove("hidden");
      document.title = "● " + APP_TITLE;
    }
    scheduleAutosave();
  }
  function clearDirty() {
    dirty = false;
    $("dirtyDot").classList.add("hidden");
    document.title = APP_TITLE;
  }
  let autosaveTimer = null;
  function writeLocalSave() {
    clearTimeout(autosaveTimer);
    try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(serializeSave())); } catch (e) {}
  }
  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(writeLocalSave, 500);
  }

  // ── Draft: the entry currently in the editor ─────────────────────────────
  // Its own key and not part of the save file: a draft is this browser's working state.
  const DRAFT_KEY = "angler-log-draft";
  let draftTimer = null;
  const TEXT_FIELDS = ["date", "angler", "reserve", "species", "medal", "rod", "reel", "bait",
    "fightTime", "timeOfDay", "weather", "fate", "notes"];
  const NUM_FIELDS = ["score", "weight", "length", "rodXp", "reelXp", "baitXp", "temp"];
  // The date and angler are left out: the reset stamps one and carries the other over, so
  // neither is "something typed" on its own.
  const draftIsEmpty = (d) => TEXT_FIELDS.every(k => k === "date" || k === "angler" || !d[k]) &&
    NUM_FIELDS.every(k => d[k] == null) && !(d.traits || []).length;

  function writeDraft() {
    clearTimeout(draftTimer);
    const data = readForm();
    try {
      if (draftIsEmpty(data)) localStorage.removeItem(DRAFT_KEY);
      else localStorage.setItem(DRAFT_KEY, JSON.stringify({ editingId, data }));
    } catch (e) {}
  }
  function scheduleDraftSave() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(writeDraft, 400);
  }
  // `raw` is read at boot before resetEditor(), which would otherwise clear it.
  function loadDraft(raw) {
    if (!raw) return false;
    let d;
    try { d = JSON.parse(raw); } catch (e) { return false; }
    if (!d || !d.data) return false;
    const data = normalizeEntry(Object.assign({ seq: 0 }, d.data));
    if (draftIsEmpty(data)) return false;
    writeForm(data);
    editingId = (d.editingId && entries.some(e => e.id === d.editingId)) ? d.editingId : null;
    $("deleteEntryBtn").classList.toggle("hidden", !editingId);
    $("saveAsNewBtn").classList.toggle("hidden", !editingId);
    $("saveEntryBtn").textContent = editingId ? "Update Entry" : "Save Entry";
    refreshEditorButtons();
    highlightEditing();
    renderHead();
    return true;
  }

  function loadAutosave() {
    let raw;
    try { raw = localStorage.getItem(AUTOSAVE_KEY); } catch (e) { return; }
    if (raw) adoptSave(raw, true);
  }
  // Refuses anything that isn't one of our files, so an unrelated JSON never replaces a log.
  function adoptSave(text, quiet) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) {
      if (!quiet) toast("That file isn't valid JSON.");
      return false;
    }
    if (!obj || obj.app !== SAVE_APP || !Array.isArray(obj.entries)) {
      if (!quiet) toast("That doesn't look like a fish log file.");
      return false;
    }
    seqCounter = 0;
    entries = obj.entries.map(normalizeEntry);
    seqCounter = entries.reduce((m, e) => Math.max(m, e.seq || 0), 0);
    // Presets and History are merged rather than replaced: they're the user's lists, and
    // opening another logbook shouldn't throw away the ones built up here.
    const filePresets = Array.isArray(obj.presets) ? obj.presets.map(normalizePreset).filter(Boolean) : [];
    for (const p of filePresets) if (!presets.some(x => norm(x.name) === norm(p.name))) presets.push(p);
    presets.sort((a, b) => alpha(a.name, b.name));
    const fileHist = obj.history && typeof obj.history === "object" ? obj.history : null;
    for (const f of Object.keys(HIST_FIELDS)) {
      // A file from before History existed has none, so it's seeded from its catches.
      // addHistory puts each value at the front, so values go in oldest first: a stored list
      // (newest first) reversed, or the catches in the order they happened.
      const vals = fileHist ? (Array.isArray(fileHist[f]) ? fileHist[f].slice().reverse() : [])
        : entries.slice().sort(chrono).flatMap(e => (HIST_FIELDS[f].multi ? e[f] : [e[f]]));
      for (const v of vals) if (typeof v === "string") addHistory(f, v, true);
    }
    histVersion++;
    renderAll();
    writeLocalSave();
    return true;
  }
  // Anything read back off disk is untrusted shape.
  const str = (v) => (typeof v === "string" ? v : "");
  const num = (v) => {
    if (v === "" || v == null) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const pick = (v, allowed, dflt) => (allowed.includes(v) ? v : dflt);
  function normalizeEntry(raw) {
    const e = raw && typeof raw === "object" ? raw : {};
    return {
      id: str(e.id) || newId(),
      seq: Number.isFinite(e.seq) ? e.seq : ++seqCounter,
      date: str(e.date),
      angler: str(e.angler),
      reserve: str(e.reserve),
      species: str(e.species),
      medal: str(e.medal),
      score: num(e.score),
      weight: num(e.weight),
      weightUnit: pick(e.weightUnit, Object.keys(W_TO_OZ), "oz"),
      length: num(e.length),
      lengthUnit: pick(e.lengthUnit, Object.keys(L_TO_IN), "ft"),
      rod: str(e.rod), rodXp: num(e.rodXp),
      reel: str(e.reel), reelXp: num(e.reelXp),
      bait: str(e.bait), baitXp: num(e.baitXp),
      temp: num(e.temp),
      tempUnit: pick(e.tempUnit, ["F", "C"], "F"),
      fightTime: formatFightTime(str(e.fightTime), true),
      traits: Array.isArray(e.traits) ? e.traits.filter(t => typeof t === "string" && t.trim()).map(t => t.trim()) : [],
      timeOfDay: str(e.timeOfDay),
      weather: str(e.weather),
      fate: pick(e.fate, ["", "Kept", "Released"], ""),
      notes: str(e.notes),
    };
  }
  function normalizePreset(p) {
    if (!p || typeof p !== "object") return null;
    const out = { rod: str(p.rod), reel: str(p.reel), bait: str(p.bait) };
    if (!out.rod && !out.reel && !out.bait) return null;
    out.name = presetName(out);
    return out;
  }
  const presetName = (p) => [p.rod, p.reel, p.bait].filter(Boolean).join(" · ");

  // ── Save files ───────────────────────────────────────────────────────────
  const supportsFsApi = "showSaveFilePicker" in window;
  const saveOpts = {
    suggestedName: "angler-fish-log.json",
    types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
  };
  async function saveToFile() {
    const data = JSON.stringify(serializeSave(), null, 2);
    if (supportsFsApi) {
      try {
        if (!fileHandle) fileHandle = await window.showSaveFilePicker(saveOpts);
        const w = await fileHandle.createWritable();
        await w.write(data);
        await w.close();
        clearDirty();
        toast("Saved.");
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;
        fileHandle = null;   // fall through to a plain download
      }
    }
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "angler-fish-log.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    clearDirty();
    toast("Downloaded save file.");
  }
  // Drops fileHandle too, so the next Save can't overwrite the file that was open.
  function newLogbook() {
    const wipe = () => {
      entries = [];
      selected.clear();
      seqCounter = 0;
      fileHandle = null;
      renderAll();
      resetEditor();
      writeLocalSave();
      clearDirty();
      toast("New logbook.");
    };
    if (!entries.length) return wipe();
    const n = entries.length;
    confirmAction("Start a new logbook?",
      n + (n === 1 ? " catch" : " catches") + " will be cleared from this browser. Your History lists and " +
      "gear presets stay. Save to a file first if you want to keep the catches.", wipe);
  }
  function afterLoad(h) {
    fileHandle = h;
    clearDirty();
    resetEditor();
    toast("Loaded " + entries.length + (entries.length === 1 ? " catch." : " catches."));
  }
  async function openFile() {
    if (supportsFsApi && window.showOpenFilePicker) {
      try {
        const [h] = await window.showOpenFilePicker({ types: saveOpts.types });
        const f = await h.getFile();
        if (adoptSave(await f.text(), false)) afterLoad(h);
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
    }
    $("importFile").click();
  }
  $("importFile").addEventListener("change", function () {
    const file = this.files[0];
    this.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { if (adoptSave(ev.target.result, false)) afterLoad(null); };
    reader.readAsText(file);
  });
  window.addEventListener("beforeunload", (e) => {
    if (!dirty || !entries.length) return;
    e.preventDefault();
    e.returnValue = "";
  });

  // ── Bests and the "+" change ─────────────────────────────────────────────
  // The catch card's "+" is how far a catch beat that angler's previous best of the species
  // (the first catch counts in full). Worked out here from the log, in the order the catches
  // happened: by date, then entry number. Undated catches come after the dated ones.
  const bestKey = (e) => norm(e.species) + "|" + norm(e.angler);
  const chrono = (a, b) => {
    if (a.date !== b.date) {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date < b.date ? -1 : 1;
    }
    return (a.seq || 0) - (b.seq || 0);
  };
  let deltas = new Map();   // id -> { w, l, s, pb }
  function computeDeltas() {
    deltas = new Map();
    const groups = new Map();
    for (const e of entries) {
      if (!norm(e.species)) continue;
      const k = bestKey(e);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    }
    for (const rows of groups.values()) {
      rows.sort(chrono);
      let bw = null, bl = null, bs = null;
      const gain = (v, best) => (v == null ? null : best == null ? v : v > best ? v - best : null);
      for (const e of rows) {
        const w = ozOf(e), l = inOf(e), s = e.score;
        deltas.set(e.id, { w: gain(w, bw), l: gain(l, bl), s: gain(s, bs), pb: false });
        if (w != null && (bw == null || w > bw)) bw = w;
        if (l != null && (bl == null || l > bl)) bl = l;
        if (s != null && (bs == null || s > bs)) bs = s;
      }
      // The standing heaviest gets the PB mark.
      if (bw != null) {
        const top = rows.filter(e => ozOf(e) === bw).pop();
        if (top) deltas.get(top.id).pb = true;
      }
    }
  }
  // Bests for a species, for the editor header and the species list. angler === undefined
  // pools every angler.
  function bestsFor(species, angler) {
    const s = norm(species);
    const rows = entries.filter(e => norm(e.species) === s && (angler === undefined || norm(e.angler) === norm(angler)));
    const max = (f) => rows.reduce((m, e) => { const v = f(e); return v != null && (m == null || v > m.v) ? { v, e } : m; }, null);
    let medal = "";
    for (const e of rows) if (e.medal && (!medal || medalRank(e.medal) > medalRank(medal))) medal = e.medal;
    return { count: rows.length, w: max(ozOf), l: max(inOf), s: max(e => e.score), medal };
  }

  // ── Species browser ──────────────────────────────────────────────────────
  // Every species in the log, under the reserve it was caught on. Clicking one starts a catch
  // of it there.
  const treeNodes = [];   // { btn, grp, haystack, countEl }
  function buildTree() {
    const wrap = $("speciesTree");
    wrap.innerHTML = "";
    treeNodes.length = 0;
    const byReserve = new Map();
    for (const e of entries) {
      if (!e.species.trim()) continue;
      const r = e.reserve.trim();
      const rk = norm(r);
      if (!byReserve.has(rk)) byReserve.set(rk, { name: r, species: new Map() });
      const sp = byReserve.get(rk).species;
      const sk = norm(e.species);
      if (!sp.has(sk)) sp.set(sk, { name: e.species.trim(), rows: [] });
      sp.get(sk).rows.push(e);
    }
    if (!byReserve.size) {
      wrap.appendChild(el("p", "qtree-empty", "Species you log show up here, by reserve, with your bests."));
      return;
    }
    const reserves = [...byReserve.values()].sort((a, b) => (!a.name !== !b.name) ? (a.name ? -1 : 1) : alpha(a.name, b.name));
    for (const r of reserves) {
      const grp = el("div", "qgrp open");
      const head = el("div", "qhead");
      const count = el("span", "qcount", String(r.species.size));
      head.append(el("span", "qtwist", "▸"), el("span", null, r.name || "Reserve not set"), count);
      head.addEventListener("click", () => grp.classList.toggle("open"));
      const kids = el("div", "qkids");
      grp.append(head, kids);
      const list = [...r.species.values()].sort((a, b) => alpha(a.name, b.name));
      for (const s of list) {
        const btn = el("button", "qitem");
        btn.type = "button";
        const top = el("span", "qitem-top");
        top.append(el("span", "qitem-name", s.name));
        let medal = "";
        for (const e of s.rows) if (e.medal && (!medal || medalRank(e.medal) > medalRank(medal))) medal = e.medal;
        if (medal) top.append(medalChip(medal));
        btn.append(top);
        const heaviest = s.rows.reduce((m, e) => { const v = ozOf(e); return v != null && (!m || v > ozOf(m)) ? e : m; }, null);
        const sub = [s.rows.length + (s.rows.length === 1 ? " catch" : " catches")];
        if (heaviest) sub.push("best " + showW(ozOf(heaviest), weightUnit(heaviest, ozOf(heaviest))));
        btn.append(el("span", "qitem-sub", sub.join(" · ")));
        btn.addEventListener("click", () => pickSpecies(r.name, s.name));
        kids.appendChild(btn);
        treeNodes.push({ btn, grp, countEl: count, name: s.name, reserve: r.name,
          haystack: (s.name + " " + r.name).toLowerCase() });
      }
      wrap.appendChild(grp);
    }
    filterTree();
    markTreeSelection();
  }
  function filterTree() {
    const terms = $("speciesSearch").value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const hits = new Map();
    let total = 0;
    for (const n of treeNodes) {
      const hit = terms.every(t => n.haystack.includes(t));
      n.btn.classList.toggle("hidden", !hit);
      if (hit) { total++; hits.set(n.grp, (hits.get(n.grp) || 0) + 1); }
    }
    for (const n of treeNodes) {
      const h = hits.get(n.grp) || 0;
      n.grp.classList.toggle("hidden", h === 0);
      if (terms.length) n.grp.classList.add("open");
      n.countEl.textContent = String(h);
    }
    const all = treeNodes.length;
    $("searchCount").textContent = !all ? "" : terms.length
      ? total + (total === 1 ? " species matches" : " species match")
      : all + (all === 1 ? " species logged" : " species logged");
  }
  function markTreeSelection() {
    const s = norm($("f_species").value), r = norm($("f_reserve").value);
    for (const n of treeNodes) n.btn.classList.toggle("sel", !!s && norm(n.name) === s && norm(n.reserve) === r);
  }
  // Fills species and reserve into the form being written, leaving everything else as is.
  function pickSpecies(reserve, species) {
    $("f_reserve").value = reserve;
    $("f_species").value = species;
    onEditorEdit();
    renderHead();
    setView("editor");
  }

  // ── Editor header ────────────────────────────────────────────────────────
  function renderHead() {
    const species = $("f_species").value.trim();
    const reserve = $("f_reserve").value.trim();
    const angler = $("f_angler").value.trim();
    $("sh_name").textContent = species || (editingId ? "Catch" : "New catch");
    const meta = [];
    if (reserve) meta.push(reserve);
    const known = reserveData(reserve);
    if (known && known.region) meta.push(known.region);
    $("sh_meta").textContent = meta.length ? meta.join(" · ")
      : species ? "" : "Type the species, or pick one you've caught before from the Species list.";
    const rec = $("sh_records");
    rec.innerHTML = "";
    if (!species) return;
    const b = bestsFor(species, angler);
    const stat = (k, v) => { const s = el("span"); s.append(k + " ", el("b", null, v)); rec.appendChild(s); };
    stat(angler ? angler + "'s catches" : "Catches", String(b.count));
    if (b.w) stat("Heaviest", showW(b.w.v, weightUnit(b.w.e, b.w.v)));
    if (b.l) stat("Longest", showL(b.l.v, lengthUnit(b.l.e, b.l.v)));
    if (b.s) stat("Top score", fmtNum(b.s.v));
    if (b.medal) stat("Best medal", b.medal);
  }
  function reserveData(name) {
    const n = norm(name);
    return n ? LIST("reserves").find(r => norm(r.name) === n) || null : null;
  }

  // ── Form ─────────────────────────────────────────────────────────────────
  function readForm() {
    const v = (id) => $(id).value.trim();
    return {
      date: $("f_date").value,
      angler: v("f_angler"), reserve: v("f_reserve"), species: v("f_species"), medal: v("f_medal"),
      score: num(v("f_score")),
      weight: num(v("f_weight")), weightUnit: $("f_weightUnit").value,
      length: num(v("f_length")), lengthUnit: $("f_lengthUnit").value,
      rod: v("f_rod"), rodXp: num(v("f_rodXp")),
      reel: v("f_reel"), reelXp: num(v("f_reelXp")),
      bait: v("f_bait"), baitXp: num(v("f_baitXp")),
      temp: num(v("f_temp")), tempUnit: $("f_tempUnit").value,
      fightTime: formatFightTime(v("f_fightTime"), true),
      traits: v("f_traits").split(",").map(t => t.trim()).filter(Boolean),
      timeOfDay: v("f_timeOfDay"), weather: v("f_weather"),
      fate: $("f_fate").value, notes: $("f_notes").value.trim(),
    };
  }
  function writeForm(d) {
    const set = (id, val) => { $(id).value = val == null ? "" : val; };
    set("f_date", d.date);
    set("f_angler", d.angler); set("f_reserve", d.reserve); set("f_species", d.species); set("f_medal", d.medal);
    set("f_score", d.score);
    set("f_weight", d.weight); set("f_weightUnit", d.weightUnit || "oz");
    set("f_length", d.length); set("f_lengthUnit", d.lengthUnit || "ft");
    set("f_rod", d.rod); set("f_rodXp", d.rodXp);
    set("f_reel", d.reel); set("f_reelXp", d.reelXp);
    set("f_bait", d.bait); set("f_baitXp", d.baitXp);
    set("f_temp", d.temp); set("f_tempUnit", d.tempUnit || "F");
    set("f_fightTime", d.fightTime);
    set("f_traits", (d.traits || []).join(", "));
    set("f_timeOfDay", d.timeOfDay); set("f_weather", d.weather);
    set("f_fate", d.fate || ""); set("f_notes", d.notes);
    syncSpeciesList();
  }

  // Time is the catch card's HH:MM:SS. Non-digits are dropped and the colons placed from the
  // right, so typing 3 1 gives "31" and settles to 00:00:31. `settle` pads and clamps.
  function formatFightTime(value, settle) {
    const d = String(value || "").replace(/\D/g, "").slice(-6);
    if (!d) return "";
    if (!settle) {
      if (d.length <= 2) return d;
      if (d.length <= 4) return d.slice(0, -2) + ":" + d.slice(-2);
      return d.slice(0, -4) + ":" + d.slice(-4, -2) + ":" + d.slice(-2);
    }
    const p = d.padStart(6, "0");
    const two = (s, max) => String(Math.min(max, parseInt(s, 10))).padStart(2, "0");
    return p.slice(0, 2) + ":" + two(p.slice(2, 4), 59) + ":" + two(p.slice(4, 6), 59);
  }

  // ── Suggestion lists ─────────────────────────────────────────────────────
  // Every list is a hint only: the fields are plain text and take anything.
  function fillList(id, names) {
    const list = $(id);
    list.innerHTML = "";
    const seen = new Set();
    const frag = document.createDocumentFragment();
    // A name is a string, or { name, meaning } to show the meaning beside it.
    for (const n of names) {
      const name = typeof n === "string" ? n : (n && n.name) || "";
      const k = norm(name);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      const o = document.createElement("option");
      o.value = name.trim();
      if (n.meaning) o.label = n.meaning;
      frag.appendChild(o);
    }
    list.appendChild(frag);
  }
  // History first (the user's own values), then the community list for that field.
  const hist = (k) => history[k] || [];
  function refreshSuggestions() {
    fillList("anglerNames", hist("angler"));
    fillList("reserveNames", hist("reserve").concat(LIST("reserves").map(r => r.name)));
    fillList("medalNames", hist("medal").concat(MEDALS));
    fillList("weatherNames", hist("weather").concat(LIST("weather")));
    // A trait from History still gets its meaning when the community list knows it.
    const traitInfo = new Map(LIST("traits").map(t => [norm(t.name || t), t]));
    fillList("traitNames", hist("traits").map(t => traitInfo.get(norm(t)) || t).concat(LIST("traits")));
    fillList("timeOfDayNames", hist("timeOfDay").concat(LIST("timesOfDay")));
    fillList("rodNames", hist("rod").concat(presets.map(p => p.rod)));
    fillList("reelNames", hist("reel").concat(presets.map(p => p.reel)));
    fillList("baitNames", hist("bait").concat(presets.map(p => p.bait), LIST("baits"), LIST("lureTypes")));
    syncSpeciesList();
  }
  // The chosen reserve's own species come first, then your History, then the rest of the
  // community list.
  let speciesListFor = null;
  function syncSpeciesList() {
    const r = reserveData($("f_reserve").value);
    const key = (r ? r.name : "") + "|" + histVersion;
    if (key === speciesListFor) return;
    speciesListFor = key;
    const fish = (x) => (x.species || []).concat(x.legendary || []);
    const all = LIST("reserves").flatMap(fish).sort(alpha);
    fillList("speciesNames", (r ? fish(r) : []).concat(hist("species"), all));
  }

  // ── History ──────────────────────────────────────────────────────────────
  // `quiet` skips the redraw, for bulk adds. A value already there moves to the front.
  function addHistory(field, value, quiet) {
    const v = String(value || "").trim();
    if (!v || !HIST_FIELDS[field]) return;
    const list = (history[field] || []).filter(x => norm(x) !== norm(v));
    list.unshift(v);
    history[field] = list;
    if (!quiet) { histVersion++; refreshSuggestions(); }
  }
  function rememberEntry(data) {
    for (const [f, def] of Object.entries(HIST_FIELDS)) {
      const vals = def.multi ? data[f] || [] : [data[f]];
      vals.forEach(v => addHistory(f, v, true));
    }
    histVersion++;
    refreshSuggestions();
  }

  // Each History field gets a 🕘 button beside it, opening its list.
  let histField = null;
  for (const [f, def] of Object.entries(HIST_FIELDS)) {
    const input = $(def.id);
    const wrap = el("span", "hist-row");
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const btn = el("button", "hist-btn", "🕘");
    btn.type = "button";
    btn.title = def.label + " history";
    btn.setAttribute("aria-label", def.label + " history");
    btn.addEventListener("click", (ev) => { ev.preventDefault(); openHistory(f); });
    wrap.appendChild(btn);
  }
  function openHistory(f) {
    histField = f;
    $("historyTitle").textContent = HIST_FIELDS[f].label + " History";
    $("historyAdd").value = "";
    renderHistory();
    $("historyModal").classList.remove("hidden");
    $("historyAdd").focus();
  }
  function renderHistory() {
    const list = $("historyList");
    list.innerHTML = "";
    const vals = hist(histField);
    $("historyClear").disabled = !vals.length;
    if (!vals.length) {
      list.appendChild(el("li", "hist-empty", "Nothing yet. Values are added when you save a catch, or add them above."));
      return;
    }
    vals.forEach((v) => {
      const li = el("li");
      const pickBtn = el("button", "hist-pick", v);
      pickBtn.type = "button";
      pickBtn.title = "Fill this in";
      pickBtn.addEventListener("click", () => fillFromHistory(v));
      const del = el("button", "hist-del", "×");
      del.type = "button";
      del.title = "Remove from History";
      del.setAttribute("aria-label", "Remove " + v + " from History");
      del.addEventListener("click", () => {
        history[histField] = hist(histField).filter(x => x !== v);
        histVersion++;
        refreshSuggestions();
        markDirty();
        renderHistory();
      });
      li.append(pickBtn, del);
      list.appendChild(li);
    });
  }
  // Traits take several values, so a pick is appended to what's there instead of replacing it.
  function fillFromHistory(v) {
    const def = HIST_FIELDS[histField];
    const input = $(def.id);
    if (def.multi) {
      const cur = input.value.split(",").map(t => t.trim()).filter(Boolean);
      if (!cur.some(t => norm(t) === norm(v))) cur.push(v);
      input.value = cur.join(", ");
    } else {
      input.value = v;
    }
    $("historyModal").classList.add("hidden");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function addFromBox() {
    const v = $("historyAdd").value.trim();
    if (!v) return;
    addHistory(histField, v);
    markDirty();
    $("historyAdd").value = "";
    renderHistory();
  }
  $("historyAddBtn").addEventListener("click", addFromBox);
  $("historyAdd").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addFromBox(); } });
  $("historyClear").addEventListener("click", () => {
    const f = histField;
    confirmAction("Clear " + HIST_FIELDS[f].label + " History?",
      "Every value in this list is removed. Your logged catches are not changed.", () => {
        history[f] = [];
        histVersion++;
        refreshSuggestions();
        markDirty();
        renderHistory();
      });
  });

  // ── Gear presets ─────────────────────────────────────────────────────────
  function renderPresets() {
    const sel = $("presetPick");
    const keep = sel.value;
    sel.innerHTML = "";
    sel.add(new Option(presets.length ? "Gear presets…" : "No gear presets yet", ""));
    presets.forEach((p, i) => sel.add(new Option(p.name, String(i))));
    sel.value = presets[+keep] ? keep : "";
    $("presetDelete").disabled = !sel.value;
  }
  $("presetPick").addEventListener("change", function () {
    $("presetDelete").disabled = !this.value;
    const p = presets[+this.value];
    if (!this.value || !p) return;
    $("f_rod").value = p.rod; $("f_reel").value = p.reel; $("f_bait").value = p.bait;
    onEditorEdit();
  });
  $("presetSave").addEventListener("click", () => {
    const p = normalizePreset({ rod: $("f_rod").value.trim(), reel: $("f_reel").value.trim(), bait: $("f_bait").value.trim() });
    if (!p) return toast("Fill in a rod, reel or bait first.");
    const i = presets.findIndex(x => norm(x.name) === norm(p.name));
    if (i >= 0) { $("presetPick").value = String(i); $("presetDelete").disabled = false; return toast("That preset is already saved."); }
    presets.push(p);
    presets.sort((a, b) => alpha(a.name, b.name));
    renderPresets();
    $("presetPick").value = String(presets.indexOf(p));
    $("presetDelete").disabled = false;
    refreshSuggestions();
    markDirty();
    toast("Preset saved.");
  });
  $("presetDelete").addEventListener("click", () => {
    const i = +$("presetPick").value;
    const p = presets[i];
    if (!$("presetPick").value || !p) return;
    confirmAction("Delete this preset?", p.name, () => {
      presets.splice(i, 1);
      renderPresets();
      refreshSuggestions();
      markDirty();
      toast("Preset deleted.");
    });
  });

  // ── Editor state ─────────────────────────────────────────────────────────
  let editorBaseline = "";
  const editorSnapshot = () => JSON.stringify(readForm());
  function refreshEditorButtons() {
    const changed = editorSnapshot() !== editorBaseline;
    const repeatable = streak && !editingId;
    const hasSpecies = !!$("f_species").value.trim();
    $("saveEntryBtn").disabled = (!changed && !repeatable) || !hasSpecies;
    $("cancelEntryBtn").disabled = !changed;
    $("saveAsNewBtn").disabled = !hasSpecies;
  }
  function syncStreakSwitch() {
    $("streakToggle").checked = streak;
    $("streakToggle").closest(".opt-toggle").classList.toggle("on", streak);
  }
  function syncStampSwitch() {
    $("stampToggle").checked = autoStamp;
    $("stampToggle").closest(".opt-toggle").classList.toggle("on", autoStamp);
    $("f_date").disabled = autoStamp;
    $("f_date").title = autoStamp ? "Set automatically when you save" : "";
  }
  function markEditorClean() {
    editorBaseline = editorSnapshot();
    refreshEditorButtons();
  }
  function highlightEditing() {
    document.querySelectorAll(".log-entry").forEach(n => n.classList.toggle("sel", n.dataset.id === editingId));
  }
  function exitEditMode() {
    editingId = null;
    highlightEditing();
    $("deleteEntryBtn").classList.add("hidden");
    $("saveAsNewBtn").classList.add("hidden");
    $("saveEntryBtn").textContent = "Save Entry";
  }
  const toDateInput = (d) => {
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
  };
  function lastUnits() {
    let u = {};
    try { u = JSON.parse(localStorage.getItem(LAST_UNITS_KEY) || "{}") || {}; } catch (e) {}
    return {
      weightUnit: pick(u.weightUnit, Object.keys(W_TO_OZ), "oz"),
      lengthUnit: pick(u.lengthUnit, Object.keys(L_TO_IN), "ft"),
      tempUnit: pick(u.tempUnit, ["F", "C"], "F"),
    };
  }
  // A blank catch. The angler carries over: it's nearly always the same person.
  function resetEditor() {
    exitEditMode();
    // On a fresh page the form is empty, so it falls back to the most recent angler.
    const angler = $("f_angler").value || hist("angler")[0] || "";
    writeForm(Object.assign(normalizeEntry({ seq: 0 }), lastUnits(), { date: toDateInput(new Date()), angler }));
    $("presetPick").value = "";
    $("presetDelete").disabled = true;
    renderHead();
    markTreeSelection();
    markEditorClean();
    writeDraft();
  }
  function editEntry(entry) {
    editingId = entry.id;
    writeForm(entry);
    $("deleteEntryBtn").classList.remove("hidden");
    $("saveAsNewBtn").classList.remove("hidden");
    $("saveEntryBtn").textContent = "Update Entry";
    markEditorClean();
    highlightEditing();
    renderHead();
    markTreeSelection();
    setView("editor");
    writeDraft();
  }
  function saveEntry() {
    if (!$("f_species").value.trim()) return;
    const data = readForm();
    if (editingId) {
      const i = entries.findIndex(e => e.id === editingId);
      if (i >= 0) entries[i] = Object.assign({}, entries[i], data);
      rememberEntry(data);
      markDirty();
      renderAll();
      highlightEditing();
      markEditorClean();
      writeDraft();
      toast("Entry updated.");
    } else {
      addEntry(data);
      toast("Catch logged.");
    }
  }
  function addEntry(data) {
    if (autoStamp) data.date = toDateInput(new Date());
    entries.push(Object.assign({ id: newId(), seq: ++seqCounter }, data));
    rememberEntry(data);
    try {
      localStorage.setItem(LAST_UNITS_KEY, JSON.stringify({
        weightUnit: data.weightUnit, lengthUnit: data.lengthUnit, tempUnit: data.tempUnit }));
    } catch (e) {}
    markDirty();
    renderAll();
    if (streak) {
      exitEditMode();
      refreshEditorButtons();
      renderHead();
      writeDraft();
    } else {
      resetEditor();
    }
  }
  function saveAsNewEntry() {
    if (!$("f_species").value.trim()) return;
    addEntry(readForm());
    toast("Saved as a new entry.");
  }
  function deleteEntry(id) {
    const i = entries.findIndex(e => e.id === id);
    if (i < 0) return;
    entries.splice(i, 1);
    markDirty();
    renderAll();
    if (editingId === id) resetEditor();
    toast("Entry deleted.");
  }

  // ── Logbook ──────────────────────────────────────────────────────────────
  const byDate = (dir) => (a, b) => {
    if (a.date !== b.date) {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date < b.date ? dir : -dir;
    }
    return (b.seq || 0) - (a.seq || 0);
  };
  // Blank values sink to the bottom of a "largest first" sort.
  const byValue = (f) => (a, b) => {
    const x = f(a), y = f(b);
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
    return y - x || (b.seq || 0) - (a.seq || 0);
  };
  const SORTS = {
    dateDesc: { asc: false, cmp: byDate(1) },
    dateAsc: { asc: true, cmp: byDate(-1) },
    seqDesc: { asc: false, cmp: (a, b) => (b.seq || 0) - (a.seq || 0) },
    seqAsc: { asc: true, cmp: (a, b) => (a.seq || 0) - (b.seq || 0) },
    weightDesc: { asc: false, cmp: byValue(ozOf) },
    lengthDesc: { asc: false, cmp: byValue(inOf) },
    scoreDesc: { asc: false, cmp: byValue(e => e.score) },
  };
  const SORT_KEY = "angler-log-sort";
  let sortBy = "dateDesc";
  try { sortBy = localStorage.getItem(SORT_KEY) || "dateDesc"; } catch (e) {}
  if (!SORTS[sortBy]) sortBy = "dateDesc";
  const sortedEntries = () => entries.slice().sort(SORTS[sortBy].cmp);

  const GROUP_KEY = "angler-log-group";
  const dayTitle = (k) => {
    const d = new Date(k + "T00:00");
    return isNaN(d) ? k : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  };
  // Text keys group case-insensitively, under the spelling first seen.
  const textGroup = (field) => ({
    key: (e) => norm(e[field]),
    title: (k, rows) => rows[0][field].trim(),
    order: null,
  });
  const GROUPINGS = {
    none: {},
    date: {
      key: (e) => (e.date || "").slice(0, 10),
      title: (k) => dayTitle(k),
      order: (a, b) => SORTS[sortBy].asc ? a.localeCompare(b) : b.localeCompare(a),
    },
    reserve: textGroup("reserve"),
    species: textGroup("species"),
    angler: textGroup("angler"),
    medal: Object.assign(textGroup("medal"), {
      // Best medal first; typed medals not in the list after the known ones.
      order: (a, b) => (medalRank(b) - medalRank(a)) || a.localeCompare(b),
    }),
    fate: { key: (e) => e.fate, title: (k) => k, order: (a, b) => a.localeCompare(b) },
  };
  const EMPTY_TITLE = {
    date: "No date", reserve: "No reserve", species: "No species", angler: "No angler",
    medal: "No medal", fate: "Not recorded",
  };
  let groupBy = "none";
  try { groupBy = localStorage.getItem(GROUP_KEY) || "none"; } catch (e) {}
  if (!GROUPINGS[groupBy]) groupBy = "none";

  // ── Selection (for copying) ──────────────────────────────────────────────
  const selected = new Set();
  let renderedOrder = [];
  const cardsById = new Map();
  let pickAnchor = null;
  function applyPick(id, on) {
    if (on) selected.add(id); else selected.delete(id);
    const card = cardsById.get(id);
    if (!card) return;
    const box = card.querySelector(".le-pick");
    if (box) box.checked = on;
    card.classList.toggle("picked", on);
  }
  function updateSelectionUI() {
    const n = selected.size, all = entries.length;
    $("copySelBtn").textContent = n ? `Copy Selected (${n})` : "Copy Selected";
    $("copySelBtn").disabled = n === 0;
    $("clearSelBtn").disabled = n === 0;
    const box = $("selectAll");
    box.checked = all > 0 && n === all;
    box.indeterminate = n > 0 && n < all;
    box.disabled = all === 0;
  }

  function renderLog() {
    const list = $("lbList");
    list.innerHTML = "";
    $("lbCount").textContent = String(entries.length);
    $("lbCountTab").textContent = String(entries.length);
    renderedOrder = [];
    cardsById.clear();
    const live = new Set(entries.map(e => e.id));
    for (const id of [...selected]) if (!live.has(id)) selected.delete(id);
    if (pickAnchor && !live.has(pickAnchor)) pickAnchor = null;
    updateSelectionUI();
    if (!entries.length) {
      list.appendChild(el("p", "lb-empty", "No catches logged yet. Fill in the catch card's details and press Save Entry."));
      return;
    }
    const rows = sortedEntries();
    const g = GROUPINGS[groupBy];
    if (!g || !g.key) {
      rows.forEach(e => list.appendChild(entryCard(e)));
      highlightEditing();
      return;
    }
    const buckets = new Map();
    for (const e of rows) {
      const k = g.key(e);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(e);
    }
    const groups = [...buckets.entries()].map(([k, r]) => ({ key: k, rows: r, title: k ? g.title(k, r) : (EMPTY_TITLE[groupBy] || "—") }));
    groups.sort((a, b) => {
      if (!a.key !== !b.key) return a.key ? -1 : 1;
      if (!a.key) return 0;
      return g.order ? g.order(a.key, b.key) : alpha(a.title, b.title);
    });
    for (const grp of groups) {
      const head = el("div", "lb-group");
      head.append(el("span", "lb-group-name", grp.title), el("span", "lb-group-count", String(grp.rows.length)));
      list.appendChild(head);
      grp.rows.forEach(e => list.appendChild(entryCard(e)));
    }
    highlightEditing();
  }

  const formatDate = (d) => {
    if (!d) return "";
    const t = new Date(d);
    return isNaN(t) ? d : t.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  };
  // The three headline numbers with their "+" change, in the units being shown.
  function headline(e) {
    const d = deltas.get(e.id) || {};
    const out = [];
    const oz = ozOf(e);
    if (oz != null) {
      const u = weightUnit(e, oz);
      out.push({ k: "Weight", v: showW(oz, u), d: d.w != null ? "+" + showW(d.w, u) : "" });
    }
    const inch = inOf(e);
    if (inch != null) {
      const u = lengthUnit(e, inch);
      out.push({ k: "Length", v: showL(inch, u), d: d.l != null ? "+" + showL(d.l, u) : "" });
    }
    if (e.score != null) out.push({ k: "Score", v: fmtNum(e.score), d: d.s != null ? "+" + fmtNum(d.s) : "" });
    return out;
  }
  const xp = (v) => (v == null ? "" : " (" + fmtNum(v) + "%)");
  const gearText = (e) => [["Rod", e.rod, e.rodXp], ["Reel", e.reel, e.reelXp], ["Bait", e.bait, e.baitXp]]
    .filter(([, n, x]) => n || x != null)
    .map(([k, n, x]) => (n || k) + xp(x)).join(" / ");
  const conditions = (e) => [e.weather, e.timeOfDay].filter(Boolean).join(", ");

  function entryCard(e) {
    const card = el("div", "log-entry");
    card.dataset.id = e.id;
    renderedOrder.push(e.id);
    cardsById.set(e.id, card);

    const top = el("div", "le-top");
    const pick = el("input", "le-pick");
    pick.type = "checkbox";
    pick.checked = selected.has(e.id);
    pick.title = "Select for copying (shift-click for a range)";
    pick.setAttribute("aria-label", "Select entry " + (e.seq || 0) + " for copying");
    pick.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const on = pick.checked;
      applyPick(e.id, on);
      const from = ev.shiftKey && pickAnchor !== null ? renderedOrder.indexOf(pickAnchor) : -1;
      const to = renderedOrder.indexOf(e.id);
      if (from >= 0 && to >= 0) {
        const [lo, hi] = from < to ? [from, to] : [to, from];
        for (let i = lo; i <= hi; i++) applyPick(renderedOrder[i], on);
      } else {
        pickAnchor = e.id;
      }
      updateSelectionUI();
    });
    const mid = el("div");
    mid.style.cssText = "flex:1;min-width:0";
    mid.append(el("div", "le-title", e.species || "(no species)"));
    const meta = ["#" + (e.seq || 0), formatDate(e.date), e.angler, e.reserve].filter(Boolean).join(" · ");
    mid.append(el("div", "le-date", meta));
    top.append(pick, mid);
    if ((deltas.get(e.id) || {}).pb) {
      const pb = el("span", "le-pb", "PB");
      pb.title = "Heaviest " + (e.species || "") + (e.angler ? " for " + e.angler : "") + " in the log";
      top.append(pb);
    }
    if (e.medal) top.append(medalChip(e.medal));
    card.classList.toggle("picked", pick.checked);
    card.appendChild(top);

    const stats = headline(e);
    if (stats.length) {
      const box = el("div", "le-stats");
      for (const s of stats) {
        const c = el("div", "le-stat");
        c.append(el("span", "k", s.k), el("span", null, s.v));
        if (s.d) c.append(el("span", "d", "▲ " + s.d));
        box.appendChild(c);
      }
      card.appendChild(box);
    }

    const dl = el("dl", "le-fields");
    const row = (label, value, cls) => {
      if (!value) return;
      const d = el("div");
      d.append(el("dt", null, label), el("dd", cls || null, value));
      dl.appendChild(d);
    };
    row("Gear", gearText(e));
    row("Temp", showTemp(e));
    row("Time", e.fightTime);
    row("Traits", e.traits.join(", "));
    row("Conditions", conditions(e));
    row("Fish", e.fate);
    row("Notes", e.notes, "le-notes");
    if (dl.children.length) card.appendChild(dl);

    const actions = el("div", "le-actions");
    const editBtn = el("button", "btn tiny", "Edit");
    editBtn.type = "button";
    editBtn.addEventListener("click", (ev) => { ev.stopPropagation(); editEntry(e); });
    const delBtn = el("button", "btn tiny", "Delete");
    delBtn.type = "button";
    delBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      confirmAction("Delete this entry?", "#" + e.seq + " " + (e.species || ""), () => deleteEntry(e.id));
    });
    actions.append(editBtn, delBtn);
    card.appendChild(actions);
    card.addEventListener("click", () => editEntry(e));
    return card;
  }

  // ── Copy ─────────────────────────────────────────────────────────────────
  // Laid out like the catch card, top to bottom.
  function entryToText(e) {
    const lines = [];
    lines.push((e.species || "(no species)") + (e.medal ? " — " + e.medal : ""));
    if (e.angler) lines.push("Angler: " + e.angler);
    if (e.date) lines.push("Date: " + formatDate(e.date));
    if (e.reserve) lines.push("Reserve: " + e.reserve);
    for (const s of headline(e)) lines.push(s.k + ": " + s.v + (s.d ? " (" + s.d + ")" : ""));
    const g = gearText(e);
    if (g) lines.push("Gear: " + g);
    if (e.temp != null) lines.push("Temperature: " + showTemp(e));
    if (e.bait) lines.push("Bait Used: " + e.bait);
    if (e.fightTime) lines.push("Time: " + e.fightTime);
    if (e.traits.length) lines.push("Traits: " + e.traits.join(", "));
    if (e.timeOfDay) lines.push("Time of Day: " + e.timeOfDay);
    if (e.weather) lines.push("Weather: " + e.weather);
    if (e.fate) lines.push("Fish: " + e.fate);
    if (e.notes) lines.push("Notes: " + e.notes);
    return lines.join("\n");
  }
  function copyText(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      const orig = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = orig; updateSelectionUI(); }, 1500);
    }, () => toast("Couldn't reach the clipboard."));
  }

  // ── Confirm dialog ───────────────────────────────────────────────────────
  let confirmFn = null;
  function confirmAction(title, body, fn) {
    $("confirmTitle").textContent = title;
    $("confirmBody").textContent = body || "";
    confirmFn = fn;
    $("confirmModal").classList.remove("hidden");
  }
  $("confirmOk").addEventListener("click", () => {
    $("confirmModal").classList.add("hidden");
    const fn = confirmFn; confirmFn = null;
    if (fn) fn();
  });
  $("confirmCancel").addEventListener("click", () => {
    $("confirmModal").classList.add("hidden");
    confirmFn = null;
  });

  // ── Theme ────────────────────────────────────────────────────────────────
  const hexRgb = (h) => { h = h.replace("#", ""); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); };
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  const clamp01 = (n) => Math.max(0, Math.min(1, n));
  const rgbToHsl = ([r, g, b]) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const l = (max + min) / 2;
    if (d === 0) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6
            : max === g ? ((b - r) / d + 2) / 6
            : ((r - g) / d + 4) / 6;
    return [h, s, l];
  };
  const hslToRgb = ([h, s, l]) => {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h * 6) % 2 - 1)), m = l - c / 2;
    const hi = Math.floor(h * 6) % 6;
    const [r, g, b] = hi === 0 ? [c, x, 0] : hi === 1 ? [x, c, 0] : hi === 2 ? [0, c, x]
                    : hi === 3 ? [0, x, c] : hi === 4 ? [x, 0, c] : [c, 0, x];
    return [r + m, g + m, b + m].map(v => clamp(v * 255));
  };
  const darken = (rgb, f) => { const [h, s, l] = rgbToHsl(rgb); return hslToRgb([h, s, clamp01(l * f)]); };
  const lighten = (rgb, b) => { const [h, s, l] = rgbToHsl(rgb); return hslToRgb([h, s, clamp01(l + (1 - l) * b)]); };
  const css = (rgb) => `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;

  const COLORS = [
    ["Deep Lake", "#2F6F86"], ["Pine", "#3E6B48"], ["Dusk", "#5A4E8C"], ["Rust", "#A0522D"],
    ["Slate", "#4A5560"], ["Reed", "#7A7A3A"], ["Glacier", "#4F8FB0"], ["Lure Red", "#8C2F39"],
  ];
  const THEME_KEY = "angler-log-theme";
  function applyTheme(hex) {
    const c = hexRgb(hex), r = document.documentElement.style;
    r.setProperty("--accent", css(c));
    r.setProperty("--accent-hover", css(lighten(c, .5)));
    r.setProperty("--bg", css(darken(c, .34)));
    r.setProperty("--bg1", css(darken(c, .2)));
    r.setProperty("--bg2", css(darken(c, .46)));
    r.setProperty("--content-bg", css(darken(c, .28)));
    r.setProperty("--panel-bg", css(darken(c, .22)));
    r.setProperty("--input-bg", css(darken(c, .15)));
    try { localStorage.setItem(THEME_KEY, hex); } catch (e) {}
    document.querySelectorAll(".swatch").forEach(s => s.classList.toggle("sel", s.dataset.hex === hex));
  }
  function buildSwatches() {
    const wrap = $("swatches");
    wrap.innerHTML = "";
    for (const [name, hex] of COLORS) {
      const d = el("div", "swatch");
      d.dataset.hex = hex;
      d.style.background = hex;
      d.title = name;
      d.append(el("span", null, name));
      d.addEventListener("click", () => applyTheme(hex));
      wrap.appendChild(d);
    }
  }

  // ── Views ────────────────────────────────────────────────────────────────
  function setView(v) {
    $("app").dataset.view = v;
    $("tabSpecies").classList.toggle("sel", v === "species");
    $("tabEditor").classList.toggle("sel", v === "editor");
    $("tabLog").classList.toggle("sel", v === "log");
  }
  function renderAll() {
    computeDeltas();
    buildTree();
    renderLog();
    renderPresets();
    refreshSuggestions();
    renderHead();
  }

  // ── Wiring ───────────────────────────────────────────────────────────────
  const modal = (btnId, modalId, closeId) => {
    $(btnId).addEventListener("click", () => $(modalId).classList.remove("hidden"));
    $(closeId).addEventListener("click", () => $(modalId).classList.add("hidden"));
    $(modalId).addEventListener("click", (e) => { if (e.target.id === modalId) $(modalId).classList.add("hidden"); });
  };
  modal("helpBtn", "helpModal", "helpClose");
  modal("aboutBtn", "aboutModal", "aboutClose");
  modal("themeBtn", "themeModal", "themeClose");
  $("historyClose").addEventListener("click", () => $("historyModal").classList.add("hidden"));
  $("historyModal").addEventListener("click", (e) => { if (e.target.id === "historyModal") $("historyModal").classList.add("hidden"); });
  $("confirmModal").addEventListener("click", (e) => {
    if (e.target.id === "confirmModal") { $("confirmModal").classList.add("hidden"); confirmFn = null; }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    document.querySelectorAll(".modal:not(.hidden)").forEach(m => m.classList.add("hidden"));
    confirmFn = null;
  });

  $("speciesSearch").addEventListener("input", filterTree);
  $("treeExpand").addEventListener("click", () => document.querySelectorAll(".qgrp").forEach(g => g.classList.add("open")));
  $("treeCollapse").addEventListener("click", () => document.querySelectorAll(".qgrp").forEach(g => g.classList.remove("open")));

  $("newBtn").addEventListener("click", () => { resetEditor(); setView("editor"); });
  $("newLogBtn").addEventListener("click", newLogbook);
  $("saveBtn").addEventListener("click", saveToFile);
  $("openBtn").addEventListener("click", openFile);
  $("saveEntryBtn").addEventListener("click", saveEntry);
  $("saveAsNewBtn").addEventListener("click", saveAsNewEntry);
  $("cancelEntryBtn").addEventListener("click", () => resetEditor());
  $("deleteEntryBtn").addEventListener("click", () => {
    const e = entries.find(x => x.id === editingId);
    if (e) confirmAction("Delete this entry?", "#" + e.seq + " " + (e.species || ""), () => deleteEntry(e.id));
  });
  $("stampToggle").addEventListener("change", function () {
    autoStamp = this.checked;
    try { localStorage.setItem(STAMP_KEY, autoStamp ? "1" : "0"); } catch (e) {}
    syncStampSwitch();
    toast(autoStamp ? "Timestamp on: the date is set when you save." : "Timestamp off: set the date yourself.");
  });
  $("streakToggle").addEventListener("change", function () {
    streak = this.checked;
    try { localStorage.setItem(STREAK_KEY, streak ? "1" : "0"); } catch (e) {}
    syncStreakSwitch();
    refreshEditorButtons();
    toast(streak ? "Same Spot on: the form stays filled after saving." : "Same Spot off: the form clears after saving.");
  });
  // Every edit mirrors the form to the draft; the header and species highlight follow along.
  function onEditorEdit() {
    scheduleDraftSave();
    refreshEditorButtons();
  }
  $("editorPane").addEventListener("input", onEditorEdit);
  $("editorPane").addEventListener("change", onEditorEdit);
  ["f_species", "f_reserve", "f_angler"].forEach(id => $(id).addEventListener("input", () => {
    if (id === "f_reserve") syncSpeciesList();
    renderHead();
    markTreeSelection();
  }));
  $("f_fightTime").addEventListener("input", function () { this.value = formatFightTime(this.value, false); });
  $("f_fightTime").addEventListener("blur", function () { this.value = formatFightTime(this.value, true); });

  $("copySelBtn").addEventListener("click", () => {
    const picked = sortedEntries().filter(e => selected.has(e.id));
    if (picked.length) copyText(picked.map(entryToText).join("\n\n"), $("copySelBtn"));
  });
  $("selectAll").addEventListener("change", function () {
    const on = this.checked;
    entries.forEach(e => applyPick(e.id, on));
    pickAnchor = null;
    updateSelectionUI();
  });
  $("clearSelBtn").addEventListener("click", () => {
    entries.forEach(e => applyPick(e.id, false));
    pickAnchor = null;
    updateSelectionUI();
  });
  $("sortBy").addEventListener("change", function () {
    sortBy = SORTS[this.value] ? this.value : "dateDesc";
    try { localStorage.setItem(SORT_KEY, sortBy); } catch (e) {}
    renderLog();
  });
  $("groupBy").addEventListener("change", function () {
    groupBy = GROUPINGS[this.value] ? this.value : "none";
    try { localStorage.setItem(GROUP_KEY, groupBy); } catch (e) {}
    renderLog();
  });
  $("unitsMode").addEventListener("change", function () {
    unitsMode = this.value;
    try { localStorage.setItem(UNITS_KEY, unitsMode); } catch (e) {}
    renderLog();
    buildTree();
    renderHead();
  });
  $("tabSpecies").addEventListener("click", () => setView("species"));
  $("tabEditor").addEventListener("click", () => setView("editor"));
  $("tabLog").addEventListener("click", () => setView("log"));

  // Credits for the suggestion lists, from data.js.
  (function renderSources() {
    const line = $("sourcesLine");
    const src = LIST("sources");
    if (!src.length) { line.remove(); return; }
    line.append("Suggestion lists: ");
    src.forEach((s, i) => {
      if (i) line.append(", ");
      const a = el("a", null, s.label || s.url);
      a.href = s.url; a.target = "_blank"; a.rel = "noopener";
      line.append(a);
    });
    line.append(".");
  })();

  // ── Boot ─────────────────────────────────────────────────────────────────
  buildSwatches();
  let savedTheme = COLORS[0][1];
  try { savedTheme = localStorage.getItem(THEME_KEY) || savedTheme; } catch (e) {}
  if (!COLORS.some(([, h]) => h === savedTheme)) savedTheme = COLORS[0][1];
  applyTheme(savedTheme);
  $("sortBy").value = sortBy;
  $("groupBy").value = groupBy;
  $("unitsMode").value = unitsMode;
  syncStreakSwitch();
  syncStampSwitch();
  loadAutosave();
  renderAll();
  let bootDraft = null;
  try { bootDraft = localStorage.getItem(DRAFT_KEY); } catch (e) {}
  resetEditor();
  if (loadDraft(bootDraft)) {
    writeDraft();
    toast("Picked up the entry you were writing.");
  }
  setView("editor");
})();
