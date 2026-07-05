# リリースチェックリスト

「そらとぶ医局」を実際に公開・運用できる状態にするための完了条件と、
自動開発エージェントでは進められない「人間ゲート」をまとめたもの。
公開（dev→mainマージ、GitHub Pagesへの反映）は必ず人間が判断して行う。

## 完了条件（6項目）

### 1. デプロイすれば実際に使える状態（複数ユーザーで同時利用できる）

- 現状：v0.2はlocalStorageデモモード（1ブラウザ内で完結、複数人の同時利用は不可）
- 実装：`js/store-supabase.js`（store.jsと同じ関数名でsupabase-jsのcreateClient・auth・rpc呼び出しの雛形）と`js/config.example.js`（接続設定の雛形）を追加。index.htmlは引き続き`js/store.js`を読み込んでおり、現行アプリの動作には影響しない。
- 必要な作業（人間ゲート）：
  - [ ] ⏸人間待ち：Supabaseプロジェクトを作成し、接続情報（URL・anon key）を用意する→`js/config.example.js`を`js/config.js`としてコピーして記入
  - [ ] `supabase/schema.sql` を実行してテーブルを作成する（⏸人間待ち：本番プロジェクトへの適用）
  - [ ] `supabase/schema.sql`に未定義のRPC・カラムを追加する（招待コード関連、確定後キャンセル、通知既読カーソル。詳細は`js/store-supabase.js`内のTODOコメント参照）
  - [ ] DB側RPC（security definer関数）で権限チェック・重複防止（ダブルブッキング）を再実装したうえで、index.htmlのscriptタグを`js/store.js`→`js/config.js`+`js/store-supabase.js`（+supabase-jsのCDN）に差し替え、動作確認する
- 状態：**骨格（雛形）まで完了。実接続・DB側RPC実装・切替は人間ゲート**

### 2. 医師側・病院側のUXに問題がないこと

- 記録：[docs/UX_CHECKLIST.md](./UX_CHECKLIST.md)
- 状態：**自己点検・主要な修正は完了**（8件修正。取り下げ理由promptの見た目統一など小規模な4件は見送りとして記録済み）
- 継続事項：新機能追加のたびに同チェックリストの観点（確認ダイアログ・多重送信防止・必須項目明示など）を踏襲すること

### 3. セキュリティに問題がないこと

- 記録：[docs/SECURITY_CHECKLIST.md](./SECURITY_CHECKLIST.md)
- 状態：**自己点検・修正は完了**（XSSエスケープ確認、権限チェック不備4件を修正、セッション・データ露出を確認）
- ⏸人間待ち：Supabase移行時にRLS（Row Level Security）・本番Authでの再点検が必須（SECURITY_CHECKLIST.md内に明記済み）

### 4. 法的に問題がないこと（Legal by Design）

- 維持している設計：
  - おすすめ医師のレコメンド機能は実装しない（意図的に作らない）
  - 運営（管理画面）はマッチング・チャットに介在しない（実在確認とAuditLog監査のみ）
  - 雇用は病院⇄医師の直接契約（本アプリは「場」の提供のみ）
- 必要な作業：
  - [ ] `docs/terms_draft.md`（利用規約・プライバシーポリシーのドラフト）の作成（TODO.mdキュー予定）
  - [ ] ⏸人間待ち：弁護士によるスキーム最終確認（あっせん非該当の判断、特定募集情報等提供事業者の届出要否）
- 状態：**設計は維持できているが、最終判断は人間ゲート**

### 5. 飛行機の実際の空き状況を反映できること

- 実装：`js/seatAvailability.js`に`seatAvailability(flightNo, date)`インターフェイスとモック実装を追加。
  募集詳細画面の便選択肢に空席バッジを表示し、「空席状況はデモデータ」と明示している。
- 必要な作業：
  - [ ] ⏸人間待ち：航空会社・GDS等の実API契約・接続情報の用意
  - [ ] 実API接続時は`seatAvailability()`の関数シグネチャ・戻り値の形（`{status, seatsLeft, source}`）を維持したまま中身のみ差し替える
- 状態：**アダプタ＋モックまで完了。実API接続は人間ゲート**

### 6. ダブルブッキングが絶対に起きない仕組み

- 実装：`store.js`の`findScheduleConflict()`で、同一医師の同日時重複を手上げ時（`apply`）・承認時（`approve`、再検証）の両方でブロック。承認時に募集の状態（`open`）も再検証し、1募集1医師を強制。
- テスト：`tests/store.test.mjs`（`node --test`）で保証
- 状態：**完了**

## 人間ゲート一覧（エージェントは進めない・進められない）

| ゲート | 内容 | 影響する完了条件 |
|---|---|---|
| Supabase接続情報 | プロジェクト作成・URL/キー発行・本番スキーマ適用 | 1 |
| RLS再点検 | Supabase移行後のセキュリティ再点検 | 3 |
| 弁護士確認 | あっせん非該当の最終判断・特定募集情報等提供事業者の届出 | 4 |
| 実API契約 | 航空会社・GDS等との空席照会API契約 | 5 |
| 公開判断 | dev→mainマージ、GitHub Pages反映 | 全体 |

## 実行方法（開発中の確認コマンド）

```bash
node --check js/*.js   # 構文チェック
node --test             # 単体テスト（tests/）
```
