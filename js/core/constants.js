export const BODY_PARTS = ["腰部", "股関節", "膝関節", "足関節", "大腿", "下腿", "足部"];
export const MUSCLE_PARTS = ["腰部", "大腿", "下腿", "足部"];

export const W0 = Object.freeze({
  "腰部": 0.08,
  "股関節": 0.17,
  "膝関節": 0.19,
  "足関節": 0.17,
  "大腿": 0.15,
  "下腿": 0.14,
  "足部": 0.10,
});

export const DEFAULT_CONFIG = Object.freeze({
  Vref: 3.0,
  kG_plus: 10.0,
  kG_minus: 10.0,
  ks: 0.5,
  rho: 0.25,
  Delta: 0.10,
  Na: 7,
  Nc: 28,
  B: 28,      // ★固定
  eps: 1e-8,
  tol: 1e-6,  // 検証用
});

// 速度近位化：近位/遠位（設計）
export const PROX_PARTS = ["腰部", "股関節", "大腿"];
export const DIST_PARTS = ["膝関節", "足関節", "下腿", "足部"];