/**
 * 无头运行环境：wx / canvas / 计时 / 随机数 桩
 * test/smoke.js（冒烟测试）与 tools/sim.js（对局模拟器）共用同一套桩：
 * 一份桩两个消费者，避免各自漂移，也保证模拟器跑的就是玩家真会跑到的代码路径。
 */
'use strict';

// 2D 上下文的方法表（fast 模式用固定对象，比 Proxy 快一个量级，模拟器才跑得动 200 局）
const CTX_METHODS = [
  'fillRect', 'clearRect', 'strokeRect', 'beginPath', 'closePath', 'moveTo', 'lineTo',
  'arc', 'arcTo', 'quadraticCurveTo', 'bezierCurveTo', 'ellipse', 'rect',
  'fill', 'stroke', 'save', 'restore', 'translate', 'scale', 'rotate',
  'setTransform', 'resetTransform', 'setLineDash', 'getLineDash', 'clip',
  'drawImage', 'fillText', 'strokeText', 'putImageData', 'isPointInPath',
];

function makeFastCtx(rec) {
  const ctx = {
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => null,
    getImageData: () => ({ data: [] }),
  };
  CTX_METHODS.forEach((m) => {
    ctx[m] = (rec && (m === 'fillText' || m === 'strokeText')) ? (t) => rec(String(t)) : () => 0;
  });
  return ctx;
}

// Proxy 版：未知方法也安全（冒烟测试用；新增 ctx 方法不会让测试直接炸）
function makeSlowCtx(rec) {
  const t = {};
  return new Proxy(t, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'measureText') return () => ({ width: 10 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') {
        return () => ({ addColorStop() {} });
      }
      if (rec && (key === 'fillText' || key === 'strokeText')) return (s) => rec(String(s));
      return () => 0; // 其余方法一律 no-op
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
}

function createHarness(opts) {
  const o = opts || {};
  const storageMap = new Map();
  const touchHandlers = {};
  const events = [];   // wx.reportAnalytics 上报的事件（埋点验证 + 指标来源）
  const shares = [];   // wx.shareAppMessage / wx.onShareAppMessage 的调用记录
  const toasts = [];   // wx.showToast 文案
  let shareHandler = null;
  let rafCb = null;
  let now = 0;
  let seed = o.seed === undefined ? 42 : o.seed;

  // 绘制文本环形缓冲（recordText 开启时）：让测试能验证"界面上真的画了这句话"
  const TEXT_CAP = 2000;
  const textBuf = new Array(TEXT_CAP);
  let textIdx = 0;
  let textCount = 0;
  function rec(s) {
    textBuf[textIdx] = s;
    textIdx = (textIdx + 1) % TEXT_CAP;
    if (textCount < TEXT_CAP) textCount++;
  }

  // 固定随机种子的 LCG：测试与模拟器都可复现
  function rng() {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  }

  const ctx = o.fast ? makeFastCtx(o.recordText ? rec : null) : makeSlowCtx(o.recordText ? rec : null);
  const fakeCanvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
  };

  const H = {
    storageMap,
    touchHandlers,
    events,
    shares,
    toasts,
    ctx,
    get seed() { return seed; },
    setSeed(v) { seed = v; },
    get shareHandler() { return shareHandler; },
    get now() { return now; },

    // 载入游戏代码之前调用（js/render.js 在 require 时就会碰 wx）
    install() {
      global.wx = {
        getSystemInfoSync: () => ({
          windowWidth: 375, windowHeight: 667, pixelRatio: 2, platform: 'devtools',
        }),
        createCanvas: () => fakeCanvas,
        onTouchStart: (cb) => { touchHandlers.start = cb; },
        onTouchMove: (cb) => { touchHandlers.move = cb; },
        onTouchEnd: (cb) => { touchHandlers.end = cb; },
        onTouchCancel: (cb) => { touchHandlers.end = cb; },
        getStorageSync: (k) => (storageMap.has(k) ? storageMap.get(k) : ''),
        setStorageSync: (k, v) => { storageMap.set(k, v); },
        createInnerAudioContext: () => ({
          src: '', loop: false,
          play() {}, pause() {}, stop() {}, onError() {}, destroy() {},
        }),
        vibrateShort() {},
        showToast(opt) { toasts.push(opt && opt.title); global.__lastToast = opt && opt.title; },
        shareAppMessage(opt) { shares.push(opt); },
        showShareMenu() {},
        onShareAppMessage(cb) { shareHandler = cb; },
        reportAnalytics(ev, params) { events.push({ ev, params: params || null }); },
      };
      global.GameGlobal = {};
      global.__lastToast = null;
      Math.random = rng;
      global.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
      global.cancelAnimationFrame = () => {};
      return H;
    },

    // ---------- 时间推进 ----------
    frame(dtMs) {
      now += dtMs === undefined ? 16.7 : dtMs;
      const cb = rafCb;
      rafCb = null;
      if (cb) cb(now);
    },

    step(seconds) {
      const frames = Math.round(seconds * 60);
      for (let i = 0; i < frames; i++) H.frame();
    },

    // ---------- 输入（与真人同一条入口） ----------
    touch(name, x, y) {
      const cb = touchHandlers[name];
      if (!cb) throw new Error(`no handler: ${name}`);
      cb({ touches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }] });
    },

    // 点按：弹层有 justOpened 防误触，首次点按会被吞掉，因此点两次
    tap(x, y) {
      H.touch('start', x, y);
      H.touch('start', x, y);
    },

    center(r) {
      return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    },

    // 拖拽：从 a 格拖到 b 格（合成/换位，与真人操作路径一致）
    drag(from, to) {
      H.touch('start', from.x, from.y);
      H.touch('move', (from.x + to.x) / 2, (from.y + to.y) / 2);
      H.touch('move', to.x, to.y);
      H.touch('end', to.x, to.y);
    },

    // 事件计数（埋点验证 / 指标）
    countEvents(ev) {
      return events.filter((e) => e.ev === ev).length;
    },

    clearEvents() {
      events.length = 0;
    },

    // 最近绘制过的文本（recordText: true 时可用）
    texts() {
      const out = [];
      for (let k = 0; k < textCount; k++) out.push(textBuf[(textIdx - textCount + k + TEXT_CAP) % TEXT_CAP]);
      return out;
    },

    hasText(sub) {
      const all = H.texts();
      for (const s of all) if (s.indexOf(sub) >= 0) return true;
      return false;
    },

    clearTexts() {
      textIdx = 0;
      textCount = 0;
    },
  };

  return H;
}

module.exports = { createHarness, makeFastCtx, makeSlowCtx };
