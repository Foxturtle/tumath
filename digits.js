'use strict';
// 손글씨 숫자 인식 — 앱 안에서, 인터넷 없이.
// 모델: model/digits.bin (MNIST로 학습한 작은 CNN, 구조는 학습 스크립트와 같아야 함)
//   conv3x3(1→16) ReLU pool2 → conv3x3(16→32) ReLU pool2 → fc(1568→64) ReLU → fc(64→10)

const Digits = (() => {
  let W = null;

  async function load() {
    if (W) return W;
    const r = await fetch('model/digits.bin');
    if (!r.ok) throw new Error(`model ${r.status}`);
    const f = new Float32Array(await r.arrayBuffer());
    let o = 0;
    const take = n => { const a = f.subarray(o, o + n); o += n; return a; };
    const w = {
      c1w: take(16 * 9), c1b: take(16), c2w: take(32 * 16 * 9), c2b: take(32),
      f1w: take(64 * 1568), f1b: take(64), f2w: take(10 * 64), f2b: take(10),
    };
    if (o !== f.length) throw new Error('model size mismatch');
    return (W = w);
  }

  // ---------- 신경망 계산 ----------
  function conv3(inp, C, H, Wd, w, b, O) {          // 3x3, 패딩 1, ReLU
    const out = new Float32Array(O * H * Wd);
    for (let o = 0; o < O; o++) {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < Wd; x++) {
          let s = b[o];
          for (let c = 0; c < C; c++) {
            const ib = c * H * Wd, wb = (o * C + c) * 9;
            for (let ky = 0; ky < 3; ky++) {
              const yy = y + ky - 1;
              if (yy < 0 || yy >= H) continue;
              for (let kx = 0; kx < 3; kx++) {
                const xx = x + kx - 1;
                if (xx < 0 || xx >= Wd) continue;
                s += inp[ib + yy * Wd + xx] * w[wb + ky * 3 + kx];
              }
            }
          }
          out[(o * H + y) * Wd + x] = s > 0 ? s : 0;
        }
      }
    }
    return out;
  }
  function pool2(inp, C, H, Wd) {
    const h = H >> 1, w = Wd >> 1, out = new Float32Array(C * h * w);
    for (let c = 0; c < C; c++) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (c * H + 2 * y) * Wd + 2 * x;
          out[(c * h + y) * w + x] = Math.max(inp[i], inp[i + 1], inp[i + Wd], inp[i + Wd + 1]);
        }
      }
    }
    return out;
  }
  function dense(inp, w, b, O, relu) {
    const n = inp.length, out = new Float32Array(O);
    for (let o = 0; o < O; o++) {
      let s = b[o];
      for (let i = 0; i < n; i++) s += inp[i] * w[o * n + i];
      out[o] = relu && s < 0 ? 0 : s;
    }
    return out;
  }
  function classify(img) {                          // img: Float32Array(784), 0~1
    let x = pool2(conv3(img, 1, 28, 28, W.c1w, W.c1b, 16), 16, 28, 28);
    x = pool2(conv3(x, 16, 14, 14, W.c2w, W.c2b, 32), 32, 14, 14);
    x = dense(dense(x, W.f1w, W.f1b, 64, true), W.f2w, W.f2b, 10, false);
    const m = Math.max(...x), e = x.map(v => Math.exp(v - m)), sum = e.reduce((a, v) => a + v, 0);
    let d = 0;
    for (let i = 1; i < 10; i++) if (e[i] > e[d]) d = i;
    return { d, p: e[d] / sum };
  }

  // ---------- 획 → 28x28 이미지 (MNIST와 같은 방식: 20x20 안에 맞추고 무게중심을 가운데로) ----------
  const cv = document.createElement('canvas');
  cv.width = cv.height = 28;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const LINE = 2.4;   // 28px 이미지 기준 획 굵기 (MNIST 글씨 굵기와 비슷하게)

  function draw(strokes, s, dx, dy) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, 28, 28);
    ctx.lineWidth = LINE; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#000';
    for (const st of strokes) {
      ctx.beginPath();
      ctx.moveTo(st[0] * s + dx, st[1] * s + dy);
      if (st.length === 2) ctx.lineTo(st[0] * s + dx + .01, st[1] * s + dy);
      for (let i = 2; i < st.length; i += 2) ctx.lineTo(st[i] * s + dx, st[i + 1] * s + dy);
      ctx.stroke();
    }
    const px = ctx.getImageData(0, 0, 28, 28).data, img = new Float32Array(784);
    for (let i = 0; i < 784; i++) img[i] = px[i * 4 + 3] / 255;
    return img;
  }
  function toImage(strokes, bb) {                   // strokes: [[x,y,x,y...]] (px)
    const bw = bb.x1 - bb.x0, bh = bb.y1 - bb.y0;
    const s = (20 - LINE) / Math.max(bw, bh, 1);
    let dx = 14 - (bb.x0 + bw / 2) * s, dy = 14 - (bb.y0 + bh / 2) * s;
    let img = draw(strokes, s, dx, dy);
    let m = 0, mx = 0, my = 0;
    for (let y = 0; y < 28; y++) for (let x = 0; x < 28; x++) { const v = img[y * 28 + x]; m += v; mx += v * x; my += v * y; }
    if (m > 0) {
      dx += 13.5 - mx / m; dy += 13.5 - my / m;
      img = draw(strokes, s, dx, dy);
    }
    return img;
  }

  // ---------- 답 칸 영역의 획을 숫자별로 나누기 ----------
  const bbox = st => {
    const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (let i = 0; i < st.length; i += 2) {
      b.x0 = Math.min(b.x0, st[i]); b.x1 = Math.max(b.x1, st[i]);
      b.y0 = Math.min(b.y0, st[i + 1]); b.y1 = Math.max(b.y1, st[i + 1]);
    }
    return b;
  };
  const union = (a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });

  // 가로로 많이 겹치는 획끼리 한 숫자로 묶음 (4, 5, 7처럼 두 번에 쓰는 숫자)
  function group(items) {
    const groups = items.map(it => ({ bb: it.bb, strokes: [it.st] }));
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < groups.length && !merged; i++) {
        for (let j = i + 1; j < groups.length && !merged; j++) {
          const a = groups[i].bb, b = groups[j].bb;
          const ov = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
          const narrow = Math.max(4, Math.min(a.x1 - a.x0, b.x1 - b.x0));
          const [n, wide] = a.x1 - a.x0 < b.x1 - b.x0 ? [a, b] : [b, a];
          const m = (wide.x1 - wide.x0) * .15, nc = (n.x0 + n.x1) / 2;
          const inside = nc > wide.x0 - m && nc < wide.x1 + m;   // 4의 세로획처럼 다른 획 안(또는 끝 근처)에 그은 획
          if (ov > narrow * .4 || inside) {
            groups[i] = { bb: union(a, b), strokes: groups[i].strokes.concat(groups[j].strokes) };
            groups.splice(j, 1);
            merged = true;
          }
        }
      }
    }
    return groups.sort((a, b) => (a.bb.x0 + a.bb.x1) - (b.bb.x0 + b.bb.x1));
  }

  // region: {x0,y0,x1,y1} (px) — 이 안에 획 중심이 있는 것만 답으로 봄 (올림 메모 등은 제외)
  // strokes: [[x,y,x,y...]] (px)
  function read(strokes, region) {
    const items = [];
    for (const st of strokes) {
      const bb = bbox(st), cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
      if (cx < region.x0 || cx > region.x1 || cy < region.y0 || cy > region.y1) continue;
      if (Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) < 3) continue;   // 실수로 찍힌 점
      items.push({ st, bb });
    }
    const out = group(items).map(g => classify(toImage(g.strokes, g.bb)));
    return { text: out.map(o => o.d).join(''), conf: out.length ? Math.min(...out.map(o => o.p)) : 1, digits: out };
  }

  return { load, read, classify, toImage };
})();
