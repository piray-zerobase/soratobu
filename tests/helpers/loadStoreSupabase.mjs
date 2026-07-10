/* =========================================================
   loadStoreSupabase.mjs — js/store-supabase.js をNode上でvmコンテキストに
   読み込み、モックのsupabaseクライアントを注入してテストからauth/api/fetchXxxに
   アクセスできるようにするヘルパー。
   ========================================================= */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

export function loadStoreSupabase(mockClient){
  const src = fs.readFileSync(path.join(ROOT, "js", "store-supabase.js"), "utf8");
  const footer = `
    globalThis.__ss = {
      auth, api,
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
  vm.runInContext(src + "\n" + footer, sandbox, { filename: "store-supabase-bundle.js" });
  return sandbox.__ss;
}
