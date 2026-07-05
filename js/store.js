/* =========================================================
   store.js — データ層＋API層（08_設計書 ②③の実装）
   ・v0.2はブラウザ内DB（localStorage）で動作する「デモモード」
   ・本番は同じインターフェイスのまま Supabase に差し替える
     （supabase/schema.sql 参照。認証もSupabase Authへ移行）
   ・状態遷移とAuditLog記録はすべてこのAPI層を通す（ビューは書かない）
   ========================================================= */

const LSKEY = "soratobu_v02";

/* ---------- パスワードハッシュ（デモ用：SHA-256+salt） ----------
   注意：クライアント内デモの簡易実装。本番はSupabase Authを使う。 */
async function hashPass(pass, salt){
  const data = new TextEncoder().encode(salt + ":" + pass);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
const genSalt = () => Math.random().toString(36).slice(2,10) + Date.now().toString(36);

/* ---------- 初期データ ---------- */
function seedDB(){
  const db = {
    users: [], doctors: [], hospitals: [], postings: [],
    applications: [], assignments: [], messages: [],
    audit: [{ts:tsNow(), actor:"system", action:"seed", detail:"初期データ投入"}],
    seq: 100,
  };
  // マスタの離島病院のうち3院を「登録・承認済み」の病院としてシード
  const seedHosp = [
    {master:"徳之島徳洲会病院", email:"tokunoshima@example.com"},
    {master:"屋久島徳洲会病院", email:"yakushima@example.com"},
    {master:"種子島医療センター", email:"tanegashima@example.com"},
  ];
  seedHosp.forEach((s,i)=>{
    const m = HOSP_MASTER.find(h=>h.name===s.master);
    db.hospitals.push({
      id:"hp_"+(i+1), name:m.name, pref:m.pref, city:m.city, address:`${m.pref}${m.city}（住所は登録時に入力）`,
      lat:m.lat, lng:m.lng, island:m.island||null, airport:m.airport||null, kind:m.kind,
      phone:"", status:"承認", verifiedNote:"病院マスタ一致（システム照合）",
      facilities:"送迎あり・宿は病院手配",
    });
  });
  // デモ医師（承認済み）
  db.doctors.push({
    id:"dr_1", name:"山田 太郎", email:"yamada@example.com",
    specialties:["総合診療","内科"], capabilities:["当直","外来応援","健診応援","ワクチン"],
    homeBase:"ITM", completedCount:12, status:"承認",
    licenseNo:"123456", hokeniNo:"", files:{license:"license_yamada.jpg", kyc:"kyc_yamada.jpg"},
    credentials:[
      {type:"医師免許", status:"承認"},
      {type:"本人確認", status:"承認"},
      {type:"保険医登録", status:"確認中"},
    ],
  });
  // 募集（実在の離島病院に紐づけ）
  const P = (o)=>Object.assign({transport:"全額 病院負担", requiredCredentials:["医師免許"], status:"open"}, o);
  db.postings.push(
    P({id:"po_1", hospitalId:"hp_1", urgent:false, date:"2026-07-12", timeStart:"09:00", timeEnd:"12:00", overnight:false,
       type:"ワクチン", cls:"b-vac", department:"—", pay:60000,
       lodging:"前泊（宿は病院手配）", ground:"病院の送迎あり", note:"定期予防接種の応援。半日のみ。"}),
    P({id:"po_2", hospitalId:"hp_1", urgent:false, date:"2026-07-18", timeStart:"18:00", timeEnd:"09:00", overnight:true,
       type:"当直", cls:"b-touku", department:"内科", pay:120000,
       lodging:"当直→翌朝そのまま帰路", ground:"病院の送迎あり（空港⇄病院）", note:"当直は比較的落ち着いています。救急は二次まで。"}),
    P({id:"po_3", hospitalId:"hp_2", urgent:true, date:"2026-07-20", timeStart:"17:00", timeEnd:"09:00", overnight:true,
       type:"当直", cls:"b-touku", department:"内科", pay:130000,
       lodging:"当直→翌朝そのまま帰路", ground:"病院の送迎あり", note:"直前の欠員。へき地手当込み。"}),
    P({id:"po_4", hospitalId:"hp_2", urgent:false, date:"2026-07-12", timeStart:"09:00", timeEnd:"17:00", overnight:false,
       type:"外来応援", cls:"b-gairai", department:"総合内科", pay:95000,
       requiredCredentials:["医師免許","保険医登録"],
       lodging:"前泊＋勤務後1泊の可能性", ground:"公共交通＋病院の送迎", note:"保険診療のため保険医登録が必要です。"}),
    P({id:"po_5", hospitalId:"hp_3", urgent:false, date:"2026-07-19", timeStart:"09:00", timeEnd:"15:00", overnight:false,
       type:"健診応援", cls:"b-kenshin", department:"健診", pay:85000,
       lodging:"前泊（宿は病院手配）", ground:"レンタカー（実費病院負担）", note:"住民健診の応援。読影なし。"}),
  );
  return db;
}

/* デモアカウント（初回のみ非同期で作成） */
async function ensureSeedUsers(){
  const mk = async (email, pass, role, refId) => {
    if(DB.users.some(u=>u.email===email)) return;
    const salt = genSalt();
    DB.users.push({id:"u_"+(DB.seq++), email, salt, hash:await hashPass(pass,salt), role, refId});
  };
  await mk("yamada@example.com","demo1234","doctor","dr_1");
  await mk("tokunoshima@example.com","demo1234","hospital","hp_1");
  await mk("yakushima@example.com","demo1234","hospital","hp_2");
  await mk("tanegashima@example.com","demo1234","hospital","hp_3");
  await mk("admin@example.com","demo1234","admin",null);
  saveDB();
}

let DB = loadDB();
function loadDB(){ try{ const s=localStorage.getItem(LSKEY); if(s) return JSON.parse(s);}catch(e){} return seedDB(); }
function saveDB(){ localStorage.setItem(LSKEY, JSON.stringify(DB)); }
function resetDB(){ DB = seedDB(); saveDB(); }
function tsNow(){ const d=new Date(); return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; }
function audit(actor, action, detail){ DB.audit.unshift({ts:tsNow(), actor, action, detail}); }

/* ---------- 認証API ---------- */
const auth = {
  session: null,   // {userId, role, refId}
  async signup(email, pass, role){
    email = (email||"").trim().toLowerCase();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return {err:"メールアドレスの形式が正しくありません"};
    if((pass||"").length < 8) return {err:"パスワードは8文字以上にしてください"};
    if(DB.users.some(u=>u.email===email)) return {err:"このメールアドレスは登録済みです"};
    const salt = genSalt();
    const user = {id:"u_"+(DB.seq++), email, salt, hash:await hashPass(pass,salt), role, refId:null};
    DB.users.push(user);
    audit(`user:${email}`, "auth.signup", `role=${role}`);
    saveDB();
    this.session = {userId:user.id, role, refId:null};
    persistSession();
    return {ok:true};
  },
  async login(email, pass){
    email = (email||"").trim().toLowerCase();
    const user = DB.users.find(u=>u.email===email);
    if(!user) return {err:"メールアドレスまたはパスワードが違います"};
    const h = await hashPass(pass, user.salt);
    if(h !== user.hash) return {err:"メールアドレスまたはパスワードが違います"};
    this.session = {userId:user.id, role:user.role, refId:user.refId};
    persistSession();
    audit(`user:${email}`, "auth.login", "");
    saveDB();
    return {ok:true};
  },
  logout(){
    this.session = null; sessionStorage.removeItem("soratobu_session");
  },
  me(){ return this.session ? DB.users.find(u=>u.id===this.session.userId) : null; },
};
function persistSession(){ sessionStorage.setItem("soratobu_session", JSON.stringify(auth.session)); }
function restoreSession(){
  try{ const s=sessionStorage.getItem("soratobu_session"); if(s) auth.session=JSON.parse(s); }catch(e){}
}

/* ---------- 日時重複チェック（ダブルブッキング防止） ----------
   同一医師が同じ日時帯の別の予定（応募中 or 確定済み）を持っている場合はブロックする。
   応募時・承認時の両方で検証する（承認時の再検証で、応募後に生じた重複も防ぐ）。 */
function postingRange(po){
  const [y,mo,d] = po.date.split("-").map(Number);
  const [sh,sm] = po.timeStart.split(":").map(Number);
  const start = new Date(y, mo-1, d, sh, sm).getTime();
  const [eh,em] = po.timeEnd.split(":").map(Number);
  const end = new Date(y, mo-1, d + (po.overnight?1:0), eh, em).getTime();
  return {start, end};
}
function rangesOverlap(a, b){ return a.start < b.end && b.start < a.end; }
function findScheduleConflict(doctorId, targetPo, excludeApplicationId){
  const range = postingRange(targetPo);
  const busyPostingIds = new Set();
  DB.applications.forEach(a=>{
    if(a.doctorId===doctorId && a.status==="applied" && a.id!==excludeApplicationId) busyPostingIds.add(a.postingId);
  });
  DB.assignments.forEach(a=>{
    if(a.doctorId===doctorId && a.status==="confirmed") busyPostingIds.add(a.postingId);
  });
  busyPostingIds.delete(targetPo.id);
  for(const pid of busyPostingIds){
    const other = DB.postings.find(p=>p.id===pid);
    if(other && rangesOverlap(range, postingRange(other))) return other;
  }
  return null;
}

/* ---------- 業務API（状態遷移＋Audit一元化） ---------- */
const api = {
  /* 医師プロフィール登録（→ 書類は「確認中」で審査キューへ） */
  registerDoctor(userId, prof){
    const user = DB.users.find(u=>u.id===userId);
    if(!user || user.role!=="doctor") return {err:"権限がありません"};
    if(!/^\d{5,7}$/.test(prof.licenseNo||"")) return {err:"医籍登録番号は5〜7桁の数字で入力してください"};
    const id = "dr_"+(DB.seq++);
    const creds = [
      {type:"医師免許", status:"確認中"},
      {type:"本人確認", status:"確認中"},
    ];
    if(prof.hokeniNo) creds.push({type:"保険医登録", status:"確認中"});
    DB.doctors.push({
      id, name:prof.name, email:user.email, specialties:prof.specialties, capabilities:prof.capabilities,
      homeBase:prof.homeBase, completedCount:0, status:"審査中",
      licenseNo:prof.licenseNo, hokeniNo:prof.hokeniNo||"", files:prof.files||{}, credentials:creds,
    });
    user.refId = id; auth.session.refId = id; persistSession();
    audit(`doctor:${id}`, "doctor.register", `${prof.name}（医籍${prof.licenseNo}）→ 実在確認キューへ`);
    saveDB(); return {ok:true, id};
  },
  /* 病院登録（→ マスタ照合。 一致=自動承認／不一致=運営の目視確認へ） */
  registerHospital(userId, prof){
    const user = DB.users.find(u=>u.id===userId);
    if(!user || user.role!=="hospital") return {err:"権限がありません"};
    if(!prof.name || !prof.pref || !prof.address) return {err:"病院名・都道府県・住所は必須です"};
    const m = matchMaster(prof.name, prof.pref);
    const id = "hp_"+(DB.seq++);
    DB.hospitals.push({
      id, name:prof.name, pref:prof.pref, city:m?m.city:"", address:prof.address, phone:prof.phone||"",
      lat:m?m.lat:null, lng:m?m.lng:null, island:m?(m.island||null):null, airport:m?(m.airport||null):null,
      kind:m?m.kind:"", facilities:prof.facilities||"",
      status: m ? "承認" : "審査中",
      verifiedNote: m ? "病院マスタ一致（システム照合で実在確認）" : "マスタ不一致 → 運営が医療情報ネット等で目視確認",
    });
    user.refId = id; auth.session.refId = id; persistSession();
    audit(m?"system":"hospital:"+id, "hospital.register",
      `${prof.name}（${prof.pref}）→ ${m?"マスタ一致・自動承認":"実在確認キューへ"}`);
    saveDB(); return {ok:true, id, matched:!!m};
  },
  /* 募集の公開 */
  publishPosting(hospitalId, p){
    const h = DB.hospitals.find(x=>x.id===hospitalId);
    if(!h || h.status!=="承認") return {err:"病院の実在確認が完了していません"};
    const id = "po_"+(DB.seq++);
    DB.postings.push({...p, id, hospitalId, status:"open"});
    audit(`hospital:${hospitalId}`, "posting.publish", `${id} ${p.date} ${p.type} ¥${(p.pay||0).toLocaleString()}`);
    saveDB(); return {ok:true, id};
  },
  /* 手上げ（資格ゲートはサーバ側でも検証） */
  apply(doctorId, postingId, itin){
    const po = DB.postings.find(p=>p.id===postingId);
    const dr = DB.doctors.find(d=>d.id===doctorId);
    if(!po || po.status!=="open") return {err:"この募集は受付中ではありません"};
    if(!dr) return {err:"医師プロフィールが未登録です"};
    if(DB.applications.some(a=>a.postingId===postingId && a.doctorId===doctorId && a.status==="applied"))
      return {err:"すでに手を挙げています"};
    const conflict = findScheduleConflict(doctorId, po, null);
    if(conflict) return {err:`同じ日時に他の予定（${conflict.date} ${conflict.type}）があるため応募できません`};
    const ok = (po.requiredCredentials||[]).every(rc=>dr.credentials.some(c=>c.type===rc && c.status==="承認"));
    if(!ok) return {err:"必要資格が未承認のため応募できません"};
    const id = "ap_"+(DB.seq++);
    DB.applications.push({id, postingId, doctorId, status:"applied", appliedAt:tsNow(), itinerary:itin});
    audit(`doctor:${doctorId}`, "application.apply", `${id} → ${postingId}（${itin.summary}）`);
    saveDB(); return {ok:true, id};
  },
  approve(hospitalId, applicationId){
    const ap = DB.applications.find(a=>a.id===applicationId);
    if(!ap || ap.status!=="applied") return {err:"承認できない状態です"};
    const po = DB.postings.find(p=>p.id===ap.postingId);
    if(po.hospitalId!==hospitalId) return {err:"自院の募集ではありません"};
    if(po.status!=="open") return {err:"この募集はすでに確定・終了しています"};
    const conflict = findScheduleConflict(ap.doctorId, po, ap.id);
    if(conflict) return {err:`医師の同日時の予定（${conflict.date} ${conflict.type}）と重複するため承認できません`};
    ap.status = "approved";
    DB.applications.filter(a=>a.postingId===po.id && a.id!==ap.id && a.status==="applied")
      .forEach(a=>{ a.status="declined"; audit("system","application.autoDecline",`${a.id}（他候補確定のため）`); });
    po.status = "confirmed";
    const asg = {id:"as_"+(DB.seq++), postingId:po.id, doctorId:ap.doctorId, hospitalId,
      status:"confirmed", employmentType:"日々雇用（病院と医師の直接契約）",
      termsSnapshot:{pay:po.pay, transport:po.transport, date:po.date,
        time:`${po.timeStart}〜${po.overnight?"翌":""}${po.timeEnd}`},
      itinerary:ap.itinerary};
    DB.assignments.push(asg);
    audit(`hospital:${hospitalId}`, "application.approve", `${ap.id} → Assignment ${asg.id}（条件スナップショット固定）`);
    saveDB(); return {ok:true, id:asg.id};
  },
  decline(hospitalId, applicationId){
    const ap = DB.applications.find(a=>a.id===applicationId);
    if(!ap || ap.status!=="applied") return {err:"操作できない状態です"};
    ap.status = "declined";
    audit(`hospital:${hospitalId}`, "application.decline", ap.id);
    saveDB(); return {ok:true};
  },
  withdraw(doctorId, applicationId, reason){
    const ap = DB.applications.find(a=>a.id===applicationId);
    if(!ap || ap.doctorId!==doctorId || ap.status!=="applied") return {err:"取り下げできない状態です"};
    ap.status = "withdrawn";
    audit(`doctor:${doctorId}`, "application.withdraw", `${ap.id}（理由：${reason||"未記入"}）`);
    saveDB(); return {ok:true};
  },
  complete(hospitalId, assignmentId){
    const asg = DB.assignments.find(a=>a.id===assignmentId);
    if(!asg || asg.status!=="confirmed") return {err:"完了にできない状態です"};
    asg.status = "completed";
    const po = DB.postings.find(p=>p.id===asg.postingId); if(po) po.status="completed";
    const dr = DB.doctors.find(d=>d.id===asg.doctorId); if(dr) dr.completedCount++;
    audit(`hospital:${hospitalId}`, "assignment.complete", assignmentId);
    saveDB(); return {ok:true};
  },
  selfReportBooking(doctorId, assignmentId){
    const asg = DB.assignments.find(a=>a.id===assignmentId);
    if(!asg || asg.doctorId!==doctorId) return {err:"操作できません"};
    asg.itinerary.booking = "予約済（自己申告）";
    audit(`doctor:${doctorId}`, "itinerary.bookingSelfReport", assignmentId);
    saveDB(); return {ok:true};
  },
  /* メッセージ（応募単位のチャット。あっせん回避のため運営は送信不可） */
  sendMessage(applicationId, senderRole, senderId, text){
    const ap = DB.applications.find(a=>a.id===applicationId);
    if(!ap) return {err:"応募が見つかりません"};
    if(!["doctor","hospital"].includes(senderRole)) return {err:"運営はやりとりに参加できません（Legal by Design）"};
    if(!(text||"").trim()) return {err:"本文を入力してください"};
    DB.messages.push({id:"ms_"+(DB.seq++), applicationId, senderRole, senderId, text:text.trim(), ts:tsNow()});
    saveDB(); return {ok:true};
  },
  /* 運営：実在確認（医師・病院） */
  verifyDoctor(doctorId, approveIt){
    const dr = DB.doctors.find(d=>d.id===doctorId);
    if(!dr || dr.status!=="審査中") return {err:"審査中の医師ではありません"};
    dr.status = approveIt ? "承認" : "却下";
    dr.credentials.forEach(c=>{ if(c.status==="確認中" && c.type!=="保険医登録") c.status = approveIt?"承認":"却下"; });
    if(approveIt){ const hk=dr.credentials.find(c=>c.type==="保険医登録"); if(hk && dr.hokeniNo) hk.status="承認"; }
    audit("admin", "doctor.verify", `${dr.name}（医籍${dr.licenseNo}）→ ${dr.status}（厚労省 医師等資格確認検索で照合）`);
    saveDB(); return {ok:true};
  },
  verifyHospital(hospitalId, approveIt){
    const h = DB.hospitals.find(x=>x.id===hospitalId);
    if(!h || h.status!=="審査中") return {err:"審査中の病院ではありません"};
    h.status = approveIt ? "承認" : "却下";
    h.verifiedNote = approveIt ? "運営が医療情報ネット等で実在確認済み" : "実在確認できず却下";
    audit("admin", "hospital.verify", `${h.name} → ${h.status}`);
    saveDB(); return {ok:true};
  },
  verifyCredential(doctorId, type, approveIt){
    const dr = DB.doctors.find(d=>d.id===doctorId);
    const c = dr && dr.credentials.find(c=>c.type===type && c.status==="確認中");
    if(!c) return {err:"確認中の書類がありません"};
    c.status = approveIt ? "承認" : "却下";
    audit("admin", "credential.verify", `${dr.name} ${type} → ${c.status}`);
    saveDB(); return {ok:true};
  },
};

/* ---------- 行程エンジン（静的時刻表から往復候補を生成） ---------- */
const hm = s => { const [a,b]=s.split(":").map(Number); return a*60+b; };
const fm = m => `${Math.floor(m/60)}:${String(m%60).padStart(2,"0")}`;
const CONNECT=40, AIRPORT_BUF=30, GROUND=60, PRE=90;
function chains(from, to){
  const out = [];
  FLIGHTS.filter(f=>f.from===from && f.to===to)
    .forEach(f=>out.push({legs:[f], dep:hm(f.dep), arr:hm(f.arr), direct:true}));
  FLIGHTS.filter(f=>f.from===from && f.to==="KOJ").forEach(f1=>{
    FLIGHTS.filter(f=>f.from==="KOJ" && f.to===to && hm(f.dep)-hm(f1.arr)>=CONNECT)
      .forEach(f2=>out.push({legs:[f1,f2], dep:hm(f1.dep), arr:hm(f2.arr), direct:false}));
  });
  return out.sort((a,b)=>a.arr-b.arr);
}
function legStr(c){ return c.legs.map(f=>`${AIRPORTS[f.from].name} ${f.dep} → ${AIRPORTS[f.to].name} ${f.arr}（${f.no}）`).join(" ／ "); }
function outboundOptions(po, hosp){
  if(!hosp.airport || !AIRPORTS[hosp.airport]) return null;
  const deadline = hm(po.timeStart) - PRE - GROUND;
  const all = chains("ITM", hosp.airport);
  if(!all.length) return null;
  const same = all.filter(c=>c.arr<=deadline);
  const opts = [];
  same.slice(-2).reverse().forEach(c=>opts.push({...c, prevDay:false,
    by:`伊丹空港に ${fm(c.dep-AIRPORT_BUF)} までに到着`,
    arrive:`${AIRPORTS[hosp.airport].name} ${fm(c.arr)} 着（当日入り）`}));
  if(opts.length<2){
    all.slice(-2).reverse().forEach(c=>opts.push({...c, prevDay:true,
      by:`【前日】伊丹空港に ${fm(c.dep-AIRPORT_BUF)} までに到着`,
      arrive:`前日 ${AIRPORTS[hosp.airport].name} ${fm(c.arr)} 着 → 前泊`}));
  }
  return opts.slice(0,3);
}
function returnOptions(po, hosp){
  if(!hosp.airport || !AIRPORTS[hosp.airport]) return null;
  const ready = hm(po.timeEnd) + GROUND;
  const all = chains(hosp.airport, "ITM");
  if(!all.length) return null;
  const same = all.filter(c=>c.dep>=ready);
  const dayLabel = po.overnight ? "翌日" : "当日";
  const opts = [];
  same.slice(0,2).forEach(c=>opts.push({...c, home:`伊丹 ${fm(c.arr)} 着（${dayLabel}）`}));
  if(opts.length<2){
    all.slice(0, 2-opts.length).forEach(c=>opts.push({...c, nextDay:true,
      home:`伊丹 ${fm(c.arr)} 着（${po.overnight?"翌々日":"翌日"}・もう1泊）`}));
  }
  return opts.slice(0,2);
}
