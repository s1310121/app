import {
  BODY_PARTS, MUSCLE_PARTS, W0, DEFAULT_CONFIG, PROX_PARTS, DIST_PARTS
} from "./constants.js";

/** util */
function sum(arr) { return arr.reduce((a,b)=>a+b,0); }
function sumKeys(obj, keys){ return keys.reduce((acc,k)=>acc + obj[k], 0); }
function clampNonneg(x){ return Math.max(0, x); }
function alphaFromN(N){ return 2 / (N + 1); }

/** date helpers */
function addDays(dateStr, i){
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + i);
  return d.toISOString().slice(0,10);
}

/**
 * 1日入力をN日分に複製（連番日付）
 * @param {import("./types.js").DayInput} baseDay
 * @param {number} nDays
 */
export function expandDays(baseDay, nDays){
  const rows = [];
  for (let i=0;i<nDays;i++){
    rows.push({ ...baseDay, date: addDays(baseDay.date, i) });
  }
  return rows;
}

/** 派生量 */
function computeDerived(day, cfg){
  const D_m = day.dist_km * 1000;
  const T_s = day.time_min * 60;
  const V_mps = D_m / (T_s + cfg.eps);

  const G_plus = (day.up_pct/100) * (day.up_grade_pct/100);
  const G_minus = (day.down_pct/100) * (day.down_grade_pct/100);

  const S_surface = (
    day.surface_paved_pct * 0.0 +
    day.surface_trail_pct * 1.0 +
    day.surface_treadmill_pct * 0.1 +
    day.surface_track_pct * 0.2
  ) / 100.0;

  const surfaceSumPct =
    day.surface_paved_pct + day.surface_trail_pct + day.surface_treadmill_pct + day.surface_track_pct;

  return { D_m, T_s, V_mps, G_plus, G_minus, S_surface, surfaceSumPct };
}

/** 外的総負荷・内的負荷（内訳も返す） */
function computeTotals(day, derived, cfg){
  const Vratio = derived.V_mps / (cfg.Vref + cfg.eps);

  const term_steps = day.steps; // N(t)
  const term_speed = (Vratio ** 2); // (V/Vref)^2
  const term_slope = (1 + cfg.kG_plus * derived.G_plus + cfg.kG_minus * derived.G_minus);
  const term_surface = (1 + cfg.ks * derived.S_surface);

  const L_ext_total = term_steps * term_speed * term_slope * term_surface;
  const L_int = derived.T_s * day.RPE;

  return {
    L_ext_total,
    L_int,
    ext_terms: { term_steps, term_speed, term_slope, term_surface, Vratio }
  };
}

/**
 * 重み計算：Δ（下り膝増） + ρ（速度近位化） → clip → normalize
 */
function computeWeights(derived, cfg){
  const { Delta, rho, Vref, eps } = cfg;

  // baseline
  const wTemp = { ...W0 };

  // (1) downhill redistribution
  wTemp["膝関節"] = W0["膝関節"] + Delta * derived.G_minus;
  wTemp["股関節"] = W0["股関節"] - (Delta * derived.G_minus) / 2;
  wTemp["足関節"] = W0["足関節"] - (Delta * derived.G_minus) / 2;

  // (2) speed proximalization
  const r = (derived.V_mps - Vref) / (Vref + eps);
  const delta = rho * r;

  const sumProx = sumKeys(W0, PROX_PARTS);
  const sumDist = sumKeys(W0, DIST_PARTS);

  for (const k of PROX_PARTS){
    wTemp[k] += delta * (W0[k] / (sumProx + eps));
  }
  for (const k of DIST_PARTS){
    wTemp[k] -= delta * (W0[k] / (sumDist + eps));
  }

  // clip+normalize
  const clipped = {};
  let s = 0;
  for (const k of BODY_PARTS){
    const v = clampNonneg(wTemp[k]);
    clipped[k] = v;
    s += v;
  }
  const w = {};
  for (const k of BODY_PARTS){
    w[k] = clipped[k] / (s + eps);
  }
  const sumW = sum(Object.values(w));
  return { w, sumW };
}

