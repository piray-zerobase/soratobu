/* =========================================================
   loadStoreCloud.mjs — js/store-supabase.js + js/cloud-map.js + js/store-cloud.js を
   同じvmコンテキストに読み込み、モックのsupabaseクライアントを注入して
   テストからrefreshAll/CACHE等にアクセスできるようにするヘルパー。
   ブラウザでは<script>タグの読み込み順（store-supabase→cloud-map→store-cloud）で
   同じグローバルスコープに展開されるため、ここでも同じ順に連結して実行する。
   ========================================================= */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

export function loadStoreCloud(mockClient){
  const files = ["store-supabase.js", "cloud-map.js", "store-cloud.js"];
  const src = files.map(f => fs.readFileSync(path.join(ROOT, "js", f), "utf8")).join("\n");
  const footer = `
    globalThis.__sc = {
      auth, api, CACHE, refreshAll, refreshMessages,
      fetchOpenPostings, fetchMyApplications, fetchMessages,
      fetchMyDoctor, fetchMyHospital, fetchApplicationsForMyPostings,
      fetchMyAssignments, fetchAdminQueues,
    };
  `;
  const sandbox = {
    console,
    SORATOBU_CONFIG: { SUPABASE_URL: "https://mock.example.com", SUPABASE_ANON_KEY: "mock-anon-key" },
    supabase: { createClient: () => mockClient },
  };
  vm.createContext(sandbox);
  vm.runInContext(src + "\n" + footer, sandbox, { filename: "store-cloud-bundle.js" });
  return sandbox.__sc;
}
