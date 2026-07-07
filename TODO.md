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
- [x] **通知センター**：ヘッダーに🔔。自分宛イベント（手上げあり/承認された/見送り/メッセージ）を既読管理付きで一覧
- [x] **病院の複数ユーザー**：HospitalUser相当（同じ病院に事務2人目を招待コードで追加）
- [x] **募集テンプレ保存**：病院が「前回の募集をコピーして作成」できるように
- [x] **医師の絞り込み**：日付×業務種別×エリアのフィルタ（地図・日付タブ共通）
- [x] **キャンセルフロー**：確定後の取り下げ（理由必須・相手に通知・AuditLog記録）※ペナルティ設計はしない
- [x] **Supabaseアダプタ骨格**：js/store-supabase.js を新設（同じAPI関数名でsupabase-js呼び出しの雛形＋接続設定ファイルconfig.example.js）。※実接続はSupabaseプロジェクト作成後
- [x] **単体テスト**：tests/store.test.mjs（node:testで状態遷移・資格ゲート・重複応募拒否を検証）＋実行方法をREADMEに
- [x] **利用規約・プライバシーポリシーのドラフト**：docs/terms_draft.md（募集情報等提供・あっせん非該当・特定募集情報等提供事業者の届出前提で）

## 作業ログ
- 2026-06-21 v0.2 初回コミット（認証・実在確認・募集/手上げ/承認/チャット・病院マスタ67院）
- 2026-07-05 PWA化：manifest.json・sw.js（アプリシェルをキャッシュ、オフライン時はoffline.htmlで「接続してください」表示）・icons/icon.svgを追加。index.htmlにmanifestリンクとSW登録を追加
- 2026-07-05 ダブルブッキング完全防止：store.jsにfindScheduleConflict()を追加し、同一医師の同日時重複を手上げ時（apply）・承認時（approve、再検証として）の両方でブロック。承認時にpo.status!=="open"チェックも追加し1募集1医師を明示的に強制。tests/store.test.mjs（node:test）とtests/helpers/loadStore.mjs（vm上でmaster.js+store.jsを読み込むテスト用ハーネス）を新設、5件のテストで検証。READMEにテスト実行方法（node --test）を追記
- 2026-07-05 セキュリティ自己点検：store.jsの全API関数を権限チェック観点で洗い出し、実際の不備4件（decline/completeの他院操作可能、sendMessageのなりすまし、verifyDoctor/verifyHospital/verifyCredentialのadmin権限未検証）を発見・修正。app.jsの呼び出し側とtests/store.test.mjsも追随（新規4テスト、計8件全通過）。XSS・セッション・データ露出は確認のうえ結果をdocs/SECURITY_CHECKLIST.mdに記録（本番Supabase移行時の再点検事項も明記）
- 2026-07-05 UX自己点検：医師側・病院側の全画面遷移をapp.js/index.html/store.js/css/app.cssから追い、問題点を洗い出してdocs/UX_CHECKLIST.mdに記録。修正8件（承認/お断り/勤務完了への確認ダイアログ、募集ウィザードの報酬未入力バリデーション、チャット入力のIME誤送信防止、ログイン/登録ボタンの多重送信防止、必須項目の「＊必須」明示、label/inputのfor紐付け、トーストの折り返し対応）。取り下げ理由promptの見た目統一など4件は小規模修正の範囲を超えるため記録のみで見送り。node --check全通過、既存node --test 8件も全通過（store.js無変更）
- 2026-07-05 空席照会アダプタ：js/seatAvailability.js を新設し、seatAvailability(flightNo,date)インターフェイスとモック実装（便名+日付から決定論的な疑似空席状況を返す）を追加。index.htmlで読み込み、募集詳細（app.js renderDetail）の行き・帰り便選択肢に空席バッジを表示し「空席状況はデモデータ」と明示（css/app.cssに.seatbadge/.demo-tag追加）。実API接続は関数シグネチャを変えずに中身を差し替える設計とし、人間ゲート（契約・接続情報）とした。tests/seatAvailability.test.mjsで決定論性・戻り値の形・unknown時の挙動を検証（4件、既存8件と合わせ計12件全通過）。あわせてdocs/RELEASE_CHECKLIST.mdを新設し、リリース6完了条件それぞれの状態・残タスク・人間ゲート一覧（Supabase接続情報／RLS再点検／弁護士確認／実API契約／公開判断）を記録
- 2026-07-05 入力バリデーション強化：医籍登録番号（数字以外を入力時に自動除去＋5〜7桁チェックをdoRegisterDoctorに追加）・病院代表電話（type=telと数字/ハイフン以外の自動除去、isValidPhoneによる形式チェックを追加。未入力は引き続き任意）・募集ウィザードの日にち欄（数字以外を自動除去、Number.isIntegerで整数のみ許可するようwizNext/wizPublishを修正）をフォーム側にも実装。store.js側の権限チェック・重複防止ロジックは無変更。node --check全通過、既存node --test 12件も全通過
- 2026-07-05 通知センター：ヘッダーに🔔ボタン（医師・病院ロールのみ表示）を追加。app.jsにnotifEvents()を新設し、応募（手上げ）・承認・見送り・チャットメッセージのうち自分宛のものを既存データ（applications/messages/postings）から動的に導出（新規の永続エンティティは追加せず、②のデータ構造は無変更）。既読管理はstore.jsに追加したDB.notifCursor（ユーザーごとの既読カーソル＝seq番号）とapi.markNotificationsRead()で実装し、通知センターを開くと未読バッジが消える。クリックで該当のチャット／応募一覧／募集詳細へ遷移。css/app.cssに.bell/.nbadge/.notifrowを追加（teal基調・バッジはpayオレンジで緊急の赤とは区別）。node --check全通過、既存node --test 16件（store 12 + seatAvailability 4）も全通過。vmサンドボックスでの手動シナリオ確認（応募→通知発生→承認→既読化）も実施
- 2026-07-05 病院の複数ユーザー（HospitalUser相当）：②のデータ構造は変更せず、既存のUser（role=hospital, refId=hospitalId）が同じhospitalIdを指せる設計をそのまま利用。store.jsに病院ごとのinviteCode（8桁・紛らわしい文字除外のランダム生成、hospitals seed/registerHospital時に自動発行）と、api.joinHospitalByInviteCode(userId,code)（refId未設定のhospitalユーザーのみ参加可・二重所属や誤コードを拒否）／api.regenerateInviteCode(userId)（漏洩時の失効用）を追加。app.jsの病院オンボーディング画面に「招待コードで参加」タブを追加し、病院ダッシュボードに自院の招待コード表示・コピー・再発行ボタンを追加（css/app.cssに.invitecode追加）。docs/SECURITY_CHECKLIST.mdに招待コード機能の権限チェック観点を追記。tests/store.test.mjsに3テスト追加（正常参加・誤コード拒否/二重所属拒否・再発行と旧コード失効）、node --check全通過、node --test 15件（store 11 + seatAvailability 4）全通過
- 2026-07-05 単体テスト：既存のtests/store.test.mjs（node:test、状態遷移・資格ゲート・重複応募拒否・権限チェック・招待コードを網羅、15件全通過）とREADMEの実行方法（node --test）記載により本項目の要件を満たしていたため、タスクとして[x]に反映（新規実装なし）
- 2026-07-05 募集テンプレ保存：js/app.jsのopenWizard()にfromId引数を追加し、既存の募集（type/time/dept/pay/urgent/note）から募集ウィザードの初期値を復元できるように変更（日にちは新規入力必須のため空欄のまま）。openTemplatePicker()／useTemplate()を新設し、病院ダッシュボードに「📋 前回をコピー」ボタン（自院の過去募集がある場合のみ表示）から最新10件を選んで複製→公開できるようにした。②のデータ構造・store.jsのAPIは無変更（ビュー層のみの変更）。node --check全通過、node --test 15件全通過、Playwright（Chromiumヘッドレス）で実際にログイン→テンプレ選択→時間帯/業務/診療科/一言/報酬が復元されること→日にちのみ入力して公開→カレンダーに新規枠が反映されることを確認
- 2026-07-05 医師の絞り込み：js/app.jsに医師タブ共通の絞り込み状態FILT（type/area）とrenderFilterBar()を追加し、マップ・日付タブの両方に「業務種別（すべて/当直/外来応援/健診応援/ワクチン）」チップと「エリア」セレクトを表示。filteredOpenPostings()で募集一覧・マップのピン集計（initMap）・ピンタップ時の一覧（hospSheet）を絞り込み条件で共通フィルタするよう変更（store.js・②データ構造は無変更、ビュー層のみ）。css/app.cssに.filterbar/.filterrow/.pick.sm/.inp.smを追加。node --check全通過、node --test 15件全通過、Playwright（Chromiumヘッドレス）で医師ログイン→日付タブでの業務種別フィルタによる件数変化・エリア候補の表示・「絞り込み解除」・マップタブへの切替後もフィルタバーが表示されることを確認
- 2026-07-05 キャンセルフロー：store.jsにapi.cancelAssignment(actorRole, actorId, assignmentId, reason)を追加。確定済み(confirmed)のAssignmentのみ対象、医師・病院どちらの当事者からもキャンセル可能（他人・他院はエラー）、理由は必須（空文字はAPI層で拒否）、キャンセル後はAssignment.status="cancelled"・対応するApplication.status="cancelled"に遷移し、募集(Posting)は"open"に戻して他の医師が再応募できるようにした。ペナルティ設計（回数記録・信用スコア等）は行わずAuditLog記録のみ。app.jsに共通のdoCancelAssignment()を追加し、医師マイページの確定カード・病院の確定枠モーダルの両方に「キャンセルする／確定を取り消す」ボタンを設置。通知センター（notifEvents）にキャンセル発生時の相手への通知イベント（❌アイコン、理由表示）を追加。ステータス表示ラベルに「キャンセル済み」を追加（既存のst-declined配色を流用）。病院カレンダー・確定枠モーダルで同一postingIdに複数Assignmentが存在しうるようになったため、DB.assignments.find()をslice(-1)[0]（最新のもの）を参照するよう修正。docs/SECURITY_CHECKLIST.mdに権限チェック観点を追記。tests/store.test.mjsに2テスト追加（医師側キャンセル→再公開→再応募可能・理由必須・当事者チェック、病院側キャンセル→AuditLog記録・他院からの操作拒否）、node --check全通過、node --test 17件（seatAvailability 4 + store 13）全通過
- 2026-07-05 利用規約・プライバシーポリシーのドラフト：docs/terms_draft.mdを新設。事業スキームの前提（募集情報等提供事業への該当整理、あっせん非該当の設計意図、特定募集情報等提供事業者の届出要否は要確認）を明記したうえで、利用規約（本サービスの内容・実在確認・禁止事項・ダブルブッキング防止・キャンセル時の扱い＝ペナルティを科さない設計・免責事項）とプライバシーポリシー（取得情報・利用目的・第三者提供＝承認後の連絡先相互開示・書類の取扱い・削除）のたたき台を作成。冒頭と末尾に「弁護士確認前の公開禁止」「未確定・要確認事項一覧」を明記し、⏸人間待ち（弁護士確認）であることを明示。コードの変更はなし（ドキュメントのみ）のためnode --check／node --testへの影響なし（既存17件は引き続き全通過を確認）
- 2026-07-05 Supabaseアダプタ骨格：js/store-supabase.jsを新設し、store.jsと同じ関数名（auth.signup/login/logout/me、api.registerDoctor/registerHospital/joinHospitalByInviteCode/regenerateInviteCode/publishPosting/apply/approve/decline/withdraw/cancelAssignment/complete/selfReportBooking/sendMessage/verifyDoctor/verifyHospital/verifyCredential/markNotificationsRead）をsupabase-jsのcreateClient・auth・rpc呼び出しの雛形として実装（状態遷移はDB側security definer RPC経由とし、重複防止・権限チェックをDB層でも再実装する前提のTODOコメントを付記。招待コード・通知既読カーソル・確定後キャンセルはsupabase/schema.sqlに未定義のため対応RPC/テーブル追加が必要な旨を明記）。js/config.example.js（SUPABASE_URL/ANON_KEYの雛形）を新設し、.gitignoreにjs/config.jsを追加（実接続情報はコミットしない）。index.htmlはjs/store.jsのままで本ファイルは未読み込み＝現行アプリの動作に影響なし。実際の切替（config.js作成・RPC実装・schema適用・script差し替え）は人間ゲート。node --check js/*.js全通過、既存node --test 17件も全通過（store.js無変更）
- 2026-07-06 Supabase本番準備（C）: supabase/schema_v2_rpc.sqlを新設（不足カラム=招待コード/キャンセル/通知カーソル/admins、RLSポリシー、全状態遷移のsecurity definer RPC。権限チェック・ダブルブッキング防止・AuditLogをDB層で強制、実行者はauth.uid()から導出しなりすまし不能、pg_advisory_xact_lockで同時応募レースも防止）。js/store-supabase.jsを雛形→本実装に更新（同一シグネチャ・rpc()ラッパ・読み取りヘルパ）。RELEASE_CHECKLIST項目1を更新。node --check/node --test 17件全通過（store.js無変更）
- 2026-07-06 読み取りアクセスの一元化(1/2)：js/store.jsにlistOpenPostings()/getPosting(id)/getHospital(id)を追加（DB参照をラップするだけの読み取り専用関数、挙動は完全に同一）。app.jsの医師側ビュー（openPostingsAll/filteredOpenPostings/renderFilterBar/initMap/hospSheet/cardHTML/renderDetail/confirmApply/doApply＝マップ・日付・詳細タブで使う関数）のDB.postings/DB.hospitals直参照をこれらの関数呼び出しに置き換え。マイページ・病院側・運営側は次タスク(2/2)のため意図的に未変更のまま残した。node --check全通過、既存node --test 17件全通過。Playwright（Chromiumヘッドレス、CDN不要な範囲）で医師ログイン→マップ表示→日付タブでカード表示→詳細（病院名表示）→手上げ完了までのトーストを確認し、置き換え前と同じ挙動であることを確認

## タスクキュー v2（2026-07-06 追加・上から順に）
※ルールは冒頭と同じ（1回1〜2個・devブランチのみ・mainへのpush禁止・②データ構造凍結・Legal by Design厳守）

- [x] **読み取りアクセスの一元化(1/2)**：app.jsがDB.postings/DB.hospitalsを直接参照している箇所を洗い出し、store.jsに読み取り関数（listOpenPostings()/getPosting(id)/getHospital(id)）を追加して医師側ビュー（地図・日付・詳細）だけ置き換える。挙動は完全に同一であること（見た目・件数が変わったら失敗）。完了条件：node --test全通過＋Playwrightで医師フロー（ログイン→地図→詳細→手上げ）が従来通り動く
- [ ] **読み取りアクセスの一元化(2/2)**：同様に病院側ビュー（カレンダー・応募者・確定）と運営ビューを置き換える。完了条件は同上（病院フロー・運営フローで確認）。※この2タスクはSupabase切替時にfetch関数へ差し替えるための下準備
- [ ] **E2Eスモークテスト**：tests/e2e/smoke.spec.mjs を新設し、Playwright（既にUX点検で使用実績あり）で3フローを自動化：①医師=ログイン→地図→詳細→手上げ→マイページに反映 ②病院=ログイン→応募確認→承認→カレンダーが🟢 ③運営=ログイン→AuditLog表示。完了条件：実行方法をREADMEに追記し、3本とも安定して通る
- [ ] **運用マニュアル**：docs/OPS_MANUAL.md を新設。運営（ゼロベース）の日次/週次手順書：医師の実在確認のやり方（厚労省 医師等資格確認検索の手順・判断基準・記録の残し方）、病院の実在確認（医療情報ネット・代表電話）、AuditLogの見方、問い合わせ対応の定型文。※「運営がやらないこと（推薦・引き合わせ・チャット参加）」の禁止リストを冒頭に明記
- [ ] **パイロット招待キット**：docs/PILOT_GUIDE.md を新設。①医師向け1枚（登録→地図→手上げの3ステップ・スクショ想定位置をプレースホルダで）②病院向け1枚（登録→実在確認→募集3分→承認）③よくある質問10個（雇用は病院と直接・紹介手数料なし・キャンセルの扱い・交通費）。文体は既存UIと同じ「です/ます・専門用語回避」
- [ ] **アクセシビリティ自己点検**：キーボード操作（Tab順・Enterで送信）、コントラスト（薄いグレー文字）、ボタンのaria-label、モーダルのフォーカストラップを点検し、小規模修正はその場で・大規模はdocs/UX_CHECKLIST.mdに追記。完了条件：点検結果の記録＋node --test全通過
- [ ] **デモデータの分離**：seedDB()のデモ募集・デモ医師を DEMO_MODE フラグ（config優先・既定true）で制御できるようにし、本番切替時にデモデータ無しで起動できる下準備をする。既定の動作（デモあり）は変えない。完了条件：フラグをfalseにすると空の状態で起動し、trueで従来通り
- 2026-07-06 Supabase実接続（人間ゲート消化）: プロジェクト作成（東京リージョン・Free）→schema.sql+schema_v2_rpc.sql適用済み→REST疎通確認OK（RLS稼働・[]応答）。js/config.js作成（gitignore済）。test-supabase.htmlを新設（接続/新規登録/ログイン/get_my_profile/医師登録RPC/RLS読み取りの動作確認ページ）
- 2026-07-07 RLS無限再帰バグ修正: postings⇄applications等のポリシー相互参照が原因（infinite recursion）。横断判定をsecurity definer関数（my_application_posting_ids等5つ）に置換。schema_v2_1_fix_rls.sql（適用用）＋schema_v2_rpc.sql（本家）を修正
