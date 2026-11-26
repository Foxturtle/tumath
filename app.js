'use strict';
// 연산 연습 — 덧셈·뺄셈·곱셈·구구단 손글씨 학습지 (자동 채점 + 부모 확인, 틀린 문제 다시 풀기)
// 누가 써도(IT에 익숙하지 않은 어르신도) 도움 없이 쓸 수 있게: 처음 안내, 화면별 도움말, 자동 업데이트·복구

const VERSION = '2026.11.26-b';   // 부모님 메뉴에 표시 — 기기가 최신 버전인지 확인용
const N = 10000;          // 획 좌표 정규화 단위 (카드 크기 대비)
const LW = 4;             // 펜 굵기(px)
const INK = '#1d3c8f';
const app = document.getElementById('app');
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
const kid = () => esc(S.name || '');

// ---------- 저장 ----------
const KEY = 'tumath.v1';
const S = load();
function load() {
  const d = { name: '', pin: null, onboarded: false, helpSeen: {}, allowTouch: false, timer: false, rotate: false, current: null, last: null, retry: [], history: [] };
  let s = d;
  try { s = Object.assign(d, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { s = d; }
  if (!Array.isArray(s.retry)) s.retry = [];
  if (!Array.isArray(s.history)) s.history = [];
  if (!s.helpSeen || typeof s.helpSeen !== 'object') s.helpSeen = {};
  if (s.current && !(Array.isArray(s.current.pages) && s.current.pages.length)) s.current = null;   // 깨진 학습지는 버림
  if (!s.onboarded && (s.pin || s.history.length)) s.onboarded = true;                            // 이미 쓰던 사람은 안내 건너뜀
  return s;
}
// 결과 화면용 사본(last)은 손글씨가 커서 저장하지 않음 (결과는 채점 직후에만 보여 줌)
let saveTimer = 0, saveFailNotified = false;
function save() {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(KEY, JSON.stringify(S, (k, v) => (k === 'last' ? undefined : v)));
  } catch (e) {
    console.warn('save failed', e);
    if (!saveFailNotified) {
      saveFailNotified = true;
      modal('<h3>저장 공간이 부족해요</h3><p>풀던 내용을 저장하지 못했어요.<br>다음부터는 <b>문제 수를 줄여서</b> 풀어 주세요.</p>', [{ label: '알겠어요', value: true, primary: true }]);
    }
  }
}
// 브라우저가 저장 공간을 정리할 때 이 앱 기록은 지우지 않도록 요청 (지원하는 기기에서만, 조용히)
if (navigator.storage && navigator.storage.persist) navigator.storage.persisted().then(p => p || navigator.storage.persist()).catch(() => {});
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); }
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { timerStop(); save(); }
  else if (curScreen === 'sheet') timerStart();
});

// ---------- 화면 방향 (기본 세로 고정, 부모님 메뉴에서 회전 허용) ----------
// 설치한 앱(전체 화면)에서만 동작하고, 브라우저 탭에서는 조용히 무시됨
function applyOrientation() {
  const o = screen.orientation;
  if (o && o.lock) o.lock(S.rotate ? 'any' : 'portrait').catch(() => {});
}

// ---------- 풀이 시간 (학습지 화면이 보이는 동안만 잼) ----------
let curScreen = '', tickStart = 0;
function timerStart() {
  if (!tickStart && S.current && S.current.status === 'solving' && !document.hidden) tickStart = Date.now();
}
function timerStop() {
  if (!tickStart) return;
  if (S.current) { S.current.elapsed = (S.current.elapsed || 0) + Date.now() - tickStart; saveSoon(); }
  tickStart = 0;
}
function setScreen(name) {
  curScreen = name;
  if (name === 'sheet') timerStart(); else timerStop();
  if (name === 'intro' || name === 'home') setTimeout(applyUpdateIfIdle);   // 새 버전이 받아져 있으면 이때 적용
}
const fmtTime = ms => {
  const s = Math.round(ms / 1000), m = Math.floor(s / 60);
  return m ? `${m}분 ${s % 60}초` : `${s}초`;
};

// ---------- 문제 생성 ----------
const rnd = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const SYM = { '+': '+', '-': '−', '×': '×' };
const BOXES = { '+': 3, '-': 2, '×': 2 };                // 칸 수 정보가 없는 옛 문제용
const answer = p => p.op === '+' ? p.a + p.b : p.op === '-' ? p.a - p.b : p.a * p.b;
const keyOf = p => `${p.a}${p.op}${p.b}`;
const boxesOf = p => p.n || BOXES[p.op];
const isGu = p => p.op === '×' && p.a <= 9 && p.b <= 10;   // 구구단 문제 (새 곱셈은 두 자리 이상)

// 예시 학습지 비율 (세로셈 v 10문제 / 가로셈 h 10문제)
//   덧셈: 받아올림 없음 3, 받아올림 7, 세 자리 답 10 (일의 자리 올림 포함 7, 십의 자리만 3)
//   뺄셈: 받아내림 없음 6, 받아내림 14
const RATIO = {
  '+': { v: { none: 2, carry: 5, both: 2, hund: 1 }, h: { none: 1, carry: 2, both: 5, hund: 2 } },
  '-': { v: { none: 5, borrow: 5 }, h: { none: 1, borrow: 9 } },
};

const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));

// ---------- 자릿수별 문제 (덧셈 · 뺄셈 · 곱셈) ----------
// 종류는 '2+1'(2자리+1자리), '3-2', '2x2'처럼 씀
const digitsOf = t => t.split(/[+\-x]/).map(Number);
// d자리 수. 더하는 수·빼는 수·곱하는 수는 일의 자리가 0이 아니게 (지금 학습지와 같은 규칙)
function num(d, onesNonZero = true) {
  if (d === 1) return rnd(1, 9);
  let x = rnd(1, 9);
  for (let i = 1; i < d; i++) x = x * 10 + (i === d - 1 && onesNonZero ? rnd(1, 9) : rnd(0, 9));
  return x;
}
function carryCount(a, b) {                        // 덧셈 받아올림 횟수
  let c = 0, n = 0;
  while (a || b || c) {
    c = a % 10 + b % 10 + c >= 10 ? 1 : 0;
    n += c; a = Math.floor(a / 10); b = Math.floor(b / 10);
  }
  return n;
}
function borrowInfo(a, b) {                        // 뺄셈 받아내림 횟수, 0을 건너뛰는 받아내림(403−127) 여부
  let br = 0, n = 0, zero = false;
  while (a || b) {
    const da = a % 10, db = b % 10;
    if (da - br < db) { if (da === 0 && br) zero = true; br = 1; n++; } else br = 0;
    a = Math.floor(a / 10); b = Math.floor(b / 10);
  }
  return { n, zero };
}
const mulCarry = (a, b) => [...String(a)].some(x => [...String(b)].some(y => x * y >= 10));

// 문제 유형 분류. 2자리+2자리, 2자리−2자리는 지금까지 쓰던 유형을 그대로 씀
function classify(op, type, a, b) {
  if (op === '+') {
    if (type === '2+2') {
      const ones = a % 10 + b % 10 >= 10, big = a + b >= 100;
      return big ? (ones ? 'both' : 'hund') : (ones ? 'carry' : 'none');
    }
    const c = carryCount(a, b);
    return c === 0 ? 'none' : c === 1 ? 'one' : 'multi';
  }
  if (op === '-') {
    if (type === '2-2') return a % 10 < b % 10 ? 'borrow' : 'none';
    const { n, zero } = borrowInfo(a, b);
    return n === 0 ? 'none' : zero ? 'zero' : n === 1 ? 'one' : 'multi';
  }
  return mulCarry(a, b) ? 'carry' : 'none';
}
// 20문제당 유형 개수. 2자리+2자리·2자리−2자리는 예시 학습지 비율(세로셈 v / 가로셈 h)을 그대로 씀.
// 나머지는 올림 없음 15% · 1번 45% · 2번 이상 40%를 기본으로, 그 자릿수에서 드문 유형은 줄임
const MIX = {
  '1+1': { none: 3, one: 17 },
  '2+1': { none: 3, one: 15, multi: 2 },
  '3+1': { none: 3, one: 13, multi: 4 },
  '3+2': { none: 3, one: 9, multi: 8 },
  '3+3': { none: 3, one: 9, multi: 8 },
  '1-1': { none: 20 },                             // 1자리 뺄셈은 받아내림이 생길 수 없음
  '2-1': { none: 6, one: 14 },
  '3-1': { none: 6, one: 12, zero: 2 },
  '3-2': { none: 6, one: 7, multi: 5, zero: 2 },
  '3-3': { none: 6, one: 7, multi: 5, zero: 2 },
  '×': { none: 3, carry: 17 },
};
const NO_CARRY = { none: 20 };
const BIG_MUL = t => t === '2x2' || t === '3x2';   // 중간 계산을 쓰는 큰 세로셈 카드

function genOne(op, type, cat) {
  const [da, db] = digitsOf(type);
  for (let t = 0; t < 30000; t++) {
    let a, b;
    if (op === '+') { a = num(da); b = num(db); }
    else if (op === '-') { a = num(da, false); b = num(db); if (a <= b) continue; }
    else { a = num(da); b = db === 1 ? rnd(2, 9) : num(db); }
    if (classify(op, type, a, b) === cat) return [a, b];
  }
  return op === '-' ? [10 ** da - 1, 10 ** (db - 1)] : [num(da), num(db)];   // 사실상 오지 않음 (안전장치)
}
const blocks = (ratio, count) => {                 // 비율표를 20문제 묶음으로 섞어서 count개
  const out = [];
  while (out.length < count) out.push(...shuffle(Object.entries(ratio).flatMap(([k, m]) => Array(m).fill(k))));
  return out.slice(0, count);
};
const boxCount = (op, type) => { const [da, db] = digitsOf(type); return op === '+' ? Math.max(da, db) + 1 : op === '-' ? da : da + db; };

