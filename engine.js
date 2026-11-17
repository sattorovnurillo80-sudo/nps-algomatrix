/* NPS AlgoMatrix — mustaqil dvigatel (1-qism).
   Narxlar: Dukascopy (bepul, JSONP). Strategiyalar botdagi Python kodi bilan bir xil qoidalarda.
   Strategiyalar: XAUUSD Turtle H1, NAS100 Donchian M30, ETHUSD Donchian H1, XAUUSD QISQA M15 (hammasi Python bilan bir xil natija berishi tekshirilgan). */
(function (W) {
  "use strict";
  const H1 = 3600000;
  const INS = { XAUUSD: "XAU/USD", NAS100: "E_NQ-100", ETHUSD: "ETH/USD", BTCUSD: "BTC/USD" };

  // Dukascopy JSONP: [[t, o, h, l, c, v], ...] (yangi -> eski)
  function fetchBars(sym, interval, limit) {
    return new Promise((ok, fail) => {
      const cb = "_nps" + Math.random().toString(36).slice(2);
      const s = document.createElement("script");
      const done = (fn, v) => { delete W[cb]; s.remove(); fn(v); };
      W[cb] = d => done(ok, (d || []).map(r => ({ t: r[0], o: r[1], h: r[2], l: r[3], c: r[4] })).reverse());
      s.onerror = () => done(fail, new Error("narx manbasi javob bermadi"));
      s.src = "https://freeserv.dukascopy.com/2.0/index.php?path=chart%2Fjson3&instrument=" + encodeURIComponent(INS[sym]) +
        "&offer_side=B&interval=" + interval + "&splits=true&stocks=true&limit=" + (limit || 500) +
        "&time_direction=P&timestamp=" + Date.now() + "&jsonp=" + cb;
      document.head.appendChild(s);
      setTimeout(() => { if (W[cb]) done(fail, new Error("vaqt tugadi")); }, 15000);
    });
  }

  // faqat yopilgan shamlar
  const closedOnly = (bars, ms, now) => bars.filter(b => b.t + ms <= (now || Date.now()));

  function atrWilder(h, n) {
    const out = []; let p = NaN; const trs = [];
    for (let i = 0; i < h.length; i++) {
      const b = h[i], tr = i === 0 ? b.h - b.l : Math.max(b.h - b.l, Math.abs(b.h - h[i - 1].c), Math.abs(b.l - h[i - 1].c));
      if (trs.length < n) { trs.push(tr); p = trs.length === n ? trs.reduce((a, x) => a + x, 0) / n : NaN; }
      else p = (p * (n - 1) + tr) / n;
      out.push(p);
    }
    return out;
  }
  const roll = (v, n, fn) => v.map((_, i) => i >= n - 1 ? fn(v.slice(i - n + 1, i + 1)) : NaN);
  const nyWeekday = t => {
    const s = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(new Date(t));
    return { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[s];
  };

  // XAUUSD Turtle H1: kirish 20-sham kanal, chiqish 10-sham kanal, SL 2xATR14, TP 4R (robot qoidasi; botda TP yo'q)
  function turtleScan(h, opt) {
    opt = Object.assign({ nIn: 20, nOut: 10, slAtr: 2, tpR: null, spread: 0 }, opt || {});
    const N = h.length; if (N < 60) return [];
    const hi = h.map(b => b.h), lo = h.map(b => b.l), cl = h.map(b => b.c);
    const A = atrWilder(h, 14);
    const hh = roll(hi, opt.nIn, a => Math.max(...a)), ll = roll(lo, opt.nIn, a => Math.min(...a));
    const xh = roll(hi, opt.nOut, a => Math.max(...a)), xl = roll(lo, opt.nOut, a => Math.min(...a));
    const trades = []; let i = 60;
    while (i < N) {
      if (nyWeekday(h[i].t) >= 5 || isNaN(hh[i - 1]) || isNaN(A[i])) { i++; continue; }
      const d = cl[i] > hh[i - 1] ? 1 : cl[i] < ll[i - 1] ? -1 : 0;
      if (!d) { i++; continue; }
      const sl = cl[i] - d * opt.slAtr * A[i];
      const tr = { dir: d, sigT: h[i].t + H1, ref: cl[i], sl, atr: A[i], chan: d === 1 ? hh[i - 1] : ll[i - 1] };
      if (i + 1 >= N) { tr.status = "pending"; trades.push(tr); break; }
      const e = h[i + 1].o + d * opt.spread, R = (e - sl) * d;
      if (R <= 0) { i++; continue; }
      const tp = opt.tpR ? e + d * opt.tpR * R : null;
      Object.assign(tr, { entry: e, entryT: h[i + 1].t, R, tp, status: "open" });
      let ex = null;
      for (let k = i + 1; k < N; k++) {
        const b = h[k];
        if (k > i + 1) {
          const j = k - 1;
          if ((d === 1 && cl[j] < xl[j - 1]) || (d === -1 && cl[j] > xh[j - 1])) { ex = [k, b.o, "CHIQISH"]; break; }
        }
        if (d === 1 ? b.l <= sl : b.h >= sl) { ex = [k, sl, "SL"]; break; }
        if (tp !== null && (d === 1 ? b.h >= tp : b.l <= tp)) { ex = [k, tp, "TP"]; break; }
      }
      if (ex) {
        const [k, px, why] = ex, pts = (px - e) * d;
        Object.assign(tr, { status: "closed", exitT: h[k].t, exit: px, result: why, pts, rr: pts / R });
        trades.push(tr); i = k + 1;
      } else {
        tr.exitLevel = d === 1 ? xl[N - 1] : xh[N - 1];
        trades.push(tr); break;
      }
    }
    return trades;
  }

  async function goldTurtle(opt) {
    const h = closedOnly(await fetchBars("XAUUSD", "1HOUR", 500), H1);
    const trades = turtleScan(h, opt);
    const last = h[h.length - 1];
    const hi = h.slice(-20).map(b => b.h), lo = h.slice(-20).map(b => b.l);
    return { trades, levels: { buyAbove: Math.max(...hi), sellBelow: Math.min(...lo), close: last.c, asOf: last.t + H1 } };
  }


  // ---- Donchian + kunlik trend (NAS100 M30 n=20, ETHUSD H1 n=55) ----
  const SPREAD = { XAUUSD: 0.4, NAS100: 1.8, ETHUSD: 3.0 };
  async function fetchPages(sym, interval, pages) {
    let all = [], ts = Date.now();
    for (let p = 0; p < pages; p++) {
      const b = await new Promise((ok, fail) => {
        const cb = "_nps" + Math.random().toString(36).slice(2), s = document.createElement("script");
        W[cb] = d => { delete W[cb]; s.remove(); ok((d || []).map(r => ({ t: r[0], o: r[1], h: r[2], l: r[3], c: r[4] }))); };
        s.onerror = () => { delete W[cb]; s.remove(); fail(new Error("narx manbasi javob bermadi")); };
        s.src = "https://freeserv.dukascopy.com/2.0/index.php?path=chart%2Fjson3&instrument=" + encodeURIComponent(INS[sym]) +
          "&offer_side=B&interval=" + interval + "&splits=true&stocks=true&limit=500&time_direction=P&timestamp=" + ts + "&jsonp=" + cb;
        document.head.appendChild(s);
      });
      if (!b.length) break;
      all = all.concat(b); ts = b[b.length - 1].t - 1;
    }
    const m = new Map(); all.forEach(b => m.set(b.t, b));
    return [...m.values()].sort((a, b) => a.t - b.t);
  }
  const fmtNY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
  const tday = t => fmtNY.format(new Date(t - 17 * 3600000));      // savdo kuni 17:00 NY da almashadi
  const emaArr = (x, n) => { const k = 2 / (n + 1); const o = []; x.forEach((v, i) => o.push(i ? o[i - 1] + k * (v - o[i - 1]) : v)); return o; };
  function d1TrendMap(h1) {                      // kun -> oldingi kun yopilishi vs kunlik EMA20
    const days = [], close = new Map();
    h1.forEach(b => { const k = tday(b.t); if (!close.has(k)) days.push(k); close.set(k, b.c); });
    const c = days.map(k => close.get(k)), e = emaArr(c, 20), tr = new Map();
    days.forEach((k, i) => tr.set(k, i ? Math.sign(c[i - 1] - e[i - 1]) : 0));
    return tr;
  }
  function atrEwm(h, n) { const o = []; h.forEach((b, i) => { const pc = i ? h[i - 1].c : b.c; const tr = Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc)); o.push(i ? o[i - 1] + (tr - o[i - 1]) / n : tr); }); return o; }
  function donchianScan(sym, bars, trendMap, n, opt) {
    opt = Object.assign({ tpR: null }, opt || {});
    const sp = SPREAD[sym], N = bars.length, m = Math.floor(n / 2);
    const A = atrEwm(bars, 14), hi = bars.map(b => b.h), lo = bars.map(b => b.l), cl = bars.map(b => b.c), op = bars.map(b => b.o);
    const mx = (a, i, k) => Math.max(...a.slice(i - k, i)), mn = (a, i, k) => Math.min(...a.slice(i - k, i));
    const trades = []; let i = n + 1;
    while (i < N) {
      const D1 = trendMap.get(tday(bars[i].t)) || 0;
      if (nyWeekday(bars[i].t) >= 5) { i++; continue; }
      let d = cl[i] > mx(hi, i, n) ? 1 : cl[i] < mn(lo, i, n) ? -1 : 0;
      if (d !== D1) d = 0;
      if (!d) { i++; continue; }
      const s = cl[i] - d * 2 * A[i];
      const tr = { sym, dir: d, sigT: bars[i].t + (bars[1].t - bars[0].t), ref: cl[i], sl: s };
      if (i + 1 >= N) { tr.status = "pending"; trades.push(tr); break; }
      const e = i + 1, ent = op[e] + (d === 1 ? sp * 1.2 : 0), R = d === 1 ? ent - s : s - ent - sp;
      if (!(R > Math.max(0.25 * A[i], 4 * sp))) { i++; continue; }
      const tp = opt.tpR ? ent + d * opt.tpR * R : null;
      Object.assign(tr, { entry: ent, R, tp, status: "open" });
      let ex = null;
      for (let k = e; k < N; k++) {
        if (k > e) { const j = k - 1; if (d === 1 ? cl[j] < mn(lo, j, m) : cl[j] > mx(hi, j, m)) { ex = [k, d === 1 ? op[k] : op[k] + sp, "CHIQISH"]; break; } }
        if (d === 1 ? lo[k] <= s : hi[k] + sp >= s) { ex = [k, d === 1 ? Math.min(op[k], s) : Math.max(op[k] + sp, s), "SL"]; break; }
        if (tp !== null && (d === 1 ? hi[k] >= tp : lo[k] + sp <= tp)) { ex = [k, tp, "TP"]; break; }
      }
      if (ex) { const [k, px, why] = ex; Object.assign(tr, { status: "closed", exit: px, result: why, rr: (px - ent) * d / R }); trades.push(tr); i = k + 1; }
      else { tr.exitLevel = d === 1 ? mn(lo, N, m) : mx(hi, N, m); trades.push(tr); break; }
    }
    return trades;
  }
  async function nasDonchian() {
    const h1 = await fetchPages("NAS100", "1HOUR", 3), m30 = closedOnly(await fetchPages("NAS100", "30MIN", 2), 1800000);
    return donchianScan("NAS100", m30, d1TrendMap(h1), 20);
  }
  async function ethDonchian() {
    const h1 = closedOnly(await fetchPages("ETHUSD", "1HOUR", 3), H1);
    return donchianScan("ETHUSD", h1, d1TrendMap(h1), 55);
  }

  // ---- QISQA: XAUUSD M15 kechagi max/min yorilishi (PDBREAK1), TP 1R, kuniga 1 savdo ----
  const fmtNYhm = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const nyHM = t => { const p = fmtNYhm.formatToParts(new Date(t)); const g = k => +p.find(x => x.type === k).value; return g("hour") * 100 + g("minute"); };
  function qisqaScan(bars, opt) {
    opt = Object.assign({ tpR: 1.0, win: [200, 1200], endHM: 1645, maxBars: 400, slAtr: 1.5 }, opt || {});
    const sym = "XAUUSD", sp = SPREAD[sym], SLIP = 0.2, N = bars.length;
    const o = bars.map(b => b.o), hi = bars.map(b => b.h), lo = bars.map(b => b.l), cl = bars.map(b => b.c);
    const A = atrEwm(bars, 14), hm = bars.map(b => nyHM(b.t)), td = bars.map(b => tday(b.t)), wd = bars.map(b => nyWeekday(b.t));
    // kunlik: yopilish, max, min (savdo kuni 17:00 NY)
    const days = [], dc = new Map(), dh = new Map(), dl = new Map();
    bars.forEach((b, i) => { const k = td[i]; if (!dc.has(k)) { days.push(k); dh.set(k, b.h); dl.set(k, b.l); } dc.set(k, b.c); dh.set(k, Math.max(dh.get(k), b.h)); dl.set(k, Math.min(dl.get(k), b.l)); });
    const c = days.map(k => dc.get(k)), e = emaArr(c, 20), D1 = new Map(), PDH = new Map(), PDL = new Map();
    days.forEach((k, i) => { D1.set(k, i ? Math.sign(c[i - 1] - e[i - 1]) : 0); PDH.set(k, i ? dh.get(days[i - 1]) : NaN); PDL.set(k, i ? dl.get(days[i - 1]) : NaN); });
    const trades = []; let busy = -1, lastDay = null;
    for (let i = 1; i < N; i++) {
      const k = td[i], ph = PDH.get(k), pl = PDL.get(k), tr = D1.get(k);
      if (!(hm[i] >= opt.win[0] && hm[i] < opt.win[1])) continue;
      let d = (cl[i] > ph && cl[i - 1] <= ph && tr === 1) ? 1 : (cl[i] < pl && cl[i - 1] >= pl && tr === -1) ? -1 : 0;
      if (!d || wd[i] >= 5 || i <= busy || k === lastDay) continue;
      const s = cl[i] - d * opt.slAtr * A[i];
      const tr0 = { sym, dir: d, sigT: bars[i].t + 900000, ref: cl[i], sl: s };
      if (i + 1 >= N) { tr0.status = "pending"; trades.push(tr0); break; }
      const en = i + 1, ent = o[en] + (d === 1 ? sp * (1 + SLIP) : 0), R = d === 1 ? ent - s : s - ent - sp;
      if (!(R > Math.max(0.25 * A[i], 4 * sp))) continue;
      const tp = ent + d * opt.tpR * R, j = Math.min(N, en + opt.maxBars);
      Object.assign(tr0, { entry: ent, entryT: bars[en].t, R, tp, status: "open" });
      let ksl = null, ktp = null, kx = null;
      for (let q = en; q < j; q++) {
        if (ksl === null && (d === 1 ? lo[q] <= s : hi[q] + sp >= s)) ksl = q;
        if (ktp === null && (d === 1 ? hi[q] >= tp : lo[q] + sp <= tp)) ktp = q;
        if (kx === null && q > en && (hm[q] >= opt.endHM || td[q] !== td[en])) kx = q;
      }
      if (kx === null && j - en >= opt.maxBars && j < N) kx = j;
      const ev = [];
      if (kx !== null) ev.push([kx, 2, 0]); if (ksl !== null) ev.push([ksl, 0, 1]); if (ktp !== null) ev.push([ktp, 1, 2]);
      if (!ev.length) { trades.push(tr0); break; }
      ev.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
      const [q, typ] = ev[0];
      let px;
      if (typ === 2) px = d === 1 ? o[q] : o[q] + sp;
      else if (typ === 0) { px = s; if (d === 1 && o[q] < s) px = o[q]; if (d === -1 && o[q] + sp > s) px = o[q] + sp; }
      else px = tp;
      Object.assign(tr0, { status: "closed", exitT: bars[q].t, exit: px, result: ["SL", "TP", "VAQT"][typ], rr: (px - ent) * d / R });
      trades.push(tr0); busy = q; lastDay = k;
    }
    return trades;
  }
  async function goldQisqa() {
    return qisqaScan(closedOnly(await fetchPages("XAUUSD", "15MIN", 10), 900000));
  }

  W.NPS = { fetchBars, fetchPages, closedOnly, atrWilder, turtleScan, goldTurtle, donchianScan, d1TrendMap, nasDonchian, ethDonchian, qisqaScan, goldQisqa, tday, nyWeekday, nyHM, INS };
})(window);
