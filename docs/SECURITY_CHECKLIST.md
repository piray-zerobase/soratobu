# セキュリティ自己点検チェックリスト

自動開発エージェントによる自己点検の記録。v0.2時点（localStorageデモモード）が対象。
Supabase移行後は「本番移行時の再点検が必要な項目」を必ず再確認すること。

## 1. XSS（出力エスケープ）

- 確認方法：`js/app.js` 内の全`innerHTML`代入箇所を洗い出し、ユーザー入力由来の文字列
  （医師名・病院名・住所・電話番号・チャット本文・募集メモ・取り下げ理由など）が
  `esc()`（`&` `<` `>` `"` をエスケープ）を経由しているかを確認した。
- 結果：**すべてのユーザー入力由来の出力は`esc()`を通していた**。診療科・対応業務・
  募集種別（当直/外来応援等）は自由入力ではなく固定選択肢からの値なので未エスケープでも問題なし。
  カレンダーの医師名表示（`renderHospital`内）は`textContent`代入のためHTML解釈されず安全。
  AuditLogの`detail`も出力時に`esc()`済み（`理由：`等の埋め込み文字列ごとまとめてエスケープされる）。
- 対応：修正なし（既存実装が妥当だったため）。
- ⚠️ 今後の開発ルール：新しく`innerHTML`にユーザー入力を差し込む箇所を追加する際は
  必ず`esc()`を通すこと。`textContent`で済む箇所はそちらを優先する。

## 2. 権限チェック（見つかった不備と修正）

`store.js`のAPI関数を1つずつ「呼び出し元以外のなりすましで悪用できないか」の観点で確認し、
以下の**実際の権限チェック漏れ**を発見・修正した（テスト`tests/store.test.mjs`で保証）。

| 関数 | 問題 | 修正 |
|---|---|---|
| `decline(hospitalId, applicationId)` | `approve()`と違い、募集が自院のものかを検証していなかった。他院の応募IDを知っていれば誰でもお断りにできた。 | `po.hospitalId!==hospitalId`のチェックを追加 |
| `complete(hospitalId, assignmentId)` | Assignmentの所属病院チェックがなく、他院のAssignmentIdを知っていれば完了処理ができた。 | `asg.hospitalId!==hospitalId`のチェックを追加 |
| `sendMessage(applicationId, senderRole, senderId, text)` | 送信者がその応募の当事者（担当医師／募集病院）であるかを検証しておらず、他人になりすましてチャットに書き込める状態だった。 | `senderRole==="doctor"`なら`ap.doctorId===senderId`、`"hospital"`なら`po.hospitalId===senderId`を検証 |
| `verifyDoctor` / `verifyHospital` / `verifyCredential` | 運営（admin）専用の実在確認処理なのに、呼び出し元のロールを検証していなかった。ビュー側は管理画面からしか呼ばないが、API単体では誰でも自分の実在確認を承認できてしまう状態だった。 | 第一引数に`actorUserId`を追加し、`DB.users`上で`role==="admin"`であることを検証。`app.js`の呼び出し側（`doVerifyDr`等）も`auth.session.userId`を渡すように変更 |

対応済みの他の関数（変更なし・元から適切）：
- `apply`：資格ゲート（`requiredCredentials`）とダブルブッキング検証あり
- `approve`：`po.hospitalId!==hospitalId`のチェックが元からあり、これを他関数の模範にした
- `withdraw`：`ap.doctorId!==doctorId`のチェックあり（他人の応募は取り下げ不可）
- `selfReportBooking`：`asg.doctorId!==doctorId`のチェックあり
- `registerDoctor` / `registerHospital`：`user.role`の一致を検証済み

⚠️ **本番移行時の再点検が必要**：現状は「呼び出し元が渡すID文字列」を信用する設計
（例：`hp().id`をview層が渡す）。これはクライアント内で完結するデモの制約であり、
Supabase移行後はRow Level Security（RLS）でDB側からも同様の所有者チェックを行うこと。
本チェックリストの表の権限チェックはあくまで「アプリ層の防御」であり、
本番ではDB層の防御（RLS）と二重にすること。

## 3. セッション・認証の取り扱い

- パスワードは`SHA-256(salt + ":" + password)`のワンショットハッシュ（`hashPass`）。
  ソルトは`Math.random()`＋タイムスタンプから生成。**これはデモ用の簡易実装**であり、
  ソースコード内にもその旨のコメントがある。ブルートフォース耐性のある
  Argon2/bcrypt/scrypt等の適応的ハッシュ関数ではない。
  → ⏸人間待ち：本番はSupabase Auth（実装済みのメール確認・パスワードハッシュ・
  レート制限等）に移行するまでの暫定実装として許容する。デモ以外の実データを
  このハッシュ方式で保存しないこと。
- セッションは`sessionStorage`に`{userId, role, refId}`を平文で保存。タブを閉じると
  消える設計で、Cookieを使わないためCSRFの心配はない（そもそもサーバーがない）。
  XSSが発生した場合はセッション情報を読み取られる可能性があるため、1のXSS対策と
  合わせて防御する設計になっている。
- ログアウト時は`sessionStorage`のセッションキーのみ削除。localStorageのDB本体は
  残る（意図した挙動：同一ブラウザでの複数アカウント切り替えを妨げないデモ仕様）。

## 4. データ露出

- 医籍登録番号・本人確認書類のファイル名・電話番号・住所などはlocalStorageに
  平文JSONで保存される。ブラウザのDevToolsやXSSがあれば閲覧可能。
  → 本番では機微情報はSupabase側（サーバー）に保存し、クライアントは必要最小限の
  フィールドのみ取得する設計に変更する。⏸人間待ち（Supabaseスキーマ設計時に対応）。
- 連絡先（メールアドレス・電話番号）は`ap.status==="approved"`（承認後）でのみ
  チャット画面に開示される設計を確認した（`js/app.js`の`drawChat()`）。想定通り。
- 運営コンソール（`renderAdmin`）は「実在確認」と「AuditLog閲覧」のみで、
  マッチングやチャットへの介在機能が存在しないことを確認した（Legal by Design維持）。

## 5. まとめ

- 見つかった実際の不備：権限チェック漏れ4件（上記表）→ すべて修正・テスト追加済み。
- 既存で問題なかった項目：XSSエスケープ、応募/取り下げ/予約自己申告の所有者チェック、
  資格ゲート、連絡先の段階的開示、運営の非介在設計。
- 人間待ちの項目：パスワードハッシュのSupabase Auth移行、機微情報のサーバー側保存化
  （いずれもSupabase接続情報が用意され次第、着手可能）。