// op 문제 n개. types 여러 개면 고르게 나눔. carryOn=false면 받아올림/받아내림/올림 없는 문제만.
// 같은 문제는 되도록 안 나오게 (1자리+1자리처럼 문제 수가 적으면 다 낸 뒤에는 겹칠 수 있음)
function makeOp(op, types, n, carryOn = true) {
  const counts = types.map(() => Math.floor(n / types.length));
  shuffle([...types.keys()]).slice(0, n % types.length).forEach(i => counts[i]++);
  const seen = new Set(), v = [], h = [], big = [];
  const make = (type, cat, fmt) => {
    let p;
    for (let t = 0; t < 80; t++) { p = genOne(op, type, cat); if (!seen.has(p.join())) break; }
    seen.add(p.join());
    return { op, a: p[0], b: p[1], fmt, n: boxCount(op, type), t: type };
  };
  types.forEach((type, i) => {
    const m = counts[i];
    if (!m) return;
    if (op === '×' && BIG_MUL(type)) {
      blocks(carryOn ? MIX['×'] : NO_CARRY, m).forEach(cat => big.push(make(type, cat, 'vm')));
      return;
    }
    const nv = Math.ceil(m / 2), nh = m - nv;
    if (carryOn && (type === '2+2' || type === '2-2')) {
      blocks(RATIO[op].v, nv).forEach(cat => v.push(make(type, cat, 'v')));
      blocks(RATIO[op].h, nh).forEach(cat => h.push(make(type, cat, 'h')));
      return;
    }
    const ratio = !carryOn ? NO_CARRY : op === '×' ? MIX['×'] : MIX[type];
    blocks(ratio, m).forEach((cat, j) => (j < nv ? v : h).push(make(type, cat, j < nv ? 'v' : 'h')));
  });
  shuffle(v); shuffle(h); shuffle(big);
  // 한 화면 = 학습지 한 줄 (세로셈 2 + 가로셈 2), 큰 곱셈은 한 화면에 2문제
  const pages = [];
  while (v.length || h.length) pages.push([...v.splice(0, 2), ...h.splice(0, 2)]);
  return pages.concat(chunk(big, 2));
}
// 예전 방식 이름 (2자리 덧셈·뺄셈) — 시험 도구 등에서 사용
const makeArith = (op, n = 20) => makeOp(op, [op === '+' ? '2+2' : '2-2'], n, true);

// 설정 창 미리보기용 예시 문제 하나
function sampleProblem(op, types, carryOn) {
  const type = types[rnd(0, types.length - 1)];
  const ratio = !carryOn ? NO_CARRY : op === '×' ? MIX['×'] : (type === '2+2' || type === '2-2') ? RATIO[op].v : MIX[type];
  const [a, b] = genOne(op, type, blocks(ratio, 1)[0]);
  return `${a} ${SYM[op]} ${b}`;
}

// ---------- 구구단 ----------
// 고른 단들로 n문제, 한 화면 10문제. 단과 곱하는 수의 모든 조합(단 수 × 10)을 한 바퀴로 보고,
// 바퀴마다 단별로 고르게 나눠 겹치지 않게 뽑음 (한 단만 고르면 바퀴 = 1~10을 섞은 것)
function makeMulMixed(dans, n = 20) {
  const out = [];
  while (out.length < n) {
    const r = Math.min(n - out.length, dans.length * 10);
    const counts = dans.map(() => Math.floor(r / dans.length));
    shuffle([...dans.keys()]).slice(0, r % dans.length).forEach(i => counts[i]++);
    out.push(...shuffle(dans.flatMap((d, i) =>
      shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).slice(0, counts[i]).map(b => ({ op: '×', a: d, b, fmt: 'h', n: 2 })))));
  }
  return chunk(out, 10);
}
// 틀린 문제 다시 풀기: 구구단은 10문제, 큰 곱셈은 2문제, 나머지는 4문제(세로셈 먼저)씩 한 화면
function paginate(probs) {
  const gu = probs.filter(isGu), big = probs.filter(p => p.fmt === 'vm'), rest = probs.filter(p => !isGu(p) && p.fmt !== 'vm');
  return [
    ...chunk(rest, 4).map(pg => pg.sort((x, y) => (x.fmt === 'v' ? 0 : 1) - (y.fmt === 'v' ? 0 : 1))),
    ...chunk(big, 2),
    ...chunk(gu, 10),
  ];
}

// ---------- 학습 세션 ----------
const flat = c => c.pages.flat();
const offset = (c, pg) => c.pages.slice(0, pg).reduce((n, p) => n + p.length, 0);
const layoutOf = pg => pg.every(isGu) ? 'grid-mul' : pg.some(p => p.fmt === 'vm') ? 'grid-big' : 'grid-arith';
const hasInk = (c, k) => (c.ink[k] || []).length > 0;
let tool = 'pen', undoStack = [];

function startSession(title, pages) {
  S.current = { title, pages, ink: {}, page: 0, status: 'solving' };
  undoStack = [];
  save();
  sheet();
}
async function begin(title, pages) {
  if (S.current) {
    const what = S.current.status === 'submitted' ? '채점하지 않은' : '풀던';
    const ok = await modal(`<p>${what} 학습지가 있어요.<br>새로 시작하면 지워져요.</p>`,
      [{ label: '그만두기', value: false }, { label: '새로 시작', value: true, primary: true }]);
    if (!ok) return;
  }
  startSession(title, pages);
}

// ---------- 카드 ----------
// 카드 종류: v 세로셈, vm 큰 세로셈(곱셈 중간 계산 칸), h 가로셈(구구단은 h + mul)
// --n: 답 칸 수 (자릿수가 많을수록 글씨를 작게)
function cardHTML(p, k, withAnswer) {
  const tag = withAnswer ? `<div class="answer-tag">${answer(p)}</div>` : '';
  const n = boxesOf(p), boxes = '<div class="box"></div>'.repeat(n);
  if (p.fmt === 'v' || p.fmt === 'vm') {
    const digits = x => String(x).padStart(n, ' ').split('').map(d => `<span>${d.trim()}</span>`).join('');
    // 큰 곱셈: 곱하는 수의 자릿수만큼 중간 계산 줄 (예: 47×36 → 282, 1410 두 줄)
    const work = p.fmt === 'vm' ? `<div class="work" style="--rows:${String(p.b).length}"></div><div class="rule"></div>` : '';
    return `<div class="card ${p.fmt}" data-k="${k}" style="--n:${n}">
      <div class="vbox"><div class="memo"></div>
        <span></span>${digits(p.a)}<span>${SYM[p.op]}</span>${digits(p.b)}
        <div class="rule"></div>${work}<span></span>${boxes}</div>
      <canvas class="ink"></canvas><div class="mark"></div>${tag}</div>`;
  }
  // 가로셈 글자 폭 어림값(--k)으로 식과 칸이 카드에 들어가게 글씨 크기를 맞춤
  const expr = `${p.a} ${SYM[p.op]} ${p.b} =`;
  const k2 = (expr.replace(/ /g, '').length * .6 + 3 * .28 + n * 1.78 + .5).toFixed(2);
  return `<div class="card h${isGu(p) ? ' mul' : ''}" data-k="${k}" style="--n:${n};--k:${k2}">
    <div class="hline"><span class="expr">${expr}</span>${boxes}</div>
    <canvas class="ink"></canvas><div class="mark"></div>${tag}</div>`;
}

function drawStroke(ctx, s, w, h) {
  const p = s.pts, X = i => p[i] * w / N, Y = i => p[i + 1] * h / N;
  ctx.lineWidth = s.lw * w / N;
  ctx.beginPath();
  ctx.moveTo(X(0), Y(0));
  if (p.length === 2) ctx.lineTo(X(0) + .01, Y(0));
  for (let i = 2; i < p.length - 2; i += 2) ctx.quadraticCurveTo(X(i), Y(i), (X(i) + X(i + 2)) / 2, (Y(i) + Y(i + 2)) / 2);
  if (p.length >= 4) ctx.lineTo(X(p.length - 2), Y(p.length - 2));
  ctx.stroke();
}

// 카드 크기와 답 칸 위치 (칸 위치는 카드 대비 N 단위). 채점 때 글씨를 읽을 영역을 정하는 데 씀
function cardGeo(card) {
  const r = $('canvas', card).getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return {
    w: card.clientWidth, h: card.clientHeight,
    boxes: $$('.box', card).map(b => {
      const q = b.getBoundingClientRect();
      return [q.left - r.left, q.top - r.top, q.right - r.left, q.bottom - r.top]
        .map((v, i) => Math.round(v / (i % 2 ? r.height : r.width) * N));
    }),
  };
}

// 카드 위에 손글씨 캔버스 연결. list()는 이 카드의 획 배열을 돌려줌.
// res(): 캔버스 해상도 배율 (기본은 화면 배율, 축소 페이지는 축소 비율만큼 낮춰 메모리 절약)
function attachInk(card, list, interactive, res) {
  const k = +card.dataset.k, cv = $('canvas', card), ctx = cv.getContext('2d');
  let w = 0, h = 0, dpr = 1, cur = null;
  const pen = () => { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; };
  const redraw = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    pen();
    list().forEach(s => drawStroke(ctx, s, w, h));
  };
  const resize = () => {
    w = card.clientWidth; h = card.clientHeight; dpr = res ? res() : window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    redraw();
  };
  card.redraw = redraw;
  card.resize = resize;
  new ResizeObserver(resize).observe(card);
  if (!interactive) return;

  const pt = ev => {
    const r = cv.getBoundingClientRect();
    return [Math.round((ev.clientX - r.left) / r.width * N), Math.round((ev.clientY - r.top) / r.height * N)];
  };
  const addPt = p => {
    const a = cur.stroke.pts, n = a.length;
    if (n && Math.abs(a[n - 2] - p[0]) + Math.abs(a[n - 1] - p[1]) < 15) return;
    a.push(p[0], p[1]);
    pen();
    ctx.lineWidth = LW;
    ctx.beginPath();
    ctx.moveTo((n ? a[n - 2] : p[0]) * w / N, (n ? a[n - 1] : p[1]) * h / N);
    ctx.lineTo(p[0] * w / N + (n ? 0 : .01), p[1] * h / N);
    ctx.stroke();
  };
  const eraseAt = p => {
    const strokes = list(), R = 16;
    let hit = false;
    for (let i = strokes.length - 1; i >= 0; i--) {
      const q = strokes[i].pts;
      for (let j = 0; j < q.length; j += 2) {
        const dx = (q[j] - p[0]) * w / N, dy = (q[j + 1] - p[1]) * h / N;
        if (dx * dx + dy * dy < R * R) { cur.removed.push(strokes.splice(i, 1)[0]); hit = true; break; }
      }
    }
    if (hit) redraw();
  };
  const move = ev => cur.erase ? eraseAt(pt(ev)) : addPt(pt(ev));

  cv.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch' && !S.allowTouch) return;   // 손바닥/손가락 무시
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    cv.setPointerCapture(e.pointerId);
    // S펜 옆 버튼(2)이나 지우개 끝(32)을 누르고 쓰면 지우개
    const erase = tool === 'eraser' || (e.pointerType === 'pen' && (e.buttons & 34) !== 0);
    cur = { id: e.pointerId, erase, removed: [], stroke: erase ? null : { lw: Math.round(LW / w * N), pts: [] } };
    move(e);
  });
  cv.addEventListener('pointermove', e => {
    if (!cur || e.pointerId !== cur.id) return;
    let evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    if (!evs || !evs.length) evs = [e];
    evs.forEach(move);
  });
  const end = e => {
    if (!cur || e.pointerId !== cur.id) return;
    if (cur.stroke && cur.stroke.pts.length) { list().push(cur.stroke); undoStack.push({ k, add: cur.stroke }); }
    if (cur.removed.length) undoStack.push({ k, removed: cur.removed });
    cur = null;
    redraw();
    saveSoon();
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
}

