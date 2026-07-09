/* =========================================================
   smoke.spec.mjs — E2Eスモークテスト（実ブラウザでアプリを操作）
   実行方法: node --test tests/e2e/
   ・Playwright（Chromium）が使えない環境では自動的にスキップします
   ・デモデータ（js/store.js seedDB）の固定値に依存：
     po_1（hp_1=徳之島徳洲会病院／2026-07-12／ワクチン）を医師dr_1が応募→承認する想定
   ========================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);

/* playwrightはこのプロジェクトの依存には入れず、実行環境にグローバル導入されているものを使う
   （②のデータ構造凍結・新規外部ライブラリ非追加の方針に合わせ、テスト実行環境側の既存ツールを利用） */
function loadPlaywright(){
  const candidates = [];
  try{ candidates.push(...require("node:child_process").execSync("npm root -g").toString().trim().split("\n")); }catch{}
  candidates.push("/opt/node22/lib/node_modules", "/usr/lib/node_modules", "/usr/local/lib/node_modules");
  for(const dir of candidates){
    try{
      const resolved = require.resolve("playwright", { paths: [dir] });
      return require(resolved);
    }catch{}
  }
  try{ return require("playwright"); }catch{ return null; }
}
const playwright = loadPlaywright();

const MIME = {".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".svg":"image/svg+xml",".png":"image/png"};
function startServer(){
  return new Promise((resolve)=>{
    const server = http.createServer((req,res)=>{
      let p = decodeURIComponent(req.url.split("?")[0]);
      if(p==="/") p="/index.html";
      const file = path.join(ROOT, p);
      if(!file.startsWith(ROOT)){ res.writeHead(403); return res.end(); }
      fs.readFile(file, (err,data)=>{
        if(err){ res.writeHead(404); return res.end("not found"); }
        res.writeHead(200, {"Content-Type": MIME[path.extname(file)] || "application/octet-stream"});
        res.end(data);
      });
    });
    server.listen(0, "127.0.0.1", ()=>resolve(server));
  });
}

async function withPage(fn){
  const server = await startServer();
  const { port } = server.address();
  const browser = await playwright.chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("dialog", d => d.accept());
  try{
    await page.goto(`http://127.0.0.1:${port}/index.html`);
    await fn(page);
  } finally {
    await browser.close();
    server.close();
  }
}

async function login(page, email){
  await page.getByRole("button", { name: "ログイン" }).first().click();
  await page.locator("#l-email").fill(email);
  await page.locator("#l-pass").fill("demo1234");
  await page.getByRole("button", { name: "ログイン" }).last().click();
  await page.waitForTimeout(150);
}
async function logout(page){
  await page.getByRole("button", { name: "ログアウト" }).click();
  await page.waitForTimeout(50);
}

test("E2Eスモーク：医師=ログイン→地図→詳細→手上げ→マイページに反映", { skip: !playwright && "playwrightが利用できない環境のためスキップ" }, async () => {
  await withPage(async (page) => {
    await login(page, "yamada@example.com");
    await page.getByText("📅 日付で探す").click();
    await page.locator(".card.click", { hasText: "徳之島徳洲会病院" }).first().click();
    await page.getByRole("button", { name: /この枠に手を挙げる/ }).click();
    await page.getByRole("button", { name: /この内容で手を挙げる/ }).click();
    await assert.doesNotReject(page.getByText("手を挙げました").waitFor({ timeout: 3000 }));
    await page.locator(".tab", { hasText: "マイページ" }).click();
    await assert.doesNotReject(page.locator(".card", { hasText: "徳之島徳洲会病院" }).getByText("承認待ち").waitFor({ timeout: 3000 }));
  });
});

test("E2Eスモーク：病院=ログイン→応募確認→承認→カレンダーが🟢", { skip: !playwright && "playwrightが利用できない環境のためスキップ" }, async () => {
  await withPage(async (page) => {
    await login(page, "yamada@example.com");
    await page.getByText("📅 日付で探す").click();
    await page.locator(".card.click", { hasText: "徳之島徳洲会病院" }).first().click();
    await page.getByRole("button", { name: /この枠に手を挙げる/ }).click();
    await page.getByRole("button", { name: /この内容で手を挙げる/ }).click();
    await page.getByText("手を挙げました").waitFor({ timeout: 3000 });
    await logout(page);

    await login(page, "tokunoshima@example.com");
    const slot = page.locator(".slot.s-open", { hasText: "ワクチン" }).first();
    await assert.doesNotReject(slot.waitFor({ timeout: 3000 }));
    await slot.click();
    await page.getByRole("button", { name: "この先生を承認" }).click();
    await assert.doesNotReject(page.locator(".slot.s-conf", { hasText: "ワクチン" }).first().waitFor({ timeout: 3000 }));
  });
});

test("E2Eスモーク：運営=ログイン→AuditLog表示", { skip: !playwright && "playwrightが利用できない環境のためスキップ" }, async () => {
  await withPage(async (page) => {
    await login(page, "admin@example.com");
    await assert.doesNotReject(page.getByText("AuditLog（追記専用・新しい順）").waitFor({ timeout: 3000 }));
    const count = await page.locator(".audit").count();
    assert.ok(count > 0, "AuditLogに1件以上の記録があること");
  });
});
