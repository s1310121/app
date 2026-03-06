import { runModel } from "../core/model.js";
import { loadResults, loadConfig } from "../lib/storage.js";
import { DEFAULT_CONFIG, BODY_PARTS } from "../core/constants.js";

function $(id){ return document.getElementById(id); }

function csvEscape(x){
  const s = (x === null || x === undefined) ? "" : String(x);
  if (s.includes(",") || s.includes('"') || s.includes("\n")){
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

function parseList(str){
  return String(str || "")
    .split(",")
    .map(s => s.trim())
    .filter(s => s.length)
    .map(Number)
    .filter(x => Number.isFinite(x));
}

function downloadText(filename, text, mime="text/csv;charset=utf-8"){
  const needsBom = mime.toLowerCase().includes("text/csv");
  const blob = needsBom
    ? new Blob(["\uFEFF", text], { type: mime })
    : new Blob([text], { type: mime });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function restoreDaysFromResults(results){
  return results.map(r => ({ ...r.input }));
}

function summarize(res){
  const theta = Math.log(1.5);
  const ready = res.filter(r => r?.meta?.standardizationReady && Number.isFinite(r?.global?.maxS));
  const last = ready.length ? ready[ready.length - 1] : null;

  let peak = null;
  for (const r of ready){
    if (!peak || r.global.maxS > peak.global.maxS) peak = r;
  }

  const exceedCount = ready.reduce((acc, r) => acc + ((r.global.maxS > theta) ? 1 : 0), 0);

  let peakTop3 = "";
  if (peak){
    const rows = BODY_PARTS
      .map(p => ({ p, S: peak.parts?.[p]?.S }))
      .filter(x => Number.isFinite(x.S))
      .sort((a,b) => b.S - a.S)
      .slice(0, 3);
    peakTop3 = rows.map(x => `${x.p}:${Number(x.S).toFixed(3)}`).join("|");
  }

  return {
    lastDate: last?.date ?? "",
    lastG: last?.global?.G ?? "",
    lastMaxS: last?.global?.maxS ?? "",
    peakDate: peak?.date ?? "",
    peakMaxS: peak?.global?.maxS ?? "",
    peakPart: peak?.global?.maxPart ?? "",
    exceedCount,
    peakTop3,
  };
}

function setStatus(msg){ $("status").textContent = msg || ""; }
function setErrors(msg){ $("errors").textContent = msg || ""; }

$("btnBack").addEventListener("click", ()=> location.href = "./output.html");

$("btnRun").addEventListener("click", ()=>{
  setErrors("");
  setStatus("");

  const baseCfg = loadConfig() ?? DEFAULT_CONFIG;
  const baseResults = loadResults();
  if (!baseResults || !baseResults.length){
    alert("結果がありません。先に入力→計算を実行してください。");
    return;
  }
  const days = restoreDaysFromResults(baseResults);

  const grid = {
    rho: parseList($("rho").value),
    Delta: parseList($("Delta").value),
    ks: parseList($("ks").value),
    kG_plus: parseList($("kG_plus").value),
    kG_minus: parseList($("kG_minus").value),
    Vref: parseList($("Vref").value),
  };

  for (const [k, arr] of Object.entries(grid)){
    if (!arr.length){
      setErrors(`${k} の値が空です（例: 0.1,0.25,0.4）`);
      return;
    }
  }

  const totalCount =
    grid.rho.length * grid.Delta.length * grid.ks.length *
    grid.kG_plus.length * grid.kG_minus.length * grid.Vref.length;

  const header = [
    "rho","Delta","ks","kG_plus","kG_minus","Vref",
    "lastDate","lastG","lastMaxS",
    "peakDate","peakMaxS","peakPart",
    "exceedCount(>theta)",
    "peakTop3(S)"
  ];
  const lines = [header.join(",")];

  let count = 0;
  setStatus(`実行中... 0 / ${totalCount}`);

  for (const rho of grid.rho){
    for (const Delta of grid.Delta){
      for (const ks of grid.ks){
        for (const kG_plus of grid.kG_plus){
          for (const kG_minus of grid.kG_minus){
            for (const Vref of grid.Vref){
              const cfg = { ...baseCfg, rho, Delta, ks, kG_plus, kG_minus, Vref };
              const res = runModel(days, cfg);
              const s = summarize(res);

              const row = [
                rho, Delta, ks, kG_plus, kG_minus, Vref,
                s.lastDate, s.lastG, s.lastMaxS,
                s.peakDate, s.peakMaxS, s.peakPart,
                s.exceedCount,
                s.peakTop3
              ].map(csvEscape);

              lines.push(row.join(","));
              count++;
              if (count % 10 === 0) setStatus(`実行中... ${count} / ${totalCount}`);
            }
          }
        }
      }
    }
  }

  setStatus(`完了: ${count} 通り（CSVを保存します）`);
  downloadText("sensitivity_sweep.csv", lines.join("\n"));
});
  setStatus(`完了: ${count} 通り（CSVを保存します）`);
  downloadText("sensitivity_sweep.csv", lines.join("\n"));

});
