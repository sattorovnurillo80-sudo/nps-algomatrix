/* NPS AlgoMatrix — ilova mantiqi */
const $ = id => document.getElementById(id);
function store(k, v){ try{ localStorage.setItem("nps_" + k, v) }catch(e){} }
function load(k){ try{ return localStorage.getItem("nps_" + k) }catch(e){ return null } }
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
let lang = load("lang") || "uz"; if(!T[lang]) lang = "uz";
const t = (k, v = {}) => (T[lang][k] ?? T.uz[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => v[n]);
const fmt = (x, d = 2) => x.toLocaleString("en-US", {minimumFractionDigits: d, maximumFractionDigits: d});
const DIG = {XAUUSD: 2, NAS100: 1, ETHUSD: 2, BTCUSD: 0};
const px = (sym, x) => (x == null || !isFinite(x)) ? "—" : fmt(x, DIG[sym]);
const VAL = {XAUUSD: 100, NAS100: 1, ETHUSD: 1};          // 1 lot, 1 punkt = $
const H = 3600000;

/* ---- ochilish animatsiyasi (sessiyada bir marta) ---- */
(function(){
  let seen = null; try{ seen = sessionStorage.getItem("nps_splash") }catch(e){}
  if(seen || matchMedia("(prefers-reduced-motion: reduce)").matches){ $("splash").remove(); return; }
  const s = $("splash"); s.hidden = false;
  try{ sessionStorage.setItem("nps_splash", "1") }catch(e){}
  setTimeout(() => s.classList.add("out"), 1700);
  setTimeout(() => s.remove(), 2200);
})();

/* ---- til ---- */
function applyLang(){
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-t]").forEach(el => el.innerHTML = t(el.dataset.t));
  document.querySelectorAll(".lang button").forEach(b => b.setAttribute("aria-pressed", b.dataset.l === lang));
  renderYears(); renderSignals(); renderChart(); tvShow(false); renderJournal(); renderNews(); renderMarkets(); tick(); calc(); renderCrypto();
}
document.querySelectorAll(".lang button").forEach(b => b.onclick = () => { lang = b.dataset.l; store("lang", lang); applyLang(); });

