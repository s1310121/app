import { clearAllAppData } from "../lib/storage.js";

document.getElementById("btnAgain").addEventListener("click", ()=>{
  location.href = "./input.html";
});

document.getElementById("btnHome").addEventListener("click", ()=>{
  location.href = "./start.html";
});

document.getElementById("btnClear").addEventListener("click", ()=>{
  clearAllAppData();
  alert("保存データを削除しました");
});