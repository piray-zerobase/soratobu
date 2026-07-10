/* =========================================================
   cloudMap.test.mjs — js/cloud-map.js（DB行⇄ビュー形の変換）の単体テスト
   実行方法: node --test
   ========================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function loadCloudMap(){
  const src = fs.readFileSync(path.join(ROOT, "js", "cloud-map.js"), "utf8");
  const footer = `globalThis.__cm = {
    postingFromDb, postingToDb, hospitalFromDb, hospitalToDb,
    doctorFromDb, doctorToDb, applicationFromDb, applicationToDb,
    assignmentFromDb, assignmentToDb, messageFromDb, messageToDb,
  };`;
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(src + "\n" + footer, sandbox, { filename: "cloud-map-bundle.js" });
  return sandbox.__cm;
}

/* vmサンドボックス側で生成したオブジェクトはこのテストファイルとは別レルム
   （Object.prototypeが別物）になるため、そのままdeepStrictEqualすると
   構造が同じでも失敗する。JSON往復で素の（このレルムの）オブジェクトに
   揃えてから比較する。 */
const plain = (o) => JSON.parse(JSON.stringify(o));

test("posting: DB行→ビュー形→DB行で元の列がすべて復元される", () => {
  const { postingFromDb, postingToDb } = loadCloudMap();
  const row = {
    id: "po_1", hospital_id: "hp_1", status: "open", urgent: false,
    date: "2026-07-12", time_start: "09:00", time_end: "12:00", overnight: false,
    type: "ワクチン", department: "—", required_credentials: ["医師免許"],
    pay: 60000, transport: "全額 病院負担", lodging: "前泊", ground: "送迎あり",
    note: "半日のみ。", published_at: "2026-07-01T00:00:00Z",
  };
  const view = postingFromDb(row);
  assert.equal(view.hospitalId, "hp_1");
  assert.equal(view.timeStart, "09:00");
  assert.equal(view.cls, "b-vac");   // DBに列は無いがtypeから算出される
  assert.deepEqual(plain(postingToDb(view)), row);
});

test("hospital: DB行→ビュー形→DB行で元の列がすべて復元される", () => {
  const { hospitalFromDb, hospitalToDb } = loadCloudMap();
  const row = {
    id: "hp_1", name: "徳之島徳洲会病院", pref: "鹿児島県", address: "鹿児島県徳之島町（住所は登録時に入力）",
    phone: "", lat: 27.75, lng: 128.95, island: "徳之島", airport: "TKN",
    status: "承認", verified_note: "病院マスタ一致（システム照合）", facilities: "送迎あり・宿は病院手配",
    invite_code: "ABCD2345",
  };
  const view = hospitalFromDb(row);
  assert.equal(view.verifiedNote, row.verified_note);
  assert.equal(view.inviteCode, "ABCD2345");
  assert.deepEqual(plain(hospitalToDb(view)), row);
});

test("doctor: DB行→ビュー形→DB行で元の列がすべて復元される（email等のextraは別合成）", () => {
  const { doctorFromDb, doctorToDb } = loadCloudMap();
  const row = {
    id: "dr_1", name: "山田 太郎", license_no: "123456", hokeni_no: "",
    specialties: ["総合診療","内科"], capabilities: ["当直","外来応援"],
    home_base: "ITM", status: "承認", completed_count: 12,
  };
  const view = doctorFromDb(row, { email: "yamada@example.com", credentials: [] });
  assert.equal(view.homeBase, "ITM");
  assert.equal(view.email, "yamada@example.com");
  assert.deepEqual(plain(doctorToDb(view)), row);
});

test("application: DB行→ビュー形→DB行で元の列がすべて復元される", () => {
  const { applicationFromDb, applicationToDb } = loadCloudMap();
  const row = {
    id: "ap_1", posting_id: "po_1", doctor_id: "dr_1", status: "applied",
    itinerary: { summary: "伊丹 08:00発" }, applied_at: "2026-07-01T00:00:00Z", decided_at: null,
  };
  const view = applicationFromDb(row);
  assert.equal(view.postingId, "po_1");
  assert.deepEqual(plain(applicationToDb(view)), row);
});

test("assignment: DB行→ビュー形→DB行で元の列がすべて復元される", () => {
  const { assignmentFromDb, assignmentToDb } = loadCloudMap();
  const row = {
    id: "as_1", posting_id: "po_1", doctor_id: "dr_1", hospital_id: "hp_1",
    status: "confirmed", employment_type: "日々雇用（病院と医師の直接契約）",
    terms_snapshot: { pay: 60000 }, itinerary: { summary: "伊丹 08:00発" },
    created_at: "2026-07-01T00:00:00Z", completed_at: null,
    cancelled_by: null, cancel_reason: null,
  };
  const view = assignmentFromDb(row);
  assert.equal(view.termsSnapshot.pay, 60000);
  assert.deepEqual(plain(assignmentToDb(view)), row);
});

test("message: DB行→ビュー形→DB行で元の列がすべて復元される", () => {
  const { messageFromDb, messageToDb } = loadCloudMap();
  const row = {
    id: "ms_1", application_id: "ap_1", sender_role: "doctor", sender_id: "dr_1",
    text: "よろしくお願いします", created_at: "2026-07-01T00:00:00Z",
  };
  const view = messageFromDb(row);
  assert.equal(view.senderRole, "doctor");
  assert.equal(view.ts, row.created_at);
  assert.deepEqual(plain(messageToDb(view)), row);
});