/* ---- bo'limlar ---- */
const VIEWS = ["bozor","signallar","grafik","jurnal","lot","more","natija","strategiya","kripto"];
const PARENT = {natija: "more", strategiya: "more", kripto: "more"};
function show(){
  const v = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "bozor";
  VIEWS.forEach(n => $("v-" + n).hidden = n !== v);
  const tab = PARENT[v] || v;
  document.querySelectorAll(".tab").forEach(a => a.dataset.v === tab ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  window.scrollTo(0, 0);
  if(v === "kripto" && (!KR || Date.now() - KR.at > 4 * 60000)) loadCrypto();
  if(v === "grafik"){ renderChart(); tvShow(false); }
}
addEventListener("hashchange", show);

/* ---- vaqt yordamchilari ---- */
function partsIn(tz, d){
  const p = new Intl.DateTimeFormat("en-GB", {timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short", hourCycle: "h23"}).formatToParts(d);
  const g = k => p.find(x => x.type === k).value;
  return {h: +g("hour"), m: +g("minute"), s: +g("second"), wd: g("weekday")};
}
const TKF = new Intl.DateTimeFormat("en-GB", {timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"});
const LOC = {uz: "uz-Latn-UZ", ru: "ru-RU", en: "en-GB"};
const WD = {uz: ["Du","Se","Ch","Pa","Ju","Sh","Ya"], ru: ["пн","вт","ср","чт","пт","сб","вс"], en: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]};
const TKW = {format: d => { const p = new Intl.DateTimeFormat("en-GB", {timeZone: "Asia/Tashkent", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23"}).formatToParts(d), g = k => p.find(x => x.type === k).value;
  const i = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].indexOf(g("weekday")); return `${WD[lang][i]} ${g("hour")}:${g("minute")}`; }};
const tkStr = ms => { const p = TKF.formatToParts(new Date(ms)), g = k => p.find(x => x.type === k).value; return `${g("day")}.${g("month")} ${g("hour")}:${g("minute")}`; };
const hms = sec => { sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(s).padStart(2, "0"); };
// berilgan zonadagi bugungi hh:mm qachon (ms) bo'lishini topish
function zoneTime(tz, hh, mm, now){
  const p = partsIn(tz, now), cur = p.h * 3600 + p.m * 60 + p.s;
  return now.getTime() + ((hh * 3600 + mm * 60) - cur) * 1000;
}

/* ---- soat + sessiyalar (har soniya) ---- */
const SESS = [
  {n: "s_asia", tz: "Asia/Tokyo",       a: [9, 0], b: [18, 0], note: "n_asia"},
  {n: "s_lon",  tz: "Europe/London",    a: [8, 0], b: [17, 0], note: "n_lon"},
  {n: "s_ny",   tz: "America/New_York", a: [8, 0], b: [17, 0], note: "n_ny"}
];
const hhmm = ms => { const p = partsIn("Asia/Tashkent", new Date(ms)); return String(p.h).padStart(2, "0") + ":" + String(p.m).padStart(2, "0"); };
function isWeekend(d){
  const ny = partsIn("America/New_York", d), m = ny.h * 60 + ny.m;
  return ny.wd === "Sat" || (ny.wd === "Sun" && m < 17 * 60) || (ny.wd === "Fri" && m >= 17 * 60);
}
function tick(){
  const d = new Date(), tk = partsIn("Asia/Tashkent", d);
  $("clk").textContent = [tk.h, tk.m, tk.s].map(x => String(x).padStart(2, "0")).join(":");
  const wk = isWeekend(d);
  $("sessions").innerHTML = SESS.map(s => {
    let A = zoneTime(s.tz, s.a[0], s.a[1], d), B = zoneTime(s.tz, s.b[0], s.b[1], d);
    if(d >= B){ A += 864e5; B += 864e5; }
    const open = !wk && d >= A && d < B;
    const pct = open ? Math.round((d - A) / (B - A) * 100) : 0;
    let pill, cd = "";
    if(wk) pill = `<span class="pill off">${t("p_wk")}</span>`;
    else if(open){ pill = `<span class="pill on">${t("p_open")}</span>`; cd = t("cd_close", {t: hms((B - d) / 1000)}); }
    else { const left = (A - d) / 1000; pill = `<span class="pill ${left <= 3600 ? "soon" : "off"}">${t("p_closed")}</span>`; cd = t("cd_open", {t: hms(left)}); }
    return `<div class="sess"><b>${t(s.n)} <span class="cd ${open ? "buy" : "mute"}">${cd}</span></b>${pill}
      <small class="num">${hhmm(A)} – ${hhmm(B)} ${t("tk")} · ${t(s.note)}</small><div class="bar"><i style="width:${pct}%"></i></div></div>`;
  }).join("");
  tickNews(d);
}
setInterval(() => { if(!document.hidden) tick(); }, 1000);

/* ---- yangiliklar taymeri ----
   Manba 1: news.json (GitHub Actions har soatda ForexFactory'dan yangilaydi).
   Manba 2: ForexFactory to'g'ridan-to'g'ri (brauzer ruxsat bersa). */
let NEWS = null, newsErr = false;
const isKey = e => (e.country === "USD") && (e.impact === "High" || (e.impact === "Medium" && /FOMC|Fed|Powell/i.test(e.title)));
async function loadNews(){
  const urls = ["news.json", "https://nfs.faireconomy.media/ff_calendar_thisweek.json"];
  for(const u of urls){
    try{
      const r = await fetch(u, {cache: "no-store"}); if(!r.ok) continue;
      const j = await r.json(); const arr = Array.isArray(j) ? j : (j.events || []);
      NEWS = arr.filter(isKey).map(e => ({t: Date.parse(e.date), title: e.title, impact: e.impact})).filter(e => isFinite(e.t)).sort((a, b) => a.t - b.t);
      newsErr = false; renderNews(); return;
    }catch(e){}
  }
  newsErr = true; renderNews();
}
function renderNews(){
  const el = $("news"); if(!el) return;
  if(!NEWS){ el.innerHTML = `<span class="mute">${t(newsErr ? "nw_fail" : "nw_load")}</span>`; return; }
  const now = Date.now(), up = NEWS.filter(e => e.t > now - 5 * 60000);
  if(!up.length){ el.className = "card gold news"; el.innerHTML = `<span class="mute">${t("nw_none")}</span>`; return; }
  const n = up[0], rest = up.slice(1, 4);
  el.innerHTML = `<div class="row"><span class="pill ${n.impact === "High" ? "danger" : "soon"}">USD · ${esc(n.impact)}</span><span class="mute num">${t("nw_at", {t: TKW.format(new Date(n.t))})}</span></div>
    <div class="ttl">${esc(n.title)}</div><div class="when" id="nwcd">--:--</div><small class="mute" id="nwlbl">${t("nw_left")}</small>
    <div class="alert" id="nwalert" hidden></div>
    ${rest.length ? `<ul>${rest.map(e => `<li><span>${esc(e.title)}</span><b>${TKW.format(new Date(e.t))}</b></li>`).join("")}</ul>` : ""}`;
  el.dataset.t0 = n.t; tickNews(new Date());
}
function tickNews(d){
  const el = $("news"); if(!el || !el.dataset.t0 || !$("nwcd")) return;
  const left = (+el.dataset.t0 - d) / 1000;
  if(left < -300){ renderNews(); return; }
  $("nwcd").textContent = left > 0 ? hms(left) : "0:00";
  const hot = left <= 600;
  el.className = "card gold news" + (hot ? " hot" : "");
  $("nwalert").hidden = !hot; $("nwalert").textContent = left > 0 ? t("nw_hot") : t("nw_now");
}

/* ---- bozor narxlari (pillalar) ---- */
let MK = null;
async function loadMarkets(){
  if(!window.NPS) return;
  try{
    const out = [];
    for(const sym of ["XAUUSD", "NAS100", "ETHUSD", "BTCUSD"]){
      // oxirgi soatlik narx va 24 soat oldingi narx bilan farq (kunlik sham hali yopilmagan bo'lishi mumkin)
      const h = await NPS.fetchBars(sym, "1HOUR", 60), a = h[h.length - 1];
      const ref = h.filter(b => b.t <= a.t - 24 * H).pop() || h[0];
      out.push({sym, p: a.c, ch: (a.c / ref.c - 1) * 100});
    }
    MK = out; renderMarkets();
  }catch(e){}
}
function renderMarkets(){
  const el = $("mk"); if(!el) return;
  const names = {XAUUSD: "XAU", NAS100: "NAS100", ETHUSD: "ETH", BTCUSD: "BTC"};
  el.innerHTML = (MK || ["XAUUSD","NAS100","ETHUSD","BTCUSD"].map(sym => ({sym}))).map(m =>
    `<div><small>${names[m.sym]}</small><b>${m.p != null ? px(m.sym, m.p) : "…"}</b>${m.ch != null ? `<i class="${m.ch >= 0 ? "buy" : "sell"}">${m.ch >= 0 ? "+" : ""}${m.ch.toFixed(2)}%</i>` : ""}</div>`).join("");
}

/* ---- jonli signallar (engine.js) ---- */
let LIVE = null, loading = false, lastErr = null;
async function getLive(){
  const N = window.NPS;
  const xh = N.closedOnly(await N.fetchPages("XAUUSD", "1HOUR", 2), H);
  const nh = await N.fetchPages("NAS100", "1HOUR", 3), nm = N.closedOnly(await N.fetchPages("NAS100", "30MIN", 2), 1800000);
  const eh = N.closedOnly(await N.fetchPages("ETHUSD", "1HOUR", 3), H);
  const chan = (b, n) => { const s = b.slice(-n); return {hi: Math.max(...s.map(x => x.h)), lo: Math.min(...s.map(x => x.l))}; };
  const trendNow = (map, tt) => map.get(N.tday(tt)) || 0;
  const nmap = N.d1TrendMap(nh), emap = N.d1TrendMap(eh);
  const mk = (id, sym, name, tf, bars, trades, nIn, nOut, trend) => ({id, sym, name, tf, bars, trades, last: bars[bars.length - 1], ch: chan(bars, nIn), xch: chan(bars, nOut), nIn, xn: nOut, trend});
  return [
    mk("eth", "ETHUSD", "Donchian-55 + trend", "H1", eh, N.donchianScan("ETHUSD", eh, emap, 55), 55, 27, trendNow(emap, eh[eh.length - 1].t)),
    mk("nas", "NAS100", "Donchian-20 + trend", "M30", nm, N.donchianScan("NAS100", nm, nmap, 20), 20, 10, trendNow(nmap, nm[nm.length - 1].t)),
    mk("turtle", "XAUUSD", "Turtle", "H1", xh, N.turtleScan(xh, {tpR: 4}), 20, 10, 0)
  ];
}
async function refresh(){
  if(loading) return;
  if(!window.NPS){ lastErr = t("sg_noeng"); renderSignals(); return; }
  loading = true; lastErr = null; renderSignals();
  try{ LIVE = await getLive(); LIVE.at = Date.now(); }catch(e){ lastErr = t("sg_err"); }
  loading = false; renderSignals(); renderChart(); renderCrypto();
  loadMarkets();
}
const side = d => d === 1 ? '<span class="buy">BUY</span>' : '<span class="sell">SELL</span>';
const rTxt = r => `<span class="${r >= 0 ? "buy" : "sell"}">${r >= 0 ? "+" : ""}${r.toFixed(2)}R</span>`;
const tfMs = tf => tf === "H1" ? H : tf === "M30" ? 1800000 : 900000;

function card(S){
  const tr = S.trades, cur = tr.length ? tr[tr.length - 1] : null, sym = S.sym;
  const title = `<h3>${sym} · ${S.name}<small>${S.tf} · ${t("sg_by")} ${tkStr(S.last.t + tfMs(S.tf))}</small></h3>`;
  let pill, body = "", acts = "";
  const btns = (sl, dir, ent, slAbs, tp) => `<div class="acts"><button type="button" class="btn sm" data-lot="${sym}|${sl.toFixed(2)}">${t("sg_lot")}</button>
    <button type="button" class="btn sm pri" data-took="${S.id}|${sym}|${dir}|${ent}|${slAbs}|${tp || ""}">${t("sg_took")}</button></div>`;
  if(cur && cur.status === "open"){
    const fl = (S.last.c - cur.entry) * cur.dir / cur.R;
    pill = `<span class="pill ${cur.dir === 1 ? "on" : "danger"}">${t("sg_open")} ${cur.dir === 1 ? "BUY" : "SELL"}</span>`;
    body = `<div class="kv"><span>${t("sg_entry")}</span><b>${px(sym, cur.entry)}</b>
      <span>SL</span><b>${px(sym, cur.sl)} <small class="mute">(${fmt(cur.R, 1)} p)</small></b>
      ${cur.tp ? `<span>TP</span><b>${px(sym, cur.tp)}</b>` : ""}
      ${cur.exitLevel != null ? `<span>${t("sg_exitlv", {n: S.xn})}</span><b>${px(sym, cur.exitLevel)}</b>` : ""}
      <span>${t("sg_now")}</span><b>${px(sym, S.last.c)} · ${rTxt(fl)}</b></div>
      <small class="num mute">${t("sg_signal")} ${tkStr(cur.sigT)}</small>`;
    acts = btns(cur.R, cur.dir, cur.entry, cur.sl, cur.tp);
  } else if(cur && cur.status === "pending"){
    pill = `<span class="pill soon">${t("sg_new")}</span>`;
    const R = Math.abs(cur.ref - cur.sl);
    body = `<div class="kv"><span>${t("sg_dir")}</span><b>${side(cur.dir)}</b><span>${t("sg_ref")}</span><b>${px(sym, cur.ref)}</b>
      <span>SL</span><b>${px(sym, cur.sl)} <small class="mute">(${fmt(R, 1)} p)</small></b></div><small class="mute">${t("sg_pend")}</small>`;
    acts = btns(R, cur.dir, cur.ref, cur.sl, S.id === "turtle" ? cur.ref + cur.dir * 4 * R : null);
  } else {
    pill = `<span class="pill off">${t("sg_wait")}</span>`;
    const okB = S.trend !== -1 || S.id === "turtle", okS = S.trend !== 1 || S.id === "turtle", lines = [];
    if(okB) lines.push(t("sg_buy", {p: `<b>${px(sym, S.ch.hi)}</b>`}));
    if(okS) lines.push(t("sg_sell", {p: `<b>${px(sym, S.ch.lo)}</b>`}));
    if(S.id !== "turtle") lines.push(t("sg_trend", {d: S.trend === 1 ? '<span class="buy">' + t("up") + "</span>" : S.trend === -1 ? '<span class="sell">' + t("down") + "</span>" : t("flat")}));
    body = `<div class="lv">${lines.join("<br>")}</div><small class="num mute">${t("sg_now")}: ${px(sym, S.last.c)}</small>`;
  }
  return `<div class="card gold scard"><div class="hd">${title}${pill}</div>${body}${acts}</div>`;
}
function wireCardButtons(root){
  root.querySelectorAll("[data-lot]").forEach(b => b.onclick = () => {
    const [sym, sl] = b.dataset.lot.split("|"); $("sym").value = sym; $("slp").value = sl; calc(); location.hash = "#lot"; });
  root.querySelectorAll("[data-took]").forEach(b => b.onclick = () => {
    const [id, sym, dir, ent, sl, tp] = b.dataset.took.split("|");
    $("jsym").value = sym; $("jsrc").value = {turtle: "Turtle", nas: "NAS", eth: "ETH"}[id];
    setDir(+dir); $("jent").value = (+ent).toFixed(DIG[sym]); $("jsl").value = (+sl).toFixed(DIG[sym]); $("jtp").value = tp ? (+tp).toFixed(DIG[sym]) : "";
    location.hash = "#jurnal"; setTimeout(() => $("jform").scrollIntoView({behavior: "smooth"}), 50); });
}
function renderSignals(){
  $("st").className = "status" + (lastErr ? " err" : "");
  $("st").textContent = loading ? t("sg_loading") : lastErr ? lastErr : LIVE ? t("sg_upd") + " " + tkStr(LIVE.at) : "";
  $("refresh").disabled = loading;
  if(!LIVE){ if(!loading && lastErr) $("cards").innerHTML = ""; return; }
  $("cards").innerHTML = LIVE.map(card).join(""); wireCardButtons($("cards"));
  const from = Date.now() - 30 * 864e5;
  const closed = LIVE.flatMap(S => S.trades.filter(x => x.status === "closed" && x.sigT >= from).map(x => ({...x, S}))).sort((a, b) => b.sigT - a.sigT);
  const sumR = closed.reduce((a, x) => a + x.rr, 0), wins = closed.filter(x => x.rr > 0).length;
  $("tot").innerHTML = `<div><small>${t("sg_closed")}</small><b>${closed.length}</b></div><div><small>${t("sg_win")}</small><b>${wins} / ${closed.length}</b></div>
    <div><small>${t("sg_tot")}</small><b class="${sumR >= 0 ? "buy" : "sell"}">${sumR >= 0 ? "+" : ""}${sumR.toFixed(2)}R</b></div>`;
  const res = r => ({SL: "r_sl", TP: "r_tp", CHIQISH: "r_exit", VAQT: "r_time"})[r] || "r_exit";
  $("siglist").innerHTML = closed.slice(0, 15).map(x =>
    `<div class="sig"><span class="t">${side(x.dir)} ${x.S.sym} <small>· ${x.S.name} ${x.S.tf}</small></span><span class="r">${rTxt(x.rr)}</span>
     <small class="num">${tkStr(x.sigT)} · ${t("sg_entry")} ${px(x.S.sym, x.entry)} → ${px(x.S.sym, x.exit)} · ${t(res(x.result))}</small></div>`).join("")
    || `<small class="mute">${t("sg_none")}</small>`;
}

/* ---- grafik darajalari (SVG shamlar) ---- */
let chSel = load("chart") || "turtle";
document.querySelectorAll("#chsel button").forEach(b => b.onclick = () => { chSel = b.dataset.c; store("chart", chSel); renderChart(); tvShow(true); });
/* TradingView jonli grafigi (taymfreymlar, chizish asboblari bilan) */
const TV = {turtle: ["VANTAGE:XAUUSD", "60"], nas: ["VANTAGE:NAS100", "30"], eth: ["VANTAGE:ETHUSD", "60"]};
let tvKey = null, tvLoading = false;
function tvShow(force){
  if($("v-grafik").hidden) return;
  const key = chSel + "|" + lang; if(!force && key === tvKey) return;
  if(!window.TradingView){
    if(tvLoading) return; tvLoading = true;
    const sc = document.createElement("script"); sc.src = "https://s3.tradingview.com/tv.js";
    sc.onload = () => { tvLoading = false; tvShow(true); }; sc.onerror = () => { tvLoading = false; $("tv").innerHTML = `<p class="mute" style="padding:16px">${t("sg_err")}</p>`; };
    document.head.appendChild(sc); return;
  }
  tvKey = key; $("tv").innerHTML = "";
  new TradingView.widget({container_id: "tv", autosize: true, symbol: TV[chSel][0], interval: TV[chSel][1], timezone: "Asia/Tashkent",
    theme: "dark", style: "1", locale: lang === "en" ? "en" : "ru", toolbar_bg: "#10131b", enable_publishing: false, allow_symbol_change: true,
    hide_side_toolbar: false, withdateranges: true, save_image: false, backgroundColor: "#0b0d13"});
}
function renderChart(){
  document.querySelectorAll("#chsel button").forEach(b => b.setAttribute("aria-pressed", b.dataset.c === chSel));
  if(!$("chart")) return;
  if(!LIVE){ $("chart").innerHTML = `<p class="mute" style="margin:14px 0 0">${t("ch_wait")}</p>`; $("legend").innerHTML = ""; return; }
  const S = LIVE.find(x => x.id === chSel), sym = S.sym, bars = S.bars.slice(-72);
  // kechagi kun max/min (savdo kuni 17:00 NY)
  const days = new Map(); S.bars.forEach(b => { const k = NPS.tday(b.t); const d = days.get(k) || {h: -1e12, l: 1e12}; d.h = Math.max(d.h, b.h); d.l = Math.min(d.l, b.l); days.set(k, d); });
  const dk = [...days.keys()], pd = days.get(dk[dk.length - 2]) || {};
  const cur = S.trades.length ? S.trades[S.trades.length - 1] : null, open = cur && cur.status === "open" ? cur : null;
  const lv = [
    {k: t("ch_in", {n: S.nIn}), a: S.ch.hi, b: S.ch.lo, c: "#e8b84a"},
    {k: t("ch_out", {n: S.xn}), a: S.xch.hi, b: S.xch.lo, c: "#8b93a7"},
    {k: t("ch_pd"), a: pd.h, b: pd.l, c: "#6aa8ff"}
  ];
  const singles = [{k: t("ch_px"), v: S.last.c, c: "#eef0f5", solid: true}];
  if(open){ singles.push({k: t("ch_ent"), v: open.entry, c: open.dir === 1 ? "#2fd29a" : "#ff5d6c", solid: true}, {k: t("ch_sl"), v: open.sl, c: "#ff5d6c"});
    if(open.tp) singles.push({k: t("ch_tp"), v: open.tp, c: "#2fd29a"}); }
  const W = 600, Hh = 380, padR = 70, padT = 10, padB = 10;
  let hi = Math.max(...bars.map(b => b.h)), lo = Math.min(...bars.map(b => b.l));
  const rng = hi - lo, H0 = hi + rng * 0.5, L0 = lo - rng * 0.5;     // juda uzoq darajalar grafikni siqib yubormasin
  [...lv.flatMap(x => [x.a, x.b]), ...singles.map(x => x.v)].forEach(v => { if(isFinite(v)){ hi = Math.max(hi, Math.min(v, H0)); lo = Math.min(lo, Math.max(v, L0)); } });
  const pad = (hi - lo) * 0.04; hi += pad; lo -= pad;
  const y = v => padT + (hi - Math.max(lo, Math.min(hi, v))) / (hi - lo) * (Hh - padT - padB);
  const cw = (W - padR) / bars.length;
  let svg = `<svg class="chart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="${sym} ${S.tf}">`;
  for(let g = 0; g <= 4; g++){ const v = lo + (hi - lo) * g / 4; svg += `<line x1="0" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" stroke="#1c2230"/>`; }
  bars.forEach((b, i) => { const x = i * cw + cw / 2, up = b.c >= b.o, col = up ? "#2fd29a" : "#ff5d6c";
    svg += `<line x1="${x}" x2="${x}" y1="${y(b.h)}" y2="${y(b.l)}" stroke="${col}" stroke-width="1"/><rect x="${x - cw * 0.34}" y="${Math.min(y(b.o), y(b.c))}" width="${cw * 0.68}" height="${Math.max(1, Math.abs(y(b.o) - y(b.c)))}" fill="${col}" rx="1"/>`; });
  const L = [];
  lv.forEach(x => { L.push({v: x.a, c: x.c}, {v: x.b, c: x.c}); });
  singles.forEach(x => L.push({v: x.v, c: x.c, solid: x.solid}));
  const items = L.filter(x => isFinite(x.v));
  items.forEach(x => { svg += `<line x1="0" x2="${W - padR}" y1="${y(x.v)}" y2="${y(x.v)}" stroke="${x.c}" stroke-width="${x.solid ? 1.4 : 1.2}" ${x.solid ? "" : 'stroke-dasharray="6 5"'} opacity=".95"/>`; });
  // narx yorliqlari bir-birini yopmasligi uchun suriladi
  const lab = items.map(x => ({...x, ly: y(x.v)})).sort((p, q) => p.ly - q.ly);
  for(let i = 1; i < lab.length; i++) if(lab[i].ly - lab[i - 1].ly < 19) lab[i].ly = lab[i - 1].ly + 19;
  const over = lab.length ? lab[lab.length - 1].ly - (Hh - 10) : 0;
  if(over > 0) lab.forEach(x => x.ly -= over);
  lab.forEach(x => { svg += `<rect x="${W - padR + 2}" y="${x.ly - 9}" width="${padR - 4}" height="18" rx="4" fill="${x.c}"/><text x="${W - padR / 2 + 1}" y="${x.ly + 4}" text-anchor="middle" fill="#07080c" font-size="11" font-weight="600" font-family="JetBrains Mono,monospace">${x.v > hi ? "↑" : x.v < lo ? "↓" : ""}${px(sym, x.v)}</text>`; });
  svg += "</svg>";
  $("chart").innerHTML = svg;
  $("legend").innerHTML = lv.map(x => `<div><span><i style="color:${x.c}"></i>${x.k}</span><b>${px(sym, x.a)} / ${px(sym, x.b)}</b></div>`).join("")
    + singles.map(x => `<div><span><i style="color:${x.c};${x.solid ? "border-top-style:solid" : ""}"></i>${x.k}</span><b>${px(sym, x.v)}</b></div>`).join("")
    + `<div><small class="mute">${sym} ${S.tf} · ${t("sg_by")} ${tkStr(S.last.t + tfMs(S.tf))}</small></div>`;
}

/* ---- savdo jurnali (localStorage) ---- */
let J = []; try{ J = JSON.parse(load("journal") || "[]") }catch(e){ J = [] }
const saveJ = () => store("journal", JSON.stringify(J));
let jdir = 1;
function setDir(d){ jdir = d; document.querySelectorAll("#jdir button").forEach(b => b.setAttribute("aria-pressed", +b.dataset.d === d)); }
document.querySelectorAll("#jdir button").forEach(b => b.onclick = () => setDir(+b.dataset.d));
const pl = e => e.exit == null ? null : (e.exit - e.entry) * e.dir * e.lot * VAL[e.sym] / (e.cent ? 100 : 1);
const rOf = e => e.exit == null ? null : (e.exit - e.entry) * e.dir / Math.abs(e.entry - e.sl);
$("jform").onsubmit = ev => {
  ev.preventDefault();
  const e = {id: Date.now(), t: Date.now(), sym: $("jsym").value, src: $("jsrc").value, dir: jdir, entry: +$("jent").value, sl: +$("jsl").value,
    tp: $("jtp").value ? +$("jtp").value : null, lot: +$("jlot").value, cent: $("jcent").value === "1", exit: null};
  if(!(e.entry > 0 && e.sl > 0 && e.lot > 0) || (e.entry - e.sl) * e.dir <= 0){ alertInline(t("jr_bad")); return; }
  J.unshift(e); saveJ(); $("jent").value = ""; $("jsl").value = ""; $("jtp").value = ""; renderJournal();
  $("jlist").scrollIntoView({behavior: "smooth"});
};
function alertInline(msg){
  let w = $("jform").querySelector(".warn"); if(!w){ w = document.createElement("p"); w.className = "warn"; $("jform").appendChild(w); }
  w.textContent = msg; setTimeout(() => w.remove(), 5000);
}
const srcName = s => ({Turtle: "Turtle H1", NAS: "NAS Donchian", ETH: "ETH Donchian", own: t("jr_own")})[s] || s;
const money = (v, cent) => (v >= 0 ? "+" : "−") + "$" + fmt(Math.abs(v));
function renderJournal(){
  if(!$("jlist")) return;
  const closed = J.filter(e => e.exit != null), tot = closed.reduce((a, e) => a + pl(e), 0), w = closed.filter(e => pl(e) > 0).length;
  $("jtot").innerHTML = `<div><small>${t("jr_n")}</small><b>${J.length}</b></div><div><small>${t("jr_win")}</small><b>${w} / ${closed.length}</b></div>
    <div><small>${t("jr_pl")}</small><b class="${tot >= 0 ? "buy" : "sell"}">${money(tot)}</b></div>`;
  $("jlist").innerHTML = J.map(e => {
    const v = pl(e), r = rOf(e);
    const right = e.exit == null ? `<span class="pill soon">${t("jr_open")}</span>` : `<span class="${v >= 0 ? "buy" : "sell"}">${money(v)}<br><small>${r >= 0 ? "+" : ""}${r.toFixed(2)}R</small></span>`;
    return `<div class="jr"><span><b>${side(e.dir)} ${e.sym}</b> <small class="mute">· ${esc(srcName(e.src))} · ${e.lot}${e.cent ? " cent" : ""}</small></span><span class="r">${right}</span>
      <small class="num">${tkStr(e.t)} · ${t("sg_entry")} ${px(e.sym, e.entry)} · SL ${px(e.sym, e.sl)}${e.tp ? " · TP " + px(e.sym, e.tp) : ""}${e.exit != null ? " → " + px(e.sym, e.exit) : ""}</small>
      <div class="acts">${e.exit == null ? `<input type="number" inputmode="decimal" step="any" placeholder="${t("jr_exitp")}" style="flex:1;min-width:120px" data-exin="${e.id}"><button type="button" class="btn sm pri" data-close="${e.id}">${t("jr_close")}</button>` : ""}
      <button type="button" class="btn sm ghost" data-del="${e.id}">${t("jr_del")}</button></div></div>`;
  }).join("") || `<small class="mute">${t("jr_empty")}</small>`;
  $("jlist").querySelectorAll("[data-close]").forEach(b => b.onclick = () => {
    const id = +b.dataset.close, inp = $("jlist").querySelector(`[data-exin="${id}"]`), v = +inp.value;
    if(!(v > 0)){ inp.focus(); return; }
    const e = J.find(x => x.id === id); e.exit = v; e.tx = Date.now(); saveJ(); renderJournal(); });
  $("jlist").querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
    if(b.dataset.armed){ J = J.filter(x => x.id !== +b.dataset.del); saveJ(); renderJournal(); }
    else { b.dataset.armed = "1"; b.textContent = t("jr_delq"); b.classList.remove("ghost"); setTimeout(() => { if(b.isConnected){ delete b.dataset.armed; b.textContent = t("jr_del"); b.classList.add("ghost"); } }, 4000); } });
}
$("jcsv").onclick = () => {
  const rows = [["sana","bozor","manba","yonalish","lot","cent","kirish","SL","TP","chiqish","natija_$","R"]].concat(J.map(e => [tkStr(e.t), e.sym, e.src, e.dir === 1 ? "BUY" : "SELL", e.lot, e.cent ? 1 : 0, e.entry, e.sl, e.tp ?? "", e.exit ?? "", e.exit == null ? "" : pl(e).toFixed(2), e.exit == null ? "" : rOf(e).toFixed(2)]));
  const blob = new Blob([rows.map(r => r.join(",")).join("\n")], {type: "text/csv"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "nps_jurnal.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

/* ---- backtest: yillar jadvali ---- */
const YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
const YR = {"ETH": [null, 32.3, 1.4, -1.5, 11.2, 30.8, -9.4, 23.2, 25.0, 37.2], "NAS": [-17.2, 28.3, -16.0, 20.4, -10.7, 21.5, 18.0, 31.8, -7.5, 24.7], "XAU Turtle": [12.8, -24.8, -14.8, 26.5, -32.8, 16.2, 11.8, -1.4, 24.0, 38.2]};
function renderYears(){
  const c = v => v == null ? `<td class="n mute">—</td>` : `<td class="n ${v >= 0 ? "buy" : "sell"}">${v > 0 ? "+" : ""}${v.toFixed(1)}</td>`;
  $("ytab").innerHTML = `<thead><tr><th></th>${Object.keys(YR).map(k => `<th class="n">${k}</th>`).join("")}</tr></thead><tbody>` +
    YEARS.map((y, i) => `<tr><td class="num">${y}${y === 2026 ? "*" : ""}</td>${Object.values(YR).map(a => c(a[i])).join("")}</tr>`).join("") + "</tbody>";
}

/* ---- kripto ---- */
let KR = null, kLoading = false, kErr = null;
const pct = (a, b) => (a / b - 1) * 100;
const pTxt = v => !isFinite(v) ? "—" : `<span class="${v >= 0 ? "buy" : "sell"}">${v >= 0 ? "+" : ""}${v.toFixed(2)}%</span>`;
function spark(cl){
  if(cl.length < 2) return "";
  const mn = Math.min(...cl), mx = Math.max(...cl), W = 300, Hs = 56, n = cl.length;
  const pts = cl.map((c, i) => `${(i / (n - 1) * W).toFixed(1)},${(Hs - 4 - (c - mn) / (mx - mn || 1) * (Hs - 8)).toFixed(1)}`).join(" ");
  return `<svg class="spark" viewBox="0 0 ${W} ${Hs}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${cl[n - 1] >= cl[0] ? "var(--buy)" : "var(--sell)"}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}
async function loadCrypto(){
  if(kLoading || !window.NPS) return;
  kLoading = true; kErr = null; renderCrypto();
  try{
    const out = [];
    for(const sym of ["BTCUSD", "ETHUSD"]){
      const h = await NPS.fetchBars(sym, "1HOUR", 60), d = await NPS.fetchBars(sym, "1DAY", 40);
      const p = h[h.length - 1].c, l24 = h.slice(-24), dc = d.map(b => b.c);
      out.push({sym, p, c24: pct(p, h[h.length - 25].c), c7: pct(p, dc[dc.length - 8]), c30: pct(p, dc[dc.length - 31]),
        hi: Math.max(...l24.map(b => b.h)), lo: Math.min(...l24.map(b => b.l)), cl: dc.slice(-30)});
    }
    KR = out; KR.at = Date.now();
  }catch(e){ kErr = t("sg_err"); }
  kLoading = false; renderCrypto();
}
function renderCrypto(){
  if(!$("kst")) return;
  $("kst").className = "status" + (kErr ? " err" : "");
  $("kst").textContent = kLoading ? t("sg_loading") : kErr ? kErr : KR ? t("sg_upd") + " " + tkStr(KR.at) : "";
  $("krefresh").disabled = kLoading;
  if(KR) $("kcards").innerHTML = KR.map(c => `<div class="card gold cr">
    <div class="top"><h3 style="margin:0;font:700 15px var(--f-disp)">${c.sym === "BTCUSD" ? "Bitcoin · BTC" : "Ethereum · ETH"}</h3><span class="px">$${px(c.sym, c.p)}</span></div>
    <div class="chg"><div><small>${t("kr_24")}</small><b>${pTxt(c.c24)}</b></div><div><small>${t("kr_7")}</small><b>${pTxt(c.c7)}</b></div><div><small>${t("kr_30")}</small><b>${pTxt(c.c30)}</b></div></div>
    <div class="hl"><span>${t("kr_hi")}: <b>$${px(c.sym, c.hi)}</b></span><span>${t("kr_lo")}: <b>$${px(c.sym, c.lo)}</b></span></div>
    <div><small class="mute">${t("kr_30d")}</small>${spark(c.cl)}</div></div>`).join("");
  const eth = LIVE && LIVE.find(x => x.id === "eth");
  $("kstrat").innerHTML = eth ? card(eth).replace('<div class="card gold scard">', '<div class="scard">') : `<small class="mute">${t("kr_wait")}</small>`;
  wireCardButtons($("kstrat"));
}
$("krefresh").onclick = loadCrypto;

/* ---- lot kalkulyator ---- */
let cent = load("cent") === "1";
function calc(){
  const bal = +$("bal").value, rp = +$("risk").value, sl = +$("slp").value, v = VAL[$("sym").value];
  const plan = bal * rp / 100, exact = (sl > 0 && v > 0) ? plan / (sl * v) : 0, k = cent ? 100 : 1;
  const step = (!cent && $("sym").value === "NAS100") ? 0.1 : 0.01;
  let shown = Math.floor(exact * k / step + 1e-9) * step, warn = "";
  if(shown < step){ shown = step; const minLoss = step / k * sl * v;
    warn = t("lt_warn", {m: step.toFixed(2), loss: fmt(minLoss), pct: (minLoss / bal * 100).toFixed(1)}) + (cent ? "" : t("lt_warn2")); }
  const loss = shown / k * sl * v;
  $("lotOut").textContent = shown.toFixed(2) + (cent ? " cent" : "");
  $("lossOut").textContent = "$" + fmt(loss) + (cent ? ` (${fmt(loss * 100, 0)} USC)` : "");
  $("planOut").textContent = "$" + fmt(plan);
  $("lotWarn").hidden = !warn; $("lotWarn").textContent = warn;
  ["bal", "risk", "slp", "sym"].forEach(x => store(x, $(x).value)); store("cent", cent ? "1" : "0");
  $("accStd").setAttribute("aria-pressed", !cent); $("accCent").setAttribute("aria-pressed", cent);
}
["bal", "risk", "slp", "sym"].forEach(x => { const v = load(x); if(v) $(x).value = v; $(x).addEventListener("input", calc); });
$("accStd").onclick = () => { cent = false; calc(); }; $("accCent").onclick = () => { cent = true; calc(); };

/* ---- ishga tushirish ---- */
$("refresh").onclick = refresh;
setInterval(() => { if(!document.hidden) refresh(); }, 5 * 60000);
setInterval(() => { if(!document.hidden) loadNews(); }, 30 * 60000);
document.addEventListener("visibilitychange", () => { if(!document.hidden && LIVE && Date.now() - LIVE.at > 4 * 60000) refresh(); });
applyLang(); show(); refresh(); loadNews();
if("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