function undo() {
  const c = S.current, visible = new Set($$('.page .card').map(cd => +cd.dataset.k));
  for (let i = undoStack.length - 1; i >= 0; i--) {
    const u = undoStack[i];
    if (!visible.has(u.k)) continue;
    undoStack.splice(i, 1);
    const list = c.ink[u.k] || (c.ink[u.k] = []);
    if (u.add) { const j = list.indexOf(u.add); if (j >= 0) list.splice(j, 1); }
    else list.push(...u.removed);
    $(`.card[data-k="${u.k}"]`).redraw();
    saveSoon();
    return;
  }
}

// ---------- 화면: 시작 (앱을 열 때마다) ----------
// 통통한 오각 별 (바깥 반지름 88, 안쪽 48)
const STAR = Array.from({ length: 10 }, (_, i) => {
  const r = i % 2 ? 48 : 88, a = (i * 36 - 90) * Math.PI / 180;
  return `${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}`;
}).join(' ');
function intro() {
  setScreen('intro');
  const n = kid(), h = new Date().getHours(), call = n ? `, ${n}` : '';   // 이름이 없으면 이름 없이 인사
  const greet = h < 5 ? `${n ? `${n}, ` : ''}아직 깜깜한 밤이에요 🌙`
    : h < 11 ? `좋은 아침이에요${call}! ☀️`
    : h < 17 ? `안녕${call}! 오늘도 반가워요 👋`
    : h < 21 ? `오늘 하루도 수고했어요${call}! 🌇`
    : `${n ? `${n}, ` : ''}조금만 하고 자요 🌙`;
  const todayKey = new Date().toDateString();
  const today = S.history.filter(x => new Date(x.date).toDateString() === todayKey).length;
  const sub = today ? `오늘 벌써 ${today}장이나 풀었어요!` : '오늘도 같이 해 볼까요?';
  const syms = ['+', '−', '×', '=', '1', '2', '3', '4', '5', '6', '7', '8', '9', '★'];
  const colors = ['#e07b39', '#3a86c8', '#3aa66b', '#f5b301'];
  const floaters = Array.from({ length: 18 }, (_, i) =>
    `<span style="left:${rnd(2, 94)}%;top:${rnd(3, 90)}%;--d:-${(Math.random() * 6).toFixed(2)}s;--c:${colors[i % 4]};font-size:${rnd(28, 64)}px">${syms[rnd(0, syms.length - 1)]}</span>`).join('');
  const badgeText = S.name || '+×';                 // 이름이 없으면 별 안에 연산 기호
  const letters = [...badgeText].map((ch, i) => `<span style="--i:${i}">${esc(ch)}</span>`).join('');
  const len = [...badgeText].length;
  app.innerHTML = `
    <main class="intro">
      <div class="floaters" aria-hidden="true">${floaters}</div>
      <div class="badge" style="--fs:${len <= 2 ? .3 : len === 3 ? .22 : .16}">
        <div class="sway"><svg class="star" viewBox="-100 -100 200 200" aria-hidden="true">
          <defs><linearGradient id="starFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#ffd45c"/><stop offset=".55" stop-color="#f7a531"/><stop offset="1" stop-color="#e98126"/>
          </linearGradient></defs>
          <g transform="translate(0 9)">
            <polygon class="star-shade" points="${STAR}" transform="translate(0 7)"/>
            <polygon class="star-body" points="${STAR}"/>
            <polygon class="star-shine" points="${STAR}" transform="scale(.62) translate(-6 -10)"/>
          </g>
        </svg>
        <div class="letters">${letters}</div></div>
        <i class="spark s1">★</i><i class="spark s2">★</i><i class="spark s3">✦</i>
      </div>
      <h1>${n ? `<b>${n}</b>만을 위한` : '<b>나만의</b>'}<br>연산 연습</h1>
      <p class="greet">${greet}</p>
      <p class="sub">${sub}</p>
      <button class="btn primary big start" data-act="start">시작하기 ▶</button>
      <p class="credit">made by foxturtle</p>
    </main>`;
  app.onclick = e => { if (e.target.closest('[data-act=start]')) (S.onboarded ? home : onboarding)(); };
}

// ---------- 화면: 홈 ----------
function home() {
  setScreen('home');
  const c = S.current;
  let banner = '';
  if (c && c.status === 'solving') banner = `<div class="banner">풀던 학습지가 있어요 · ${c.title}<button class="btn primary" data-act="resume">이어서 풀기</button></div>`;
  if (c && c.status === 'submitted') banner = `<div class="banner">채점을 기다리는 학습지가 있어요 · ${c.title}<button class="btn primary" data-act="grade">부모님 채점하기</button></div>`;
  app.innerHTML = `
    <header class="bar"><div class="title">${kid() ? `<span class="kid">${kid()}</span>의 ` : ''}연산 연습</div>
      ${helpBtn('home')}<button class="icon-btn" data-act="parent" aria-label="부모님 메뉴">⚙️</button></header>
    <main class="home">
      ${banner}
      <div class="choices">
        <button class="choice add" data-act="add"><b>+</b><span>덧셈</span><small>자릿수 골라서</small></button>
        <button class="choice sub" data-act="sub"><b>−</b><span>뺄셈</span><small>자릿수 골라서</small></button>
        <button class="choice mul" data-act="mul"><b>×</b><span>곱셈</span><small>두·세 자리 수</small></button>
        <button class="choice gugu" data-act="gugu"><b><i>9×9</i></b><span>구구단</span><small>2단 ~ 9단</small></button>
        <button class="choice mix" data-act="mix"><b><i>±×</i></b><span>섞어 풀기</span><small>한 번에</small></button>
      </div>
      ${S.retry.length ? `<button class="retry-btn" data-act="retry">틀린 문제 다시 풀기 <span class="count">${S.retry.length}</span></button>` : ''}
    </main>`;
  app.onclick = e => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (KINDS[a]) opDialog(a);
    else if (a === 'gugu') guguDialog();
    else if (a === 'mix') mixDialog();
    else if (a === 'retry') begin('틀린 문제 다시 풀기', paginate(S.retry.slice(0, 200).map(p => ({ ...p }))));
    else if (a === 'resume') sheet();
    else if (a === 'grade') requirePin(grade, home);
    else if (a === 'parent') requirePin(parentMenu, home);
  };
}
// ---------- 시작 전 설정 창 ----------
// 덧셈·뺄셈·곱셈: ① 자릿수(여러 개) ② 받아올림 켜기/끄기 ③ 문제 수 + 예시 문제
// 구구단: ① 단(여러 개) ② 문제 수 / 섞어 풀기: 종류별 문제 수만 (자릿수 등은 각 메뉴의 마지막 설정)
// 마지막 설정을 기억함 (S.setup, 구구단 단은 S.mulDans)
const MAXQ = 200, ALL_DANS = [2, 3, 4, 5, 6, 7, 8, 9];
const KINDS = {
  add: { op: '+', label: '덧셈', types: ['1+1', '2+1', '2+2', '3+1', '3+2', '3+3'], def: ['2+2'], carry: '받아올림' },
  sub: { op: '-', label: '뺄셈', types: ['1-1', '2-1', '2-2', '3-1', '3-2', '3-3'], def: ['2-2'], carry: '받아내림' },
  mul: { op: '×', label: '곱셈', types: ['2x1', '3x1', '2x2', '3x2'], def: ['2x1'], carry: '올림' },
};
const typeLabel = t => {
  const [a, b] = digitsOf(t), o = t.includes('+') ? '+' : t.includes('-') ? '−' : '×';
  return `${a}자리 ${o} ${b}자리`;
};
const onlyNoBorrow = (kind, types) => kind === 'sub' && types.every(t => t === '1-1');   // 1자리 뺄셈은 받아내림이 없음

// 마지막 설정. 예전 형식(문제 수만 저장, 곱셈 = 구구단이던 때)도 새 형식으로 옮김
function getSetup(kind) {
  const s = S.setup = S.setup || {};
  if (!s.v2) {
    const old = { ...s }, om = old.mix || {};
    Object.assign(s, {
      v2: true,
      add: { n: typeof old.add === 'number' ? old.add : 20 },
      sub: { n: typeof old.sub === 'number' ? old.sub : 20 },
      mul: {},
      gugu: typeof old.mul === 'number' ? old.mul : 20,
      mix: { add: om['+'] ?? 20, sub: om['-'] ?? 20, mul: 0, gugu: om['×'] ?? 0 },
    });
  }
  if (kind === 'gugu') return { n: s.gugu || 20, dans: S.mulDans && S.mulDans.length ? S.mulDans : ALL_DANS };
  if (kind === 'mix') return { add: 20, sub: 20, mul: 0, gugu: 0, ...s.mix };
  const K = KINDS[kind], c = s[kind] || {};
  return { types: c.types && c.types.length ? c.types : K.def, carry: c.carry !== false, n: c.n || 20 };
}
function summaryOf(kind) {
  if (kind === 'gugu') { const d = getSetup('gugu').dans; return d.length === ALL_DANS.length ? '2단 ~ 9단' : d.map(x => `${x}단`).join('·'); }
  const c = getSetup(kind), K = KINDS[kind];
  const t = c.types.length === 1 ? typeLabel(c.types[0]) : `자릿수 ${c.types.length}가지`;
  return `${t} · ${K.carry} ${c.carry && !onlyNoBorrow(kind, c.types) ? '포함' : '없음'}`;
}
function titleOf(kind, c) {
  if (kind === 'gugu') return c.dans.length === 1 ? `${c.dans[0]}단` : c.dans.length === ALL_DANS.length ? '구구단 섞어서' : `${c.dans.join('·')}단 섞어서`;
  return `${KINDS[kind].label} · ${c.types.length === 1 ? typeLabel(c.types[0]) : '여러 자릿수'}`;
}
const pagesOf = (kind, c, n = c.n) => kind === 'gugu' ? makeMulMixed(c.dans, n) : makeOp(KINDS[kind].op, c.types, n, c.carry);