/** 外的部位負荷 */
function computeExternalByPart(L_ext_total, w){
  const L_ext = {};
  for (const k of BODY_PARTS){
    L_ext[k] = w[k] * L_ext_total;
  }
  return L_ext;
}

/** 内的統合（筋系のみ） */
function computeIntegratedByPart(L_ext, L_int, cfg){
  const D_M = sum(MUSCLE_PARTS.map(k => L_ext[k]));
  const eta = {};

  const sumW0Muscle = sum(MUSCLE_PARTS.map(k => W0[k]));
  for (const k of MUSCLE_PARTS){
    eta[k] = (D_M > 0)
      ? (L_ext[k] / (D_M + cfg.eps))
      : (W0[k] / (sumW0Muscle + cfg.eps));
  }

  const L = {};
  for (const k of BODY_PARTS){
    if (MUSCLE_PARTS.includes(k)){
      L[k] = L_ext[k] + eta[k] * L_int;
    } else {
      L[k] = L_ext[k];
    }
  }
  return { L, eta, D_M };
}

/** lag平均（t-1..t-B） */
function lagMean(series, t, B){
  let s = 0;
  for (let i=1;i<=B;i++){
    s += series[t - i];
  }
  return s / B;
}

/** EWMA update: A = (1-α)A + αx */
function ewmaUpdate(prev, x, alpha){
  return (1 - alpha) * prev + alpha * x;
}

/**
 * runModel: DayInput[] → DayResult[]
 * - B=28 lag mean; t<B → standardizationReady=false, later stages null
 *
 * ★修正点（重要）:
 * 初回の標準化成立日（t===B）で A=C=L_tilde と初期化すると必ず S=0 になる。
 * そこで初回だけ A=C=1.0（平常状態）から開始し、その日の L_tilde で更新する。
 * これにより初回stdReady日でもスパイクが可視化される。
 */
