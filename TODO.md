# そらとぶ医局 — 自動開発キュー（クラウドエージェント用作業指示）

## ルール（エージェントは毎回これに従う）
1. 上から順に未完了タスクを**1回の実行で1〜2個だけ**進める（小さく確実に）
2. 変更前に既存コードの流儀を読む。②データ構造（README参照）は凍結：変更しない
3. **Legal by Design を壊さない**：レコメンド機能・運営がマッチングに介在する機能は絶対に作らない
4. 完了したらこのファイルのチェックボックスを [x] にし、変更内容を「作業ログ」に1行追記してcommit & push
5. テスト：`node --check js/*.js` は必ず通す。壊れた状態でpushしない

## タスクキュー（優先順）
- [x] **PWA化**：manifest.json＋Service Worker（オフライン時は「接続してください」表示）。ホーム画面に追加できるように
- [x] **ダブルブッキング完全防止**：同一医師の同日時重複応募/重複承認をstore.jsでブロック（承認時にも再検証）、1募集1医師の強制、テスト付き
- [x] **セキュリティ自己点検と修正**：XSS（全出力のesc確認）/権限チェック/セッション取り扱い/データ露出。結果をdocs/SECURITY_CHECKLIST.mdに記録
- [x] **UX自己点検**：医師側・病院側の全フローを追って問題点を洗い出し・修正。docs/UX_CHECKLIST.mdに記録
- [x] **空席照会アダプタ**：実際の空き状況を反映できるインターフェイス（seatAvailability(flightNo,date)）とモック実装。UIに「デモデータ」と明示。実API接続は人間ゲート
- [x] **リリースチェックリスト作成**：docs/RELEASE_CHECKLIST.md（完了条件と人間ゲート＝Supabase接続情報／実API契約／弁護士確認を記載）
- [x] **入力バリデーション強化**：医籍番号・電話番号・日付の形式チェックをフォーム側にも（store.js側は既存）
- [ ] **通知センター**：ヘッダーに🔔。自分宛イベント（手上げあり/承認された/見送り/メッセージ）を既読管理付きで一覧
- [ ] **病院の複数ユーザー**：HospitalUser相当（同じ病院に事務2人目を招待コードで追加）
- [ ] **募集テンプレ保存**：病院が「前回の募集をコピーして作成」できるように
- [ ] **医師の絞り込み**：日付×業務種別×エリアのフィルタ（地図・日付タブ共通）
- [ ] **キャンセルフロー**：確定後の取り下げ（理由必須・相手に通知・AuditLog記録）※ペナルティ設計はしない
- [ ] **Supabaseアダプタ骨格**：js/store-supabase.js を新設（同じAPI関数名でsupabase-js呼び出しの雛形＋接続設定ファイルconfig.example.js）。※実接続はSupabaseプロジェクト作成後
- [ ] **単体テスト**：tests/store.test.mjs（node:testで状態遷移・資格ゲート・重複応募拒否を検証）＋実行方法をREADMEに
- [ ] **利用規約・プライバシーポリシーのドラフト**：docs/terms_draft.md（募集情報等提供・あっせん非該当・特定募集情報等提供事業者の届出前提で）

## 作業ログ
- 2026-06-21 v0.2 初回コミット（認証・実在確認・募集/手上げ/承認/チャット・病院マスタ67院）
- 2026-07-05 PWA化：manifest.json・sw.js（アプリシェルをキャッシュ、オフライン時はoffline.htmlで「接続してください」表示）・icons/icon.svgを追加。index.htmlにmanifestリンクとSW登録を追加
- 2026-07-05 ダブルブッキング完全防止：store.jsにfindScheduleConflict()を追加し、同一医師の同日時重複を手上げ時（apply）・承認時（approve、再検証として）の両方でブロック。承認時にpo.status!=="open"チェックも追加し1募集1医師を明示的に強制。tests/store.test.mjs（node:test）とtests/helpers/loadStore.mjs（vm上でmaster.js+store.jsを読み込むテスト用ハーネス）を新設、5件のテストで検証。READMEにテスト実行方法（node --test）を追記
- 2026-07-05 セキュリティ自己点検：store.jsの全API関数を権限チェック観点で洗い出し、実際の不備4件（decline/completeの他院操作可能、sendMessageのなりすまし、verifyDoctor/verifyHospital/verifyCredentialのadmin権限未検証）を発見・修正。app.jsの呼び出し側とtests/store.test.mjsも追随（新規4テスト、計8件全通過）。XSS・セッション・データ露出は確認のうえ結果をdocs/SECURITY_CHECKLIST.mdに記録（本番Supabase移行時の再点検事項も明記）
- 2026-07-05 UX自己点検：医師側・病院側の全画面遷移をapp.js/index.html/store.js/css/app.cssから追い、問題点を洗い出してdocs/UX_CHECKLIST.mdに記録。修正8件（承認/お断り/勤務完了への確認ダイアログ、募集ウィザードの報酬未入力バリデーション、チャット入力のIME誤送信防止、ログイン/登録ボタンの多重送信防止、必須項目の「＊必須」明示、label/inputのfor紐付け、トーストの折り返し対応）。取り下げ理由promptの見た目統一など4件は小規模修正の範囲を超えるため記録のみで見送り。node --check全通過、既存node --test 8件も全通過（store.js無変更）
- 2026-07-05 空席照会アダプタ：js/seatAvailability.js を新設し、seatAvailability(flightNo,date)インターフェイスとモック実装（便名+日付から決定論的な疑似空席状況を返す）を追加。index.htmlで読み込み、募集詳細（app.js renderDetail）の行き・帰り便選択肢に空席バッジを表示し「空席状況はデモデータ」と明示（css/app.cssに.seatbadge/.demo-tag追加）。実API接続は関数シグネチャを変えずに中身を差し替える設計とし、人間ゲート（契約・接続情報）とした。tests/seatAvailability.test.mjsで決定論性・戻り値の形・unknown時の挙動を検証（4件、既存8件と合わせ計12件全通過）。あわせてdocs/RELEASE_CHECKLIST.mdを新設し、リリース6完了条件それぞれの状態・残タスク・人間ゲート一覧（Supabase接続情報／RLS再点検／弁護士確認／実API契約／公開判断）を記録
- 2026-07-05 入力バリデーション強化：医籍登録番号（数字以外を入力時に自動除去＋5〜7桁チェックをdoRegisterDoctorに追加）・病院代表電話（type=telと数字/ハイフン以外の自動除去、isValidPhoneによる形式チェックを追加。未入力は引き続き任意）・募集ウィザードの日にち欄（数字以外を自動除去、Number.isIntegerで整数のみ許可するようwizNext/wizPublishを修正）をフォーム側にも実装。store.js側の権限チェック・重複防止ロジックは無変更。node --check全通過、既存node --test 12件も全通過