// 문제 수 고르기 줄 (− 20문제 +, 빠른 선택)
const countHTML = (key, label = '', quick = true) => `
  <div class="count-row" data-key="${key}">${label}
    <button class="btn step" data-step="-10" aria-label="10문제 빼기">−</button>
    <b class="cnt"></b>
    <button class="btn step" data-step="10" aria-label="10문제 더하기">+</button></div>
  ${quick ? `<div class="row quick" data-key="${key}">${[10, 20, 50, 100, 200].map(n => `<button class="btn" data-quick="${n}">${n}</button>`).join('')}</div>` : ''}`;
function paintCount(m, key, n, min, max) {
  const row = $(`.count-row[data-key="${key}"]`, m);
  $('.cnt', row).textContent = `${n}문제`;
  $('[data-step="-10"]', row).disabled = n <= min;
  $('[data-step="10"]', row).disabled = n >= max;
  $$(`.quick[data-key="${key}"] [data-quick]`, m).forEach(b => b.classList.toggle('primary', +b.dataset.quick === n));
}
function openDialog(html, onClick) {
  const m = $('#modal');
  m.innerHTML = `<div class="dlg setup">${html}</div>`;
  m.hidden = false;
  m.onclick = e => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.act === 'cancel') m.hidden = true;
    else onClick(b);
  };
  return m;
}

// 덧셈 · 뺄셈 · 곱셈
function opDialog(kind) {
  const K = KINDS[kind], c = getSetup(kind), sel = new Set(c.types);
  let carry = c.carry, n = c.n;
  const types = () => K.types.filter(t => sel.has(t));
  const m = openDialog(`
    <div class="dlg-head"><h3>${K.label}</h3>${helpBtn('op')}</div>
    <section class="sec"><p class="sec-t"><b>①</b> 자릿수 <small>여러 개 고를 수 있어요</small></p>
      <div class="chips">${K.types.map(t => `<button class="btn chip" data-t="${t}">${typeLabel(t)}</button>`).join('')}</div></section>
    <section class="sec"><label class="switch"><span><b>②</b> ${K.carry} 문제 넣기</span><input type="checkbox" id="carry"><i aria-hidden="true"></i></label>
      <p class="hint note" hidden>1자리 − 1자리 뺄셈은 받아내림이 생기지 않아요</p></section>
    <section class="sec"><p class="sec-t"><b>③</b> 문제 수</p>${countHTML('n')}</section>
    <button class="example" data-act="ex"></button>
    <div class="row"><button class="btn" data-act="cancel">취소</button><button class="btn primary" data-act="go"></button></div>`, b => {
    if (b.dataset.t) {
      if (sel.has(b.dataset.t)) { if (sel.size > 1) sel.delete(b.dataset.t); } else sel.add(b.dataset.t);
      paint(); example();
    } else if (b.dataset.step) { n = Math.max(10, Math.min(MAXQ, n + +b.dataset.step)); paint(); }
    else if (b.dataset.quick) { n = +b.dataset.quick; paint(); }
    else if (b.dataset.act === 'ex') example();
    else if (b.dataset.act === 'go') {
      m.hidden = true;
      const cfg = { types: types(), carry, n };
      S.setup[kind] = cfg;
      save();
      begin(titleOf(kind, cfg), pagesOf(kind, cfg));
    }
  });
  const box = $('#carry', m);
  const example = () => {
    $('.example', m).innerHTML = `예) <b>${sampleProblem(K.op, types(), carry && !onlyNoBorrow(kind, types()))} = ?</b><small>↻ 누르면 다른 예시</small>`;
  };
  const paint = () => {
    $$('.chip', m).forEach(b => b.classList.toggle('on', sel.has(b.dataset.t)));
    const off = onlyNoBorrow(kind, types());
    box.checked = carry && !off;
    box.disabled = off;
    $('.switch', m).classList.toggle('off', off);
    $('.note', m).hidden = !off;
    paintCount(m, 'n', n, 10, MAXQ);
    $('[data-act=go]', m).textContent = `${n}문제 시작`;
  };
  box.onchange = () => { carry = box.checked; example(); };
  paint();
  example();
}

// 구구단
function guguDialog() {
  const c = getSetup('gugu'), sel = new Set(c.dans);
  let n = c.n;
  const m = openDialog(`
    <div class="dlg-head"><h3>구구단</h3>${helpBtn('gugu')}</div>
    <section class="sec"><p class="sec-t"><b>①</b> 몇 단? <small>여러 개 고르면 섞여요</small></p>
      <div class="dan-grid">${ALL_DANS.map(d => `<button class="btn dan" data-d="${d}">${d}단</button>`).join('')}</div>
      <div class="row"><button class="btn" data-act="all"></button></div></section>
    <section class="sec"><p class="sec-t"><b>②</b> 문제 수</p>${countHTML('n')}</section>
    <div class="row"><button class="btn" data-act="cancel">취소</button><button class="btn primary" data-act="go"></button></div>`, b => {
    if (b.dataset.d) { const d = +b.dataset.d; sel.has(d) ? sel.delete(d) : sel.add(d); }
    else if (b.dataset.act === 'all') { if (sel.size === ALL_DANS.length) sel.clear(); else ALL_DANS.forEach(d => sel.add(d)); }
    else if (b.dataset.step) n = Math.max(10, Math.min(MAXQ, n + +b.dataset.step));
    else if (b.dataset.quick) n = +b.dataset.quick;
    else if (b.dataset.act === 'go') {
      m.hidden = true;
      const cfg = { dans: [...sel].sort((x, y) => x - y), n };
      S.setup.gugu = n;
      S.mulDans = cfg.dans;
      save();
      begin(titleOf('gugu', cfg), pagesOf('gugu', cfg));
      return;
    }
    paint();
  });
  const paint = () => {
    $$('.dan', m).forEach(b => b.classList.toggle('on', sel.has(+b.dataset.d)));
    $('[data-act=all]', m).textContent = sel.size === ALL_DANS.length ? '모두 빼기' : '모두 고르기';
    paintCount(m, 'n', n, 10, MAXQ);
    const go = $('[data-act=go]', m);
    go.disabled = !sel.size;
    go.textContent = sel.size ? `${n}문제 시작` : '단을 골라 주세요';
  };
  paint();
}

// 섞어 풀기: 종류별 문제 수만 정함. 자릿수·받아올림·단은 각 메뉴에서 마지막으로 고른 설정
const MIX_KINDS = [['add', '덧셈'], ['sub', '뺄셈'], ['mul', '곱셈'], ['gugu', '구구단']];
function mixDialog() {
  const counts = getSetup('mix');
  const total = () => MIX_KINDS.reduce((s, [k]) => s + counts[k], 0);
  const m = openDialog(`
    <div class="dlg-head"><h3>섞어 풀기</h3>${helpBtn('mix')}</div>
    ${MIX_KINDS.map(([k, label]) => `<div class="mix-row">
      ${countHTML(k, `<span class="lbl">${label}<small>${summaryOf(k)}</small></span>`, false)}</div>`).join('')}
    <p class="hint">자릿수·받아올림·단은 각 메뉴에서 마지막으로 고른 대로 나와요</p>
    <p class="hint total"></p>
    <div class="row"><button class="btn" data-act="cancel">취소</button><button class="btn primary" data-act="go"></button></div>`, b => {
    if (b.dataset.step) {
      const k = b.closest('.count-row').dataset.key;
      counts[k] = Math.max(0, Math.min(MAXQ, counts[k] + +b.dataset.step));
      paint();
    } else if (b.dataset.act === 'go') {
      m.hidden = true;
      S.setup.mix = { ...counts };
      save();
      const pages = MIX_KINDS.flatMap(([k]) => counts[k] ? pagesOf(k, getSetup(k), counts[k]) : []);
      begin('섞어 풀기', pages);
    }
  });
  const paint = () => {
    const n = total();
    MIX_KINDS.forEach(([k]) => paintCount(m, k, counts[k], 0, counts[k] + (MAXQ - n)));
    $$('.mix-row', m).forEach((r, i) => r.classList.toggle('zero', !counts[MIX_KINDS[i][0]]));
    $('.total', m).textContent = `모두 ${n}문제 (위에서부터 차례로, ${MAXQ}문제까지)`;
    const go = $('[data-act=go]', m);
    go.disabled = !n;
    go.textContent = n ? `${n}문제 시작` : '문제 수를 골라 주세요';
  };
  paint();
}

