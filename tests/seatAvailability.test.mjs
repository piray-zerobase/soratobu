/* =========================================================
   seatAvailability.test.mjs — 空席照会アダプタ（モック実装）の単体テスト
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

function loadSeatAvailability(){
  const src = fs.readFileSync(path.join(ROOT, "js", "seatAvailability.js"), "utf8");
  const footer = `globalThis.__seat = { seatAvailability, SEAT_STATUS, SEAT_STATUS_LABEL };`;
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(src + "\n" + footer, sandbox, { filename: "seatAvailability-bundle.js" });
  return sandbox.__seat;
}

test("同じ便名・日付なら常に同じ結果を返す（決定論的モック）", () => {
  const { seatAvailability } = loadSeatAvailability();
  const a = seatAvailability("JAL2405", "2026-08-01");
  const b = seatAvailability("JAL2405", "2026-08-01");
  assert.deepEqual(a, b);
});

test("便名・日付が変われば結果が変わりうる（固定値を返しているだけではない）", () => {
  const { seatAvailability } = loadSeatAvailability();
  const results = new Set();
  for(let i=0;i<20;i++){
    results.add(JSON.stringify(seatAvailability("JAL2405", `2026-08-${String(i+1).padStart(2,"0")}`)));
  }
  assert.ok(results.size > 1, "異なる日付で全く同じ結果しか返らない");
});

test("戻り値は status/seatsLeft/source を持つ", () => {
  const { seatAvailability, SEAT_STATUS } = loadSeatAvailability();
  const r = seatAvailability("ANA541", "2026-08-01");
  assert.ok(Object.values(SEAT_STATUS).includes(r.status));
  assert.equal(r.source, "mock");
  assert.ok(r.seatsLeft === null || typeof r.seatsLeft === "number");
});

test("便名または日付が無い場合はunknownを返す（実照会できないことを明示）", () => {
  const { seatAvailability, SEAT_STATUS } = loadSeatAvailability();
  assert.equal(seatAvailability(null, "2026-08-01").status, SEAT_STATUS.UNKNOWN);
  assert.equal(seatAvailability("JAL2405", null).status, SEAT_STATUS.UNKNOWN);
});
