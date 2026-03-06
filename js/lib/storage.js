const KEYS = {
  draft: "app:draft",
  results: "app:results",
  config: "app:config",
};

export function saveDraft(draft) {
  localStorage.setItem(KEYS.draft, JSON.stringify(draft));
}
export function loadDraft() {
  const s = localStorage.getItem(KEYS.draft);
  return s ? JSON.parse(s) : null;
}
export function clearDraft() {
  localStorage.removeItem(KEYS.draft);
}

export function saveConfig(cfg) {
  localStorage.setItem(KEYS.config, JSON.stringify(cfg));
}
export function loadConfig() {
  const s = localStorage.getItem(KEYS.config);
  return s ? JSON.parse(s) : null;
}
export function clearConfig() {
  localStorage.removeItem(KEYS.config);
}

export function saveResults(results){
  localStorage.setItem(KEYS.results, JSON.stringify(results));
}

export function loadResults(){
  const s = localStorage.getItem(KEYS.results);
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

export function clearResults() {
  localStorage.removeItem(KEYS.results);
}

export function clearAllAppData() {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
}