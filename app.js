'use strict';
// 연산 연습 — 두 자리 덧셈/뺄셈, 구구단 손글씨 학습지 (부모 채점, 틀린 문제 다시 풀기)

const N = 10000;          // 획 좌표 정규화 단위 (카드 크기 대비)
const LW = 4;             // 펜 굵기(px)
const INK = '#1d3c8f';
const app = document.getElementById('app');
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// ---------- 저장 ----------
const KEY = 'tumath.v1';
const S = load();
function load() {
  const d = { pin: null, allowTouch: false, timer: false, current: null, last: null, retry: [], history: [] };
  try { return Object.assign(d, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { return d; }
}
let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { console.warn('save failed', e); }
}
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); }
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { timerStop(); save(); }
  else if (curScreen === 'sheet') timerStart();
});

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
}
const fmtTime = ms => {
  const s = Math.round(ms / 1000), m = Math.floor(s / 60);
  return m ? `${m}분 ${s % 60}초` : `${s}초`;
};

// ---------- 문제 생성 ----------
const rnd = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const d2 = () => rnd(1, 9) * 10 + rnd(1, 9);
const SYM = { '+': '+', '-': '−', '×': '×' };
const BOXES = { '+': 3, '-': 2, '×': 2 };
const answer = p => p.op === '+' ? p.a + p.b : p.op === '-' ? p.a - p.b : p.a * p.b;
const keyOf = p => `${p.a}${p.op}${p.b}`;

// 예시 학습지 비율 (세로셈 v 10문제 / 가로셈 h 10문제)
//   덧셈: 받아올림 없음 3, 받아올림 7, 세 자리 답 10 (일의 자리 올림 포함 7, 십의 자리만 3)
//   뺄셈: 받아내림 없음 6, 받아내림 14
const RATIO = {
  '+': { v: { none: 2, carry: 5, both: 2, hund: 1 }, h: { none: 1, carry: 2, both: 5, hund: 2 } },
  '-': { v: { none: 5, borrow: 5 }, h: { none: 1, borrow: 9 } },
};

function addProblem(kind) {
  for (;;) {
    const a = d2(), b = d2(), ones = a % 10 + b % 10 >= 10, s = a + b;
    if (kind === 'none' && !ones && s < 100) return [a, b];
    if (kind === 'carry' && ones && s < 100) return [a, b];
    if (kind === 'both' && ones && s >= 100) return [a, b];
    if (kind === 'hund' && !ones && s >= 100) return [a, b];
  }
}
function subProblem(kind) {
  for (;;) {
    const a = rnd(2, 9) * 10 + rnd(0, 9), b = rnd(1, 9) * 10 + rnd(1, 9);
    if (a <= b) continue;
    const borrow = a % 10 < b % 10;
    if ((kind === 'borrow') === borrow) return [a, b];
  }
}
function makeArith(op) {
  const gen = op === '+' ? addProblem : subProblem, seen = new Set();
  const pick = fmt => shuffle(Object.entries(RATIO[op][fmt]).flatMap(([k, n]) => Array(n).fill(k))).map(k => {
    let p;
    do { p = gen(k); } while (seen.has(p.join()));
    seen.add(p.join());
    return { op, a: p[0], b: p[1], fmt };
  });
  const v = pick('v'), h = pick('h');
  // 한 화면 = 학습지 한 줄 (세로셈 2 + 가로셈 2)
  return [0, 1, 2, 3, 4].map(r => [v[2 * r], v[2 * r + 1], h[2 * r], h[2 * r + 1]]);
}
function makeMul(dan) {
  const nums = () => shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const L = nums();
  let R;
  do { R = nums(); } while (R.join() === L.join());
  const row = i => [{ op: '×', a: dan, b: L[i], fmt: 'h' }, { op: '×', a: dan, b: R[i], fmt: 'h' }];
  return [0, 1].map(pg => [0, 1, 2, 3, 4].flatMap(r => row(pg * 5 + r)));
}
function makeMulMixed() {
  const seen = new Set(), out = [];
  while (out.length < 20) {
    const p = { op: '×', a: rnd(2, 9), b: rnd(1, 10), fmt: 'h' };
    if (!seen.has(keyOf(p))) { seen.add(keyOf(p)); out.push(p); }
  }
  return [out.slice(0, 10), out.slice(10)];
}
function paginate(probs) {
  const arith = probs.filter(p => p.op !== '×'), mul = probs.filter(p => p.op === '×'), pages = [];
  for (let i = 0; i < arith.length; i += 4) pages.push(arith.slice(i, i + 4).sort((x, y) => (x.fmt === 'v' ? 0 : 1) - (y.fmt === 'v' ? 0 : 1)));
  for (let i = 0; i < mul.length; i += 10) pages.push(mul.slice(i, i + 10));
  return pages;
}