export function runModel(days, config = DEFAULT_CONFIG){
  const cfg = { ...DEFAULT_CONFIG, ...config, B: 28 }; // ★B固定
  const alphaA = alphaFromN(cfg.Na);
  const alphaC = alphaFromN(cfg.Nc);

  /** store per-day L_k to compute lag mean */
  const L_series = {};
  for (const k of BODY_PARTS) L_series[k] = [];

  /** EWMA states per part (only after standardizationReady) */
  const A_state = {}; const C_state = {};
  for (const k of BODY_PARTS){ A_state[k] = null; C_state[k] = null; }

  const results = [];

  for (let t=0; t<days.length; t++){
    const day = days[t];

    const derived = computeDerived(day, cfg);
    const total = computeTotals(day, derived, cfg);

    const weights = computeWeights(derived, cfg);
    const L_ext = computeExternalByPart(total.L_ext_total, weights.w);
    const integrated = computeIntegratedByPart(L_ext, total.L_int, cfg);

    // push L for lag mean series
    for (const k of BODY_PARTS){
      L_series[k].push(integrated.L[k]);
    }

    const standardizationReady = (t >= cfg.B); // needs t-1..t-B

    // parts detail base
    const parts = {};
    for (const k of BODY_PARTS){
      parts[k] = {
        w: weights.w[k],
        L_ext: L_ext[k],
        L: integrated.L[k],
        L_bar_lag: null,
        L_tilde: null,
        A: null,
        C: null,
        R: null,
        S: null,
      };
    }

    // shared checks (even before std)
    const surfaceSumOk = Math.abs(derived.surfaceSumPct - 100) < 1e-9;
    const sumW = weights.sumW;
    const sumWOk = Math.abs(sumW - 1) < cfg.tol;

    const sumExtParts = sum(BODY_PARTS.map(k => L_ext[k]));
    const extError = Math.abs(sumExtParts - total.L_ext_total);
    const extOk = extError < cfg.tol;

    const sumLParts = sum(BODY_PARTS.map(k => integrated.L[k]));
    const totalError = Math.abs(sumLParts - (total.L_ext_total + total.L_int));
    const totalOk = totalError < cfg.tol;

    const messages = [];
    if (!surfaceSumOk) messages.push(`路面割合の合計が100%ではありません（現在: ${derived.surfaceSumPct}%）`);
    if (!sumWOk) messages.push(`Σw_k が 1 からずれています（Σw=${sumW}）`);
    if (!extOk) messages.push(`外的保存則誤差: |ΣL_ext_k − L_ext_total| = ${extError}`);
    if (!totalOk) messages.push(`統合後保存則誤差: |ΣL_k − (L_ext_total+L_int)| = ${totalError}`);

    if (standardizationReady){
      const lagFromDate = days[t - cfg.B].date;
      const lagToDate   = days[t - 1].date;

      // compute L_tilde
      const L_tilde = {};
      for (const k of BODY_PARTS){
        const bar = lagMean(L_series[k], t, cfg.B);
        const tilde = integrated.L[k] / (bar + cfg.eps);
        parts[k].L_bar_lag = bar;
        parts[k].L_tilde = tilde;
        L_tilde[k] = tilde;
      }

      // ★修正：初回stdReady日は「平常状態(1.0)」から開始して更新する
      const isFirstReadyDay = (t === cfg.B);
      for (const k of BODY_PARTS){
        if (isFirstReadyDay){
          A_state[k] = 1.0;
          C_state[k] = 1.0;
        }

        // recursive update
        A_state[k] = ewmaUpdate(A_state[k], L_tilde[k], alphaA);
        C_state[k] = ewmaUpdate(C_state[k], L_tilde[k], alphaC);

        const R = A_state[k] / (C_state[k] + cfg.eps);
        const S = Math.log(R); // R>0 は標準化+EWMAで保証される

        parts[k].A = A_state[k];
        parts[k].C = C_state[k];
        parts[k].R = R;
        parts[k].S = S;
      }

      // global
      const theta = Math.log(1.5);
      let maxS = -Infinity;
      let maxPart = BODY_PARTS[0];
      for (const k of BODY_PARTS){
        if (parts[k].S > maxS){
          maxS = parts[k].S;
          maxPart = k;
        }
      }
      const pi = 1 / BODY_PARTS.length;
      let sumExp = 0;
      for (const k of BODY_PARTS){
        sumExp += pi * Math.exp(parts[k].S);
      }
      const G = Math.log(sumExp + cfg.eps);
      const warn = maxS > theta;

      const checks = {
        ok: surfaceSumOk && sumWOk && extOk && totalOk,
        messages,
        surfaceSumOk,
        surfaceSumPct: derived.surfaceSumPct,
        sumW,
        extConservation: { sumExtParts, extTotal: total.L_ext_total, absError: extError, ok: extOk },
        totalConservation: { sumLParts, extPlusInt: total.L_ext_total + total.L_int, absError: totalError, ok: totalOk },
        standardization: { ready: true, missingLagMeans: [], note: "B=28 lag mean uses t-1..t-28" }
      };

      results.push({
        date: day.date,
        meta: { dayIndex: t, standardizationReady: true, lagWindow: { from: lagFromDate, to: lagToDate, B: cfg.B } },
        input: { ...day },
        derived,
        total,
        weights: { w: weights.w, sumW: weights.sumW },
        parts,
        global: { theta, maxS, maxPart, warn, G },
        checks,
      });
    } else {
      messages.push("B=28のlag平均が未成立です（t<29）。標準化/EWMA/スパイクは未計算です。");

      const checks = {
        ok: surfaceSumOk && sumWOk && extOk && totalOk,
        messages,
        surfaceSumOk,
        surfaceSumPct: derived.surfaceSumPct,
        sumW,
        extConservation: { sumExtParts, extTotal: total.L_ext_total, absError: extError, ok: extOk },
        totalConservation: { sumLParts, extPlusInt: total.L_ext_total + total.L_int, absError: totalError, ok: totalOk },
        standardization: { ready: false, missingLagMeans: BODY_PARTS, note: "B=28 lag mean uses t-1..t-28" }
      };

      results.push({
        date: day.date,
        meta: { dayIndex: t, standardizationReady: false, lagWindow: null },
        input: { ...day },
        derived,
        total,
        weights: { w: weights.w, sumW: weights.sumW },
        parts,
        global: { theta: Math.log(1.5), maxS: null, maxPart: null, warn: null, G: null },
        checks,
      });
    }
  }

  return results;
}