// ---------- 화면: 학습지 ----------
function sheet() {
  const c = S.current, pg = c.pages[c.page], off = offset(c, c.page), last = c.page === c.pages.length - 1;
  // 10쪽까지는 점, 그보다 많으면 "몇 / 몇쪽"과 진행 막대
  const dots = c.pages.length <= 10 ? c.pages.map((p, i) => {
    const cls = i === c.page ? 'on' : p.some((_, j) => hasInk(c, offset(c, i) + j)) ? 'done' : '';
    return `<button data-act="go" data-p="${i}" aria-label="${i + 1}쪽"><i class="${cls}"></i></button>`;
  }).join('') : `<span class="pg"><b>${c.page + 1}</b> / ${c.pages.length}쪽
      <i class="bar-track"><i class="bar-fill" style="width:${(c.page + 1) / c.pages.length * 100}%"></i></i></span>`;
  app.innerHTML = `
    <header class="bar">
      <button class="icon-btn" data-act="home" aria-label="처음으로">🏠</button>
      <div class="title">${c.title}<small>${c.page + 1} / ${c.pages.length}</small></div>
      <div class="tools">
        <button class="tool${tool === 'pen' ? ' on' : ''}" data-act="pen" aria-label="펜">✏️</button>
        <button class="tool${tool === 'eraser' ? ' on' : ''}" data-act="eraser" aria-label="지우개">🧽</button>
        <button class="tool" data-act="undo" aria-label="되돌리기">↩️</button>
      </div>
      ${helpBtn('sheet')}
    </header>
    <main class="page ${layoutOf(pg)}">${pg.map((p, i) => cardHTML(p, off + i)).join('')}</main>
    <footer class="nav">
      <button class="btn" data-act="prev"${c.page === 0 ? ' disabled' : ''}>◀ 이전</button>
      <div class="dots">${dots}</div>
      ${last ? '<button class="btn primary" data-act="submit">다 풀었어요!</button>' : '<button class="btn primary" data-act="next">다음 ▶</button>'}
    </footer>`;
  $$('.page .card').forEach(cd => { const k = cd.dataset.k; attachInk(cd, () => c.ink[k] || (c.ink[k] = []), true); });
  setScreen('sheet');
  autoHelp('sheet');
  const main = $('main.page');
  const recordSize = () => {
    if (!main.isConnected || !main.clientWidth || !main.clientHeight) return;   // 화면 전환으로 사라질 때는 무시
    c.pageSize = [main.clientWidth, main.clientHeight];
    c.geo = c.geo || {};
    $$('.card', main).forEach(cd => { const g = cardGeo(cd); if (g) c.geo[cd.dataset.k] = g; });
    saveSoon();
  };
  recordSize();   // 바로 한 번 기록 (채점 화면 축소 페이지 비율용)
  new ResizeObserver(recordSize).observe(main);
  app.onclick = e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'home') { save(); home(); }
    else if (a === 'pen' || a === 'eraser') { tool = a; $$('.tool').forEach(t => t.classList.toggle('on', t.dataset.act === tool)); }
    else if (a === 'undo') undo();
    else if (a === 'prev' || a === 'next') { c.page += a === 'next' ? 1 : -1; save(); sheet(); }
    else if (a === 'go') { c.page = +b.dataset.p; save(); sheet(); }
    else if (a === 'submit') submit();
  };
}
async function submit() {
  const c = S.current, blanks = flat(c).filter((_, k) => !hasInk(c, k)).length;
  if (blanks) {
    const ok = await modal(`<p>아직 안 쓴 문제가 <b>${blanks}개</b> 있어요.<br>그래도 다 풀었어요?</p>`,
      [{ label: '더 풀래요', value: false }, { label: '네, 다 풀었어요', value: true, primary: true }]);
    if (!ok) return;
  }
  timerStop();
  c.status = 'submitted';
  save();
  submitted();
}
function submitted() {
  setScreen('submitted');
  app.innerHTML = `<main class="center"><div class="big-emoji">👏</div><h2>다 풀었어요!</h2><p>부모님께 채점을 받아요.</p>
    <div class="row"><button class="btn big" data-act="home">나중에</button><button class="btn primary big" data-act="grade">부모님 채점하기</button></div></main>`;
  app.onclick = e => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'home') home();
    else if (a === 'grade') requirePin(grade, submitted);
  };
}

// ---------- 축소 페이지 (채점/결과) ----------
function renderMinis(sess, withAnswer) {
  const box = $('.minis');
  box.innerHTML = sess.pages.map((pg, i) => {
    const off = offset(sess, i);
    return `<div class="mini"><div class="page ${layoutOf(pg)}">${pg.map((p, j) => cardHTML(p, off + j, withAnswer)).join('')}</div></div>`;
  }).join('');
  let scale = .5;
  const fit = () => {
    const [pw, ph] = sess.pageSize && sess.pageSize[1] ? sess.pageSize : [innerWidth - 32, innerHeight - 170];
    if (!box.clientWidth) return;
    const cols = box.clientWidth > 700 ? 2 : 1, tw = (box.clientWidth - 32 - 16 * (cols - 1)) / cols, s = tw / pw;
    scale = s;
    $$('.mini', box).forEach(m => {
      m.style.width = `${tw}px`; m.style.height = `${ph * s}px`;
      Object.assign(m.firstElementChild.style, { width: `${pw}px`, height: `${ph}px`, transform: `scale(${s})` });
    });
  };
  fit();
  const res = () => Math.max(.5, scale * Math.min(window.devicePixelRatio || 1, 2));
  // 보이는 쪽(과 위아래 가까운 쪽)만 손글씨를 그리고, 멀어진 쪽은 캔버스를 비워 메모리를 돌려줌
  const io = new IntersectionObserver(entries => entries.forEach(en => $$('.card', en.target).forEach(cd => {
    if (en.isIntersecting) {
      if (cd.resize) cd.resize();
      else attachInk(cd, () => sess.ink[cd.dataset.k] || [], false, res);
    } else if (cd.resize) {
      const cv = $('canvas', cd);
      cv.width = cv.height = 0;
    }
  })), { root: box, rootMargin: '1000px 0px' });
  $$('canvas', box).forEach(cv => { cv.width = cv.height = 0; });   // 그리기 전에는 빈 캔버스 (기본 300x150도 아낌)
  $$('.mini', box).forEach(mn => io.observe(mn));
  new ResizeObserver(fit).observe(box);
}
const paintMarks = marks => $$('.minis .card').forEach(cd => {
  cd.classList.toggle('is-o', marks[cd.dataset.k] === 'o');
  cd.classList.toggle('is-x', marks[cd.dataset.k] === 'x');
});

// ---------- 글씨 읽기 (자동 채점) ----------
const UNSURE = .7;   // 숫자 하나라도 이보다 자신 없으면 부모님 확인 표시

async function recognize(c, onProgress) {
  await Digits.load();
  const reco = {}, probs = flat(c);
  for (let k = 0; k < probs.length; k++) {
    if (k && k % 20 === 0) {                                       // 문제가 많을 때 화면이 멈추지 않게 잠깐씩 쉼
      if (onProgress) onProgress(k, probs.length);
      await new Promise(r => setTimeout(r));
    }
    const p = probs[k], strokes = c.ink[k] || [], g = c.geo && c.geo[k];
    if (!strokes.length) { reco[k] = { text: '', conf: 1 }; continue; }
    if (!g || !g.boxes.length) { reco[k] = null; continue; }        // 칸 위치 기록이 없는 옛 학습지
    const px = strokes.map(s => s.pts.map((v, i) => v * (i % 2 ? g.h : g.w) / N));
    const bx = g.boxes.map(b => b.map((v, i) => v * (i % 2 ? g.h : g.w) / N));
    const bw = bx[0][2] - bx[0][0], bh = bx[0][3] - bx[0][1], last = bx[bx.length - 1];
    // 답을 쓰는 줄만 읽음: 세로셈은 칸 줄(위의 올림·내림 메모, 곱셈 중간 계산은 제외), 가로셈은 = 오른쪽
    const region = p.fmt === 'v' || p.fmt === 'vm'
      ? { x0: bx[0][0] - bw * .35, x1: last[2] + bw * .35, y0: bx[0][1] - bh * .35, y1: bx[0][3] + bh * .6 }
      : { x0: bx[0][0] - bw * .5, x1: g.w, y0: bx[0][1] - bh * .4, y1: bx[0][3] + bh * .4 };
    const r = Digits.read(px, region);
    reco[k] = { text: r.text, conf: +r.conf.toFixed(3) };
  }
  return reco;
}
const recoOk = (p, r) => !!r && r.text === String(answer(p));
const recoUnsure = r => r === null || (!!r && !!r.text && r.conf < UNSURE);

