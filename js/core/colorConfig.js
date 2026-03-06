// js/core/colorConfig.js

export const COLOR = {
  text: "#111111",
  muted: "#666666",
  grid: "#DDDDDD",
  axis: "#DDDDDD",
  guide: "#F0F0F0",

  spike: {
    recovery: "#0072B2",
    neutral: "#E0E0E0",
    increase: "#D55E00",
    warn: "#CC0000",
    thetaLine: "#888888",
    zeroLine: "#888888",
  },

  charts: {
    extTerms: {
      term_speed: "#0072B2",
      term_slope: "#009E73",
      term_surface: "#E69F00",
    },

    spike: {
      G: "#111111",
      maxS: "#D55E00",
    },

    parts: {
      "腰部": "#CC79A7",
      "股関節": "#0072B2",
      "膝関節": "#D55E00",
      "足関節": "#E69F00",
      "大腿": "#009E73",
      "下腿": "#56B4E9",
      "足部": "#7F7F7F",
    },
  },
};

export function colorForSpikeS(S, theta = Math.log(1.5)) {
  const s = Number(S);
  const th = Number(theta);

  if (!Number.isFinite(s)) return COLOR.spike.neutral;
  if (Number.isFinite(th) && s >= th) return COLOR.spike.warn;
  if (s > 0) return COLOR.spike.increase;
  if (s < 0) return COLOR.spike.recovery;
  return COLOR.spike.neutral;
}