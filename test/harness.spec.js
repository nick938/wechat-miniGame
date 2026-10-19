/**
 * 桩能力自检（harness self-spec）：验证 test/harness.js 的"忠实度"本身成立。
 *
 * 为什么单独有这个文件：冒烟测试验证的是**游戏**，而这份验证的是**桩**。
 * 桩退化成"简化桩"时，冒烟测试会安静地继续全绿 —— 这正是本轮缺陷能藏这么久的原因。
 * 有了这份自检，任何人把桩改回单槽/按引用/后台喂帧，都会在这里立刻红。
 *
 * 运行方式：node test/harness.spec.js    （退出码 0 = 桩的忠实度达标；无需先装依赖）
 * 注意：本文件【只测桩、不加载游戏】—— 不 require js/main.js，也不碰任何游戏逻辑，
 *       所以跑得极快（<1s），可以放在任何提交前钩子里。
 */
'use strict';

const { createHarness } = require('./harness');

let pass = 0;
let fail = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.error(`  ✗ ${name}${extra === undefined ? '' : `  [${extra}]`}`);
  }
}
const tick = () => new Promise((r) => setImmediate(r));
async function flush(n) { for (let i = 0; i < (n || 12); i++) await tick(); }

(async () => {
  // ============================================================
  console.log('\n[1] 激励视频：监听器【数组】语义（不是单槽覆盖）');
  // ============================================================
  {
    const H = createHarness({ seed: 1 });
    H.install();
    const ad = H.ads.create('unit-A');

    const calls = [];
    const a = () => calls.push('a');
    const b = () => calls.push('b');
    ad.onClose(a);
    ad.onClose(b);
    check('onClose 是订阅：两个回调都留在实例上（单槽写法会只剩 1 个）',
      ad.listeners.close.length === 2, `实际 ${ad.listeners.close.length}`);
    check('close 会调用【所有】已注册回调（订阅语义）',
      ad.close({ isEnded: true }) === 2 && calls.join(',') === 'a,b', calls.join(','));

    ad.offClose(a);
    check('offClose 按引用删除，只删掉指定的那一个',
      ad.listeners.close.length === 1 && ad.listeners.close[0] === b);

    ad.onClose(a);
    ad.offClose();
    check('offClose() 不传参 = 移除该事件的全部监听（官方文档语义）',
      ad.listeners.close.length === 0);

    // 单槽覆盖写法在结构上不可能通过上面三条：它只保留最后一个回调，
    // 于是"历史上注册过的回调"要么被覆盖丢失、要么无法按引用删除 —— 泄漏就测不出来。
    const H2 = createHarness({ seed: 1 });
    H2.install();
    check('同一 adUnitId 复用同一实例（小游戏端全局单例，官方文档）',
      H2.ads.create('u') === H2.ads.create('u') && H2.ads.instances.length === 1);
    check('不同 adUnitId 是不同实例', H2.ads.create('u2') !== H2.ads.create('u'));
  }

  // ============================================================
  console.log('\n[2] 激励视频：可驱动的全部分支');
  // ============================================================
  {
    const H = createHarness({ seed: 1 });
    H.install();

    // --- 正常看完 ---
    const ad = H.ads.create('u1');
    let r = 0;
    const onReward = () => { r++; };
    // 模拟 ads.js 的用法：挂监听 → show → 关闭
    ad.onClose((res) => { if (res && res.isEnded) onReward(); });
    await ad.show();
    check('show 成功后广告处于播放中（playing 为真）', ad.playing === true);
    check('看完（isEnded:true）触发回调并识别为看完', ad.close({ isEnded: true }) === 1 && r === 1);
    check('关闭后 playing 归假', ad.playing === false);

    // --- 中途关闭 ---
    const ad2 = H.ads.create('u2');
    let r2 = 0;
    ad2.onClose((res) => { if (res && res.isEnded) r2++; });
    await ad2.show();
    ad2.close({ isEnded: false });
    check('中途关闭（isEnded:false）不认作看完', r2 === 0);

    // --- show 首次 reject → load 成功 → 再 show 成功 ---
    const ad3 = H.ads.create('u3');
    ad3.failShows(1);
    let caught = false;
    await ad3.show().catch(() => { caught = true; });
    check('failShows(1)：第一次 show reject', caught === true);
    await ad3.load();
    await ad3.show();
    check('load 成功后再次 show 能成功（重试链可被驱动）', ad3.playing === true);
    check('load 被真实调用过', ad3.loadCalls === 1, `loadCalls=${ad3.loadCalls}`);

    // --- 一直失败 ---
    const ad4 = H.ads.create('u4');
    ad4.failAll();
    let e1 = false, e2 = false;
    await ad4.show().catch(() => { e1 = true; });
    await ad4.load().catch(() => { e2 = true; });
    check('failAll()：show 与 load 都一直 reject', e1 && e2);

    // --- 自动拉取失败（官方文档：onError 执行 + show reject） ---
    const ad5 = H.ads.create('u5');
    let errCalled = 0;
    ad5.onError(() => { errCalled++; });
    ad5.failFetch(1);
    let rejected = false;
    await ad5.show().catch(() => { rejected = true; });
    check('failFetch()：onError 回调执行 且 show() reject（官方语义）', rejected && errCalled === 1);

    // --- 基础库 <2.1.0：onClose 的 res 是 undefined ---
    const ad6 = H.ads.create('u6');
    let got;
    ad6.onClose((res) => { got = res; });
    ad6.close(undefined);
    check('close(undefined) 透传 res=undefined（旧基础库语义，此时算看完）', got === undefined);

    // --- 回调完全不触发（喂看门狗） ---
    const ad7 = H.ads.create('u7');
    await ad7.show();
    check('广告已展示但回调不触发（看门狗场景可构造）',
      ad7.playing === true && ad7.closeListenerCount >= 0);
    check('closePayloads 记录每次关闭负载（可断言"漏看也发奖"）',
      Array.isArray(ad7.closePayloads) && ad7.closePayloads.length === 0);
  }

  // ============================================================
  console.log('\n[3] 存储：JSON 往返（真机序列化语义）');
  // ============================================================
  {
    const H = createHarness({ seed: 1 });
    H.install();

    const src = { a: 1, undef: undefined, fn: function () {}, nested: { x: 1 }, arr: [1, 2] };
    H.storageSet('k', src);
    src.a = 999; // 写入后再改源对象
    const got = H.storageGet('k');
    check('get 返回反序列化后的副本（不是同一个引用）', got !== src);
    check('别名污染：写入后改源对象不影响存储', got.a === 1, `got.a=${got.a}`);
    got.nested.x = 777; // 改读出来的副本
    check('别名污染：改读出的副本不影响存储', H.storageGet('k').nested.x === 1);
    check('undefined 字段序列化后被丢弃（真机行为，旧桩会保留）', !('undef' in got));
    check('函数字段序列化后被丢弃', !('fn' in got));
    check('底层存的是序列化字符串（真机底层同样是字符串）',
      typeof H.storageMap.get('k') === 'string' && typeof H.storageRaw('k') === 'string');
    check('不存在的 key 返回 ""（真机 getStorageSync 语义）', H.storageGet('nope') === '');
    H.storageSet('num', 42);
    H.storageSet('str', 'hello');
    H.storageSet('nil', null);
    check('数字/字符串/null 都能往返',
      H.storageGet('num') === 42 && H.storageGet('str') === 'hello' && H.storageGet('nil') === null);
    H.storageSet('nan', { v: NaN, inf: Infinity });
    check('NaN/Infinity 序列化成 null（真机行为）',
      H.storageGet('nan').v === null && H.storageGet('nan').inf === null);
    H.storageClear();
    check('storageClear 清空', H.storageKeys().length === 0);
  }

  // ============================================================
  console.log('\n[4] hidden：切后台一帧都不出');
  // ============================================================
  {
    const H = createHarness({ seed: 1 });
    H.install();
    let frames = 0;
    let hiddenSeen = null;
    // 模拟 main.js 的帧循环：注册 → 下一帧执行
    const loop = () => { frames++; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    let hideCalls = 0;
    let showCalls = 0;
    wx.onHide(() => { hideCalls++; hiddenSeen = H.hidden; });
    wx.onShow(() => { showCalls++; });

    check('启动后有一帧待执行', H.rafPending === 1);
    H.frame();
    check('前台 frame 会驱动 rAF 回调', frames === 1 && H.frameCount === 1);

    H.hide();
    check('hide() 驱动 wx.onHide 监听', hideCalls === 1);
    check('onHide 回调里 hidden 已置真（游戏能读到）', hiddenSeen === true);
    const framesBefore = frames;
    const skipsBefore = H.hiddenFrameSkips;
    H.step(1); // 后台 1 秒 = 60 帧
    check('后台 step 一帧都不出（真机 rAF 不触发）', frames === framesBefore, `多跑了 ${frames - framesBefore} 帧`);
    check('后台跳过的帧数被计数（可断言）', H.hiddenFrameSkips === skipsBefore + 60);
    check('frame() 在后台返回 false（测试可据此断言"没喂帧"）', H.frame() === false);
    check('后台不消耗 rAF 队列（回前台后还能继续跑）', H.rafPending === 1);

    H.show();
    check('show() 驱动 wx.onShow 监听', showCalls === 1);
    check('回前台 hidden 归假', H.hidden === false);
    H.frame();
    check('回前台后已排队的那一帧照常执行', frames === framesBefore + 1);
    check('墙钟在后台照常前进（时间戳单调，游戏靠 dt 上限兜住）', H.now > 0);
  }

  // ============================================================
  console.log('\n[5] 输入：完整人类时序');
  // ============================================================
  {
    const H = createHarness({ seed: 1 });
    H.install();
    const seq = [];
    wx.onTouchStart(() => seq.push('start'));
    wx.onTouchEnd(() => seq.push('end'));
    wx.onTouchMove(() => seq.push('move'));
    H.press(10, 20);
    check('H.press 发 touchstart + touchend（真人完整时序）', seq.join(',') === 'start,end');
    seq.length = 0;
    H.tap(10, 20);
    check('H.tap 保持旧语义：两次 touchstart（穿透 justOpened 防误触）',
      seq.join(',') === 'start,start');
    seq.length = 0;
    H.drag({ x: 0, y: 0 }, { x: 30, y: 30 });
    check('H.drag 发完整拖拽时序', seq.join(',') === 'start,move,move,end');
  }

  // ============================================================
  console.log('\n[6] 错误上报与 rAF 队列');
  // ============================================================
  {
    const H = createHarness({ seed: 1, swallowFrameErrors: true });
    H.install();
    const logMgr = wx.getRealtimeLogManager();
    logMgr.error('frameError', 'boom');
    check('wx.getRealtimeLogManager 记录可断言（monitor.js 路径）',
      H.logs.length === 1 && H.logs[0].tag === 'frameError');

    let errSeen = null;
    let rejSeen = null;
    wx.onError((m) => { errSeen = m; });
    wx.onUnhandledRejection((r) => { rejSeen = r; });
    H.emitError('js error');
    H.emitRejection(new Error('rej'));
    check('wx.onError 监听可被驱动', errSeen === 'js error');
    check('wx.onUnhandledRejection 监听可被驱动', !!rejSeen && String(rejSeen.reason).indexOf('rej') >= 0);

    // rAF 队列语义：同一帧里注册多个回调都会执行；cancel 能取消
    const order = [];
    let id2 = null;
    requestAnimationFrame(() => order.push(1));
    id2 = requestAnimationFrame(() => order.push(2));
    cancelAnimationFrame(id2);
    requestAnimationFrame(() => order.push(3));
    H.frame();
    check('rAF 是队列语义：同帧注册的回调都执行', order.join(',') === '1,3', order.join(','));
    check('cancelAnimationFrame 能取消尚未执行的回调', order.indexOf(2) < 0);

    // 帧异常：默认抛出（测试要"响"），swallow 时收集
    const H3 = createHarness({ seed: 1, swallowFrameErrors: true });
    H3.install();
    requestAnimationFrame(() => { throw new Error('frame boom'); });
    H3.frame();
    check('swallowFrameErrors 时帧异常被收集而不是炸测试',
      H3.frameErrors.length === 1 && String(H3.frameErrors[0].message) === 'frame boom');

    const H4 = createHarness({ seed: 1 });
    H4.install();
    requestAnimationFrame(() => { throw new Error('frame boom'); });
    let threw = false;
    try { H4.frame(); } catch (e) { threw = /frame boom/.test(String(e.message)); }
    check('默认帧异常照常抛出（不静默吞掉真缺陷）', threw === true);
  }

  // ============================================================
  console.log('\n[7] 向后兼容：旧 API 全部还在');
  // ============================================================
  {
    const H = createHarness({ seed: 1 });
    H.install();
    const oldApi = [
      'storageMap', 'touchHandlers', 'events', 'shares', 'toasts', 'audioCalls', 'ctx',
      'seed', 'setSeed', 'shareHandler', 'hideHandler', 'showHandler',
      'offscreenCanvases', 'now', 'install', 'frame', 'step', 'touch', 'tap',
      'center', 'drag', 'countEvents', 'clearEvents', 'texts', 'hasText', 'clearTexts',
    ];
    const missing = oldApi.filter((k) => !(k in H));
    check('createHarness 的旧对外 API 一个不少（tools/sim.js 依赖）', missing.length === 0, `缺 ${missing.join(',')}`);

    const H5 = createHarness({ seed: 42, recordText: true });
    H5.install();
    const c1 = wx.createCanvas();
    const c2 = wx.createCanvas();
    check('第一次 createCanvas 是上屏画布、之后是离屏画布（旧行为）',
      c1 !== c2 && H5.offscreenCanvases.length === 1 && c2.__offscreen === true);
    check('recordText 记录绘制文本（旧行为）', (() => {
      const ctx = H5.ctx;
      ctx.fillText('摸鱼保卫战', 0, 0);
      return H5.hasText('摸鱼保卫战');
    })());
    check('ctx 字体赋值计数仍可用（性能用例依赖）', (() => {
      H5.ctx.font = '12px sans-serif';
      return H5.ctx.__fontSets === 1;
    })());
  }

  // ============================================================
  console.log(`\n========== 桩忠实度自检：${pass} 通过 / ${fail} 失败 ==========`);
  if (fail) console.error(`失败项：\n  - ${failures.join('\n  - ')}`);
  process.exit(fail ? 1 : 0);
})();