// ---------- 화면: 채점 (부모) ----------
function grade() {
  setScreen('grade');
  const c = S.current, probs = flat(c);
  const time = S.timer && c.elapsed ? ` · ⏱ ${fmtTime(c.elapsed)}` : '';
  app.innerHTML = `
    <header class="bar">
      <button class="icon-btn" data-act="home" aria-label="처음으로">🏠</button>
      <div class="title">채점하기<small>${c.title}${time}</small></div>
      ${helpBtn('grade')}
      <button class="btn primary" data-act="finish" disabled>채점 완료 · <span id="sc">글씨 읽는 중…</span></button>
    </header>
    <div class="grade-help">글씨를 읽어서 자동으로 채점했어요. <b class="r">✎</b>는 글씨에서 읽은 답, <b class="g">초록</b>은 정답이에요.
      <b class="u">노란 칸</b>은 글씨가 애매한 문제예요. 잘못 채점된 문제는 눌러서 바꿔 주세요.</div>
    <div class="row filters" hidden>
      <button class="btn" data-f="all">전체 <span></span></button>
      <button class="btn" data-f="x">틀린 것 <span></span></button>
      <button class="btn" data-f="u">노란 칸 <span></span></button>
    </div>
    <div class="minis grading"></div>
    <p class="filter-empty" hidden></p>`;
  renderMinis(c, true);
  // 보기 필터: 해당 문제가 없는 쪽은 숨기고, 있는 쪽에서는 나머지 문제를 흐리게.
  // 표시를 바꿔도 바로 사라지지 않도록, 필터는 버튼을 누를 때만 다시 적용함
  // 틀린 것(x)과 노란 칸(u)은 함께 켤 수 있음. 아무것도 안 켜면 전체
  const filters = new Set();
  const isUnsure = k => !!c.reco && recoUnsure(c.reco[k]);
  const match = k => !filters.size || (filters.has('x') && c.marks[k] === 'x') || (filters.has('u') && isUnsure(k));
  const applyFilter = () => {
    let shown = 0;
    $$('.minis .mini').forEach(mn => {
      const cards = $$('.card', mn);
      cards.forEach(cd => cd.classList.toggle('dim', !match(+cd.dataset.k)));
      const any = cards.some(cd => match(+cd.dataset.k));
      mn.hidden = !any;
      if (any) shown++;
    });
    const empty = $('.filter-empty');
    empty.hidden = !!shown;
    empty.textContent = filters.size === 2 ? '틀리거나 애매한 문제가 없어요 🎉'
      : filters.has('x') ? '틀린 문제가 없어요 🎉' : '애매한 문제가 없어요 👍';
    $$('[data-f]').forEach(b => b.classList.toggle('primary', b.dataset.f === 'all' ? !filters.size : filters.has(b.dataset.f)));
  };
  const refresh = () => {
    paintMarks(c.marks);
    $('#sc').textContent = `${c.marks.filter(m => m === 'o').length} / ${probs.length}`;
    $('[data-f=all] span').textContent = probs.length;
    $('[data-f=x] span').textContent = c.marks.filter(m => m === 'x').length;
    $('[data-f=u] span').textContent = probs.filter((_, k) => isUnsure(k)).length;
  };
  const ready = () => {
    if (curScreen !== 'grade') return;
    paintReco(c);
    refresh();
    $('.filters').hidden = false;
    applyFilter();
    $('[data-act=finish]').disabled = false;
    autoHelp('grade');   // 처음 채점하는 어른에게 한 번 설명
  };
  if (c.marks) ready();
  else {
    recognize(c, (k, n) => { if (curScreen === 'grade') $('#sc').textContent = `글씨 읽는 중… ${k}/${n}`; }).then(reco => {
      c.reco = reco;
      c.marks = probs.map((p, k) => reco[k] === null ? 'o' : recoOk(p, reco[k]) ? 'o' : 'x');
    }).catch(err => {
      console.warn('recognize failed', err);   // 모델을 못 읽으면 예전처럼: 쓴 문제는 일단 맞음
      c.marks = probs.map((_, k) => hasInk(c, k) ? 'o' : 'x');
    }).then(() => { save(); ready(); });
  }
  app.onclick = e => {
    const card = e.target.closest('.minis .card');
    if (card && c.marks) { const k = +card.dataset.k; c.marks[k] = c.marks[k] === 'o' ? 'x' : 'o'; refresh(); saveSoon(); return; }
    const f = e.target.closest('[data-f]');
    if (f) {
      const v = f.dataset.f;
      if (v === 'all') filters.clear();
      else if (filters.has(v)) filters.delete(v);
      else filters.add(v);
      applyFilter();
      $('.minis').scrollTop = 0;
      return;
    }
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'home') { save(); home(); }
    else if (a === 'finish' && c.marks) finish();
  };
}
// 채점 화면 카드마다 "읽은 답" 표시
function paintReco(c) {
  if (!c.reco) return;
  const probs = flat(c);
  $$('.minis .card').forEach(cd => {
    const k = +cd.dataset.k, r = c.reco[k];
    if (r === undefined) return;
    const el = document.createElement('div');
    el.className = `reco${recoOk(probs[k], r) ? ' ok' : ''}${recoUnsure(r) ? ' unsure' : ''}`;
    el.innerHTML = r === null ? '✎ ?' : r.text ? `✎ ${r.text}` : '✎ 빈칸';
    cd.appendChild(el);
  });
}
function finish() {
  const c = S.current, probs = flat(c);
  let score = 0;
  probs.forEach((p, k) => {
    const key = keyOf(p);
    if (c.marks[k] === 'o') { score++; S.retry = S.retry.filter(r => keyOf(r) !== key); }
    else if (!S.retry.some(r => keyOf(r) === key)) S.retry.push({ op: p.op, a: p.a, b: p.b, fmt: p.fmt, n: boxesOf(p) });
  });
  const elapsed = c.elapsed || 0;
  S.history.unshift({ date: new Date().toISOString(), title: c.title, score, total: probs.length, elapsed });
  S.history.length = Math.min(S.history.length, 300);
  S.last = { title: c.title, pages: c.pages, ink: c.ink, marks: c.marks, pageSize: c.pageSize, score, total: probs.length, elapsed };
  S.current = null;
  save();
  result();
}

// ---------- 화면: 결과 (아이) ----------
function result() {
  setScreen('result');
  const L = S.last, r = L.score / L.total, wrong = flat(L).filter((_, k) => L.marks[k] === 'x');
  const stars = r >= .9 ? 3 : r >= .7 ? 2 : 1;
  const call = kid() ? `, ${kid()}` : '';
  const msg = r === 1 ? `모두 맞았어요! 최고예요${call} 🎉` : r >= .8 ? `참 잘했어요${call}! 👍` : `조금만 더 힘내요${call}! 💪`;
  app.innerHTML = `
    <header class="bar"><button class="icon-btn" data-act="home" aria-label="처음으로">🏠</button><div class="title">${L.title} 결과</div>${helpBtn('result')}</header>
    <div class="result-top">
      <div class="stars">${'★'.repeat(stars)}<span class="off">${'★'.repeat(3 - stars)}</span></div>
      <div class="score">${L.score}<span>/ ${L.total}</span></div>
      ${S.timer && L.elapsed ? `<div class="time">⏱ ${fmtTime(L.elapsed)}</div>` : ''}
      <div class="msg">${msg}</div>
      <div class="row">${wrong.length ? `<button class="btn primary big" data-act="again">틀린 ${wrong.length}문제 다시 풀기</button>` : ''}
        <button class="btn big" data-act="home">처음으로</button></div>
    </div>
    <div class="minis"></div>`;
  renderMinis(L, false);
  paintMarks(L.marks);
  app.onclick = e => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'home') home();
    else if (a === 'again') begin('틀린 문제 다시 풀기', paginate(wrong.map(p => ({ ...p }))));
  };
}

// ---------- 화면: 부모님 메뉴 ----------
function parentMenu() {
  setScreen('parent');
  const rows = S.history.slice(0, 50).map(h => {
    const d = new Date(h.date).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const t = S.timer ? `<td class="t">${h.elapsed ? fmtTime(h.elapsed) : ''}</td>` : '';
    return `<tr><td>${d}</td><td>${h.title}</td>${t}<td>${h.score} / ${h.total}</td></tr>`;
  }).join('');
  app.innerHTML = `
    <header class="bar"><button class="icon-btn" data-act="home" aria-label="처음으로">🏠</button><div class="title">부모님 메뉴</div>${helpBtn('parent')}</header>
    <main class="parent">
      <section><h3>설정</h3>
        <div class="switch-row"><span>아이 이름<small>시작 화면과 홈에 나와요 (이니셜이나 별명 추천)</small></span>
          <button class="btn name-btn" data-act="name">${kid() || '정하기'} ✎</button></div>
        <label class="switch-row"><span>손가락으로도 쓰기<small>끄면 S펜으로만 써져요 (손바닥이 닿아도 안 써짐)</small></span>
          <input type="checkbox" id="touch"${S.allowTouch ? ' checked' : ''}></label>
        <label class="switch-row"><span>화면 돌리기 허용<small>끄면 세로로 고정돼요 (홈 화면에 설치한 앱에서만 적용)</small></span>
          <input type="checkbox" id="rotate"${S.rotate ? ' checked' : ''}></label>
        <label class="switch-row"><span>풀이 시간 재기<small>다 푼 뒤 결과 화면과 기록에 걸린 시간이 나와요 (풀 때는 안 보여요)</small></span>
          <input type="checkbox" id="timer"${S.timer ? ' checked' : ''}></label>
        <div class="row" style="justify-content:flex-start">
          <button class="btn" data-act="pin">비밀번호 바꾸기</button>
          <button class="btn" data-act="clear"${S.retry.length ? '' : ' disabled'}>다시 풀기 목록 비우기 (${S.retry.length})</button>
        </div>
      </section>
      <section><h3>기록</h3>${rows ? `<table class="history">${rows}</table>` : '<p class="empty">아직 기록이 없어요.</p>'}</section>
      <p class="ver">앱 버전 ${VERSION} · © 2026 foxturtle</p>
    </main>`;
  $('#touch').onchange = e => { S.allowTouch = e.target.checked; save(); };
  $('#rotate').onchange = e => { S.rotate = e.target.checked; save(); applyOrientation(); };
  $('#timer').onchange = e => { S.timer = e.target.checked; save(); parentMenu(); };
  app.onclick = async e => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'home') home();
    else if (a === 'name') nameEditor();
    else if (a === 'pin') setPin(parentMenu, parentMenu);
    else if (a === 'clear' && await modal('<p>다시 풀기 목록을 비울까요?</p>', [{ label: '취소', value: false }, { label: '비우기', value: true, primary: true }])) {
      S.retry = []; save(); parentMenu();
    }
  };
}

// ---------- 한글 조합 (화면 글자판용, 두벌식 순서: 초성 → 중성 → 종성) ----------
const CHO = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
const JUNG = [...'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'];
const JONG = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];
const PAIR_V = { 'ㅗㅏ': 'ㅘ', 'ㅗㅐ': 'ㅙ', 'ㅗㅣ': 'ㅚ', 'ㅜㅓ': 'ㅝ', 'ㅜㅔ': 'ㅞ', 'ㅜㅣ': 'ㅟ', 'ㅡㅣ': 'ㅢ' };
const PAIR_C = { 'ㄱㅅ': 'ㄳ', 'ㄴㅈ': 'ㄵ', 'ㄴㅎ': 'ㄶ', 'ㄹㄱ': 'ㄺ', 'ㄹㅁ': 'ㄻ', 'ㄹㅂ': 'ㄼ', 'ㄹㅅ': 'ㄽ', 'ㄹㅌ': 'ㄾ', 'ㄹㅍ': 'ㄿ', 'ㄹㅎ': 'ㅀ', 'ㅂㅅ': 'ㅄ' };
const unpair = (pairs, v) => Object.keys(pairs).find(k => pairs[k] === v);   // 'ㄺ' → 'ㄹㄱ'
const syllable = s => s.c && s.v
  ? String.fromCharCode(0xAC00 + (CHO.indexOf(s.c) * 21 + JUNG.indexOf(s.v)) * 28 + JONG.indexOf(s.j || ''))
  : (s.c || '') + (s.v || '');

// st = { done: 완성된 글자, cur: 조합 중인 글자 {c, v, j} | null }
function hangulKey(st, key) {
  const cur = st.cur;
  const commit = next => { if (cur) st.done += syllable(cur); st.cur = next; };
  if (!JUNG.includes(key)) {                                   // 자음
    if (!cur || !cur.c || !cur.v) return commit({ c: key });
    if (!cur.j) { if (JONG.includes(key)) cur.j = key; else commit({ c: key }); return; }
    if (PAIR_C[cur.j + key]) cur.j = PAIR_C[cur.j + key]; else commit({ c: key });
    return;
  }
  if (!cur) return commit({ v: key });                         // 모음
  if (cur.c && !cur.v) { cur.v = key; return; }
  if (!cur.j) { if (PAIR_V[cur.v + key]) cur.v = PAIR_V[cur.v + key]; else commit({ v: key }); return; }
  const sp = unpair(PAIR_C, cur.j);                            // 받침을 다음 글자 첫소리로 (예: 갈+ㅏ → 가라)
  const moved = sp ? sp[1] : cur.j;
  cur.j = sp ? sp[0] : '';
  commit({ c: moved, v: key });
}
function hangulBack(st) {
  const cur = st.cur;
  if (!cur) { st.done = [...st.done].slice(0, -1).join(''); return; }
  if (cur.j) { const sp = unpair(PAIR_C, cur.j); cur.j = sp ? sp[0] : ''; }
  else if (cur.v) { const sp = unpair(PAIR_V, cur.v); cur.v = sp ? sp[0] : ''; if (!cur.v && !cur.c) st.cur = null; }
  else st.cur = null;
}