// ---------- 학습 세션 ----------
const flat = c => c.pages.flat();
const offset = (c, pg) => c.pages.slice(0, pg).reduce((n, p) => n + p.length, 0);
const layoutOf = pg => pg.every(p => p.op === '×') ? 'grid-mul' : 'grid-arith';
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
function cardHTML(p, k, withAnswer) {
  const tag = withAnswer ? `<div class="answer-tag">${answer(p)}</div>` : '';
  if (p.fmt === 'v') {
    const n = BOXES[p.op];
    const digits = x => String(x).padStart(n, ' ').split('').map(d => `<span>${d.trim()}</span>`).join('');
    return `<div class="card v" data-k="${k}">
      <div class="vbox" style="--n:${n}"><div class="memo"></div>
        <span></span>${digits(p.a)}<span>${SYM[p.op]}</span>${digits(p.b)}
        <div class="rule"></div><span></span>${'<div class="box"></div>'.repeat(n)}</div>
      <canvas class="ink"></canvas><div class="mark"></div>${tag}</div>`;
  }
  return `<div class="card h${p.op === '×' ? ' mul' : ''}" data-k="${k}">
    <div class="hline"><span class="expr">${p.a} ${SYM[p.op]} ${p.b} =</span>${'<div class="box"></div>'.repeat(BOXES[p.op])}</div>
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

// 카드 위에 손글씨 캔버스 연결. list()는 이 카드의 획 배열을 돌려줌.
function attachInk(card, list, interactive) {
  const k = +card.dataset.k, cv = $('canvas', card), ctx = cv.getContext('2d');
  let w = 0, h = 0, dpr = 1, cur = null;
  const pen = () => { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; };
  const redraw = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    pen();
    list().forEach(s => drawStroke(ctx, s, w, h));
  };
  card.redraw = redraw;
  new ResizeObserver(() => {
    w = card.clientWidth; h = card.clientHeight; dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    redraw();
  }).observe(card);
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

// ---------- 화면: 홈 ----------
function home() {
  setScreen('home');
  const c = S.current;
  let banner = '';
  if (c && c.status === 'solving') banner = `<div class="banner">풀던 학습지가 있어요 · ${c.title}<button class="btn primary" data-act="resume">이어서 풀기</button></div>`;
  if (c && c.status === 'submitted') banner = `<div class="banner">채점을 기다리는 학습지가 있어요 · ${c.title}<button class="btn primary" data-act="grade">부모님 채점하기</button></div>`;
  app.innerHTML = `
    <header class="bar"><div class="title">연산 연습</div><button class="icon-btn" data-act="parent" aria-label="부모님 메뉴">⚙️</button></header>
    <main class="home">
      ${banner}
      <div class="choices">
        <button class="choice add" data-act="add"><b>+</b><span>덧셈</span><small>두 자리 수</small></button>
        <button class="choice sub" data-act="sub"><b>−</b><span>뺄셈</span><small>두 자리 수</small></button>
        <button class="choice mul" data-act="mul"><b>×</b><span>곱셈</span><small>구구단</small></button>
      </div>
      ${S.retry.length ? `<button class="retry-btn" data-act="retry">틀린 문제 다시 풀기 <span class="count">${S.retry.length}</span></button>` : ''}
    </main>`;
  app.onclick = e => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'add') begin('두 자리 수 덧셈', makeArith('+'));
    else if (a === 'sub') begin('두 자리 수 뺄셈', makeArith('-'));
    else if (a === 'mul') chooseMul();
    else if (a === 'retry') begin('틀린 문제 다시 풀기', paginate(S.retry.slice(0, 20).map(p => ({ ...p }))));
    else if (a === 'resume') sheet();
    else if (a === 'grade') requirePin(grade, home);
    else if (a === 'parent') requirePin(parent, home);
  };
}
async function chooseMul() {
  const v = await modal('<h3>몇 단을 할까요?</h3>',
    [...[2, 3, 4, 5, 6, 7, 8, 9].map(d => ({ label: `${d}단`, value: d })),
      { label: '섞어서', value: 'mix', primary: true }, { label: '취소', value: null }], 'dan-grid');
  if (v == null) return;
  if (v === 'mix') begin('구구단 섞어서', makeMulMixed());
  else begin(`${v}단`, makeMul(v));
}

// ---------- 화면: 학습지 ----------
function sheet() {
  const c = S.current, pg = c.pages[c.page], off = offset(c, c.page), last = c.page === c.pages.length - 1;
  const dots = c.pages.map((p, i) => {
    const cls = i === c.page ? 'on' : p.some((_, j) => hasInk(c, offset(c, i) + j)) ? 'done' : '';
    return `<button data-act="go" data-p="${i}" aria-label="${i + 1}쪽"><i class="${cls}"></i></button>`;
  }).join('');
  app.innerHTML = `
    <header class="bar">
      <button class="icon-btn" data-act="home" aria-label="처음으로">🏠</button>
      <div class="title">${c.title}<small>${c.page + 1} / ${c.pages.length}</small></div>
      <div class="tools">
        <button class="tool${tool === 'pen' ? ' on' : ''}" data-act="pen" aria-label="펜">✏️</button>
        <button class="tool${tool === 'eraser' ? ' on' : ''}" data-act="eraser" aria-label="지우개">🧽</button>
        <button class="tool" data-act="undo" aria-label="되돌리기">↩️</button>
      </div>
    </header>
    <main class="page ${layoutOf(pg)}">${pg.map((p, i) => cardHTML(p, off + i)).join('')}</main>
    <footer class="nav">
      <button class="btn" data-act="prev"${c.page === 0 ? ' disabled' : ''}>◀ 이전</button>
      <div class="dots">${dots}</div>
      ${last ? '<button class="btn primary" data-act="submit">다 풀었어요!</button>' : '<button class="btn primary" data-act="next">다음 ▶</button>'}
    </footer>`;
  $$('.page .card').forEach(cd => { const k = cd.dataset.k; attachInk(cd, () => c.ink[k] || (c.ink[k] = []), true); });
  setScreen('sheet');
  const main = $('main.page');
  new ResizeObserver(() => {
    if (!main.isConnected || !main.clientWidth || !main.clientHeight) return;   // 화면 전환으로 사라질 때는 무시
    c.pageSize = [main.clientWidth, main.clientHeight];
    saveSoon();
  }).observe(main);
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
  $$('.card', box).forEach(cd => { const k = cd.dataset.k; attachInk(cd, () => sess.ink[k] || [], false); });
  const fit = () => {
    const [pw, ph] = sess.pageSize && sess.pageSize[1] ? sess.pageSize : [1248, 620];
    if (!box.clientWidth) return;
    const cols = box.clientWidth > 900 ? 2 : 1, tw = (box.clientWidth - 32 - 16 * (cols - 1)) / cols, s = tw / pw;
    $$('.mini', box).forEach(m => {
      m.style.width = `${tw}px`; m.style.height = `${ph * s}px`;
      Object.assign(m.firstElementChild.style, { width: `${pw}px`, height: `${ph}px`, transform: `scale(${s})` });
    });
  };
  fit();
  new ResizeObserver(fit).observe(box);
}
const paintMarks = marks => $$('.minis .card').forEach(cd => {
  cd.classList.toggle('is-o', marks[cd.dataset.k] === 'o');
  cd.classList.toggle('is-x', marks[cd.dataset.k] === 'x');
});

// ---------- 화면: 채점 (부모) ----------
function grade() {
  setScreen('grade');
  const c = S.current, probs = flat(c);
  if (!c.marks) c.marks = probs.map((_, k) => hasInk(c, k) ? 'o' : 'x');
  const time = S.timer && c.elapsed ? ` · ⏱ ${fmtTime(c.elapsed)}` : '';
  app.innerHTML = `
    <header class="bar">
      <button class="icon-btn" data-act="home" aria-label="처음으로">🏠</button>
      <div class="title">채점하기<small>${c.title}${time}</small></div>
      <button class="btn primary" data-act="finish">채점 완료 · <span id="sc"></span></button>
    </header>
    <div class="grade-help">초록색이 정답이에요. 틀린 문제만 눌러서 <b>빗금</b>으로 바꿔 주세요. 빈칸은 미리 빗금으로 되어 있어요.</div>
    <div class="minis grading"></div>`;
  renderMinis(c, true);
  const refresh = () => { paintMarks(c.marks); $('#sc').textContent = `${c.marks.filter(m => m === 'o').length} / ${probs.length}`; };
  refresh();
  app.onclick = e => {
    const card = e.target.closest('.minis .card');
    if (card) { const k = +card.dataset.k; c.marks[k] = c.marks[k] === 'o' ? 'x' : 'o'; refresh(); saveSoon(); return; }
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'home') { save(); home(); }
    else if (a === 'finish') finish();
  };
}
function finish() {
  const c = S.current, probs = flat(c);
  let score = 0;
  probs.forEach((p, k) => {
    const key = keyOf(p);
    if (c.marks[k] === 'o') { score++; S.retry = S.retry.filter(r => keyOf(r) !== key); }
    else if (!S.retry.some(r => keyOf(r) === key)) S.retry.push({ op: p.op, a: p.a, b: p.b, fmt: p.fmt });
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
  const msg = r === 1 ? '모두 맞았어요! 최고예요 🎉' : r >= .8 ? '참 잘했어요! 👍' : '조금만 더 힘내요! 💪';
  app.innerHTML = `
    <header class="bar"><button class="icon-btn" data-act="home" aria-label="처음으로">🏠</button><div class="title">${L.title} 결과</div></header>
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
function parent() {
  setScreen('parent');
  const rows = S.history.slice(0, 50).map(h => {
    const d = new Date(h.date).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const t = S.timer ? `<td class="t">${h.elapsed ? fmtTime(h.elapsed) : ''}</td>` : '';
    return `<tr><td>${d}</td><td>${h.title}</td>${t}<td>${h.score} / ${h.total}</td></tr>`;
  }).join('');
  app.innerHTML = `
    <header class="bar"><button class="icon-btn" data-act="home" aria-label="처음으로">🏠</button><div class="title">부모님 메뉴</div></header>
    <main class="parent">
      <section><h3>설정</h3>
        <label class="switch-row"><span>손가락으로도 쓰기<small>끄면 S펜으로만 써져요 (손바닥이 닿아도 안 써짐)</small></span>
          <input type="checkbox" id="touch"${S.allowTouch ? ' checked' : ''}></label>
        <label class="switch-row"><span>풀이 시간 재기<small>다 푼 뒤 결과 화면과 기록에 걸린 시간이 나와요 (풀 때는 안 보여요)</small></span>
          <input type="checkbox" id="timer"${S.timer ? ' checked' : ''}></label>
        <div class="row" style="justify-content:flex-start">
          <button class="btn" data-act="pin">비밀번호 바꾸기</button>
          <button class="btn" data-act="clear"${S.retry.length ? '' : ' disabled'}>다시 풀기 목록 비우기 (${S.retry.length})</button>
        </div>
      </section>
      <section><h3>기록</h3>${rows ? `<table class="history">${rows}</table>` : '<p class="empty">아직 기록이 없어요.</p>'}</section>
    </main>`;
  $('#touch').onchange = e => { S.allowTouch = e.target.checked; save(); };
  $('#timer').onchange = e => { S.timer = e.target.checked; save(); parent(); };
  app.onclick = async e => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'home') home();
    else if (a === 'pin') setPin(parent, parent);
    else if (a === 'clear' && await modal('<p>다시 풀기 목록을 비울까요?</p>', [{ label: '취소', value: false }, { label: '비우기', value: true, primary: true }])) {
      S.retry = []; save(); parent();
    }
  };
}

