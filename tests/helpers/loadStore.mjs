/* =========================================================
   loadStore.mjs — js/master.js + js/store.js をNode上でvmコンテキストに
   読み込み、テストからapi/auth/DBにアクセスできるようにするヘルパー。
   ブラウザのグローバル（localStorage/sessionStorage/crypto）は最小限のスタブで代替する。
   ========================================================= */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

function makeStorage(){
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
  };
}

export function loadStore(){
  const masterSrc = fs.readFileSync(path.join(ROOT, "js", "master.js"), "utf8");
  const storeSrc = fs.readFileSync(path.join(ROOT, "js", "store.js"), "utf8");
  const footer = `
    globalThis.__store = { api, auth, resetDB, saveDB, getDB: () => DB };
  `;

  const sandbox = {
    console,
    crypto,
    TextEncoder,
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
  };
  vm.createContext(sandbox);
  vm.runInContext(masterSrc + "\n" + storeSrc + "\n" + footer, sandbox, { filename: "store-bundle.js" });

  return sandbox.__store;
}