// 이름 바꾸기: 기기 키보드가 안 떠도 되도록 화면 글자판(한글/ABC)을 함께 둠.
// 처음 안내에서도 씀 (onboard: 제목·버튼을 "건너뛰기 / 다음"으로)
function nameEditor({ onDone = parentMenu, onCancel = parentMenu, onboard = false } = {}) {
  setScreen('name');
  const MAX = 6, KO = [...'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㄲㄸㅃㅆㅉㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣㅐㅒㅔㅖ'], EN = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
  let st = { done: S.name || '', cur: null }, mode = !S.name || /[가-힣]/.test(S.name) ? 'ko' : 'en';
  const text = () => st.done + (st.cur ? syllable(st.cur) : '');
  app.innerHTML = `
    <header class="bar">
      ${onboard ? '<button class="btn" data-act="back">건너뛰기</button>' : '<button class="icon-btn" data-act="back" aria-label="취소">✕</button>'}
      <div class="title">${onboard ? '① 아이 이름' : '아이 이름'}</div>
      <button class="btn primary" data-act="ok">${onboard ? '다음 ▶' : '완료'}</button>
    </header>
    <main class="center name-edit">
      ${onboard ? '<h2 class="ob-q">아이 이름을 알려 주세요</h2><p class="ob-sub">시작 화면에 "○○만을 위한 연산 연습"으로 나와요.<br>비워 두고 <b>건너뛰기</b>를 눌러도 돼요.</p>' : ''}
      <input type="text" id="nm" class="name-field" maxlength="${MAX}" autocomplete="off" spellcheck="false" placeholder="이름">
      <p>아래 글자판을 누르거나, 칸을 눌러 키보드로 입력해요 (${MAX}글자까지)</p>
      <div class="row pad-tabs"><button class="btn" data-mode="ko">한글</button><button class="btn" data-mode="en">ABC</button></div>
      <div class="letter-pad"></div>
    </main>`;
  const f = $('#nm'), pad = $('.letter-pad');
  const paint = () => {
    f.value = text();
    $$('[data-mode]').forEach(b => b.classList.toggle('primary', b.dataset.mode === mode));
    pad.innerHTML = (mode === 'ko' ? KO : EN).map(k => `<button data-k="${k}">${k}</button>`).join('')
      + '<button class="wide" data-act="del" aria-label="한 글자 지우기">⌫</button>';
  };
  paint();
  f.oninput = () => { st = { done: f.value, cur: null }; };   // 기기 키보드로 직접 쓴 경우
  app.onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.k) {
      const before = JSON.stringify(st);
      if (mode === 'ko') hangulKey(st, b.dataset.k);
      else { st.done = text() + b.dataset.k; st.cur = null; }
      if ([...text()].length > MAX) st = JSON.parse(before);
      f.value = text();
    } else if (b.dataset.mode) {
      st = { done: text(), cur: null }; mode = b.dataset.mode; paint();
    } else if (b.dataset.act === 'del') { hangulBack(st); f.value = text(); }
    else if (b.dataset.act === 'ok') { S.name = text().trim(); save(); onDone(); }
    else if (b.dataset.act === 'back') onCancel();
  };
}

// ---------- 처음 안내 (처음 설치한 사람만) ----------
// 환영 → ① 아이 이름(건너뛰기 가능) → ② 부모님 비밀번호(나중에 가능) → 준비 끝
function onboarding() {
  setScreen('onboard');
  app.innerHTML = `
    <main class="center onboard">
      <div class="big-emoji">👋</div>
      <h2>처음 오셨네요!</h2>
      <p>두 가지만 정하면 바로 시작할 수 있어요.</p>
      <ol class="ob-steps"><li><b>①</b> 아이 이름 <small>(안 정해도 돼요)</small></li><li><b>②</b> 부모님 비밀번호 숫자 4자리</li></ol>
      <button class="btn primary big" data-act="go">시작하기 ▶</button>
    </main>`;
  app.onclick = e => {
    if (!e.target.closest('[data-act=go]')) return;
    const done = () => onboardDone();
    const pin = () => setPin(done, done, { title: '② 부모님 비밀번호', sub: '채점과 설정은 부모님만 할 수 있게<br>아이가 모르는 숫자 4자리를 정해 주세요', later: true });
    nameEditor({ onDone: pin, onCancel: () => { S.name = ''; save(); pin(); }, onboard: true });
  };
}
function onboardDone() {
  S.onboarded = true;
  save();
  setScreen('onboard');
  app.innerHTML = `
    <main class="center onboard">
      <div class="big-emoji">🎉</div>
      <h2>준비 끝!</h2>
      <ul class="ob-steps">
        <li>덧셈·뺄셈·곱셈·구구단 중 하나를 누르고</li>
        <li>문제 수를 고른 뒤 <b>시작</b>을 누르면 돼요.</li>
        <li>화면마다 있는 <b>❓ 도움말</b>을 누르면 사용법이 나와요.</li>
      </ul>
      <button class="btn primary big" data-act="go">처음 화면으로 ▶</button>
    </main>`;
  app.onclick = e => { if (e.target.closest('[data-act=go]')) home(); };
}

// ---------- 비밀번호 ----------
// extra: 키패드 아래 글자 버튼 하나 ({label, onClick}), cancelLabel: 닫기 대신 쓸 글자 (예: "나중에")
function pinPad({ title, sub, onCode, onCancel, extra, cancelLabel }) {
  setScreen('pin');
  let code = '';
  app.innerHTML = `
    <header class="bar">${cancelLabel ? `<button class="btn" data-act="cancel">${cancelLabel}</button>` : '<button class="icon-btn" data-act="cancel" aria-label="닫기">✕</button>'}
      <div class="title"></div>${helpBtn('pin')}</header>
    <main class="center pin"><h2>${title}</h2><p>${sub}</p><div class="pin-dots">${'<i></i>'.repeat(4)}</div>
      <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-n="${n}">${n}</button>`).join('')}
        <span></span><button data-n="0">0</button><button data-act="del" aria-label="지우기">⌫</button></div>
      ${extra ? `<button class="link-btn" data-act="extra">${extra.label}</button>` : ''}</main>`;
  const dots = $$('.pin-dots i'), paint = () => dots.forEach((d, i) => d.classList.toggle('on', i < code.length));
  app.onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'cancel') return onCancel();
    if (b.dataset.act === 'extra') return extra.onClick();
    if (b.dataset.act === 'del') { code = code.slice(0, -1); return paint(); }
    if (b.dataset.n == null || code.length >= 4) return;
    code += b.dataset.n;
    paint();
    if (code.length === 4) setTimeout(() => {
      if (onCode(code) !== false) return;
      code = ''; paint();
      const el = $('.pin-dots'); el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
    }, 150);
  };
}
// later: 처음 안내에서는 "나중에"로 건너뛸 수 있음 (채점·설정에 처음 들어갈 때 다시 정함)
function setPin(next, cancel, { title = '부모님 비밀번호 정하기', sub = '아이가 모르는 숫자 4자리를 눌러 주세요', later = false } = {}) {
  const cancelLabel = later ? '나중에' : '';
  pinPad({
    title, sub, onCancel: cancel, cancelLabel,
    onCode: first => pinPad({
      title: '한 번 더 눌러 주세요', sub: '확인을 위해 같은 숫자를<br>다시 눌러 주세요', onCancel: cancel, cancelLabel,
      onCode: second => {
        if (second !== first) return false;
        S.pin = first; save(); next();
      },
    }),
  });
}
function requirePin(next, cancel) {
  if (!S.pin) return setPin(next, cancel);
  pinPad({
    title: '부모님 확인', sub: '비밀번호 4자리를 눌러 주세요', onCancel: cancel,
    onCode: c => c === S.pin ? next() : false,
    extra: { label: '비밀번호를 잊었어요', onClick: () => pinRecover(next, cancel) },
  });
}
// 비밀번호 찾기: 어른만 풀 수 있는 곱셈(세 자리 × 두 자리)을 맞히면 새 비밀번호를 정함. 기록은 그대로
function pinRecover(next, cancel) {
  setScreen('pin');
  let a, b, ans = '';
  const ask = () => { a = rnd(123, 987); b = rnd(12, 98); ans = ''; };
  ask();
  const render = () => {
    app.innerHTML = `
      <header class="bar"><button class="icon-btn" data-act="cancel" aria-label="닫기">✕</button><div class="title">비밀번호 찾기</div>${helpBtn('recover')}</header>
      <main class="center pin">
        <h2>어른 확인</h2>
        <p>아래 곱셈을 풀면 비밀번호를 새로 정할 수 있어요.<br><b>아이 기록은 그대로</b> 남아요. (계산기를 써도 돼요)</p>
        <div class="recover-q">${a} × ${b} = <span class="recover-a">${ans || '?'}</span></div>
        <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-n="${n}">${n}</button>`).join('')}
          <button data-act="del" aria-label="지우기">⌫</button><button data-n="0">0</button><button class="ok" data-act="ok">확인</button></div>
        <button class="link-btn" data-act="new">다른 문제로 바꾸기</button>
      </main>`;
  };
  render();
  app.onclick = e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'cancel') return cancel();
    if (act === 'new') { ask(); return render(); }
    if (act === 'del') ans = ans.slice(0, -1);
    else if (btn.dataset.n != null && ans.length < 6) ans += btn.dataset.n;
    else if (act === 'ok') {
      if (+ans === a * b) return setPin(next, cancel, { title: '새 비밀번호 정하기' });
      ans = '';
      render();
      const el = $('.recover-q'); el.classList.add('shake');
      return;
    }
    $('.recover-a').textContent = ans || '?';
  };
}

