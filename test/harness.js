/**
 * 无头运行环境：wx / canvas / 计时 / 随机数 桩
 * test/smoke.js（冒烟测试）与 tools/sim.js（对局模拟器）共用同一套桩：
 * 一份桩两个消费者，避免各自漂移，也保证模拟器跑的就是玩家真会跑到的代码路径。
 *
 * ============================================================================
 * 忠实度原则（P13 起）：桩要尽量对齐真机语义，否则"全绿"盖不住真缺陷。
 * 旧桩把三件事简化掉了，而这三件恰好是本轮缺陷的温床：
 *   1) 激励视频：旧桩根本没有 wx.createRewardedVideoAd，测试与模拟器 100% 走
 *      simulate 分支 —— tryShow 重试链 / onClose / isEnded / offClose / 看门狗全测不到。
 *   2) 存档：旧桩按【引用】存取同一个对象 —— 掩盖了"序列化后 undefined 字段被丢弃"
 *      与"别名污染"（改内存里的 meta 不会自动落盘、读出来的不是同一个对象）。
 *   3) 前后台：旧桩 onHide 只让游戏自己 paused=true，测试仍在喂帧 —— 真机切后台
 *      一帧都不出，看门狗/广告回调在后台根本不会推进。
 * ============================================================================
 *
 * ---------- 激励视频广告桩用法（给 test/smoke.js / tools/sim.js） ----------
 *   const ad = H.ads.last;            // 最近一次 wx.createRewardedVideoAd() 返回的实例
 *   ad.listeners.close.length         // 已注册 close 监听数（测监听器泄漏：offClose 后应归零）
 *   ad.close({ isEnded: true });      // 触发【所有】close 监听：看完
 *   ad.close({ isEnded: false });     // 触发【所有】close 监听：中途关
 *   ad.close();                       // 同上，默认 isEnded:true
 *   ad.close(undefined);              // 基础库 < 2.1.0 语义：res 是 undefined（官方文档：此时算看完）
 *
 *   // 加载/失败分支（三个层次，语义不同，别混用）：
 *   ad.failShows(n)   // 接下来 n 次 show() reject（省略 n = 一直失败）。对应"自动拉取失败"
 *   ad.failLoads(n)   // 接下来 n 次 load() reject（省略 n = 一直失败）。对应"手动重拉失败"
 *   ad.failFetch(n)   // 自动拉取失败：onError 回调执行 + 下一次 show() reject（官方文档语义）
 *   ad.failAll()      // show 与 load 都一直失败（模拟"广告位彻底没填充"）
 *   ad.succeed()      // 恢复：清空失败计数、loaded=true
 *   ad.setLoaded(false) // show() 直接 reject（"还没加载完"）
 *   ad.emitError(err) / ad.emitLoad(res)   // 手动喂事件（res 可为 {useFallbackSharePage:true}）
 *
 *   // 回调完全不触发（喂看门狗）：照常 show()，然后【不要】调 close()，直接推进时间。
 *   // 注意：切后台（H.hide()）期间不喂帧，所以看门狗在后台也不会走 —— 与真机一致。
 *
 *   // 观测：
 *   ad.showCalls / ad.loadCalls / ad.destroyCalls / ad.closePayloads
 *   ad.playing（show 成功且尚未 close）/ ad.loaded
 *   ad.closeListenerCount / ad.pendingShowFailures / ad.pendingLoadFailures
 *   H.ads.instances / H.ads.byUnit(id) / H.ads.reset()（清实例表，测试隔离用）
 *
 *   真机语义（已按官方文档对齐）：
 *   * 同一个 adUnitId 多次 createRewardedVideoAd 返回【同一实例】（小游戏端全局单例）
 *   * onClose/onLoad/onError 是【订阅】语义（push），offClose(cb) 按引用删；
 *     offClose() 不传参 = 移除该事件的全部监听；close 时【所有】已注册回调都会被调用。
 *     这正是"监听器泄漏 → 没看广告也发奖"的成因：单槽桩（closedCb = cb 覆盖）
 *     在结构上不可能复现它。
 *
 * ---------- 存档桩用法 ----------
 *   H.storageGet(k) / H.storageSet(k, v)  // 与 wx.getStorageSync / wx.setStorageSync 同一条实现
 *   H.storageRaw(k)                       // 底层原始序列化字符串（真机底层也是字符串）
 *   H.storageMap.get(k)                   // 同上；注意是【字符串】不是对象，别再当对象用
 *   H.storageClear() / H.storageKeys()
 *   真机语义：set 时 JSON 序列化、get 时反序列化 ⇒ 拿到的是快照副本；
 *   undefined/函数字段会消失；NaN/Infinity 变 null；读出来的 key 不存在时返回 ''。
 *
 * ---------- 前后台 ----------
 *   H.hide() / H.show()               // 同时驱动所有 wx.onHide / wx.onShow 监听
 *   H.hidden / H.frameCount / H.hiddenFrameSkips
 *   hidden 期间 H.frame()/H.step() 不推进时间、不驱动 rAF 回调（真机一帧都不出），
 *   返回 false；回前台后已排队的那一帧照常执行。
 *
 * ---------- 其它 ----------
 *   H.press(x,y)  // 完整人类时序：touchstart + touchend（H.tap 保持旧语义：两次 touchstart，
 *                 // 用于穿透弹层 justOpened 防误触；改 tap 会改变现有用例的调用次数，故不动它）
 *   H.logs        // wx.getRealtimeLogManager().error 的记录（monitor.js 的错误上报）
 *   H.emitError / H.emitRejection  // 触发 wx.onError / wx.onUnhandledRejection 监听
 *   H.frameErrors // o.swallowFrameErrors 时收集的帧异常
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
// 顺带统计 ctx.font 赋值次数与 drawImage/fillRect 调用次数（性能优化是否有实效的证据）
function makeSlowCtx(rec) {
  const t = { __fontSets: 0, __drawImages: 0, __fillRects: 0 };
  return new Proxy(t, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'measureText') return () => ({ width: 10 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') {
        return () => ({ addColorStop() {} });
      }
      if (key === 'drawImage') return () => { target.__drawImages++; };
      if (key === 'fillRect') return () => { target.__fillRects++; };
      if (rec && (key === 'fillText' || key === 'strokeText')) return (s) => rec(String(s));
      return () => 0; // 其余方法一律 no-op
    },
    set(target, key, value) {
      if (key === 'font') target.__fontSets = (target.__fontSets || 0) + 1;
      target[key] = value;
      return true;
    },
  });
}

// 取消监听：真机 offXxx(cb) 按引用取消；offXxx() 不传参 = 取消该事件的全部监听
function removeListener(list, cb) {
  if (cb === undefined || cb === null) { list.length = 0; return; }
  for (let i = list.length - 1; i >= 0; i--) if (list[i] === cb) list.splice(i, 1);
}

function createHarness(opts) {
  const o = opts || {};
  const storageMap = new Map(); // key -> 原始序列化字符串（真机底层同样是字符串，不是活对象）
  const touchHandlers = {};
  const events = [];   // wx.reportAnalytics 上报的事件（埋点验证 + 指标来源）
  const shares = [];   // wx.shareAppMessage / wx.onShareAppMessage 的调用记录
  const toasts = [];   // wx.showToast 文案
  const audioCalls = []; // bgm 的 play/pause 调用记录（前后台切换验证用）
  const logs = [];     // wx.getRealtimeLogManager 的记录（monitor.js 的错误上报）
  let shareHandler = null;
  const hideHandlers = []; // 真机 onHide 是订阅语义，可以注册多个（旧 API H.hideHandler 取最后一个）
  const showHandlers = [];
  const errorHandlers = [];       // wx.onError
  const rejectionHandlers = [];   // wx.onUnhandledRejection
  let hideHandler = null;  // 兼容旧用法：H.hideHandler 仍是最近一次注册的回调
  let showHandler = null;
  let hidden = false;      // 切后台：真机一帧都不出
  let rafSeq = 0;
  const rafQueue = [];     // requestAnimationFrame 待执行队列（真机是队列，不是单槽）
  let frameCount = 0;      // 真正执行过的帧数
  let hiddenFrameSkips = 0; // hidden 期间被跳过的 frame()/step() 次数
  const frameErrors = [];  // o.swallowFrameErrors 时收集的帧异常
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

  // ---------- 存档：真机是"序列化落盘 + 反序列化读出" ----------
  // 关键差异（旧桩按引用存取，掩盖了这两类问题）：
  //   1) undefined / 函数字段序列化后消失，NaN/Infinity 变 null
  //   2) 读出来的是快照，改它不会影响存储；写进去的对象之后再改也不会影响存储
  function storageSet(key, value) {
    const raw = JSON.stringify(value);
    storageMap.set(String(key), raw === undefined ? '' : raw);
  }
  function storageGet(key) {
    const k = String(key);
    return rawToValue(storageMap.get(k), storageMap.has(k));
  }
  function rawToValue(raw, present) {
    if (!present || raw === undefined) return ''; // 真机：key 不存在返回 ''
    if (typeof raw !== 'string') return cloneValue(raw); // 兜底：测试直接往 storageMap 塞了对象
    try {
      return JSON.parse(raw);
    } catch (e) {
      return raw; // 纯字符串（非 JSON 文本）原样返回
    }
  }
  function cloneValue(v) {
    if (v === null || typeof v !== 'object') return v;
    try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
  }

  // ---------- 激励视频广告桩 ----------
  // 真机语义要点（官方文档）：
  //   * 同一个 adUnitId 多次 createRewardedVideoAd 拿到的是【同一个实例】，监听器会累加
  //   * onClose 是订阅（push），offClose 按引用删；close 事件会调用【所有】已注册回调
  //   * show() 返回 Promise；未加载完 / 自动拉取失败 / 正在播放 都会 reject
  //   * 自动拉取失败时 onError 回调会执行，且 show() reject
  //   * 基础库 < 2.1.0 时 onClose 的 res 是 undefined（此时算"看完"）
  const adRegistry = new Map(); // adUnitId -> 广告实例
  const adInstances = [];       // 创建顺序
  const ads = {
    get last() { return adInstances.length ? adInstances[adInstances.length - 1] : null; },
    get instances() { return adInstances; },
    byUnit(adUnitId) { return adRegistry.get(adUnitId === undefined ? '' : String(adUnitId)) || null; },
    reset() { adRegistry.clear(); adInstances.length = 0; },
    create(adUnitId) { return createRewardedVideoAd({ adUnitId }); },
  };

  function createRewardedVideoAd(cfg) {
    const unit = String((cfg && cfg.adUnitId) || '');
    let ad = adRegistry.get(unit);
    if (!ad) {
      ad = makeRewardedVideoAd(unit);
      adRegistry.set(unit, ad);
      adInstances.push(ad);
    }
    return ad;
  }

  function makeRewardedVideoAd(unit) {
    const listeners = { close: [], load: [], error: [] };
    const st = {
      loaded: true,      // 创建即自动拉取一次；默认拉取成功
      showFails: 0,      // >0 = 剩余失败次数；Infinity = 一直失败（自动拉取失败 → show reject）
      loadFails: 0,      // 手动 load() 的失败次数
      fetchFails: 0,     // 自动拉取失败次数（onError + show reject）
      playing: false,    // show() 成功且尚未 close
      destroyed: false,
    };
    const ad = {
      adUnitId: unit,
      listeners,                 // 测试可直接断言 listeners.close.length（监听器泄漏检测）
      showCalls: 0,
      loadCalls: 0,
      destroyCalls: 0,
      closePayloads: [],         // 每次 close(res) 透传的 res，用于断言"漏看的广告也发了奖"
      rejectShowWhilePlaying: false, // 打开后：广告还在播时再 show() 会 reject（真机行为，默认关）

      // ---- 真机 API ----
      onClose(cb) { if (typeof cb === 'function') listeners.close.push(cb); },
      offClose(cb) { removeListener(listeners.close, cb); },
      onLoad(cb) { if (typeof cb === 'function') listeners.load.push(cb); },
      offLoad(cb) { removeListener(listeners.load, cb); },
      onError(cb) { if (typeof cb === 'function') listeners.error.push(cb); },
      offError(cb) { removeListener(listeners.error, cb); },
      load() {
        ad.loadCalls++;
        return Promise.resolve().then(() => {
          if (st.destroyed) throw new Error('mock ad: destroyed');
          if (st.loadFails > 0) {
            if (st.loadFails !== Infinity) st.loadFails--;
            throw new Error('mock ad: load failed');
          }
          st.loaded = true;
          listeners.load.slice().forEach((cb) => cb());
        });
      },
      show() {
        ad.showCalls++;
        return Promise.resolve().then(() => {
          if (st.destroyed) throw new Error('mock ad: destroyed');
          if (!st.loaded) throw new Error('mock ad: not loaded');
          // 自动拉取失败：官方文档语义 = onError 回调执行 + show() reject
          if (st.fetchFails > 0) {
            if (st.fetchFails !== Infinity) st.fetchFails--;
            const err = { errCode: 1004, errMsg: 'mock ad: auto fetch failed' };
            listeners.error.slice().forEach((cb) => cb(err));
            throw new Error('mock ad: auto fetch failed');
          }
          if (st.showFails > 0) {
            if (st.showFails !== Infinity) st.showFails--;
            throw new Error('mock ad: show failed');
          }
          if (st.playing && ad.rejectShowWhilePlaying) throw new Error('mock ad: ad is playing');
          st.playing = true;
        });
      },
      destroy() {
        ad.destroyCalls++;
        st.destroyed = true;
        st.playing = false;
        removeListener(listeners.close);
        removeListener(listeners.load);
        removeListener(listeners.error);
      },

      // ---- 测试驱动（真机不会调，测试用来喂事件） ----
      // 关闭广告：所有已注册的 close 回调都会被调用（订阅语义），返回被调用的回调数。
      // 不传参 = {isEnded:true}；显式传 undefined = 基础库 <2.1.0 的 res（官方文档：算看完）
      close(res) {
        const payload = arguments.length === 0 ? { isEnded: true } : res;
        ad.closePayloads.push(payload);
        st.playing = false;
        const cbs = listeners.close.slice();
        cbs.forEach((cb) => cb(payload));
        return cbs.length;
      },
      emitLoad(res) { listeners.load.slice().forEach((cb) => cb(res)); },
      emitError(err) { listeners.error.slice().forEach((cb) => cb(err || { errCode: -1, errMsg: 'mock ad: error' })); },
      failShows(n) { st.showFails = n === undefined ? Infinity : n; return ad; },
      failLoads(n) { st.loadFails = n === undefined ? Infinity : n; return ad; },
      failFetch(n) { st.fetchFails = n === undefined ? Infinity : n; return ad; },
      failAll() { return ad.failShows().failLoads().failFetch(); },
      succeed() { st.showFails = 0; st.loadFails = 0; st.fetchFails = 0; st.loaded = true; return ad; },
      setLoaded(v) { st.loaded = !!v; return ad; },
      get loaded() { return st.loaded; },
      get playing() { return st.playing; },
      get closeListenerCount() { return listeners.close.length; },
      get pendingShowFailures() { return st.showFails; },
      get pendingLoadFailures() { return st.loadFails; },
      get pendingFetchFailures() { return st.fetchFails; },
    };
    return ad;
  }

  const ctx = o.fast ? makeFastCtx(o.recordText ? rec : null) : makeSlowCtx(o.recordText ? rec : null);
  const fakeCanvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
  };
  // 第一次 createCanvas = 上屏画布；之后的 = 离屏画布（离屏缓存需要一块独立的）
  let canvasCalls = 0;
  const offscreenCanvases = [];
  function createCanvas() {
    canvasCalls++;
    if (canvasCalls === 1) return fakeCanvas;
    const c = { width: 0, height: 0, getContext: () => makeSlowCtx(null), __offscreen: true };
    offscreenCanvases.push(c);
    return c;
  }

  const H = {
    storageMap,
    touchHandlers,
    events,
    shares,
    toasts,
    audioCalls,
    logs,
    ads,
    frameErrors,
    get ctx() { return ctx; },
    get seed() { return seed; },
    setSeed(v) { seed = v; },
    get shareHandler() { return shareHandler; },
    get hideHandler() { return hideHandler; },
    get showHandler() { return showHandler; },
    get hideHandlers() { return hideHandlers; },
    get showHandlers() { return showHandlers; },
    get hidden() { return hidden; },
    get rafPending() { return rafQueue.length; },
    get frameCount() { return frameCount; },
    get hiddenFrameSkips() { return hiddenFrameSkips; },
    get offscreenCanvases() { return offscreenCanvases; },
    get now() { return now; },

    // 载入游戏代码之前调用（js/render.js 在 require 时就会碰 wx）
    install() {
      global.wx = {
        getSystemInfoSync: () => ({
          windowWidth: 375, windowHeight: 667, pixelRatio: 3, platform: 'devtools',
        }),
        createCanvas: () => createCanvas(),
        onTouchStart: (cb) => { touchHandlers.start = cb; },
        onTouchMove: (cb) => { touchHandlers.move = cb; },
        onTouchEnd: (cb) => { touchHandlers.end = cb; },
        onTouchCancel: (cb) => { touchHandlers.end = cb; },
        getStorageSync: (k) => storageGet(k),
        setStorageSync: (k, v) => storageSet(k, v),
        removeStorageSync: (k) => { storageMap.delete(String(k)); },
        clearStorageSync: () => { storageMap.clear(); },
        createRewardedVideoAd: (cfg) => createRewardedVideoAd(cfg),
        getRealtimeLogManager: () => ({
          error(tag, msg) { logs.push({ level: 'error', tag, msg }); },
          warn(tag, msg) { logs.push({ level: 'warn', tag, msg }); },
          info(tag, msg) { logs.push({ level: 'info', tag, msg }); },
          flush() {},
        }),
        onError(cb) { if (typeof cb === 'function') errorHandlers.push(cb); },
        onUnhandledRejection(cb) { if (typeof cb === 'function') rejectionHandlers.push(cb); },
        createInnerAudioContext: () => {
          const a = {
            src: '', loop: false,
            play() { audioCalls.push('play'); },
            pause() { audioCalls.push('pause'); },
            stop() {}, onError() {}, destroy() {},
          };
          return a;
        },
        vibrateShort() {},
        showToast(opt) { toasts.push(opt && opt.title); global.__lastToast = opt && opt.title; },
        shareAppMessage(opt) { shares.push(opt); },
        showShareMenu() {},
        onShareAppMessage(cb) { shareHandler = cb; },
        onHide(cb) {
          // 包一层：无论测试走 H.hide() 还是直接调 H.hideHandler()，hidden 都会置位
          const wrapped = function () { hidden = true; return cb.apply(null, arguments); };
          hideHandlers.push(wrapped);
          hideHandler = wrapped;
        },
        onShow(cb) {
          const wrapped = function () { hidden = false; return cb.apply(null, arguments); };
          showHandlers.push(wrapped);
          showHandler = wrapped;
        },
        reportAnalytics(ev, params) { events.push({ ev, params: params || null }); },
      };
      global.GameGlobal = {};
      global.__lastToast = null;
      Math.random = rng;
      // 真机 rAF 是"注册 → 下一帧执行一次"的队列；cancel 能取消尚未执行的那一个
      global.requestAnimationFrame = (cb) => {
        rafSeq++;
        rafQueue.push({ id: rafSeq, cb });
        return rafSeq;
      };
      global.cancelAnimationFrame = (id) => {
        for (let i = rafQueue.length - 1; i >= 0; i--) if (rafQueue[i].id === id) rafQueue.splice(i, 1);
      };
      return H;
    },

    // ---------- 前后台 ----------
    // 真机切后台：rAF 不再回调，一帧都不出（已排队的那一帧留到回前台后继续跑）
    hide() { hidden = true; hideHandlers.slice().forEach((cb) => cb()); return H; },
    show() { hidden = false; showHandlers.slice().forEach((cb) => cb()); return H; },

    // ---------- 错误上报（monitor.js 路径） ----------
    emitError(msg) { errorHandlers.slice().forEach((cb) => cb(msg)); return H; },
    emitRejection(reason) { rejectionHandlers.slice().forEach((cb) => cb({ reason })); return H; },

    // ---------- 存档（与 wx.*StorageSync 同一实现） ----------
    storageGet(key) { return storageGet(key); },
    storageSet(key, value) { storageSet(key, value); return H; },
    storageRaw(key) { return storageMap.get(String(key)); },
    storageKeys() { return Array.from(storageMap.keys()); },
    storageClear() { storageMap.clear(); return H; },

    // ---------- 时间推进 ----------
    // 返回是否真的执行了至少一个 rAF 回调（hidden 期间返回 false，测试可据此断言"后台不喂帧"）
    // 注意：墙钟（now）在后台【照常前进】，只是 rAF 回调不触发 —— 真机时间戳是单调时钟，
    // 切后台 5 秒再回来，下一帧的 ts 就是 +5s（游戏靠 onShow 里 last=0 + dt 上限 33ms 兜住）。
    frame(dtMs) {
      now += dtMs === undefined ? 16.7 : dtMs;
      if (hidden) { hiddenFrameSkips++; return false; } // 真机切后台：rAF 不触发，一帧都不出
      frameCount++;
      const pending = rafQueue.splice(0, rafQueue.length);
      let ran = 0;
      let firstError = null;
      for (const item of pending) {
        ran++;
        try {
          item.cb(now);
        } catch (e) {
          if (!o.swallowFrameErrors) { if (!firstError) firstError = e; } else frameErrors.push(e);
        }
      }
      // 默认让异常照常抛出（测试要"响"），但先把同一帧里其它回调跑完（真机也是各自独立任务）
      if (firstError) throw firstError;
      return ran > 0;
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

    // 点按：弹层有 justOpened 防误触，首次点按会被吞掉，因此点两次 touchstart。
    // 注意不要改成 start+end：现有用例依赖"两次 start 穿透 justOpened"的调用次数。
    // 需要完整人类时序（start+end）时用 H.press。
    tap(x, y) {
      H.touch('start', x, y);
      H.touch('start', x, y);
    },

    // 完整人类时序：按下 + 抬起（棋盘拖拽以外的点击都该走这个）
    press(x, y) {
      H.touch('start', x, y);
      H.touch('end', x, y);
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
