import { DEFAULT_CONFIG } from "../core/constants.js";
import { saveConfig, clearAllAppData } from "../lib/storage.js";

document.getElementById("btnStart").addEventListener("click", () => {
  saveConfig(DEFAULT_CONFIG);
  location.href = "./input.html";
});

document.getElementById("btnReset").addEventListener("click", () => {
  clearAllAppData();
  alert("保存データを消去しました");
});