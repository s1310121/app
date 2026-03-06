import { DEFAULT_CONFIG } from "../core/constants.js";
import { expandDays, runModel } from "../core/model.js";
import { validateDayInput, validateDays } from "../lib/validate.js";
import { saveDraft, loadDraft, saveResults, saveConfig, loadConfig } from "../lib/storage.js";

function getVal(id){ return document.getElementById(id).value; }
function num(id){ return Number(getVal(id)); }
function setVal(id, v){ document.getElementById(id).value = v; }

function readForm(){
  return {
    date: getVal("date"),
    steps: num("steps"),
    dist_km: num("dist_km"),
    time_min: num("time_min"),
    RPE: num("RPE"),
    up_pct: num("up_pct"),
    down_pct: num("down_pct"),
    up_grade_pct: num("up_grade_pct"),
    down_grade_pct: num("down_grade_pct"),
    surface_paved_pct: num("surface_paved_pct"),
    surface_trail_pct: num("surface_trail_pct"),
    surface_treadmill_pct: num("surface_treadmill_pct"),
    surface_track_pct: num("surface_track_pct"),
  };
}

function writeForm(d){
  setVal("date", d.date ?? "");
  setVal("steps", d.steps ?? 0);
  setVal("dist_km", d.dist_km ?? 0);
  setVal("time_min", d.time_min ?? 0);
  setVal("RPE", d.RPE ?? 0);
  setVal("up_pct", d.up_pct ?? 0);
  setVal("down_pct", d.down_pct ?? 0);
  setVal("up_grade_pct", d.up_grade_pct ?? 0);
  setVal("down_grade_pct", d.down_grade_pct ?? 0);
  setVal("surface_paved_pct", d.surface_paved_pct ?? 0);
  setVal("surface_trail_pct", d.surface_trail_pct ?? 0);
  setVal("surface_treadmill_pct", d.surface_treadmill_pct ?? 0);
  setVal("surface_track_pct", d.surface_track_pct ?? 0);
}

function showErrors(errors){
  const box = document.getElementById("errors");
  box.innerHTML = errors.map(e => `<li>${e}</li>`).join("");
  box.style.display = errors.length ? "block" : "none";
}