// ---------- 비밀번호 ----------
function pinPad({ title, sub, onCode, onCancel }) {
  setScreen('pin');
  let code = '';
  app.innerHTML = `
    <header class="bar"><button class="icon-btn" data-act="cancel" aria-label="닫기">✕</button><div class="title"></div></header>
    <main class="center pin"><h2>${title}</h2><p>${sub}</p><div class="pin-dots">${'<i></i>'.repeat(4)}</div>
      <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-n="${n}">${n}</button>`).join('')}
        <span></span><button data-n="0">0</button><button data-act="del" aria-label="지우기">⌫</button></div></main>`;
  const dots = $$('.pin-dots i'), paint = () => dots.forEach((d, i) => d.classList.toggle('on', i < code.length));
  app.onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'cancel') return onCancel();
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
function setPin(next, cancel) {
  pinPad({
    title: '부모님 비밀번호 정하기', sub: '아이가 모르는 숫자 4자리를 눌러 주세요', onCancel: cancel,
    onCode: first => pinPad({
      title: '한 번 더 눌러 주세요', sub: '확인을 위해 같은 숫자를 다시 눌러 주세요', onCancel: cancel,
      onCode: second => {
        if (second !== first) return false;
        S.pin = first; save(); next();
      },
    }),
  });
}
function requirePin(next, cancel) {
  if (!S.pin) return setPin(next, cancel);
  pinPad({ title: '부모님 확인', sub: '비밀번호 4자리를 눌러 주세요', onCancel: cancel, onCode: c => c === S.pin ? next() : false });
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

// ---------- 시작 ----------
if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
home();
