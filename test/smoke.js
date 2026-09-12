/**
 * 无头冒烟测试：在 Node 里用桩替身模拟 wx/canvas，跑通完整游戏循环
 * 运行：node test/smoke.js
 * 覆盖：首页→进关→刷怪击杀→拖拽合成→三选一→暂停→胜利→双倍奖励→下一关→失败→复活→结算→工位升级→存档
 */
'use strict';

// ---------- 桩：wx / GameGlobal / rAF ----------
const storageMap = new Map();
const touchHandlers = {};

function makeCtx() {
  const t = {};
  return new Proxy(t, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'measureText') return () => ({ width: 10 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') {
        return () => ({ addColorStop() {} });
      }
      return () => 0; // 其余方法一律 no-op
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
}

const fakeCanvas = {
  width: 0,
  height: 0,
  getContext: () => makeCtx(),
};

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 2, platform: 'devtools' }),
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
  showToast(o) { global.__lastToast = o && o.title; },
  shareAppMessage() {},
  showShareMenu() {},
};

global.GameGlobal = {};
global.__lastToast = null;

// 固定随机种子：测试结果可复现
let seed = 42;
Math.random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

let rafCb = null;
let now = 0;
global.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
global.cancelAnimationFrame = () => {};

// ---------- 载入游戏 ----------
const App = require('../js/main');

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}`);
  }
}

function step(seconds) {
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i++) {
    now += 16.7;
    const cb = rafCb;
    rafCb = null;
    if (cb) cb(now);
  }
}

function touch(name, x, y) {
  const cb = touchHandlers[name];
  if (!cb) throw new Error(`no handler: ${name}`);
  cb({ touches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }] });
}

// 点按（弹层有 justOpened 防误触，首次点按会被吞掉，因此点两次）
function tap(x, y) {
  touch('start', x, y);
  touch('start', x, y);
}

function center(r) {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

// 排空所有待选的升级三选一（一直选第一张卡）
function drainLevelups() {
  let guard = 0;
  while (d.battle && d.battle.modal && d.battle.modal.type === 'levelup' && guard++ < 60) {
    const card = d.battle.modal.rects.cards[0];
    if (!card) break;
    tap(card.x + card.w / 2, card.y + card.h / 2);
    step(0.05);
  }
}

const app = GameGlobal.app;
const d = GameGlobal.databus;

// ---------- 1. 首页与玩法说明弹窗 ----------
console.log('\n[1] 首页');
step(1);
check('进入首页', d.scene === 'home' && app.scene === app.home);
check('首次进入自动弹出玩法说明弹窗', app.home.panel === 'help');
check('存档初始金币为 0', d.meta.coins === 0);
// 翻完 3 页（弹层无防误触，单击即可；第 3 页按钮 = 完成）
const nBtn = () => app.home.rects.helpNext;
const tapBtn = () => touch('start', nBtn().x + nBtn().w / 2, nBtn().y + nBtn().h / 2);
tapBtn();
step(0.05);
check('弹窗翻到第 2 页', app.home.helpPage === 1);
tapBtn();
step(0.05);
check('弹窗翻到第 3 页', app.home.helpPage === 2);
tapBtn();
step(0.05);
check('看完弹窗关闭并落存档', app.home.panel === null && d.meta.helpSeen === true);
// ❓ 按钮可重开、可跳过
touch('start', 341, 59);
step(0.05);
check('❓ 重新打开玩法说明', app.home.panel === 'help' && app.home.helpPage === 0);
const cx = app.home.rects.helpCloseX;
touch('start', cx.x + cx.w / 2, cx.y + cx.h / 2); // 首页面板无防误触，单击关闭
step(0.05);
check('✕ 跳过弹窗', app.home.panel === null);

// ---------- 2. 开始游戏（第 1 关，带手把手教学） ----------
console.log('\n[2] 开始游戏');
tap(187.5, 320); // 开始摸鱼
step(0.2);
const b = d.battle;
check('进入战斗', d.scene === 'battle' && !!b);
check('初始装备 3 件（2 咖啡 + 1 键盘）',
  b.board.cells.filter(Boolean).length === 3 &&
  b.board.cells[0].type === 'coffee' && b.board.cells[5].type === 'coffee' &&
  b.board.cells[10].type === 'keyboard');
check('新手教学激活（合成阶段）', !!app.battle.tutorial && app.battle.tutorial.step === 'merge');
check('教学阶段先不刷怪', b.enemies.length === 0 && b.coins === 0);

// ---------- 3. 拖拽合成（同时完成教学第 1 步） ----------
console.log('\n[3] 合成棋盘');
// cells[0]=(r0,c0) 中心 (82.5,415)；cells[5]=(r1,c1) 中心 (152.5,485)：两个咖啡 LV1 → 合成
touch('start', 82.5, 415);
touch('move', 120, 450);
touch('end', 152.5, 485);
check('两个咖啡 LV1 合成为 LV2', b.board.cells[5].lv === 2 && b.board.cells[0] === null);
check('合成后教学推进并落存档', d.meta.tutorialDone === true &&
  (!app.battle.tutorial || app.battle.tutorial.step === 'auto'));

// ---------- 4. 战斗推进：刷怪/击杀/金币/补给（×2 快进） ----------
console.log('\n[4] 战斗推进 45s（×2 快进）');
touch('start', 304, 27); // 倍速按钮 → ×2
step(0.05);
check('切到 ×2 快进', b.speed === 2 && d.meta.speed === 2);
let sawEnemy = false;
let sawProj = false;
for (let i = 0; i < 90; i++) {
  step(0.5);
  drainLevelups(); // 自然升级会弹三选一并冻结模拟，排空后继续
  if (b.enemies.length > 0) sawEnemy = true;
  if (b.projectiles.length > 0) sawProj = true;
}
drainLevelups();
// 恢复 ×1（×2 → ×3 → ×1）
touch('start', 304, 27);
step(0.05);
touch('start', 304, 27);
step(0.05);
check('倍速循环切回 ×1 并存档', b.speed === 1 && d.meta.speed === 1);
check('45s 内出现敌人', sawEnemy);
check('45s 内有弹丸飞行', sawProj);
check('有击杀产生', b.kills > 0);
check('金币入账', b.coins > 0);
check('补给投放后装备数 >= 4', b.board.cells.filter(Boolean).length >= 4);
check('Boss 未提前出现（第 1 关无 Boss）', b.bossRef === null);
check('期间自然升过级', b.charLevel > 1);

// ---------- 5. 手动触发三选一 ----------
console.log('\n[5] 升级三选一');
d.debug.addExp(200);
step(0.1);
check('弹出三选一', b.modal && b.modal.type === 'levelup');
check('三个选项', b.modal && b.modal.options.length === 3);
const skillsBefore = b.skills.length;
drainLevelups();
check('把升级全部选完', b.modal === null);
check('技能已生效（新增技能）', b.skills.length > skillsBefore);
check('三选一首次提示已落存档', d.meta.skillTipDone === true);

// ---------- 6. 暂停 ----------
console.log('\n[6] 暂停');
drainLevelups();
touch('start', 348, 27); // ⏸
step(0.05);
check('弹出暂停', b.modal && b.modal.type === 'pause');
const resumeBtn = center(b.modal.rects.resume);
tap(resumeBtn.x, resumeBtn.y);
step(0.05);
check('继续游戏', b.modal === null);

// ---------- 7. 胜利路径：双倍奖励 + 下一关 ----------
console.log('\n[7] 胜利与双倍奖励');
drainLevelups();
// 快进到关卡尾声：把波次时间轴推到末尾，让剩余事件全部放出
d.debug.setTime(148);
d.debug.setTimeLeft(0.5);
step(0.7);
// 产品需求会分裂出小需求，且波次队列还在放怪，多轮清场
for (let i = 0; i < 25 && !b.modal; i++) {
  d.debug.killAll();
  step(1);
  drainLevelups();
}
check('弹出胜利结算', b.modal && b.modal.type === 'result' && b.modal.win === true);
const coinsBeforeDouble = d.meta.coins;
const runCoins = b.coins;
const dbl = center(b.modal.rects.double);
tap(dbl.x, dbl.y); // 双倍奖励（模拟广告）
check('进入模拟广告倒计时', !!app.adService.simulating);
step(3.2);
check('双倍奖励到账', b.modal.doubled === true && d.meta.coins === coinsBeforeDouble + runCoins);
const nextBtn = center(b.modal.rects.next);
tap(nextBtn.x, nextBtn.y);
step(0.2);
check('进入第 2 关', d.battle && d.battle.level === 2 && !d.battle.modal);
check('存档已解锁第 2 关', d.meta.bestLevel >= 2);

// ---------- 8. 失败路径：复活弹层 → 认命 → 结算 → 回首页 ----------
console.log('\n[8] 失败与复活');
drainLevelups();
const b2 = d.battle;
d.debug.damageBase(99999);
step(0.1);
check('弹出复活弹层', b2.modal && b2.modal.type === 'revive');
const giveup = center(b2.modal.rects.giveup);
tap(giveup.x, giveup.y);
step(0.05);
check('进入失败结算', b2.modal && b2.modal.type === 'result' && b2.modal.win === false);
check('失败也保留本局金币', d.meta.coins >= coinsBeforeDouble + runCoins);
const homeBtn = center(b2.modal.rects.home);
tap(homeBtn.x, homeBtn.y);
step(0.1);
check('回到首页', d.scene === 'home' && app.scene === app.home);

// ---------- 8.5 Boss 关：召唤/狂暴/击杀 + 中途退出结算 ----------
console.log('\n[8.5] Boss 关与中途退出结算');
d.meta.bestLevel = 4;
tap(187.5, 320); // 开始摸鱼 → 第 4 关
step(0.2);
const b4 = d.battle;
check('进入第 4 关', d.scene === 'battle' && b4.level === 4);
// 快进到 Boss 登场（事件表 t = 关卡时长-50 = 145）
d.debug.setTime(144);
d.debug.setTimeLeft(60);
step(2);
drainLevelups();
check('Boss 产品经理登场', !!b4.bossRef && b4.bossRef.type === 'boss');
const cnt0 = b4.enemies.length;
step(5); // 召唤周期 4 秒
drainLevelups();
check('Boss 召唤了增援', b4.enemies.length > cnt0 && b4.enemies.some((e) => e.type === 'request'));
// 残血狂暴
const boss = b4.bossRef;
boss.hp = Math.round(boss.hpMax * 0.3);
const speedBefore = boss.speed;
step(0.2);
drainLevelups();
check('残血触发狂暴（提速）', boss.enraged === true && boss.speed > speedBefore);
// 击杀 Boss
d.debug.killAll();
step(1);
drainLevelups();
check('Boss 被击杀且引用清空', b4.bossRef === null);
// 中途退出（暂停 → 回首页）：金币要入账
drainLevelups();
touch('start', 348, 27); // ⏸
step(0.05);
const leaveBtn = center(b4.modal.rects.home);
const coinsBeforeLeave = d.meta.coins;
const runCoinsLeave = b4.coins;
tap(leaveBtn.x, leaveBtn.y);
step(0.3);
check('中途退出金币已入账', d.scene === 'home' && d.meta.coins === coinsBeforeLeave + runCoinsLeave);
check('提示已保存金币', !!global.__lastToast && global.__lastToast.includes('已保存'));

// ---------- 9. 工位升级面板 ----------
console.log('\n[9] 工位升级');
const upBtn = center(app.home.rects.upgrade);
tap(upBtn.x, upBtn.y);
step(0.05);
check('打开升级面板', app.home.panel === 'upgrade');
const coinsBeforeBuy = d.meta.coins;
const buy0 = center(app.home.rects.buys[0]);
touch('start', buy0.x, buy0.y); // 单击购买（首页面板无防误触，双击会连买两级）
check('购买成功：显示器 +1 级（扣 80 金币）',
  d.meta.upgrades.screen === 1 && d.meta.coins === coinsBeforeBuy - 80);
const closeBtn = center(app.home.rects.closePanel);
touch('start', closeBtn.x, closeBtn.y);
step(0.05);
check('关闭面板', app.home.panel === null);

// ---------- 10. 存档持久化 ----------
console.log('\n[10] 存档');
const saved = storageMap.get('moyu_defense_save_v1');
check('存档已写入 storage', !!saved && saved.bestLevel >= 2 && saved.totalKills > 0);

// ---------- 结果 ----------
console.log(`\n========== 冒烟测试：${pass} 通过 / ${fail} 失败 ==========`);
process.exit(fail ? 1 : 0);