/* ===== CSV parser (robust) ===== */
function splitLine(line){
  const seps = [",", "\t", ";"];
  let bestSep = ",";
  let bestCount = -1;
  for (const s of seps){
    const c = (line.split(s).length - 1);
    if (c > bestCount){ bestCount = c; bestSep = s; }
  }

  const out = [];
  let cur = "";
  let inQ = false;
  for (let i=0;i<line.length;i++){
    const ch = line[i];
    if (ch === '"'){ inQ = !inQ; continue; }
    if (!inQ && ch === bestSep){
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function normHeader(h){
  return h.trim().toLowerCase().replaceAll(" ", "").replaceAll("-", "_");
}

function mapHeaderKey(h){
  const key = normHeader(h);
  const dict = {
    "date": "date",
    "day": "date",
    "datetime": "date",

    "steps": "steps",
    "step": "steps",

    "dist_km": "dist_km",
    "distance_km": "dist_km",
    "distancekm": "dist_km",
    "dist": "dist_km",
    "distance": "dist_km",
    "km": "dist_km",

    "time_min": "time_min",
    "time": "time_min",
    "duration_min": "time_min",
    "duration": "time_min",
    "minutes": "time_min",
    "min": "time_min",

    "rpe": "RPE",

    "up_pct": "up_pct",
    "up": "up_pct",

    "down_pct": "down_pct",
    "down": "down_pct",

    "up_grade_pct": "up_grade_pct",
    "up_grade": "up_grade_pct",
    "upgrade": "up_grade_pct",

    "down_grade_pct": "down_grade_pct",
    "down_grade": "down_grade_pct",
    "downgrade": "down_grade_pct",

    "surface_paved_pct": "surface_paved_pct",
    "paved_pct": "surface_paved_pct",
    "paved": "surface_paved_pct",

    "surface_trail_pct": "surface_trail_pct",
    "trail_pct": "surface_trail_pct",
    "trail": "surface_trail_pct",

    "surface_treadmill_pct": "surface_treadmill_pct",
    "treadmill_pct": "surface_treadmill_pct",
    "treadmill": "surface_treadmill_pct",

    "surface_track_pct": "surface_track_pct",
    "track_pct": "surface_track_pct",
    "track": "surface_track_pct",
  };
  return dict[key] ?? null;
}

function parseNumberSafe(x){
  const s = String(x ?? "").trim();
  if (s === "") return NaN;
  return Number(s);
}

function normalizeDate(s){
  if (!s) return "";
  let t = String(s).trim().replaceAll("/", "-");
  const m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m){
    const yyyy = m[1];
    const mm = String(m[2]).padStart(2, "0");
    const dd = String(m[3]).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return t;
}

function parseCsvText(csvText){
  const lines = csvText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length === 0) return [];

  const firstCells = splitLine(lines[0]).map(normHeader);
  const hasHeader = firstCells.includes("date") && (firstCells.includes("steps") || firstCells.includes("step"));

  let mappedHeader;
  let dataLines;

  if (hasHeader){
    const rawHeader = splitLine(lines[0]);
    mappedHeader = rawHeader.map(mapHeaderKey);
    dataLines = lines.slice(1);
  } else {
    const defaultHeader = [
      "date","steps","dist_km","time_min","RPE","up_pct","down_pct","up_grade_pct","down_grade_pct",
      "surface_paved_pct","surface_trail_pct","surface_treadmill_pct","surface_track_pct"
    ];
    mappedHeader = defaultHeader;
    dataLines = lines;
  }

  const days = [];
  for (const line of dataLines){
    const cells = splitLine(line);
    const obj = {};
    for (let i=0; i<mappedHeader.length; i++){
      const key = mappedHeader[i];
      if (!key) continue;
      obj[key] = cells[i] ?? "";
    }

    days.push({
      date: normalizeDate(obj.date),
      steps: parseNumberSafe(obj.steps),
      dist_km: parseNumberSafe(obj.dist_km),
      time_min: parseNumberSafe(obj.time_min),
      RPE: parseNumberSafe(obj.RPE),
      up_pct: parseNumberSafe(obj.up_pct),
      down_pct: parseNumberSafe(obj.down_pct),
      up_grade_pct: parseNumberSafe(obj.up_grade_pct),
      down_grade_pct: parseNumberSafe(obj.down_grade_pct),
      surface_paved_pct: parseNumberSafe(obj.surface_paved_pct),
      surface_trail_pct: parseNumberSafe(obj.surface_trail_pct),
      surface_treadmill_pct: parseNumberSafe(obj.surface_treadmill_pct),
      surface_track_pct: parseNumberSafe(obj.surface_track_pct),
    });
  }
  return days;
}

/* ===== init ===== */
const cfg = loadConfig() ?? DEFAULT_CONFIG;
saveConfig(cfg);

const draft = loadDraft();
if (draft) writeForm(draft);

document.getElementById("form").addEventListener("input", () => {
  saveDraft(readForm());
});

document.getElementById("btnBack").addEventListener("click", () => {
  location.href = "./start.html";
});

/* 1日入力→N日複製で計算 */
document.getElementById("btnCalc").addEventListener("click", () => {
  const baseDay = readForm();
  const v = validateDayInput(baseDay);
  if (!v.ok){
    showErrors(v.errors);
    return;
  }
  showErrors([]);

  const nDays = Number(document.getElementById("nDays").value || 28);
  const days = expandDays(baseDay, nDays);

  const results = runModel(days, cfg);
  saveResults(results);
  location.href = "./output.html";
});

/* CSV読み込み→フォームに反映（先頭行） */
document.getElementById("btnLoadCsv").addEventListener("click", () => {
  const text = document.getElementById("csvText").value || "";
  const days = parseCsvText(text);
  if (!days.length){
    showErrors(["CSVが空です"]);
    return;
  }

  const v = validateDays(days);
  if (!v.ok){
    showErrors(v.errors);
    return;
  }
  showErrors([]);

  writeForm(days[0]);
  saveDraft(days[0]);
  alert(`CSV ${days.length}日分を読み込みました（フォームには先頭1日を反映）`);
});

/* CSVで計算 */
document.getElementById("btnCalcFromCsv").addEventListener("click", () => {
  const text = document.getElementById("csvText").value || "";
  const days = parseCsvText(text);
  if (!days.length){
    showErrors(["CSVが空です"]);
    return;
  }

  const v = validateDays(days);
  if (!v.ok){
    showErrors(v.errors);
    return;
  }
  showErrors([]);

  const results = runModel(days, cfg);
  saveResults(results);
  location.href = "./output.html";
});