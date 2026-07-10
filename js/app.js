/* =========================================================
   app.js — ビュー層（ビュー専用。DBへの書き込みは store.js のAPI経由のみ）
   UX:
   医師: 登録（免許・保険医登録票・実在チェック）→ 見る → クリック → 申し込む → 病院とやりとり
   病院: 登録（実在チェック）→ 募集要項作成 → 公開 → 依頼あり → 医師とやりとり
   ========================================================= */

let VIEW = "landing";       // landing / login / signup / onboard / main
let DTAB = "map";           // 医師タブ: map / date / my
let SELDATE = null, DETAIL = null, selOut = 0, selRet = 0, map = null;
let FILT = {type:"", area:""}; // 医師の絞り込み（マップ・日付タブ共通）
let CHAT_AP = null;         // 開いているチャットの applicationId

const $ = id => document.getElementById(id);
const yen = n => "¥" + (n||0).toLocaleString();
const DOWJ = ["日","月","火","水","木","金","土"];
const dstr = iso => { const p=iso.split("-"); return `${+p[1]}/${+p[2]}`; };
const dow = iso => DOWJ[new Date(iso+"T00:00:00").getDay()];
const esc = s => (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const isValidLicenseNo = s => /^\d{5,7}$/.test(s||"");
const isValidPhone = s => /^0\d{9,10}$/.test((s||"").replace(/-/g,""));
const dr = () => DB.doctors.find(d=>d.id===auth.session.refId);
const hp = () => DB.hospitals.find(h=>h.id===auth.session.refId);
const dname = id => (DB.doctors.find(d=>d.id===id)||{}).name || id;
const hname = id => (DB.hospitals.find(h=>h.id===id)||{}).name || id;

function toast(msg){
  const t=document.createElement("div"); t.className="toast"; t.textContent=msg;
  document.body.appendChild(t); setTimeout(()=>t.remove(),2600);
}
let MODAL_LAST_FOCUS = null;
function openModal(html){
  MODAL_LAST_FOCUS = document.activeElement;
  $("modal").innerHTML=html; $("ov").classList.add("show");
  const first = $("modal").querySelector('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
  (first || $("modal")).focus();
}
function closeModal(){
  $("ov").classList.remove("show"); CHAT_AP=null;
  if(MODAL_LAST_FOCUS && typeof MODAL_LAST_FOCUS.focus==="function") MODAL_LAST_FOCUS.focus();
  MODAL_LAST_FOCUS = null;
}
function modalKeydown(e){
  if(!$("ov").classList.contains("show")) return;
  if(e.key==="Escape"){ closeModal(); return; }
  if(e.key!=="Tab") return;
  const list = Array.from($("modal").querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'))
    .filter(el=>!el.disabled && el.offsetParent!==null);
  if(!list.length) return;
  const first=list[0], last=list[list.length-1];
  if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
  else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
}

/* ---------- ルーティング ---------- */
function go(v){ VIEW=v; DETAIL=null; render(); }
function render(){
  renderHeader();
  const root=$("root");
  if(!auth.session){
    if(VIEW==="login") return renderLogin(root);
    if(VIEW==="signup") return renderSignup(root);
    return renderLanding(root);
  }
  const s=auth.session;
  if(s.role==="admin") return renderAdmin(root);
  if(s.role==="doctor"){
    if(!s.refId) return renderDoctorOnboard(root);
    return DETAIL ? renderDetail(root) : renderDoctor(root);
  }
  if(s.role==="hospital"){
    if(!s.refId) return renderHospitalOnboard(root);
    const h=hp();
    if(h.status!=="承認") return renderHospitalPending(root,h);
    return renderHospital(root);
  }
}
function renderHeader(){
  const u=auth.me();
  const s=auth.session;
  const showBell = s && s.refId && (s.role==="doctor"||s.role==="hospital");
  const unread = showBell ? unreadNotifCount() : 0;
  const bell = showBell
    ? `<button class="hbtn bell" onclick="openNotifCenter()" aria-label="通知">🔔${unread?`<span class="nbadge">${unread>9?"9+":unread}</span>`:""}</button>` : "";
  $("hdr-right").innerHTML = u
    ? `${bell}<span class="hdr-user">${esc(u.email)}（${{doctor:"医師",hospital:"病院",admin:"運営"}[u.role]}）</span>
       <button class="hbtn" onclick="doLogout()">ログアウト</button>`
    : `<button class="hbtn" onclick="go('login')">ログイン</button>
       <button class="hbtn solid" onclick="go('signup')">新規登録</button>`;
}
function doLogout(){ auth.logout(); go("landing"); }

/* ---------- 通知センター（自分宛イベントを既読カーソル付きで一覧） ---------- */
const seqOf = id => +((id||"").split("_")[1]||0);
function notifEvents(role, refId){
  const evs=[];
  const short = t => t.length>22 ? t.slice(0,22)+"…" : t;
  if(role==="doctor"){
    DB.applications.filter(a=>a.doctorId===refId).forEach(a=>{
      const po=DB.postings.find(p=>p.id===a.postingId); if(!po) return;
      if(a.status==="approved") evs.push({seq:seqOf(a.id), icon:"✅",
        text:`${hname(po.hospitalId)}／${dstr(po.date)} ${po.type} が承認されました`,
        action:`closeModal();DTAB='my';go('main')`});
      if(a.status==="declined") evs.push({seq:seqOf(a.id), icon:"🙏",
        text:`${hname(po.hospitalId)}／${dstr(po.date)} ${po.type} は見送りになりました`,
        action:`closeModal();DTAB='my';go('main')`});
    });
    DB.assignments.filter(a=>a.doctorId===refId && a.status==="cancelled" && a.cancelledBy==="hospital").forEach(asg=>{
      const po=DB.postings.find(p=>p.id===asg.postingId); if(!po) return;
      evs.push({seq:seqOf(asg.id), icon:"❌",
        text:`${hname(asg.hospitalId)}／${dstr(po.date)} ${po.type} の確定がキャンセルされました（理由：${short(asg.cancelReason||"")}）`,
        action:`closeModal();DTAB='my';go('main')`});
    });
    DB.messages.forEach(m=>{
      if(m.senderRole!=="hospital") return;
      const ap=DB.applications.find(a=>a.id===m.applicationId);
      if(!ap || ap.doctorId!==refId) return;
      const po=DB.postings.find(p=>p.id===ap.postingId); if(!po) return;
      evs.push({seq:seqOf(m.id), icon:"💬", text:`${hname(po.hospitalId)}：「${short(m.text)}」`, action:`openChat('${ap.id}')`});
    });
  } else if(role==="hospital"){
    DB.postings.filter(p=>p.hospitalId===refId).forEach(po=>{
      DB.applications.filter(a=>a.postingId===po.id && a.status==="applied").forEach(a=>{
        evs.push({seq:seqOf(a.id), icon:"✋",
          text:`${dname(a.doctorId)} 先生が ${dstr(po.date)} ${po.type} に手を挙げました`,
          action:`closeModal();hospSlot('${po.id}')`});
      });
    });
    DB.assignments.filter(a=>a.hospitalId===refId && a.status==="cancelled" && a.cancelledBy==="doctor").forEach(asg=>{
      const po=DB.postings.find(p=>p.id===asg.postingId); if(!po) return;
      evs.push({seq:seqOf(asg.id), icon:"❌",
        text:`${dname(asg.doctorId)} 先生／${dstr(po.date)} ${po.type} の確定がキャンセルされました（理由：${short(asg.cancelReason||"")}）`,
        action:`closeModal();hospSlot('${po.id}')`});
    });
    DB.messages.forEach(m=>{
      if(m.senderRole!=="doctor") return;
      const ap=DB.applications.find(a=>a.id===m.applicationId); if(!ap) return;
      const po=DB.postings.find(p=>p.id===ap.postingId);
      if(!po || po.hospitalId!==refId) return;
      evs.push({seq:seqOf(m.id), icon:"💬", text:`${dname(ap.doctorId)} 先生：「${short(m.text)}」`, action:`openChat('${ap.id}')`});
    });
  }
  return evs.sort((a,b)=>b.seq-a.seq);
}
function unreadNotifCount(){
  const s=auth.session; if(!s||!s.refId) return 0;
  const cursor=(DB.notifCursor||{})[s.userId]||0;
  return notifEvents(s.role, s.refId).filter(e=>e.seq>cursor).length;
}
function openNotifCenter(){
  const s=auth.session; if(!s||!s.refId) return;
  const cursor=(DB.notifCursor||{})[s.userId]||0;
  const evs=notifEvents(s.role, s.refId).slice(0,30);
  openModal(`<h3>🔔 通知</h3>
    ${evs.length?evs.map(e=>`<div class="notifrow ${e.seq>cursor?"unread":""}" onclick="${e.action}">${e.icon} ${esc(e.text)}</div>`).join("")
      :'<div class="paneltitle" style="text-align:center;">通知はまだありません</div>'}
    <div class="mfoot"><button class="btn ghost" onclick="closeModal()">閉じる</button></div>`);
  api.markNotificationsRead(s.userId);
  renderHeader();
}

/* ---------- ランディング ---------- */
function renderLanding(root){
  root.innerHTML=`
  <div class="hero-l">
    <h1>僻地の医療に、<br>飛行機で行くように手を挙げる。</h1>
    <p>そらとぶ医局は、離島・僻地のスポット医師募集と医師をつなぐ会員制プラットフォームです。<br>
    地図から行き先を選び、実在便から行き帰りを選んで、ワンタップで手を挙げる。<br>
    雇用は病院との直接契約。紹介手数料はありません。</p>
    <div class="hero-btns">
      <button class="btn prim big" onclick="go('signup')">医師として登録する</button>
      <button class="btn teal big" onclick="go('signup')">病院として登録する</button>
    </div>
    <div class="hero-demo">デモアカウント：医師 yamada@example.com ／ 病院 tokunoshima@example.com ／ 運営 admin@example.com（パスワードはすべて demo1234）</div>
  </div>
  <div class="feat3">
    <div class="feat"><div class="fi">🗺</div><b>地図で見つかる</b><span>募集は🟢点灯・緊急は🔴点滅。離島便を選ぶ感覚で。</span></div>
    <div class="feat"><div class="fi">✈️</div><b>行き帰りまで見える</b><span>実在ダイヤから往復の便を選択。空港リミットと帰宅時刻を明示。</span></div>
    <div class="feat"><div class="fi">⚖️</div><b>あっせんしない設計</b><span>医師が挙げ、病院が選ぶ。運営は場の提供と本人確認のみ。</span></div>
  </div>`;
}

/* ---------- ログイン / 新規登録 ---------- */
function renderLogin(root){
  root.innerHTML=`
  <div class="authbox">
    <h2>ログイン</h2>
    <label for="l-email">メールアドレス</label><input class="inp" id="l-email" type="email" autocomplete="username">
    <label for="l-pass">パスワード</label><input class="inp" id="l-pass" type="password" autocomplete="current-password">
    <button class="btn prim" style="width:100%;margin-top:14px;" onclick="doLogin()">ログイン</button>
    <div class="authnote">アカウントがない方は <a onclick="go('signup')">新規登録</a></div>
  </div>`;
}
async function doLogin(){
  const btn = document.querySelector(".authbox .btn.prim");
  if(btn) btn.disabled = true;
  const r = await auth.login($("l-email").value, $("l-pass").value);
  if(btn) btn.disabled = false;
  if(r.err) return toast("⚠️ "+r.err);
  go("main");
}
function renderSignup(root){
  root.innerHTML=`
  <div class="authbox">
    <h2>新規登録</h2>
    <label>立場</label>
    <div class="opts">
      <div class="pick on" id="su-doc" onclick="suRole('doctor')">🩺 医師</div>
      <div class="pick" id="su-hosp" onclick="suRole('hospital')">🏥 病院</div>
    </div>
    <label for="s-email">メールアドレス（ログインID）</label><input class="inp" id="s-email" type="email" autocomplete="username">
    <label for="s-pass">パスワード（8文字以上）</label><input class="inp" id="s-pass" type="password" autocomplete="new-password">
    <button class="btn prim" style="width:100%;margin-top:14px;" onclick="doSignup()">登録してはじめる</button>
    <div class="authnote">登録後にプロフィールと本人確認書類を提出します。<br>すでにアカウントがある方は <a onclick="go('login')">ログイン</a></div>
  </div>`;
  window._suRole="doctor";
}
function suRole(r){ window._suRole=r; $("su-doc").classList.toggle("on",r==="doctor"); $("su-hosp").classList.toggle("on",r==="hospital"); }
async function doSignup(){
  const btn = document.querySelector(".authbox .btn.prim");
  if(btn) btn.disabled = true;
  const r = await auth.signup($("s-email").value, $("s-pass").value, window._suRole);
  if(btn) btn.disabled = false;
  if(r.err) return toast("⚠️ "+r.err);
  toast("アカウントを作成しました。プロフィールを登録してください");
  go("main");
}

/* ---------- 医師オンボーディング ---------- */
const SPECS=["内科","総合診療","外科","小児科","整形外科","皮膚科","精神科","その他"];
const CAPS=["当直","外来応援","健診応援","ワクチン","オンコール"];
function renderDoctorOnboard(root){
  root.innerHTML=`
  <div class="authbox wide">
    <h2>医師プロフィール登録（初回のみ）</h2>
    <p class="authp">登録内容は運営が<b>厚生労働省「医師等資格確認検索」と照合し、実在する医師であることを確認</b>してから有効になります。閲覧は審査中でも可能ですが、手上げ（応募）は承認後に開放されます。</p>
    <label for="d-name">氏名（免許証と同一表記）<span class="req">＊必須</span></label><input class="inp" id="d-name">
    <label for="d-lic">医籍登録番号（数字のみ）<span class="req">＊必須</span></label><input class="inp" id="d-lic" placeholder="例）123456" inputmode="numeric" maxlength="7" oninput="this.value=this.value.replace(/[^0-9]/g,'')">
    <label for="d-hoken">保険医登録票の登録番号（保険診療をする場合のみ・任意）</label><input class="inp" id="d-hoken" placeholder="未入力可">
    <label id="d-specs-label">診療科（複数可）<span class="req">＊必須</span></label><div class="opts" id="d-specs" role="group" aria-labelledby="d-specs-label">${SPECS.map(s=>`<div class="pick" onclick="this.classList.toggle('on')">${s}</div>`).join("")}</div>
    <label id="d-caps-label">対応できる業務（複数可）<span class="req">＊必須</span></label><div class="opts" id="d-caps" role="group" aria-labelledby="d-caps-label">${CAPS.map(s=>`<div class="pick" onclick="this.classList.toggle('on')">${s}</div>`).join("")}</div>
    <label for="d-base">出発拠点（最寄りの空港）</label>
    <select class="inp" id="d-base">${Object.keys(AIRPORTS).map(c=>`<option value="${c}" ${c==="ITM"?"selected":""}>${AIRPORTS[c].name}</option>`).join("")}</select>
    <label for="d-file1">医師免許証の画像<span class="req">＊必須</span></label><input class="inp" id="d-file1" type="file" accept="image/*,.pdf">
    <label for="d-file2">本人確認書類（運転免許証・マイナンバーカード等）<span class="req">＊必須</span></label><input class="inp" id="d-file2" type="file" accept="image/*,.pdf">
    <button class="btn prim" style="width:100%;margin-top:16px;" onclick="doRegisterDoctor()">提出して審査を受ける</button>
    <div class="authnote">※デモ版ではファイルはアップロードされず、ファイル名のみ記録されます</div>
  </div>`;
}
async function doRegisterDoctor(){
  const specs=[...document.querySelectorAll("#d-specs .pick.on")].map(e=>e.textContent);
  const caps=[...document.querySelectorAll("#d-caps .pick.on")].map(e=>e.textContent);
  if(!$("d-name").value.trim()) return toast("⚠️ 氏名を入力してください");
  if(!isValidLicenseNo($("d-lic").value.trim())) return toast("⚠️ 医籍登録番号は5〜7桁の数字で入力してください");
  if(!specs.length||!caps.length) return toast("⚠️ 診療科と対応業務を選んでください");
  if(!$("d-file1").files.length||!$("d-file2").files.length) return toast("⚠️ 免許証と本人確認書類を添付してください");
  const r = await Promise.resolve(api.registerDoctor(auth.session.userId,{
    name:$("d-name").value.trim(), licenseNo:$("d-lic").value.trim(), hokeniNo:$("d-hoken").value.trim(),
    specialties:specs, capabilities:caps, homeBase:$("d-base").value,
    files:{license:$("d-file1").files[0].name, kyc:$("d-file2").files[0].name}}));
  if(r.err) return toast("⚠️ "+r.err);
  toast("提出しました。審査中でも募集の閲覧はできます");
  render();
}

/* ---------- 病院オンボーディング ---------- */
function renderHospitalOnboard(root){
  const mode = window._hospOnboardMode || "register";
  root.innerHTML=`
  <div class="authbox wide">
    <h2>病院情報の登録（初回のみ）</h2>
    <div class="opts">
      <div class="pick ${mode==="register"?"on":""}" onclick="setHospOnboardMode('register')">🏥 病院として新規登録</div>
      <div class="pick ${mode==="join"?"on":""}" onclick="setHospOnboardMode('join')">🔑 招待コードで参加</div>
    </div>
    ${mode==="register" ? `
    <p class="authp">入力された病院名・住所は<b>実在病院マスタと自動照合</b>します。一致すればすぐに利用開始できます。一致しない場合は、運営が医療情報ネット（厚労省）等で実在を確認してから承認します。</p>
    <label for="h-pref">都道府県</label>
    <select class="inp" id="h-pref">${PREFS.map(p=>`<option>${p}</option>`).join("")}</select>
    <label for="h-name">病院名（正式名称）<span class="req">＊必須</span></label><input class="inp" id="h-name" placeholder="例）徳之島徳洲会病院">
    <label for="h-addr">住所<span class="req">＊必須</span></label><input class="inp" id="h-addr" placeholder="例）鹿児島県大島郡徳之島町亀津7588">
    <label for="h-tel">代表電話（任意）</label><input class="inp" id="h-tel" type="tel" placeholder="例）0997-83-1100" oninput="this.value=this.value.replace(/[^0-9\-]/g,'')">
    <label for="h-fac">受け入れ体制メモ（任意）</label><input class="inp" id="h-fac" placeholder="例）送迎あり・宿は病院手配・電子カルテあり">
    <button class="btn prim" style="width:100%;margin-top:16px;" onclick="doRegisterHospital()">登録して実在確認を受ける</button>
    ` : `
    <p class="authp">同じ病院のご担当者からすでにアカウントがある場合は、共有された<b>招待コード</b>を入力するとその病院の担当者として利用を開始できます（病院を新しく登録する必要はありません）。</p>
    <label for="h-code">招待コード<span class="req">＊必須</span></label><input class="inp" id="h-code" placeholder="例）AB2C3D4E" style="text-transform:uppercase;letter-spacing:2px;">
    <button class="btn prim" style="width:100%;margin-top:16px;" onclick="doJoinHospitalByCode()">このコードで参加する</button>
    `}
  </div>`;
}
function setHospOnboardMode(m){ window._hospOnboardMode=m; render(); }
async function doJoinHospitalByCode(){
  const code=$("h-code").value.trim();
  if(!code) return toast("⚠️ 招待コードを入力してください");
  const r = await Promise.resolve(api.joinHospitalByInviteCode(auth.session.userId, code));
  if(r.err) return toast("⚠️ "+r.err);
  window._hospOnboardMode=null;
  toast(`${r.hospitalName} の担当者として参加しました`);
  render();
}
async function doRegisterHospital(){
  const tel=$("h-tel").value.trim();
  if(tel && !isValidPhone(tel)) return toast("⚠️ 電話番号の形式が正しくありません（例：0997-83-1100）");
  const r = await Promise.resolve(api.registerHospital(auth.session.userId,{
    pref:$("h-pref").value, name:$("h-name").value.trim(), address:$("h-addr").value.trim(),
    phone:$("h-tel").value.trim(), facilities:$("h-fac").value.trim()}));
  if(r.err) return toast("⚠️ "+r.err);
  toast(r.matched ? "実在病院マスタと一致しました。利用を開始できます" : "登録しました。運営の実在確認をお待ちください");
  render();
}
function renderHospitalPending(root,h){
  root.innerHTML=`
  <div class="authbox wide">
    <h2>実在確認中です</h2>
    <p class="authp"><b>${esc(h.name)}</b>（${esc(h.pref)}）は現在、運営が実在確認を行っています。<br>
    確認方法：医療情報ネット（厚労省）・都道府県の医療機能情報・代表電話への確認<br>
    承認されると募集の作成・公開ができるようになります。</p>
    <div class="notice">ステータス：<b>${h.status}</b>／${esc(h.verifiedNote)}</div>
  </div>`;
}

/* ---------- 医師メイン ---------- */
function setDTab(t){ DTAB=t; DETAIL=null; render(); }
const areaOf = h => h.island || h.pref;
function openPostingsAll(){ return listOpenPostings(); }
function filteredOpenPostings(){
  return openPostingsAll().filter(p=>{
    if(FILT.type && p.type!==FILT.type) return false;
    if(FILT.area){ const h=getHospital(p.hospitalId); if(!h||areaOf(h)!==FILT.area) return false; }
    return true;
  });
}
function renderFilterBar(){
  const areas=[...new Set(openPostingsAll().map(p=>{const h=getHospital(p.hospitalId); return h&&areaOf(h);}).filter(Boolean))].sort();
  const active = FILT.type || FILT.area;
  return `<div class="filterbar">
    <div class="opts">
      <div class="pick sm ${!FILT.type?"on":""}" onclick="setFiltType('')">すべての業務</div>
      ${W_TYPES.map(t=>`<div class="pick sm ${FILT.type===t[0]?"on":""}" onclick="setFiltType('${t[0]}')">${t[0]}</div>`).join("")}
    </div>
    <div class="filterrow">
      <select class="inp sm" id="filt-area" onchange="setFiltArea(this.value)">
        <option value="">エリア：すべて</option>
        ${areas.map(a=>`<option value="${esc(a)}" ${FILT.area===a?"selected":""}>${esc(a)}</option>`).join("")}
      </select>
      ${active?`<button class="btn sm ghost" onclick="clearFilt()">絞り込み解除</button>`:""}
    </div>
  </div>`;
}
function setFiltType(t){ FILT.type=t; render(); }
function setFiltArea(a){ FILT.area=a; render(); }
function clearFilt(){ FILT={type:"",area:""}; render(); }
function renderDoctor(root){
  const d=dr();
  const pend=d.status!=="承認";
  const myCount=DB.applications.filter(a=>a.doctorId===d.id&&["applied","approved"].includes(a.status)).length;
  root.innerHTML=`
  ${pend?`<div class="notice">🕒 実在確認の審査中です（閲覧は可能・手上げは承認後に開放されます）</div>`:""}
  <div class="tabs">
    <div class="tab ${DTAB==="map"?"on":""}" onclick="setDTab('map')">🗺 マップで探す</div>
    <div class="tab ${DTAB==="date"?"on":""}" onclick="setDTab('date')">📅 日付で探す</div>
    <div class="tab ${DTAB==="my"?"on":""}" onclick="setDTab('my')">👤 マイページ${myCount?`（${myCount}）`:""}</div>
  </div><div id="dbody"></div>`;
  const b=$("dbody");
  if(DTAB==="map"){
    b.innerHTML=`${renderFilterBar()}<div id="leafmap"></div>
      <div class="maplegend">🟢 点灯＝募集あり ／ 🔴 点滅＝緊急募集 ｜ ピンをタップ→募集一覧（給与は地図では非表示）</div>`;
    setTimeout(initMap,30);
  } else if(DTAB==="date"){
    const open=filteredOpenPostings();
    const dates=[...new Set(open.map(p=>p.date))].sort();
    if(!dates.length){ b.innerHTML=`${renderFilterBar()}<div class="paneltitle">${FILT.type||FILT.area?"条件に合う募集がありません":"現在、公開中の募集はありません"}</div>`; return; }
    if(!SELDATE||!dates.includes(SELDATE)) SELDATE=dates[0];
    b.innerHTML=`${renderFilterBar()}<div class="datebar">${dates.map(dd=>`
      <div class="dchip ${dd===SELDATE?"on":""}" onclick="SELDATE='${dd}';render()">
        <div class="m">${+dd.split("-")[1]}月</div><div class="d">${+dd.split("-")[2]}</div><div class="m">${dow(dd)}</div></div>`).join("")}
    </div>${open.filter(p=>p.date===SELDATE).map(cardHTML).join("")}`;
  } else {
    renderMyPage(b,d);
  }
}
function renderMyPage(b,d){
  const apps=DB.applications.filter(a=>a.doctorId===d.id);
  const asgs=DB.assignments.filter(a=>a.doctorId===d.id);
  b.innerHTML=`
  <div class="card"><div class="top"><div><div class="hosp">${esc(d.name)} 先生</div>
    <div class="isl">${d.specialties.join("・")}／実績 ${d.completedCount}回／出発拠点 ${AIRPORTS[d.homeBase].name}</div></div>
    <span class="stat ${d.status==="承認"?"st-approved":"st-applied"}">${d.status==="承認"?"✓ 実在確認済":"審査中"}</span></div>
    <div class="meta">書類：${d.credentials.map(c=>`${c.type} <b>${c.status}</b>`).join("　")}</div></div>
  <div class="section-h">確定した勤務</div>
  ${asgs.map(asg=>{const po=DB.postings.find(p=>p.id===asg.postingId);const ap=DB.applications.find(a=>a.postingId===asg.postingId&&a.doctorId===d.id&&a.status==="approved");
    const label={confirmed:"確定",completed:"完了",cancelled:"キャンセル済"}[asg.status]||asg.status;
    const cls={confirmed:"st-confirmed",completed:"st-completed",cancelled:"st-declined"}[asg.status]||"st-confirmed";
    return `
    <div class="card"><div class="top"><div><div class="hosp">${esc(hname(asg.hospitalId))}</div>
      <div class="isl">📍 ${dstr(po.date)}(${dow(po.date)}) ${asg.termsSnapshot.time}・${po.type}</div></div>
      <span class="stat ${cls}">${label}</span></div>
      <div class="meta">💰 ${yen(asg.termsSnapshot.pay)}（条件固定）／${asg.employmentType}</div>
      <div class="meta">✈ ${esc(asg.itinerary.summary)}</div>
      ${asg.status==="cancelled"?`<div class="meta">キャンセル理由：${esc(asg.cancelReason||"")}</div>`:""}
      <div style="display:flex;gap:8px;margin-top:9px;flex-wrap:wrap;">
        ${ap?`<button class="btn sm teal" onclick="openChat('${ap.id}')">💬 病院とやりとり</button>`:""}
        ${asg.status==="confirmed"&&!(asg.itinerary.booking||"").startsWith("予約済")
          ?`<button class="btn sm ghost" onclick="doBook('${asg.id}')">🎫 便を予約した（自己申告）</button>`:""}
        ${asg.status==="confirmed"?`<button class="btn sm ghost" onclick="doCancelAssignment('${asg.id}')">キャンセルする</button>`:""}
      </div></div>`;}).join("")||`<div class="paneltitle">まだありません</div>`}
  <div class="section-h">応募中・履歴</div>
  ${apps.map(a=>{const po=DB.postings.find(p=>p.id===a.postingId);return `
    <div class="card"><div class="top"><div><div class="hosp">${esc(hname(po.hospitalId))}</div>
      <div class="isl">📍 ${dstr(po.date)}(${dow(po.date)})・${po.type}</div></div>
      <span class="stat st-${a.status==="cancelled"?"declined":a.status}">${{applied:"承認待ち",approved:"承認済",declined:"見送り",withdrawn:"取り下げ",cancelled:"キャンセル済"}[a.status]}</span></div>
      <div class="meta">✈ ${esc(a.itinerary.summary)}</div>
      <div style="display:flex;gap:8px;margin-top:9px;">
        ${["applied","approved"].includes(a.status)?`<button class="btn sm teal" onclick="openChat('${a.id}')">💬 やりとり</button>`:""}
        ${a.status==="applied"?`<button class="btn sm ghost" onclick="doWithdraw('${a.id}')">取り下げる</button>`:""}
      </div></div>`;}).join("")||`<div class="paneltitle">応募はまだありません</div>`}`;
}
function initMap(){
  if(typeof L==="undefined"){ $("leafmap").innerHTML='<div class="paneltitle" style="padding:40px;text-align:center;">🗺 地図表示にはネット接続が必要です</div>'; return; }
  map=L.map("leafmap",{zoomControl:true}).fitBounds([[24.0,123.0],[45.8,146.0]],{padding:[8,8]});
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {maxZoom:12,minZoom:4,attribution:"&copy; OpenStreetMap &copy; CARTO"}).addTo(map);
  const byH={};
  filteredOpenPostings().forEach(p=>{(byH[p.hospitalId]=byH[p.hospitalId]||[]).push(p);});
  Object.keys(byH).forEach(hid=>{
    const h=getHospital(hid);
    if(!h||h.lat==null) return;
    const urgent=byH[hid].some(p=>p.urgent);
    const icon=L.divIcon({className:"",iconSize:[90,44],iconAnchor:[45,22],
      html:`<div class="pinmark ${urgent?"urgent":"normal"}"></div>`+
        (urgent?`<div class="pinlbl">🚨 緊急募集</div>`:`<div class="pincnt">${byH[hid].length}件 募集中</div>`)});
    L.marker([h.lat,h.lng],{icon}).addTo(map).on("click",()=>hospSheet(hid));
  });
}
function hospSheet(hid){
  const h=getHospital(hid);
  const list=filteredOpenPostings().filter(p=>p.hospitalId===hid);
  openModal(`<h3>📍 ${esc(h.island||h.pref)}｜${esc(h.name)}</h3>
    <div class="sub">${esc(h.address||"")}</div>
    ${list.map(cardHTML).join("")}
    <div class="mfoot"><button class="btn ghost" onclick="closeModal()">閉じる</button></div>`);
}
function cardHTML(p){
  const h=getHospital(p.hospitalId);
  return `<div class="card click" onclick="openPosting('${p.id}')">
    <div class="top"><div><div class="hosp">${esc(h.name)}</div>
    <div class="isl">📍 ${esc(h.island||h.pref)}・${dstr(p.date)}(${dow(p.date)})</div></div><div class="pay">${yen(p.pay)}</div></div>
    <span class="badge ${p.cls}">${p.type}</span>${p.urgent?'<span class="badge b-urgent">🚨 緊急</span>':""}
    <div class="meta">🕘 勤務 ${p.timeStart}〜${p.overnight?"翌":""}${p.timeEnd}</div>
    <div class="fare">💴 交通費 ${esc(p.transport)}</div></div>`;
}
function openPosting(id){ closeModal(); DETAIL=id; selOut=0; selRet=0; render(); }

// 便の候補(複数区間なら各区間)の空席状況をデモ表示用バッジにする
function seatBadge(o, date){
  const order={full:3, few:2, unknown:1, available:0};
  const worst = o.legs.map(f=>seatAvailability(f.no, date))
    .reduce((a,b)=> order[b.status]>order[a.status]?b:a);
  const left = (worst.status!=="full" && worst.seatsLeft!=null) ? `(残${worst.seatsLeft})` : "";
  return ` <span class="seatbadge ${worst.status}">${SEAT_STATUS_LABEL[worst.status]}${left}</span>`;
}

/* ---------- 募集詳細（医師） ---------- */
function renderDetail(root){
  const p=getPosting(DETAIL);
  const h=getHospital(p.hospitalId);
  const d=dr();
  const missing=(p.requiredCredentials||[]).filter(rc=>!d.credentials.some(c=>c.type===rc&&c.status==="承認"));
  const notVerified=d.status!=="承認";
  const already=DB.applications.some(a=>a.postingId===p.id&&a.doctorId===d.id&&a.status==="applied");
  const outs=outboundOptions(p,h), rets=returnOptions(p,h);
  const navitime=`https://www.navitime.co.jp/maps/routeSearch?departure=${encodeURIComponent("大阪駅")}&arrival=${encodeURIComponent(h.name)}`;
  root.innerHTML=`
  <div class="paneltitle"><a class="backlink" onclick="DETAIL=null;render()">‹ 一覧に戻る</a></div>
  <div class="hero">
    <span class="badge ${p.cls}" style="background:rgba(255,255,255,.22);color:#fff;">${p.type}</span>
    ${p.urgent?'<span class="badge b-urgent">🚨 緊急募集</span>':""}
    <h2>${esc(h.name)}</h2>
    <div class="loc">📍 ${esc(h.island||h.pref)}｜${dstr(p.date)}（${dow(p.date)}） ${p.timeStart}〜${p.overnight?"翌":""}${p.timeEnd}｜${esc(p.department)}</div>
    <div class="pay2">${yen(p.pay)} <small>／ 勤務1回</small></div>
  </div>
  <div class="detbody">
    <div class="farebig">💴 交通費は <u>${esc(p.transport)}</u></div>
    ${outs?`
      <div class="opt-h">🛫 行きの便（選べます）<span class="demo-tag">空席状況はデモデータ</span></div>
      ${outs.map((o,i)=>`<div class="opt ${i===selOut?"on":""}" onclick="selOut=${i};render()">
        <div class="opt-f">✈ ${o.prevDay?"【前日】":""}${legStr(o)}${o.direct?' <span class="direct">🟢直行</span>':""}${seatBadge(o,p.date)}</div>
        <div class="opt-s">⏰ ${o.by}　→ ${o.arrive}</div></div>`).join("")}
      <div class="tl-work">🩺 勤務　${p.timeStart}〜${p.overnight?"翌":""}${p.timeEnd}</div>
      <div class="opt-h">🛬 帰りの便（選べます）<span class="demo-tag">空席状況はデモデータ</span></div>
      ${rets.map((o,i)=>`<div class="opt ${i===selRet?"on":""}" onclick="selRet=${i};render()">
        <div class="opt-f">✈ ${p.overnight?"【翌日】":""}${legStr(o)}${o.direct?' <span class="direct">🟢直行</span>':""}${seatBadge(o,p.date)}</div>
        <div class="opt-s">🏠 ${o.home}</div></div>`).join("")}`
    :`<div class="notice">✈ この病院の便データは準備中です。<a href="${navitime}" target="_blank" rel="noopener">NAVITIMEで経路を確認する →</a></div>`}
    <div class="row"><div class="k">現地の足</div><div class="v">${esc(p.ground)}</div></div>
    <div class="row"><div class="k">宿泊</div><div class="v">${esc(p.lodging)}</div></div>
    <div class="row"><div class="k">病院から</div><div class="v">${esc(p.note)}</div></div>
    ${notVerified?`<div class="gatemsg">🕒 実在確認の審査中のため、まだ手を挙げられません（承認後に開放）。</div>`
     :missing.length?`<div class="gatemsg">🔒 この募集には <b>${missing.join("・")}</b> の承認が必要です（マイページで状況を確認できます）。</div>`
     :already?`<div class="gatemsg">✋ すでに手を挙げています（マイページでやりとりできます）。</div>`
     :`<button class="btn prim" style="width:100%;margin-top:14px;" onclick="confirmApply()">この枠に手を挙げる ✋</button>`}
    <div class="legalmini">雇用契約は病院と医師が直接結びます。本アプリは募集の「場」とシステムの提供のみで、個別のあっせん（紹介）は行いません。</div>
  </div>`;
}
function confirmApply(){
  const p=getPosting(DETAIL);
  const h=getHospital(p.hospitalId);
  const outs=outboundOptions(p,h), rets=returnOptions(p,h);
  const o=outs?outs[selOut]:null, r=rets?rets[selRet]:null;
  openModal(`<h3>最終確認</h3><div class="sub">確定後、選んだ便はご自身で予約します（費用は病院負担）</div>
    <div class="summ">
      <div class="l"><span>病院</span><b>${esc(h.name)}</b></div>
      <div class="l"><span>日時</span><b>${dstr(p.date)}(${dow(p.date)}) ${p.timeStart}〜${p.overnight?"翌":""}${p.timeEnd}</b></div>
      <div class="l"><span>報酬</span><b style="color:var(--pay)">${yen(p.pay)}</b></div>
      ${o?`<div class="l"><span>行き</span><b>${o.prevDay?"前日 ":""}${legStr(o)}</b></div>
      <div class="l"><span>空港まで</span><b>${o.by}</b></div>`:""}
      ${r?`<div class="l"><span>帰り</span><b>${legStr(r)}</b></div>
      <div class="l"><span>帰宅</span><b style="color:var(--ok)">${r.home}</b></div>`:""}
    </div>
    <div class="mfoot"><button class="btn ghost" onclick="closeModal()">戻る</button>
    <button class="btn green" onclick="doApply()">この内容で手を挙げる ✋</button></div>`);
}
async function doApply(){
  const p=getPosting(DETAIL);
  const h=getHospital(p.hospitalId);
  const outs=outboundOptions(p,h), rets=returnOptions(p,h);
  const o=outs?outs[selOut]:null, r=rets?rets[selRet]:null;
  const itin = o&&r
    ? {summary:`${o.prevDay?"前日入り ":""}${o.legs.map(f=>f.no).join("+")} ／ 帰り ${r.legs.map(f=>f.no).join("+")}（${r.home}）`,
       outbound:o.legs.map(f=>f.no), return:r.legs.map(f=>f.no), airportArriveBy:o.by, homeArriveAt:r.home, booking:"未予約"}
    : {summary:"経路は各自確認（便データ準備中の病院）", booking:"未予約"};
  const res = await Promise.resolve(api.apply(dr().id, p.id, itin));
  if(res.err) return toast("⚠️ "+res.err);
  closeModal(); DETAIL=null; DTAB="my"; render();
  toast("手を挙げました！マイページから病院とやりとりできます");
}
async function doWithdraw(apId){
  const reason=prompt("取り下げの理由（病院に通知されます）","都合がつかなくなったため");
  if(reason===null) return;
  const r = await Promise.resolve(api.withdraw(dr().id, apId, reason));
  if(r.err) return toast("⚠️ "+r.err);
  render(); toast("取り下げました");
}
async function doBook(asgId){
  const r = await Promise.resolve(api.selfReportBooking(dr().id, asgId));
  if(r.err) return toast("⚠️ "+r.err);
  render(); toast("予約済みにしました");
}
/* 確定後のキャンセル：医師・病院どちらの画面からも呼ばれる共通処理 */
async function doCancelAssignment(asgId){
  const reason=prompt("キャンセルの理由を入力してください（相手に通知されます・必須）","");
  if(reason===null) return;
  if(!reason.trim()) return toast("⚠️ 理由を入力してください");
  if(!confirm("確定した勤務をキャンセルします。よろしいですか？\nこの操作は取り消せません。")) return;
  const s=auth.session;
  const r = await Promise.resolve(api.cancelAssignment(s.role, s.refId, asgId, reason));
  if(r.err) return toast("⚠️ "+r.err);
  closeModal(); render(); toast("キャンセルしました");
}

/* ---------- チャット（医師↔病院） ---------- */
async function openChat(apId){
  CHAT_AP=apId; drawChat();
}
function drawChat(){
  const ap=DB.applications.find(a=>a.id===CHAT_AP);
  const po=DB.postings.find(p=>p.id===ap.postingId);
  const d=DB.doctors.find(x=>x.id===ap.doctorId);
  const h=DB.hospitals.find(x=>x.id===po.hospitalId);
  const meRole=auth.session.role;
  const msgs=DB.messages.filter(m=>m.applicationId===CHAT_AP);
  const contact = ap.status==="approved"
    ? `<div class="notice" style="margin:8px 0;">📞 承認済みのため連絡先を開示：医師 ${esc(d.email)} ／ 病院 ${esc(h.phone||h.address||"登録住所参照")}</div>`
    : `<div class="legalmini" style="margin:6px 0;">連絡先は承認後に開示されます。それまではこのチャットでやりとりしてください。</div>`;
  openModal(`<h3>💬 ${esc(meRole==="doctor"?h.name:d.name+" 先生")} とのやりとり</h3>
    <div class="sub">${dstr(po.date)}(${dow(po.date)}) ${po.type}／状態：${{applied:"承認待ち",approved:"承認済み",declined:"見送り",withdrawn:"取り下げ",cancelled:"キャンセル済"}[ap.status]}</div>
    ${contact}
    <div class="chatlog" id="chatlog">
      ${msgs.map(m=>`<div class="bubble ${m.senderRole===meRole?"mine":"theirs"}">
        <div class="btxt">${esc(m.text)}</div><div class="bts">${m.senderRole==="doctor"?"🩺":"🏥"} ${m.ts}</div></div>`).join("")
      ||'<div class="paneltitle" style="text-align:center;">最初のメッセージを送ってみましょう（例：当日の持ち物・オリエンの時間など）</div>'}
    </div>
    <div class="chatrow">
      <input class="inp" id="chat-inp" placeholder="メッセージを入力" aria-label="メッセージを入力" onkeydown="if(event.key==='Enter'&&!event.isComposing&&event.keyCode!==229)sendChat()">
      <button class="btn teal" onclick="sendChat()">送信</button>
    </div>
    <div class="mfoot"><button class="btn ghost" onclick="closeModal()">閉じる</button></div>`);
  const log=$("chatlog"); if(log) log.scrollTop=log.scrollHeight;
}
async function sendChat(){
  const text=$("chat-inp").value;
  const r = await Promise.resolve(api.sendMessage(CHAT_AP, auth.session.role, auth.session.refId, text));
  if(r.err) return toast("⚠️ "+r.err);
  drawChat();
}

/* ---------- 病院メイン ---------- */
let wiz=null;
const W_TYPES=[["当直","b-touku"],["外来応援","b-gairai"],["健診応援","b-kenshin"],["ワクチン","b-vac"]];
const W_TIMES=[["18:00","09:00",true],["17:00","09:00",true],["09:00","17:00",false],["09:00","15:00",false],["09:00","12:00",false]];
function renderHospital(root){
  const h=hp();
  const pos=listPostingsForHospital(h.id);
  const inbox=pos.reduce((n,p)=>n+listApplicationsForPosting(p.id).filter(a=>a.status==="applied").length,0);
  root.innerHTML=`
  <div class="paneltitle">🏥 <b>${esc(h.name)}</b>（✓ ${esc(h.verifiedNote)}）
    <button class="btn sm teal" style="margin-left:10px;" onclick="openWizard()">＋ 新規募集（3分）</button>
    ${pos.length?`<button class="btn sm ghost" style="margin-left:6px;" onclick="openTemplatePicker()">📋 前回をコピー</button>`:""}</div>
  <div class="paneltitle">🔑 招待コード：<code class="invitecode">${esc(h.inviteCode)}</code>
    <button class="btn sm ghost" onclick="copyInviteCode('${esc(h.inviteCode)}')">コピー</button>
    <button class="btn sm ghost" onclick="doRegenInviteCode()">再発行</button>
    ／同じ病院の別の担当者を追加するときに共有してください（漏れた場合は再発行してください）</div>
  ${inbox?`<div class="notice">🔔 <b>依頼あり：${inbox}件の手上げ</b>が承認待ちです。🟡の枠をクリックして確認してください。</div>`:""}
  <div class="notice" style="background:#fff;">🟡 募集中（クリック=応募確認）／🟢 確保済み／⚪ 完了｜2026年7月</div>
  <div class="cal">
    <div class="dow"><div style="color:#d9645a">日</div><div>月</div><div>火</div><div>水</div><div>木</div><div>金</div><div style="color:#5b8fb0">土</div></div>
    <div class="grid7" id="hgrid"></div>
  </div>`;
  const g=$("hgrid");
  for(let i=0;i<3;i++){const e=document.createElement("div");e.className="cell empty";g.appendChild(e);}
  for(let dd=1;dd<=31;dd++){
    const cell=document.createElement("div");cell.className="cell";
    cell.innerHTML=`<div class="num">${dd}</div>`;
    pos.filter(p=>+p.date.split("-")[2]===dd).forEach(p=>{
      const n=listApplicationsForPosting(p.id).filter(a=>a.status==="applied").length;
      const asg=getAssignmentForPosting(p.id);
      const el=document.createElement("div");
      if(p.status==="open"){el.className="slot s-open"+(p.urgent?" blink2":"");el.textContent=`🟡 ${p.type} 応募${n}`;}
      else if(p.status==="confirmed"){el.className="slot s-conf";el.textContent=`🟢 ${p.type} ${dname(asg.doctorId).split(" ")[0]}`;}
      else {el.className="slot s-comp";el.textContent=`✔ ${p.type} 完了`;}
      el.onclick=()=>hospSlot(p.id);
      cell.appendChild(el);
    });
    g.appendChild(cell);
  }
}
function hospSlot(poId){
  const p=getPosting(poId);
  if(p.status==="open"){
    const apps=listApplicationsForPosting(poId).filter(a=>a.status==="applied");
    openModal(`<h3>手上げの確認（${dstr(p.date)} ${p.type}）</h3>
      <div class="sub">${esc(p.department)}・${p.timeStart}〜${p.overnight?"翌":""}${p.timeEnd}・${yen(p.pay)}／交通費 ${esc(p.transport)}</div>
      ${apps.length?apps.map(a=>{const d=getDoctor(a.doctorId);return `
        <div class="appcard"><span class="nm">${esc(d.name)}</span><span class="verified">✓ 実在確認済</span>
          <div class="meta">${d.specialties.join("・")}／スポット実績 ${d.completedCount}回</div>
          <div class="meta">✈ ${esc(a.itinerary.summary)}</div>
          <div style="display:flex;gap:8px;margin-top:9px;flex-wrap:wrap;">
            <button class="btn sm green" onclick="doApprove('${a.id}')">この先生を承認</button>
            <button class="btn sm teal" onclick="openChat('${a.id}')">💬 やりとり</button>
            <button class="btn sm ghost" onclick="doDecline('${a.id}')">お断り</button></div></div>`;}).join("")
      :'<div class="paneltitle" style="text-align:center;padding:14px;">まだ手上げがありません。登録医師に公開中です。</div>'}
      <div class="mfoot"><button class="btn ghost" onclick="closeModal()">閉じる</button></div>`);
  } else {
    const asg=getAssignmentForPosting(poId);
    const ap=listApplicationsForPosting(poId).find(a=>a.status==="approved");
    openModal(`<h3>${p.status==="completed"?"完了":"確保済み"}（${dstr(p.date)} ${p.type}）</h3>
      <div class="summ">
        <div class="l"><span>担当医</span><b style="color:var(--ok)">${esc(dname(asg.doctorId))}</b></div>
        <div class="l"><span>雇用</span><b>${asg.employmentType}</b></div>
        <div class="l"><span>報酬</span><b>${yen(asg.termsSnapshot.pay)}（固定）</b></div>
        <div class="l"><span>便</span><b>${esc(asg.itinerary.summary)}</b></div>
        <div class="l"><span>便の予約</span><b>${esc(asg.itinerary.booking||"未予約")}</b></div>
      </div>
      <div class="mfoot"><button class="btn ghost" onclick="closeModal()">閉じる</button>
        ${ap?`<button class="btn teal" onclick="openChat('${ap.id}')">💬 やりとり</button>`:""}
        ${asg.status==="confirmed"?`<button class="btn ghost" onclick="doCancelAssignment('${asg.id}')">確定を取り消す</button>`:""}
        ${asg.status==="confirmed"?`<button class="btn green" onclick="doComplete('${asg.id}')">勤務完了 ✓</button>`:""}</div>`);
  }
}
async function doApprove(apId){
  if(!confirm("この先生を承認しますか？\n承認すると、この枠の他の応募者は自動的にお断りになります。")) return;
  const r = await Promise.resolve(api.approve(hp().id,apId)); if(r.err)return toast("⚠️ "+r.err); closeModal(); render(); toast("承認しました。医師と連絡先が相互開示されます");
}
async function doDecline(apId){
  if(!confirm("この先生をお断りしますか？\nこの操作は取り消せません。")) return;
  const r = await Promise.resolve(api.decline(hp().id,apId)); if(r.err)return toast("⚠️ "+r.err); closeModal(); render(); toast("お断りしました");
}
function copyInviteCode(code){
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(code).then(()=>toast("招待コードをコピーしました")).catch(()=>toast("コピーできませんでした。コード："+code));
  } else {
    toast("コード："+code);
  }
}
async function doRegenInviteCode(){
  if(!confirm("招待コードを再発行しますか？\n古いコードはこの操作後、参加に使えなくなります。")) return;
  const r = await Promise.resolve(api.regenerateInviteCode(auth.session.userId));
  if(r.err) return toast("⚠️ "+r.err);
  render(); toast("招待コードを再発行しました");
}
async function doComplete(asgId){
  if(!confirm("この勤務を完了にしますか？\n完了後は取り消せません。")) return;
  const r = await Promise.resolve(api.complete(hp().id,asgId)); if(r.err)return toast("⚠️ "+r.err); closeModal(); render(); toast("完了にしました");
}
function openWizard(fromId){
  const src = fromId ? getPosting(fromId) : null;
  if(src){
    const tyIdx = W_TYPES.findIndex(t=>t[0]===src.type);
    const tiIdx = W_TIMES.findIndex(t=>t[0]===src.timeStart && t[1]===src.timeEnd && t[2]===!!src.overnight);
    wiz = {step:0, day:"", ti:tiIdx>=0?tiIdx:0, ty:tyIdx>=0?tyIdx:0,
      dept:src.department||"内科", pay:String(src.pay||"120000"), urgent:!!src.urgent, note:src.note||""};
  } else {
    wiz={step:0,day:"",ti:0,ty:0,dept:"内科",pay:"120000",urgent:false,note:""};
  }
  drawWiz();
}
function openTemplatePicker(){
  const h=hp();
  const list=listPostingsForHospital(h.id).sort((a,b)=>seqOf(b.id)-seqOf(a.id)).slice(0,10);
  openModal(`<h3>📋 前回の募集をコピー</h3>
    <div class="sub">選んだ内容を元に、日にちだけ変えて公開できます</div>
    ${list.map(p=>`<div class="appcard" style="cursor:pointer;" onclick="useTemplate('${p.id}')">
      <span class="nm">${dstr(p.date)}(${dow(p.date)}) ${esc(p.type)}</span>
      <div class="meta">${esc(p.department)}／${yen(p.pay)}${p.urgent?"／🚨 緊急":""}</div></div>`).join("")
    ||'<div class="paneltitle" style="text-align:center;">コピーできる過去の募集がありません</div>'}
    <div class="mfoot"><button class="btn ghost" onclick="closeModal()">閉じる</button></div>`);
}
function useTemplate(id){ closeModal(); openWizard(id); }
function drawWiz(){
  const s=wiz.step; let body="";
  if(s===0) body=`<div class="q">① いつ来てほしい？（2026年7月の日にち）</div>
    <input class="inp" id="w-day" placeholder="例）18" value="${wiz.day}" inputmode="numeric" oninput="this.value=this.value.replace(/[^0-9]/g,'');wiz.day=this.value">
    <div class="q">時間帯</div><div class="opts">${W_TIMES.map((t,i)=>`
      <div class="pick ${wiz.ti===i?"on":""}" onclick="wiz.ti=${i};drawWiz()">${t[0]}〜${t[2]?"翌":""}${t[1]}</div>`).join("")}</div>`;
  else if(s===1) body=`<div class="q">② 何の業務？</div><div class="opts">${W_TYPES.map((t,i)=>`
      <div class="pick ${wiz.ty===i?"on":""}" onclick="wiz.ty=${i};drawWiz()">${t[0]}</div>`).join("")}</div>
    <div class="q">診療科</div><input class="inp" value="${esc(wiz.dept)}" oninput="wiz.dept=this.value">
    <div class="q">病院からの一言（任意）</div><input class="inp" value="${esc(wiz.note)}" oninput="wiz.note=this.value" placeholder="例）当直は落ち着いています">`;
  else if(s===2) body=`<div class="q">③ 報酬（円）</div><input class="inp" value="${wiz.pay}" oninput="wiz.pay=this.value">
    <div class="q">緊急募集にする？（医師の地図で赤く点滅）</div><div class="opts">
      <div class="pick ${!wiz.urgent?"on":""}" onclick="wiz.urgent=false;drawWiz()">通常</div>
      <div class="pick ${wiz.urgent?"on":""}" onclick="wiz.urgent=true;drawWiz()">🚨 緊急</div></div>
    <div class="q">交通費・宿泊</div><div class="opts"><div class="pick on">交通費 全額病院負担</div><div class="pick on">宿は病院手配</div></div>`;
  else { const t=W_TIMES[wiz.ti];
    body=`<div class="q">④ この内容で公開します</div><div class="summ">
      <div class="l"><span>日時</span><b>7/${wiz.day||"?"}　${t[0]}〜${t[2]?"翌":""}${t[1]}</b></div>
      <div class="l"><span>業務</span><b>${W_TYPES[wiz.ty][0]}／${esc(wiz.dept)}</b></div>
      <div class="l"><span>報酬</span><b style="color:var(--pay)">¥${(+wiz.pay||0).toLocaleString()}</b></div>
      <div class="l"><span>区分</span><b>${wiz.urgent?"🚨 緊急募集":"通常"}</b></div></div>
      <p class="legalmini">公開すると登録医師の地図・日付検索に表示され、医師が自分で手を挙げます（運営からのレコメンド送信は行いません）。</p>`;
  }
  openModal(`<h3>募集をつくる（${s+1}/4）</h3><div class="sub">1問1答・3分で公開</div>${body}
    <div class="mfoot">
      ${s===0?`<button class="btn ghost" onclick="closeModal()">やめる</button>`:`<button class="btn ghost" onclick="wiz.step--;drawWiz()">‹ 戻る</button>`}
      ${s<3?`<button class="btn teal" onclick="wizNext()">次へ ›</button>`:`<button class="btn green" onclick="wizPublish()">公開する ✓</button>`}
    </div>`);
}
function wizNext(){
  if(wiz.step===0&&!(Number.isInteger(+wiz.day)&&+wiz.day>=1&&+wiz.day<=31)){toast("⚠️ 日にちを入れてください");return;}
  if(wiz.step===2&&!(+wiz.pay>0)){toast("⚠️ 報酬を入力してください");return;}
  wiz.step++; drawWiz();
}
async function wizPublish(){
  if(!(Number.isInteger(+wiz.day)&&+wiz.day>=1&&+wiz.day<=31)){toast("⚠️ 日にちを入れてください");wiz.step=0;drawWiz();return;}
  if(!(+wiz.pay>0)){toast("⚠️ 報酬を入力してください");wiz.step=2;drawWiz();return;}
  const t=W_TIMES[wiz.ti];
  const r = await Promise.resolve(api.publishPosting(hp().id,{date:`2026-07-${String(+wiz.day).padStart(2,"0")}`,
    timeStart:t[0],timeEnd:t[1],overnight:t[2],type:W_TYPES[wiz.ty][0],cls:W_TYPES[wiz.ty][1],
    department:wiz.dept,urgent:wiz.urgent,requiredCredentials:["医師免許"],pay:+wiz.pay||0,
    transport:"全額 病院負担",lodging:t[2]?"当直→翌朝そのまま帰路":"前泊（宿は病院手配）",
    ground:"病院の送迎あり",note:wiz.note||"—"}));
  if(r.err) return toast("⚠️ "+r.err);
  closeModal(); render(); toast("募集を公開しました。医師側の地図・日付にすぐ出ます");
}

/* ---------- 運営 ---------- */
function renderAdmin(root){
  const drQ=listDoctorsByStatus("審査中");
  const hpQ=listHospitalsByStatus("審査中");
  const credQ=listCredentialQueue();
  root.innerHTML=`
  <div class="paneltitle">⚙️ 運営コンソール（ゼロベース）</div>
  <div class="notice">⚖️ <b>Legal by Design</b>：運営には「医師を病院に割り当てる」「やりとりに参加する」機能が<b>存在しません</b>。
    できるのは①実在確認 ②監査ログの閲覧 のみ。</div>
  <div class="section-h">🩺 医師の実在確認待ち（${drQ.length}）</div>
  ${drQ.map(d=>`<div class="appcard"><span class="nm">${esc(d.name)}</span>
    <div class="meta">医籍登録番号：<b>${esc(d.licenseNo)}</b>${d.hokeniNo?`／保険医登録：${esc(d.hokeniNo)}`:""}／提出書類：${esc(d.files.license||"")}・${esc(d.files.kyc||"")}</div>
    <div class="meta">照合先：<a href="https://licenseif.mhlw.go.jp/search_isei/" target="_blank" rel="noopener">厚生労働省 医師等資格確認検索 →</a></div>
    <div style="display:flex;gap:8px;margin-top:9px;">
      <button class="btn sm green" onclick="doVerifyDr('${d.id}',true)">実在確認OK・承認</button>
      <button class="btn sm ghost" onclick="doVerifyDr('${d.id}',false)">却下</button></div></div>`).join("")
  ||'<div class="paneltitle">確認待ちはありません</div>'}
  <div class="section-h">🏥 病院の実在確認待ち（${hpQ.length}）</div>
  ${hpQ.map(h=>`<div class="appcard"><span class="nm">${esc(h.name)}</span>
    <div class="meta">${esc(h.pref)}／${esc(h.address)}／☎ ${esc(h.phone||"未入力")}</div>
    <div class="meta">${esc(h.verifiedNote)}／照合先：<a href="https://www.iryou.teikyouseido.mhlw.go.jp/" target="_blank" rel="noopener">医療情報ネット（厚労省）→</a></div>
    <div style="display:flex;gap:8px;margin-top:9px;">
      <button class="btn sm green" onclick="doVerifyHp('${h.id}',true)">実在確認OK・承認</button>
      <button class="btn sm ghost" onclick="doVerifyHp('${h.id}',false)">却下</button></div></div>`).join("")
  ||'<div class="paneltitle">確認待ちはありません</div>'}
  <div class="section-h">📋 追加書類の確認待ち（${credQ.length}）</div>
  ${credQ.map(q=>`<div class="appcard"><span class="nm">${esc(q.d.name)}</span>
    <div class="meta">書類：<b>${q.c.type}</b>（確認中）</div>
    <div style="display:flex;gap:8px;margin-top:9px;">
      <button class="btn sm green" onclick="doVerifyCred('${q.d.id}','${q.c.type}',true)">承認</button>
      <button class="btn sm ghost" onclick="doVerifyCred('${q.d.id}','${q.c.type}',false)">却下</button></div></div>`).join("")
  ||'<div class="paneltitle">確認待ちはありません</div>'}
  <div class="section-h">🧾 AuditLog（追記専用・新しい順）</div>
  <div style="margin-bottom:8px;"><button class="btn sm ghost" onclick="if(confirm('デモデータを初期化しますか？')){resetDB();location.reload();}">デモデータ初期化</button></div>
  ${listAuditLog(40).map(a=>`<div class="audit">[${a.ts}] <b>${esc(a.actor)}</b> ${esc(a.action)}<br>${esc(a.detail||"")}</div>`).join("")}`;
}
async function doVerifyDr(id,ok){ const r = await Promise.resolve(api.verifyDoctor(auth.session.userId,id,ok)); if(r.err)return toast("⚠️ "+r.err); render(); toast(ok?"承認しました":"却下しました"); }
async function doVerifyHp(id,ok){ const r = await Promise.resolve(api.verifyHospital(auth.session.userId,id,ok)); if(r.err)return toast("⚠️ "+r.err); render(); toast(ok?"承認しました":"却下しました"); }
async function doVerifyCred(id,type,ok){ const r = await Promise.resolve(api.verifyCredential(auth.session.userId,id,type,ok)); if(r.err)return toast("⚠️ "+r.err); render(); toast("処理しました"); }

/* ---------- init ---------- */
window.addEventListener("load", async ()=>{
  restoreSession();
  await ensureSeedUsers();
  $("ov").addEventListener("click", e=>{ if(e.target.id==="ov") closeModal(); });
  document.addEventListener("keydown", modalKeydown);
  render();
});