// ---------- 대화상자 ----------
function modal(html, buttons, cls = '') {
  const m = $('#modal');
  m.innerHTML = `<div class="dlg">${html}<div class="row ${cls}">${buttons.map((b, i) =>
    `<button class="btn${b.primary ? ' primary' : ''}" data-i="${i}">${b.label}</button>`).join('')}</div></div>`;
  m.hidden = false;
  return new Promise(res => {
    m.onclick = e => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      m.hidden = true;
      res(buttons[+b.dataset.i].value);
    };
  });
}

// ---------- 도움말 ----------
// 화면마다 ❓ 버튼 → 그 화면에서 할 일만 큰 글씨로. 채점·학습지 화면은 처음 한 번 저절로 보여 줌
const HELP = {
  home: ['처음 화면', [
    '<b>덧셈 · 뺄셈 · 곱셈 · 구구단</b> 중 하나를 누르면, 어떤 문제를 몇 개 풀지 고를 수 있어요.',
    '<b>섞어 풀기</b>는 여러 가지 문제를 한 번에 풀어요.',
    '<b>틀린 문제 다시 풀기</b>가 보이면, 전에 틀린 문제만 모아서 다시 풀 수 있어요.',
    '풀던 학습지가 있으면 위쪽에 <b>이어서 풀기</b>가 나와요.',
    '오른쪽 위 <b>⚙️</b>는 부모님 메뉴예요. (비밀번호가 필요해요)',
  ]],
  op: ['문제 고르기', [
    '<b>① 자릿수</b> — 몇 자리 수끼리 계산할지 골라요. 여러 개 골라도 돼요. (✓ 표시가 고른 것)',
    '<b>② 받아올림 문제 넣기</b> — 켜면 받아올림이 있는 문제가 섞여요. 끄면 쉬운 문제만 나와요.',
    '<b>③ 문제 수</b> — <b>−</b> <b>+</b> 를 눌러 10문제씩 바꿔요. 숫자 버튼을 누르면 한 번에 바뀌어요.',
    '<b>예)</b> 칸에 어떤 문제가 나올지 보여요. 누르면 다른 예시가 나와요.',
    '다 골랐으면 <b>○○문제 시작</b>을 눌러요.',
  ]],
  gugu: ['구구단 고르기', [
    '<b>① 몇 단?</b> — 연습할 단을 눌러요. 여러 개 고르면 섞여서 나와요.',
    '<b>모두 고르기</b>를 누르면 2단부터 9단까지 모두 골라져요.',
    '<b>② 문제 수</b> — <b>−</b> <b>+</b> 를 눌러 바꿔요.',
    '다 골랐으면 <b>○○문제 시작</b>을 눌러요.',
  ]],
  mix: ['섞어 풀기', [
    '덧셈·뺄셈·곱셈·구구단을 <b>각각 몇 문제</b> 풀지 <b>−</b> <b>+</b> 로 정해요.',
    '풀지 않을 것은 <b>0문제</b>로 두면 돼요.',
    '자릿수나 받아올림, 단은 <b>각 메뉴에서 마지막으로 고른 대로</b> 나와요.',
    '다 골랐으면 <b>○○문제 시작</b>을 눌러요.',
  ]],
  sheet: ['문제 푸는 방법', [
    '<b>펜으로 점선 네모 칸</b>에 답을 써요. 한 칸에 숫자 하나씩 써요.',
    '세로셈은 <b>오른쪽 칸부터</b> 자리를 맞춰 써요.',
    '받아올림 숫자는 위쪽 빈 곳에 작게 써도 돼요. 채점할 때는 답 칸만 봐요.',
    '<b>✏️</b> 쓰기 · <b>🧽</b> 지우기(문지르면 지워져요) · <b>↩️</b> 방금 쓴 것 취소',
    '한 쪽을 다 쓰면 <b>다음 ▶</b>, 마지막 쪽에서는 <b>다 풀었어요!</b>를 눌러요.',
    '손가락으로 안 써지면 부모님 메뉴에서 <b>손가락으로도 쓰기</b>를 켜 주세요.',
  ]],
  grade: ['채점하는 방법 (어른용)', [
    '앱이 아이 글씨를 읽어서 <b>미리 채점</b>해 두었어요.',
    '<b>빨간 동그라미 ○</b>는 맞음, <b>빨간 빗금 ╱</b>은 틀림이에요.',
    '<b>✎ 숫자</b>는 앱이 읽은 답, <b>초록 숫자</b>는 정답이에요.',
    '<b>노란 테두리</b> 문제는 앱이 글씨를 잘 못 읽은 문제예요. 아이 글씨를 보고 확인해 주세요.',
    '채점이 잘못됐으면 <b>그 문제를 한 번 누르면</b> ○ ↔ ╱ 가 바뀌어요.',
    '위쪽 <b>틀린 것</b>, <b>노란 칸</b> 버튼을 누르면 그 문제만 보여서 빨리 볼 수 있어요.',
    '다 봤으면 오른쪽 위 <b>채점 완료</b>를 눌러요.',
  ]],
  result: ['결과 보기', [
    '별과 점수가 나와요. 잘한 만큼 칭찬해 주세요!',
    '<b>틀린 ○문제 다시 풀기</b>를 누르면 틀린 문제만 다시 풀어요.',
    '틀린 문제는 처음 화면의 <b>틀린 문제 다시 풀기</b>에도 모여 있어요.',
  ]],
  parent: ['부모님 메뉴', [
    '<b>아이 이름</b> — 시작 화면과 처음 화면에 나오는 이름이에요.',
    '<b>손가락으로도 쓰기</b> — 켜면 손가락으로도 써져요. 펜을 쓴다면 꺼 두세요. (손바닥이 닿아도 안 써지게)',
    '<b>화면 돌리기 허용</b> — 끄면 화면이 세로로 고정돼요.',
    '<b>풀이 시간 재기</b> — 켜면 다 푼 뒤 걸린 시간이 나와요.',
    '<b>비밀번호 바꾸기</b> — 부모님 비밀번호를 새로 정해요.',
    '<b>기록</b> — 날짜별로 무엇을 풀었고 몇 점이었는지 보여요.',
  ]],
  pin: ['비밀번호', [
    '부모님이 정한 <b>숫자 4자리</b>를 눌러요.',
    '틀리게 누르면 다시 누를 수 있어요. <b>⌫</b> 는 한 칸 지우기예요.',
    '비밀번호가 생각나지 않으면 아래 <b>비밀번호를 잊었어요</b>를 누르세요. 기록은 지워지지 않아요.',
  ]],
  recover: ['비밀번호 찾기', [
    '화면의 곱셈 답을 숫자 버튼으로 누르고 <b>확인</b>을 눌러요. 계산기를 써도 돼요.',
    '맞히면 <b>새 비밀번호 4자리</b>를 정할 수 있어요.',
    '문제가 어려우면 <b>다른 문제로 바꾸기</b>를 눌러요.',
  ]],
};
const helpBtn = key => `<button class="help-btn" data-help="${key}" aria-label="도움말">❓<span>도움말</span></button>`;
function showHelp(key) {
  const [title, items] = HELP[key] || HELP.home, h = $('#help');
  h.innerHTML = `<div class="help-card"><h3>❓ ${title}</h3><ul>${items.map(t => `<li>${t}</li>`).join('')}</ul>
    <button class="btn primary big" data-close>알겠어요</button></div>`;
  h.hidden = false;
  h.onclick = e => { if (e.target.closest('[data-close]') || e.target === h) h.hidden = true; };
}
function autoHelp(key) {
  if (S.helpSeen[key]) return;
  S.helpSeen[key] = true;
  save();
  showHelp(key);
}
// ❓ 버튼은 어느 화면·창에서든 이 처리기가 먼저 받음 (아래 화면의 클릭 처리로 넘기지 않음)
document.addEventListener('click', e => {
  const b = e.target.closest('[data-help]');
  if (!b) return;
  e.stopPropagation();
  showHelp(b.dataset.help);
}, true);

// ---------- 자동 업데이트 ----------
// 새 버전이 올라와 있으면, 아이가 문제를 풀고 있지 않을 때(시작·처음 화면) 알아서 새로 불러옴.
// "앱을 완전히 닫았다 열기"를 몰라도 되게. 같은 버전으로 두 번 새로 불러오지는 않음
let lastUpdateCheck = 0, updateReady = false;
async function checkUpdate() {
  if (Date.now() - lastUpdateCheck < 10 * 60 * 1000 || navigator.onLine === false) return;
  lastUpdateCheck = Date.now();
  try {
    const t = await fetch('app.js', { cache: 'no-store' }).then(r => (r.ok ? r.text() : ''));
    const m = t.match(/const VERSION = '([^']+)'/);
    if (m && m[1] !== VERSION && sessionStorage.getItem('tumath.reloadedFor') !== m[1]) {
      updateReady = m[1];
      applyUpdateIfIdle();
    }
  } catch (e) { /* 인터넷이 없으면 다음에 */ }
}
function applyUpdateIfIdle() {
  if (!updateReady || !['intro', 'home'].includes(curScreen) || !$('#modal').hidden) return;
  try { sessionStorage.setItem('tumath.reloadedFor', updateReady); } catch (e) { /* 무시 */ }
  save();
  location.reload();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });

// ---------- 오류가 나도 멈추지 않게 ----------
// 예상 못 한 오류가 나면 쉬운 말로 알리고 처음 화면으로. 연달아 나면 풀던 학습지만 비우고 다시 (기록·비밀번호는 그대로)
let crashCount = 0, crashOpen = false;
function onCrash(err) {
  const msg = String(err && (err.message || err) || '');
  if (/ResizeObserver|Script error/i.test(msg)) return;           // 브라우저가 내는 무해한 알림
  console.error(err);
  if (crashOpen) return;
  crashOpen = true;
  crashCount++;
  if (crashCount >= 2 && S.current) { S.current = null; save(); }
  modal('<h3>잠깐 문제가 생겼어요</h3><p>처음 화면으로 돌아갈게요.<br>아이 기록은 그대로 있어요.</p>', [{ label: '처음 화면으로', value: true, primary: true }])
    .then(() => { crashOpen = false; try { home(); } catch (e) { location.reload(); } });
}
window.addEventListener('error', e => onCrash(e.error || e.message));
window.addEventListener('unhandledrejection', e => onCrash(e.reason));

// ---------- 시작 ----------
if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
try {
  applyOrientation();
  intro();
} catch (e) {
  console.error(e);
  S.current = null;   // 풀던 학습지 때문에 못 열리면 그것만 비우고 다시
  save();
  intro();
}
setTimeout(checkUpdate, 3000);
