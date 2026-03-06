import { BODY_PARTS } from "../core/constants.js";
import { loadResults } from "../lib/storage.js";
import { fmt, fmtBool, escapeHtml } from "../lib/format.js";
import { COLOR, colorForSpikeS } from "../core/colorConfig.js";

const BODY_INACTIVE_COLOR = "#d9d9d9";

const results = loadResults();
if (!results || !results.length){
  alert("結果がありません。入力画面へ戻ります。");
  location.href = "./input.html";
  throw new Error("No results found");
}

const dateSelect = document.getElementById("dateSelect");
results.forEach((r, idx) => {
  const opt = document.createElement("option");
  opt.value = String(idx);
  opt.textContent = r.date + (r.meta.standardizationReady ? "" : " (std:No)");
  dateSelect.appendChild(opt);
});
dateSelect.value = String(results.length - 1);

/* ========= helpers ========= */
function thetaOf(r){
  if (Number.isFinite(r?.global?.theta)) return r.global.theta;
  return Math.log(1.5);
}

function safeNum(x){
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function renderTableKV(obj){
  const rows = Object.entries(obj).map(([k,v]) =>
    `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(fmt(v, 6))}</td></tr>`
  ).join("");
  return `<table class="kv"><tbody>${rows}</tbody></table>`;
}

function renderDerived(r){
  const d = r.derived;
  return renderTableKV({
    "D_m": d.D_m,
    "T_s": d.T_s,
    "V_mps": d.V_mps,
    "G_plus": d.G_plus,
    "G_minus": d.G_minus,
    "S_surface": d.S_surface,
    "surfaceSumPct": d.surfaceSumPct,
  });
}

function renderTotal(r){
  const t = r.total;
  const base = renderTableKV({
    "L_ext_total": t.L_ext_total,
    "L_int": t.L_int,
  });

  const e = t.ext_terms;
  const breakdown = renderTableKV({
    "term_steps (N)": e.term_steps,
    "Vratio (V/Vref)": e.Vratio,
    "term_speed (Vratio^2)": e.term_speed,
    "term_slope [1+kG+G+ + kG-G-]": e.term_slope,
    "term_surface [1+ks*S]": e.term_surface,
  });

  return `
    <div class="two-col">
      <div>
        <h3 class="sub">総量</h3>
        ${base}
      </div>
      <div>
        <h3 class="sub">外的負荷の内訳（倍率）</h3>
        ${breakdown}
      </div>
    </div>
  `;
}

function renderStdInfo(r){
  if (!r.meta.standardizationReady){
    return `<div class="muted">標準化は未成立です（B=28 lag）。</div>`;
  }
  const w = r.meta?.lagWindow;
  if (!w){
    return `<div class="muted">B=28 lag window 情報がありません。</div>`;
  }
  return `<div class="muted">B=28 lag window: ${escapeHtml(w.from)} .. ${escapeHtml(w.to)}</div>`;
}

function renderPartsTable(r, showDetail){
  const colsBasic = [
    ["部位", (k)=>k],
    ["w", (k)=>fmt(r.parts[k].w, 6)],
    ["L_ext", (k)=>fmt(r.parts[k].L_ext, 4)],
    ["L", (k)=>fmt(r.parts[k].L, 4)],
    ["L_bar_lag", (k)=>fmt(r.parts[k].L_bar_lag, 4)],
    ["L_tilde", (k)=>fmt(r.parts[k].L_tilde, 6)],
    ["S", (k)=>fmt(r.parts[k].S, 6)],
  ];
  const colsDetail = [
    ["A", (k)=>fmt(r.parts[k].A, 6)],
    ["C", (k)=>fmt(r.parts[k].C, 6)],
    ["R", (k)=>fmt(r.parts[k].R, 6)],
  ];
  const cols = showDetail ? colsBasic.concat(colsDetail) : colsBasic;

  const thead = `<tr>${cols.map(c=>`<th>${escapeHtml(c[0])}</th>`).join("")}</tr>`;
  const tbody = BODY_PARTS.map((k)=>{
    return `<tr>${cols.map(c=>`<td>${escapeHtml(String(c[1](k)))}</td>`).join("")}</tr>`;
  }).join("");

  return `<table class="grid"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

function renderChecks(r){
  const c = r.checks;

  document.getElementById("chkSurfaceSum").textContent =
    `${fmtBool(c.surfaceSumOk)} (${c.surfaceSumPct}%)`;

  const upDown = Number(r.input.up_pct ?? 0) + Number(r.input.down_pct ?? 0);
  document.getElementById("chkSlopeSum").textContent = `${fmt(upDown, 3)}%`;

  document.getElementById("chkStdReady").textContent = fmtBool(r.meta.standardizationReady);

  document.getElementById("chkSumW").textContent =
    `${fmt(c.sumW, 9)} (${fmtBool(Math.abs(c.sumW-1) < 1e-6)})`;

  document.getElementById("chkExtCons").textContent =
    `${fmt(c.extConservation.absError, 9)} (${fmtBool(c.extConservation.ok)})`;

  document.getElementById("chkTotalCons").textContent =
    `${fmt(c.totalConservation.absError, 9)} (${fmtBool(c.totalConservation.ok)})`;

  document.getElementById("chkMessages").innerHTML =
    c.messages.length ? `<ul>${c.messages.map(m=>`<li>${escapeHtml(m)}</li>`).join("")}</ul>` : "";
}

function renderSummary(r){
  document.getElementById("cardG").textContent =
    (r.meta.standardizationReady ? fmt(r.global.G, 6) : "—");

  document.getElementById("cardMaxS").textContent =
    (r.meta.standardizationReady ? fmt(r.global.maxS, 6) : "—");

  document.getElementById("cardMaxPart").textContent =
    (r.meta.standardizationReady ? (r.global.maxPart ?? "—") : "—");

  document.getElementById("cardWarn").textContent =
    (r.global.warn === null) ? "—" : (r.global.warn ? "WARN" : "OK");

  document.getElementById("thetaValue").textContent = fmt(thetaOf(r), 6);
}

/* ★当日スパイク上位3 */
function renderSpikeRank(r){
  const box = document.getElementById("spikeRank");
  if (!box) return;

  if (!r.meta.standardizationReady){
    box.textContent = "（標準化未成立のためランキングは表示しません）";
    return;
  }

  const rows = BODY_PARTS
    .map(k => ({ part: k, S: r.parts?.[k]?.S, R: r.parts?.[k]?.R }))
    .filter(x => Number.isFinite(x.S))
    .sort((a,b) => b.S - a.S)
    .slice(0, 3);

  if (!rows.length){
    box.textContent = "（当日のスパイク順位を計算できません）";
    return;
  }

  const items = rows.map((x,i) => {
    const s = (x.S >= 0 ? "+" : "") + Number(x.S).toFixed(3);
    const rr = Number(x.R).toFixed(3);
    return `${i+1}位 ${x.part}  S=${s}  (R=${rr})`;
  }).join(" / ");

  box.textContent = `当日スパイク上位: ${items}`;
}

function renderAll(){
  const idx = Number(dateSelect.value);
  const r = results[idx];

  renderSummary(r);
  renderChecks(r);

  document.getElementById("tableDerived").innerHTML = renderDerived(r);
  document.getElementById("tableTotal").innerHTML = renderTotal(r);
  document.getElementById("stdInfo").innerHTML = renderStdInfo(r);

  const showDetail = document.getElementById("toggleDetailCols").checked;
  document.getElementById("partsTable").innerHTML = renderPartsTable(r, showDetail);

  renderSpikeRank(r);

  document.getElementById("ewmaInfo").innerHTML =
    r.meta.standardizationReady
      ? `<div class="muted">EWMA: Na=7, Nc=28（初回stdReady日は A=C=1.0 から更新）</div>`
      : `<div class="muted">EWMA未計算（標準化未成立）</div>`;

  if (bodyModal?.classList?.contains("open")) updateBodyView(r);
}

/* ===== charts ===== */
function getSeries(filteredResults){
  const labels = filteredResults.map(r => r.date.slice(5));
  const term_speed = filteredResults.map(r => r.total?.ext_terms?.term_speed ?? null);
  const term_slope = filteredResults.map(r => r.total?.ext_terms?.term_slope ?? null);
  const term_surface = filteredResults.map(r => r.total?.ext_terms?.term_surface ?? null);

  const G = filteredResults.map(r => safeNum(r.global?.G));
  const maxS = filteredResults.map(r => safeNum(r.global?.maxS));

  const partsS = {};
  for (const k of BODY_PARTS){
    partsS[k] = filteredResults.map(r => safeNum(r.parts?.[k]?.S));
  }

  return { labels, term_speed, term_slope, term_surface, G, maxS, partsS };
}

function drawLineChart(canvasId, labels, seriesList, referenceLines = []){
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const allVals = [];
  for (const s of seriesList){
    for (const v of s.values){
      if (v !== null && Number.isFinite(v)) allVals.push(v);
    }
  }
  for (const rl of referenceLines){
    if (rl && Number.isFinite(rl.y)) allVals.push(rl.y);
  }
  if (allVals.length === 0){
    ctx.fillStyle = COLOR.muted;
    ctx.font = "12px system-ui";
    ctx.fillText("（データなし）", 10, 20);
    return;
  }

  let ymin = Math.min(...allVals);
  let ymax = Math.max(...allVals);
  if (ymin === ymax){ ymin -= 1; ymax += 1; }

  const padL = 40, padR = 10, padT = 10, padB = 30;
  const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;

  const n = labels.length;
  const xAt = (i) => (n <= 1) ? (x0 + x1) / 2 : x0 + (x1 - x0) * (i / (n - 1));
  const yAt = (v) => y1 - (y1 - y0) * ((v - ymin) / (ymax - ymin));

  ctx.strokeStyle = COLOR.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0, y1);
  ctx.lineTo(x1, y1);
  ctx.stroke();

  ctx.fillStyle = COLOR.muted;
  ctx.font = "12px system-ui";
  for (let t=0; t<=2; t++){
    const yy = y0 + (y1 - y0) * (t/2);
    const val = ymax - (ymax - ymin) * (t/2);
    ctx.strokeStyle = COLOR.guide;
    ctx.beginPath();
    ctx.moveTo(x0, yy);
    ctx.lineTo(x1, yy);
    ctx.stroke();
    ctx.fillText(val.toFixed(3), 5, yy + 4);
  }

  const step = Math.max(1, Math.ceil(n / 8));
  for (let i=0; i<n; i+=step){
    ctx.fillStyle = COLOR.muted;
    ctx.fillText(labels[i], xAt(i) - 12, H - 10);
  }

  for (const rl of referenceLines){
    if (!rl || !Number.isFinite(rl.y)) continue;
    const yy = yAt(rl.y);
    ctx.strokeStyle = rl.color ?? COLOR.spike.thetaLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, yy);
    ctx.lineTo(x1, yy);
    ctx.stroke();
    if (rl.label){
      ctx.fillStyle = COLOR.muted;
      ctx.fillText(rl.label, x1 - 60, yy - 4);
    }
  }

  seriesList.forEach((s, idx) => {
    const col = s.color ?? COLOR.text;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    for (let i=0; i<n; i++){
      const v = s.values[i];
      if (v === null || !Number.isFinite(v)) { started = false; continue; }
      const x = xAt(i), y = yAt(v);
      if (!started){ ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = col;
    ctx.fillText(s.name, x0 + 6, y0 + 14 + idx*14);
  });
}

function drawMultiPartsChart(canvasId, labels, partsSeries, theta){
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);

  const allVals = [];
  for (const k of Object.keys(partsSeries)){
    for (const v of partsSeries[k]){
      if (v !== null && Number.isFinite(v)) allVals.push(v);
    }
  }
  if (Number.isFinite(theta)) allVals.push(theta, 0);

  if (allVals.length === 0){
    ctx.fillStyle = COLOR.muted;
    ctx.font = "12px system-ui";
    ctx.fillText("（データなし）", 10, 20);
    return;
  }

  let ymin = Math.min(...allVals);
  let ymax = Math.max(...allVals);
  if (ymin === ymax){ ymin -= 1; ymax += 1; }

  const padL = 44, padR = 160, padT = 10, padB = 30;
  const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;

  const n = labels.length;
  const xAt = (i) => (n <= 1) ? (x0 + x1)/2 : x0 + (x1-x0) * (i/(n-1));
  const yAt = (v) => y1 - (y1-y0) * ((v - ymin)/(ymax - ymin));

  ctx.strokeStyle = COLOR.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0, y1);
  ctx.lineTo(x1, y1);
  ctx.stroke();

  ctx.fillStyle = COLOR.muted;
  ctx.font = "12px system-ui";
  for (let t=0; t<=2; t++){
    const yy = y0 + (y1-y0) * (t/2);
    const val = ymax - (ymax-ymin) * (t/2);
    ctx.strokeStyle = COLOR.guide;
    ctx.beginPath();
    ctx.moveTo(x0, yy);
    ctx.lineTo(x1, yy);
    ctx.stroke();
    ctx.fillText(val.toFixed(3), 6, yy + 4);
  }

  const step = Math.max(1, Math.ceil(n/8));
  for (let i=0;i<n;i+=step){
    ctx.fillStyle = COLOR.muted;
    ctx.fillText(labels[i], xAt(i)-12, H-10);
  }

  const yZero = yAt(0);
  ctx.strokeStyle = COLOR.spike.zeroLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, yZero);
  ctx.lineTo(x1, yZero);
  ctx.stroke();

  if (Number.isFinite(theta)){
    const yTh = yAt(theta);
    ctx.strokeStyle = COLOR.spike.thetaLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, yTh);
    ctx.lineTo(x1, yTh);
    ctx.stroke();
  }

  const keys = Object.keys(partsSeries);
  keys.forEach((k) => {
    const col = COLOR.charts.parts[k] ?? COLOR.text;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    for (let i=0;i<n;i++){
      const v = partsSeries[k][i];
      if (v === null || !Number.isFinite(v)) { started = false; continue; }
      const x = xAt(i), y = yAt(v);
      if (!started){ ctx.moveTo(x,y); started = true; }
      else ctx.lineTo(x,y);
    }
    ctx.stroke();
  });

  const lx = x1 + 10;
  let ly = y0 + 10;
  ctx.font = "12px system-ui";
  keys.forEach((k) => {
    const col = COLOR.charts.parts[k] ?? COLOR.text;
    ctx.fillStyle = col;
    ctx.fillRect(lx, ly - 8, 10, 2);
    ctx.fillText(k, lx + 16, ly - 4);
    ly += 16;
  });
}

function renderCharts(){
  const onlyReady = document.getElementById("chkOnlyReady")?.checked ?? true;
  const filtered = onlyReady ? results.filter(r => r.meta.standardizationReady) : results;
  const { labels, term_speed, term_slope, term_surface, G, maxS, partsS } = getSeries(filtered);

  drawLineChart("chartExtTerms", labels, [
    { name: "term_speed", values: term_speed, color: COLOR.charts.extTerms.term_speed },
    { name: "term_slope", values: term_slope, color: COLOR.charts.extTerms.term_slope },
    { name: "term_surface", values: term_surface, color: COLOR.charts.extTerms.term_surface },
  ]);

  const theta = results.length ? thetaOf(results[results.length - 1]) : Math.log(1.5);

  drawLineChart("chartSpike", labels, [
    { name: "G(t)", values: G, color: COLOR.charts.spike.G },
    { name: "max S_k", values: maxS, color: COLOR.charts.spike.maxS },
  ], [{ y: theta, label: "θ", color: COLOR.spike.thetaLine }]);

  drawMultiPartsChart("chartPartsS", labels, partsS, theta);
}

/* ===== JSON export ===== */
document.getElementById("btnCopyJson").addEventListener("click", async ()=>{
  const idx = Number(dateSelect.value);
  const json = JSON.stringify(results[idx], null, 2);
  try {
    await navigator.clipboard.writeText(json);
    alert("JSONをコピーしました");
  } catch (err) {
    alert("JSONコピーに失敗しました。JSON保存を使用してください。");
  }
});

document.getElementById("btnDownloadJson").addEventListener("click", ()=>{
  const idx = Number(dateSelect.value);
  const blob = new Blob([JSON.stringify(results[idx], null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `result_${results[idx].date}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

/* ===== CSV export ===== */
function csvEscape(x){
  const s = (x === null || x === undefined) ? "" : String(x);
  if (s.includes(",") || s.includes('"') || s.includes("\n")){
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

function buildResultsCSV(resultsArr){
  const header = [
    "date","part",
    "w","L_ext","L","L_bar_lag","L_tilde","A","C","R","S",
    "L_ext_total","L_int",
    "term_speed","term_slope","term_surface",
    "G","maxS","maxPart","warn","stdReady"
  ];
  const lines = [header.join(",")];

  for (const r of resultsArr){
    for (const part of BODY_PARTS){
      const p = r.parts[part];
      const e = r.total?.ext_terms ?? {};
      const row = [
        r.date,
        part,
        p.w, p.L_ext, p.L, p.L_bar_lag, p.L_tilde, p.A, p.C, p.R, p.S,
        r.total?.L_ext_total ?? null,
        r.total?.L_int ?? null,
        e.term_speed ?? null,
        e.term_slope ?? null,
        e.term_surface ?? null,
        r.global?.G ?? null,
        r.global?.maxS ?? null,
        r.global?.maxPart ?? null,
        r.global?.warn ?? null,
        r.meta?.standardizationReady ?? null,
      ].map(csvEscape);
      lines.push(row.join(","));
    }
  }
  return lines.join("\n");
}

function buildResultsCSVWide(resultsArr){
  const header = [
    "date",
    ...BODY_PARTS.map(p => `S_${p}`),
    ...BODY_PARTS.map(p => `R_${p}`),
    "G","maxS","maxPart","warn","stdReady"
  ];
  const lines = [header.join(",")];

  for (const r of resultsArr){
    const row = [
      r.date,
      ...BODY_PARTS.map(p => r.parts?.[p]?.S ?? ""),
      ...BODY_PARTS.map(p => r.parts?.[p]?.R ?? ""),
      r.global?.G ?? "",
      r.global?.maxS ?? "",
      r.global?.maxPart ?? "",
      r.global?.warn ?? "",
      r.meta?.standardizationReady ?? "",
    ].map(csvEscape);
    lines.push(row.join(","));
  }
  return lines.join("\n");
}

document.getElementById("btnDownloadCSV")?.addEventListener("click", ()=>{
  const csv = buildResultsCSV(results);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "results_long.csv";
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("btnDownloadCSVWide")?.addEventListener("click", ()=>{
  const csv = buildResultsCSVWide(results);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "results_wide.csv";
  a.click();
  URL.revokeObjectURL(url);
});

/* ===== 人体ビュー ===== */
const bodyModal = document.getElementById("bodyModal");
const btnBodyView = document.getElementById("btnBodyView");
const btnBodyClose = document.getElementById("btnBodyClose");

function openBodyModal(){
  if (!bodyModal) return;
  bodyModal.classList.add("open");
  bodyModal.setAttribute("aria-hidden", "false");
}
function closeBodyModal(){
  if (!bodyModal) return;
  bodyModal.classList.remove("open");
  bodyModal.setAttribute("aria-hidden", "true");
}

bodyModal?.addEventListener("click", (e)=>{
  const t = e.target;
  if (t?.dataset?.close === "1") closeBodyModal();
});
btnBodyClose?.addEventListener("click", closeBodyModal);
btnBodyView?.addEventListener("click", ()=>{
  openBodyModal();
  const idx = Number(dateSelect.value);
  updateBodyView(results[idx]);
});

function setSvgPartColor(partName, color){
  const el = document.getElementById(`part-${partName}`);
  if (!el) return;
  el.style.fill = color;
}

function updateBodyView(r){
  if (!r) return;

  const theta = thetaOf(r);
  const thetaEl = document.getElementById("bodyTheta");
  if (thetaEl) thetaEl.textContent = theta.toFixed(6);

  const hint = document.getElementById("bodyHint");
  const bt = document.getElementById("bodyTable");

  if (!r.meta.standardizationReady){
    for (const k of BODY_PARTS) setSvgPartColor(k, BODY_INACTIVE_COLOR);
    if (hint) hint.textContent = "（標準化未成立日のため S_k は未計算です。人体ビューは灰表示）";
    if (bt) bt.innerHTML = "";
    return;
  }
  if (hint) hint.textContent = "";

  for (const k of BODY_PARTS){
    const S = r.parts?.[k]?.S;
    const col = colorForSpikeS(S, theta);
    setSvgPartColor(k, col);

    const el = document.getElementById(`part-${k}`);
    if (el){
      const R = r.parts?.[k]?.R;
      el.setAttribute("title", `${k}  S=${Number(S).toFixed(3)}  R=${Number(R).toFixed(3)}`);
    }
  }

  const rows = BODY_PARTS.map(k=>{
    const S = r.parts?.[k]?.S;
    const R = r.parts?.[k]?.R;
    const tag = (S >= theta) ? "WARN" : (S > 0 ? "UP" : (S < 0 ? "DOWN" : "OK"));
    const sText = (Number(S) >= 0 ? "+" : "") + Number(S).toFixed(3);
    return `<tr>
      <td>${escapeHtml(k)}</td>
      <td>${escapeHtml(sText)}</td>
      <td>${escapeHtml(Number(R).toFixed(3))}</td>
      <td>${escapeHtml(tag)}</td>
    </tr>`;
  }).join("");

  if (bt){
    bt.innerHTML = `
      <table class="grid">
        <thead><tr><th>部位</th><th>S</th><th>R</th><th>状態</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }
}

function initBodyLegend(){
  const map = {
    recovery: COLOR.spike.recovery,
    neutral: COLOR.spike.neutral,
    increase: COLOR.spike.increase,
    warn: COLOR.spike.warn
  };

  document.querySelectorAll(".legend-box").forEach(el=>{
    const kind = el.dataset.kind;
    if(map[kind]) el.style.background = map[kind];
  });
}

/* ===== スパイク日一覧 + 寄与分解 ===== */
const spikeModal = document.getElementById("spikeModal");
const btnSpikeDays = document.getElementById("btnSpikeDays");
const btnSpikeClose = document.getElementById("btnSpikeClose");
const btnDownloadSpikeCSV = document.getElementById("btnDownloadSpikeCSV");

function openSpikeModal(){
  if (!spikeModal) return;
  spikeModal.classList.add("open");
  spikeModal.setAttribute("aria-hidden", "false");
}
function closeSpikeModal(){
  if (!spikeModal) return;
  spikeModal.classList.remove("open");
  spikeModal.setAttribute("aria-hidden", "true");
}

spikeModal?.addEventListener("click", (e)=>{
  const t = e.target;
  if (t?.dataset?.close === "1") closeSpikeModal();
});
btnSpikeClose?.addEventListener("click", closeSpikeModal);

btnSpikeDays?.addEventListener("click", ()=>{
  openSpikeModal();
  renderSpikeDaysList();
});

function lnSafe(x, eps=1e-12){
  const v = Number(x);
  if (!Number.isFinite(v)) return null;
  return Math.log(Math.max(v, eps));
}

function diffLn(a, b){
  const la = lnSafe(a);
  const lb = lnSafe(b);
  if (!Number.isFinite(la) || !Number.isFinite(lb)) return null;
  return la - lb;
}

function toFixedSigned(x, d=4){
  if (!Number.isFinite(x)) return "—";
  const s = x >= 0 ? "+" : "";
  return s + x.toFixed(d);
}

function buildSpikeRows(){
  const theta = results.length ? thetaOf(results[results.length - 1]) : Math.log(1.5);
  const rows = [];

  for (let i=1; i<results.length; i++){
    const r = results[i];
    const prev = results[i-1];

    if (!r?.meta?.standardizationReady) continue;
    if (!(Number.isFinite(r?.global?.maxS) && r.global.maxS > theta)) continue;

    const e = r.total?.ext_terms ?? {};
    const ep = prev.total?.ext_terms ?? {};

    const d_lnN = diffLn(e.term_steps, ep.term_steps);

    const dv = diffLn(e.Vratio, ep.Vratio);
    const d_2lnV = Number.isFinite(dv) ? 2 * dv : null;

    const d_lnSlope = diffLn(e.term_slope, ep.term_slope);
    const d_lnSurf = diffLn(e.term_surface, ep.term_surface);

    const d_lnExtSum =
      [d_lnN, d_2lnV, d_lnSlope, d_lnSurf].every(Number.isFinite)
        ? d_lnN + d_2lnV + d_lnSlope + d_lnSurf
        : null;

    const d_lnExtTotal = diffLn(r.total?.L_ext_total, prev.total?.L_ext_total);
    const d_lnInt = diffLn(r.total?.L_int, prev.total?.L_int);

    rows.push({
      date: r.date,
      prevDate: prev.date,
      maxS: r.global.maxS,
      maxPart: r.global.maxPart,
      d_lnN,
      d_2lnV,
      d_lnSlope,
      d_lnSurf,
      d_lnExtSum,
      d_lnExtTotal,
      d_lnInt,
      N: e.term_steps,
      Vratio: e.Vratio,
      slope: e.term_slope,
      surface: e.term_surface,
      L_ext_total: r.total?.L_ext_total,
      L_int: r.total?.L_int,
    });
  }

  return rows;
}

function renderSpikeDaysList(){
  const box = document.getElementById("spikeList");
  const hint = document.getElementById("spikeListHint");
  if (!box) return;

  const rows = buildSpikeRows();
  if (!rows.length){
    box.innerHTML = "";
    if (hint) hint.textContent = "（スパイク日：max S_k > θ を満たす日がありません）";
    return;
  }
  if (hint) hint.textContent = `検出: ${rows.length}日（判定: max S_k > θ, θ=${thetaOf(results[results.length - 1]).toFixed(6)}）`;

  const thead = `
    <tr>
      <th>日付</th>
      <th>max部位</th>
      <th>maxS</th>
      <th>前日</th>
      <th>ΔlnN</th>
      <th>2ΔlnV</th>
      <th>ΔlnSlope</th>
      <th>ΔlnSurface</th>
      <th>合計(分解)</th>
      <th>Δln L_ext_total</th>
      <th>Δln L_int</th>
    </tr>
  `;

  const tbody = rows.map(r => `
    <tr>
      <td>${escapeHtml(r.date)}</td>
      <td>${escapeHtml(r.maxPart ?? "—")}</td>
      <td>${escapeHtml(toFixedSigned(r.maxS, 4))}</td>
      <td>${escapeHtml(r.prevDate)}</td>
      <td>${escapeHtml(toFixedSigned(r.d_lnN, 4))}</td>
      <td>${escapeHtml(toFixedSigned(r.d_2lnV, 4))}</td>
      <td>${escapeHtml(toFixedSigned(r.d_lnSlope, 4))}</td>
      <td>${escapeHtml(toFixedSigned(r.d_lnSurf, 4))}</td>
      <td>${escapeHtml(toFixedSigned(r.d_lnExtSum, 4))}</td>
      <td>${escapeHtml(toFixedSigned(r.d_lnExtTotal, 4))}</td>
      <td>${escapeHtml(toFixedSigned(r.d_lnInt, 4))}</td>
    </tr>
  `).join("");

  box.innerHTML = `<table class="grid"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

function buildSpikeCSV(){
  const rows = buildSpikeRows();
  const header = [
    "date","prevDate","maxPart","maxS",
    "d_lnN","d_2lnV","d_lnSlope","d_lnSurface","d_lnExtSum",
    "d_lnExtTotal","d_lnInt",
    "N","Vratio","slope","surface","L_ext_total","L_int"
  ];
  const lines = [header.join(",")];

  for (const r of rows){
    const row = [
      r.date, r.prevDate, r.maxPart, r.maxS,
      r.d_lnN, r.d_2lnV, r.d_lnSlope, r.d_lnSurf, r.d_lnExtSum,
      r.d_lnExtTotal, r.d_lnInt,
      r.N, r.Vratio, r.slope, r.surface, r.L_ext_total, r.L_int
    ].map(csvEscape);
    lines.push(row.join(","));
  }
  return lines.join("\n");
}

btnDownloadSpikeCSV?.addEventListener("click", ()=>{
  const csv = buildSpikeCSV();
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "spike_days_decomposition.csv";
  a.click();
  URL.revokeObjectURL(url);
});

/* ===== events ===== */
dateSelect.addEventListener("change", () => { renderAll(); renderCharts(); });
document.getElementById("toggleDetailCols").addEventListener("change", renderAll);
document.getElementById("chkOnlyReady")?.addEventListener("change", renderCharts);

document.getElementById("btnBack").addEventListener("click", ()=> location.href="./input.html");
document.getElementById("btnEnd").addEventListener("click", ()=> location.href="./end.html");
document.getElementById("btnSensitivity")?.addEventListener("click", ()=> location.href="./sensitivity.html");

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (bodyModal?.classList.contains("open")) closeBodyModal();
  if (spikeModal?.classList.contains("open")) closeSpikeModal();
});

/* initial render */
initBodyLegend();
renderAll();
renderCharts();