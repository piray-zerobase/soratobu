# そらとぶ医局（仮称）v0.2

離島・僻地のスポット医師募集と医師をつなぐ会員制プラットフォーム。
医師が地図・日付から募集を見つけ、実在便から往復を選んで手を挙げる。病院が承認すると直接雇用で確定。
**職業紹介（あっせん）は行わない**設計（Legal by Design）。

- 戦略: `GoogleDrive/ClaudeCode/business/豊蔵_医師確保コンサル支援/09_事業戦略_再設計.md`
- 設計: 同 `08_設計書.md`（②データ構造は凍結。変更は設計書を先に直す）

## 構成

```
index.html          … 画面の骨格（SPA）
css/app.css         … スタイル（teal基調・緊急のみ赤）
js/master.js        … 実在病院マスタ（47都道府県＋離島）・空港・便マスタ・実在照合
js/store.js         … データ層＋API層（認証・状態遷移・AuditLog・行程エンジン）
js/app.js           … ビュー層（医師/病院/運営の3ロール）
supabase/schema.sql … 本番用DBスキーマ（Postgres/Supabase）
```

## 現在のモード（v0.2 = デモモード）

- データは **ブラウザのlocalStorage** に保存（＝1ブラウザ内で完結。複数人での同時利用は不可）
- 認証はデモ実装（SHA-256+salt。**本番はSupabase Authに移行必須**）
- デモアカウント（パスワードは全て `demo1234`）
  - 医師: `yamada@example.com` ／ 病院: `tokunoshima@example.com` ／ 運営: `admin@example.com`

## 実在確認のしくみ

| 対象 | システムチェック | 人力チェック（運営） |
|---|---|---|
| 病院 | 登録時に**実在病院マスタと自動照合**（一致→即利用可） | 不一致時は[医療情報ネット](https://www.iryou.teikyouseido.mhlw.go.jp/)等で確認して承認 |
| 医師 | 医籍登録番号の形式チェック＋書類添付必須 | [厚労省 医師等資格確認検索](https://licenseif.mhlw.go.jp/search_isei/)で照合して承認 |

## GitHub Pages 公開手順（平井さんのターミナルで実行）

AIサンドボックスからGitHubへは接続できないため、公開はローカルターミナルで：

```bash
cd ~/projects/soratobu
gh repo create soratobu --public --source=. --push
gh api repos/{owner}/soratobu/pages -X POST -f 'source[branch]=main' -f 'source[path]=/'
```

数分後 `https://<GitHubユーザー名>.github.io/soratobu/` で公開される。
以後の更新は `git add -A && git commit -m "update" && git push`。

## 本番化ロードマップ（次フェーズ）

1. **Supabase接続**：プロジェクト作成 → `supabase/schema.sql` 実行 → Auth有効化 →
   `js/store.js` のデータ層をsupabase-js呼び出しに差し替え（APIインターフェイスは同一）
2. **RLS＋RPC**：状態遷移をsecurity definer関数化し、AuditLog記録をDB層で強制
3. **書類ストレージ**：免許証等は非公開バケット＋署名付きURL
4. **法務**：弁護士確認（α案スキーム）＋**特定募集情報等提供事業者の届出**＋利用規約
5. 通知（メール→LINE検討）、便マスタの季節ダイヤ更新運用

## テスト

`js/store.js`（状態遷移・ダブルブッキング防止など）の単体テストは `tests/` にあります。

```bash
node --test
```

### E2Eスモークテスト（実ブラウザでの動作確認）

`tests/e2e/smoke.spec.mjs` は Playwright（Chromium）でアプリを実際に操作し、医師・病院・運営の3フローが通しで動くことを確認します。単体テストとは別コマンドで実行します（デフォルトの `node --test` の対象パターンには含まれません）。

```bash
node --test tests/e2e/smoke.spec.mjs
```

- Playwrightが導入されていない環境では自動的にスキップされます（テスト失敗にはなりません）
- 対象データはデモモードの初期シード（`js/store.js` seedDB）の固定値に依存します。ブラウザは毎回まっさらな状態（localStorage無し）で起動するため、繰り返し実行しても結果は安定します

## 運用ルール（制度として）

- 運営（ゼロベース）がやること：実在確認（病院・医師・書類）、AuditLog監査、便マスタ更新
- 運営が**やらない**こと：医師の推薦・割り当て・やりとりへの参加（あっせん該当を避ける）
- 雇用は病院⇄医師の直接契約（日々雇用）。交通費は病院負担、便の予約は医師本人（自己申告で記録）
