/**
 * 无头冒烟测试：在 Node 里用桩替身模拟 wx/canvas，跑通完整游戏循环
 * 运行：node test/smoke.js
 * 覆盖：首页→进关→刷怪击杀→拖拽合成→三选一→暂停→胜利→双倍奖励→下一关→失败→复活→结算→工位升级→存档
 *      →减伤/护盾词缀生效→技能刷新扣次数时机→链式引爆不留僵尸怪
 */
'use strict';

// ---------- 无头运行环境：与 tools/sim.js 共用 test/harness.js ----------
const { createHarness } = require('./harness');
const H = createHarness({ seed: 42, recordText: true }); // 固定随机种子 + 记录绘制文本（可断言界面文案）
H.install();

// ---------- 载入游戏 ----------
const App = require('../js/main');
const { cellRect } = require('../js/ui/board');
const CFG = require('../js/core/config');
const Skills = require('../js/systems/skills');
const Daily = require('../js/systems/daily');
const Ach = require('../js/systems/achievements');

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

const step = (seconds) => H.step(seconds);
const touch = (name, x, y) => H.touch(name, x, y);
const tap = (x, y) => H.tap(x, y);
const center = (r) => H.center(r);

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

// 无论当前停在战斗、弹层还是结算里，都按真人路径退回首页
function exitToHome() {
  for (let i = 0; i < 8 && d.scene === 'battle'; i++) {
    drainLevelups();
    const m = d.battle && d.battle.modal;
    if (m) {
      const r = m.rects.home || m.rects.giveup || m.rects.resume; // 结算/复活/暂停都有出路
      if (r) tap(r.x + r.w / 2, r.y + r.h / 2);
    } else {
      touch('start', 348, 27); // ⏸
    }
    step(0.15);
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
// 好友排行榜弹窗（开发者工具无开放数据域 → 本地兜底视图）
touch('start', 187.5, 508); // 🏆 好友摸鱼榜按钮
step(0.05);
check('打开好友排行榜（本地兜底）', app.home.panel === 'rank');
touch('start', 332.5, 117); // ✕
step(0.05);
check('关闭排行榜', app.home.panel === null);

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
check('结算含摸鱼分且刷新历史最高', b.modal.score > 0 && d.meta.bestScore >= b.modal.score && b.modal.newRecord === true);
check('结算按钮把"能换到什么"写清楚了', H.hasText('本局金币 ×2'));
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
let summoned = false;
for (let i = 0; i < 10 && !summoned; i++) { // 召唤周期 4 秒，期间可能有升级弹层冻结，轮询等待
  step(1);
  drainLevelups();
  summoned = b4.enemies.length > cnt0 && b4.enemies.some((e) => e.type === 'request');
}
check('Boss 召唤了增援', summoned);
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
const firstCost = CFG.UPGRADE_COST(0);
touch('start', buy0.x, buy0.y); // 单击购买（首页面板无防误触，双击会连买两级）
check(`购买成功：显示器 +1 级（扣 ${firstCost} 金币）`,
  d.meta.upgrades.screen === 1 && d.meta.coins === coinsBeforeBuy - firstCost);
const closeBtn = center(app.home.rects.closePanel);
touch('start', closeBtn.x, closeBtn.y);
step(0.05);
check('关闭面板', app.home.panel === null);

// ---------- 10. 存档持久化 ----------
console.log('\n[10] 存档');
const saved = H.storageMap.get('moyu_defense_save_v1');
check('存档已写入 storage', !!saved && saved.bestLevel >= 2 && saved.totalKills > 0 && saved.bestScore > 0);

// ---------- 11. 词缀生效：工作群静音（减伤）与明天再说（护盾） ----------
console.log('\n[11] 减伤与护盾');
d.meta.bestLevel = 1;
tap(187.5, 320); // 新开一局：词缀回到初始值，便于断言精确伤害
step(0.2);
const b5 = d.battle;
// 造一只贴在工位线上、打不死的怪当稳定伤害源（bug dps = 4/s）
b5.enemies.length = 0;
app.battle.spawnEnemy('bug');
const dummy = b5.enemies[0];
dummy.hpMax = dummy.hp = 1e9;
dummy.attacking = true;
dummy.y = 340;
b5.baseHp = b5.baseHpMax;
b5.baseShield = 0;
Skills.apply(b5, CFG.SKILLS.find((s) => s.id === 'shield'));
check('「明天再说」给出 50 点护盾', b5.baseShield === 50);
step(1); // 约 4 点伤害，应全部由护盾吃掉
check('护盾真的挡伤害、血条不掉', b5.baseShield > 40 && b5.baseShield < 50 && b5.baseHp === b5.baseHpMax);
check('护盾按伤害量递减（不是装饰）', b5.baseShield < 50);
// 工作群静音：受到的伤害 -15%
Skills.apply(b5, CFG.SKILLS.find((s) => s.id === 'mute'));
b5.baseShield = 0;
const hpBeforeMute = b5.baseHp;
step(1);
const taken = hpBeforeMute - b5.baseHp;
check(`「工作群静音」让工位伤害真的减少 15%（实测 ${taken.toFixed(2)} / 基准 4.00）`,
  taken > 4 * 0.75 && taken < 4 * 0.95);

// ---------- 12. 技能刷新：看完广告才扣次数 ----------
console.log('\n[12] 技能刷新时机');
d.debug.addExp(400);
step(0.1);
check('弹出三选一（带刷新按钮）', b5.modal && b5.modal.type === 'levelup' && !!b5.modal.rects.reroll);
const rerollBefore = b5.rerollLeft;
const rrBtn = center(b5.modal.rects.reroll);
tap(rrBtn.x, rrBtn.y);
check('刷新进入广告、此时还没扣次数', !!app.adService.simulating && b5.rerollLeft === rerollBefore);
tap(rrBtn.x, rrBtn.y); // 广告播放期间重复点按
check('播放中重复点按被忽略', b5.rerollLeft === rerollBefore &&
  app.adService.simulating && app.adService.simulating.placement === 'reroll');
step(3.2);
check('看完广告才扣 1 次并重抽选项', b5.rerollLeft === rerollBefore - 1 &&
  b5.modal && b5.modal.type === 'levelup' && b5.modal.options.length === 3);
// 看门狗：真机上广告回调偶发不触发时，占用位不能永久卡死（那会让后续广告全部不可用）
app.adService.showing = true;
app.adService.showTimer = 179;
step(2);
check('广告占用位有超时兜底', app.adService.showing === false);
drainLevelups();

// 同一个三选一面板里把刷新次数用完：热区必须消失，
// 否则玩家点到那块空位会白看一次广告（回调里 rerollLeft 已是 0，什么也不会发生）
b5.rerollLeft = 1;
d.debug.addExp(400);
step(0.1);
check('还剩 1 次刷新时画出热区', b5.modal && b5.modal.type === 'levelup' && !!b5.modal.rects.reroll);
const rrSpot = center(b5.modal.rects.reroll);
tap(rrSpot.x, rrSpot.y); // 用完最后 1 次
step(3.2);
check('刷完后次数归零且热区被清掉', b5.rerollLeft === 0 && b5.modal.rects.reroll === null);
tap(rrSpot.x, rrSpot.y); // 再点原来那个位置（现在是空的）
step(0.2);
check('点已消失的刷新热区不会触发广告', !app.adService.simulating && app.adService.showing === false);
check('点空位也不会误选技能', b5.modal && b5.modal.type === 'levelup');
drainLevelups();

// ---------- 13. 链式引爆结算（回归：长连锁不能留僵尸怪卡关） ----------
console.log('\n[13] 链式引爆');
d.meta.bestLevel = 1;
tap(187.5, 320);
step(0.2);
const b6 = d.battle;
const CHAIN = 15; // 3 行 × 5 列
b6.enemies.length = 0;
// 隔离出纯连锁场景：拆掉棋盘武器、清掉开局已打出的弹丸。
// 键帽冲击波只按 x 判定命中，会顺着弹道一帧秒掉整列测试怪，等于多出好几个起爆点，
// 把连锁深度压到 5 轮以内，那样就测不到「一帧内结算完整条连锁」了
b6.projectiles.length = 0;
b6.bombs.length = 0;
b6.board.cells = b6.board.cells.map(() => null);
b6.mods.killExplode = 1; // 100% 击杀引爆，把连锁拉到最长
for (let i = 0; i < CHAIN; i++) {
  app.battle.spawnEnemy('bug');
  const e = b6.enemies[b6.enemies.length - 1];
  e.baseX = e.x = 40 + (i % 5) * 60;        // 同行间距 60 < 爆炸范围（半径 70 + 怪半径 14）
  e.y = 150 + Math.floor(i / 5) * 60;
  e.sway = 0;                               // 关掉左右摇摆，保证连锁距离稳定可复现
  e.hpMax = 100;                            // 爆炸伤害 = 血上限 30% = 30
  e.hp = 1;                                 // 一击必死，连锁才能一路传下去
}
const killsBeforeChain = b6.kills;
b6.enemies[0].dying = true; // 只点着第一个，其余全靠引爆连坐
step(1 / 60); // 只跑一帧：整条连锁必须在同一个子步进里结算完，不能跨帧慢慢消化
check('链式引爆在同一帧内结算完（不留残影）', b6.enemies.every((e) => !e.dying));
check(`${CHAIN} 个敌人全部结算入账`, b6.kills - killsBeforeChain === CHAIN);

// ---------- 14. 技能全满级兜底（回归：不能让三选一弹层没有可选卡把玩家卡死） ----------
console.log('\n[14] 技能全满级兜底');
const b7 = d.battle;
// 上一节连锁击杀会攒下升级：先排空弹层，否则这里看到的是旧弹层（选项是旧的、卡片也不是兜底卡）
drainLevelups();
check('上一节的升级已排空（本节前提）', b7.modal === null);
CFG.SKILLS.forEach((s) => {
  const owned = b7.skills.find((k) => k.id === s.id);
  if (owned) owned.stacks = s.max;
  else b7.skills.push({ id: s.id, stacks: s.max });
});
d.debug.addExp(400);
step(0.1);
check('全满级后三选一仍有卡可选', b7.modal && b7.modal.type === 'levelup' &&
  b7.modal.options.length >= 1 && !!b7.modal.rects.cards[0]);
check('此时弹层给的就是兜底卡', b7.modal && b7.modal.options.length === 1 && b7.modal.options[0].id === 'mastery');
const coinsBeforeMastery = b7.coins;
const masteryCard = b7.modal && b7.modal.rects.cards[0];
if (masteryCard) { // 没有卡时（旧代码）不要去点，否则测试会崩在中途、后面的断言跑不到
  tap(masteryCard.x + masteryCard.w / 2, masteryCard.y + masteryCard.h / 2);
  step(0.1);
}
check('兜底卡可点、弹层能关掉、金币到账',
  !!masteryCard && b7.coins === coinsBeforeMastery + CFG.MASTERY_COINS);
drainLevelups();
check('继续排空升级也不会再卡住', b7.modal === null);

// ---------- 15. 装备回收（拖到桌面 ♻️ 换金币） ----------
console.log('\n[15] 装备回收与满盘提示');
// 上一节结束时还在战斗里，先按真人路径回首页再开新局
touch('start', 348, 27); // ⏸
step(0.05);
const homeFromPause = center(d.battle.modal.rects.home);
tap(homeFromPause.x, homeFromPause.y);
step(0.1);
check('从暂停面板回到首页', d.scene === 'home');
d.meta.bestLevel = 1;
tap(187.5, 320); // 开始摸鱼
step(0.2);
const b8 = d.battle;
check('新局已开始（3 件初始装备、金币归零）',
  d.scene === 'battle' && b8.board.cells.filter(Boolean).length === 3 && b8.coins === 0);
const recycleEvBefore = H.countEvents('weapon_recycle');
const coinsBeforeRecycle = b8.coins;
const srcCell = cellRect(0);
const rcy = CFG.RECYCLE_RECT;
H.drag(
  { x: srcCell.x + srcCell.w / 2, y: srcCell.y + srcCell.h / 2 },
  { x: rcy.x + rcy.w / 2, y: rcy.y + rcy.h / 2 }
);
step(0.05);
check('装备被回收、格子空出来', b8.board.cells[0] === null);
check(`回收获金币（期望 +${CFG.recycleCoins(1)}，实际 +${b8.coins - coinsBeforeRecycle}）`,
  b8.coins === coinsBeforeRecycle + CFG.recycleCoins(1));
check(`回收计数与埋点都有（recycled=${b8.recycled}，事件+${H.countEvents('weapon_recycle') - recycleEvBefore}）`,
  b8.recycled === 1 && H.countEvents('weapon_recycle') === recycleEvBefore + 1);
check('回收价随等级递增', CFG.recycleCoins(5) > CFG.recycleCoins(3) && CFG.recycleCoins(3) > CFG.recycleCoins(1));
// 棋盘塞满：空投无处可放必须给提示（此前是静默丢弃）
b8.board.cells = b8.board.cells.map(() => ({ type: 'coffee', lv: 1 }));
b8.hint = null;
b8.supplyTimer = 0.01;
step(0.2);
check('棋盘满时空投失败并弹出提示条', !!b8.hint && b8.hint.text.indexOf('棋盘满') >= 0);
check('棋盘满也有埋点', H.countEvents('board_full') >= 1);
// 腾出一格后空投恢复正常，提示条到点自动消失
b8.board.cells[0] = null;
b8.hint = { text: '测试用', t: 0.02 };
step(0.2);
check('提示条到点自动消失', b8.hint === null);
b8.supplyTimer = 0.01;
step(0.2);
check('腾出空格后空投能正常放下', b8.board.cells.filter(Boolean).length === 16);

// ---------- 16. 失败复盘 ----------
console.log('\n[16] 失败复盘');
// 让一只怪贴到工位线上啃，看是否记下"谁在啃"
b8.enemies.length = 0;
app.battle.spawnEnemy('request');
const foe = b8.enemies[0];
foe.hp = foe.hpMax = 1e9;
foe.attacking = true;
foe.y = 340;
b8.lastHitBy = '';
step(0.2);
check('记录啃工位的敌人类型（失败复盘用）', b8.lastHitBy === 'request');
check('复盘会给一句可执行建议', typeof CFG.lossTip(b8) === 'string' && CFG.lossTip(b8).length >= 8);
// 触发失败结算，确认面板上真的画出了复盘文案
H.clearTexts();
d.debug.damageBase(99999);
step(0.1);
const giveUp2 = b8.modal && b8.modal.type === 'revive' ? center(b8.modal.rects.giveup) : null;
if (giveUp2) { tap(giveUp2.x, giveUp2.y); step(0.1); }
check('进入失败结算', b8.modal && b8.modal.type === 'result' && b8.modal.win === false);
check('结算面板画出了"谁啃掉最后一滴血"', H.hasText('啃掉了最后一点血'));
check('结算面板画出了"撑到多久/还剩几只"', H.hasText('场上还剩'));
check('结算面板画出了改进建议', H.hasText(CFG.lossTip(b8)));

// ---------- 17. 机制技能真的改变打法（暴击 / 冰缓 / 回血） ----------
console.log('\n[17] 机制技能生效');
// 从 [16] 的失败结算回首页，再开一局干净的战斗
const backHome = center(b8.modal.rects.home);
tap(backHome.x, backHome.y);
step(0.1);
d.meta.bestLevel = 1;
tap(187.5, 320);
step(0.2);
const b9 = d.battle;
check('新局开始（用于机制测试）', d.scene === 'battle' && b9.board.cells.filter(Boolean).length === 3);
b9.enemies.length = 0;
app.battle.spawnEnemy('request');
const target = b9.enemies[0];
target.hpMax = target.hp = 1e6;

// 暴击：100% 时一次命中打三倍
b9.mods.crit = 0;
let hp0 = target.hp;
app.battle.damageEnemy(target, 10, false);
check('无暴击时伤害就是 10', hp0 - target.hp === 10);
b9.mods.crit = 1;
hp0 = target.hp;
app.battle.damageEnemy(target, 10, false);
check('暴击时一次命中打 30（三倍）', hp0 - target.hp === 30);
// 50% 概率：200 次命中的平均伤害应接近 2 倍（种子固定 ⇒ 可复现）
b9.mods.crit = 0.5;
hp0 = target.hp;
for (let i = 0; i < 200; i++) app.battle.damageEnemy(target, 10, false);
const avg = (hp0 - target.hp) / 200;
check(`50% 暴击的平均伤害落在 2 倍附近（实测 ${(avg / 10).toFixed(2)}x，期望 1.6-2.4x）`,
  avg > 16 && avg < 24);

// 冰缓：命中即减速，实测移动距离变短
b9.mods.chill = 0.25;
app.battle.damageEnemy(target, 1, false);
check('命中后敌人进入冰缓', target.chillT > 0 && target.chillMul === 0.75);
b9.enemies.length = 0;
app.battle.spawnEnemy('request');
app.battle.spawnEnemy('request');
const slowOne = b9.enemies[0];
const fastOne = b9.enemies[1];
slowOne.y = fastOne.y = 0;
slowOne.x = fastOne.x = 100;
slowOne.baseX = fastOne.baseX = 100;
slowOne.chillT = 5;
slowOne.chillMul = 0.5;
step(0.5);
check('被冰缓的敌人确实走得慢', slowOne.y < fastOne.y * 0.75);

// 回血：击杀回血且不超过上限
b9.mods.lifesteal = 2;
b9.baseHp = b9.baseHpMax - 5;
const beforeHeal = b9.baseHp;
b9.enemies.length = 0;
app.battle.spawnEnemy('bug');
const victim = b9.enemies[0];
victim.hp = 1;
b9.mods.lifesteal = 2;
app.battle.damageEnemy(victim, 5, false);
step(1 / 60);
check('击杀回血 +2', b9.baseHp === beforeHeal + 2);
b9.baseHp = b9.baseHpMax;
b9.enemies.length = 0;
app.battle.spawnEnemy('bug');
const victim2 = b9.enemies[0];
victim2.hp = 1;
app.battle.damageEnemy(victim2, 5, false);
step(1 / 60);
check('回血不会超过生命上限', b9.baseHp === b9.baseHpMax);
// 三个机制技能都已挂到 mods 上（选了就生效，不是摆设）
check('三个机制技能都在配置里且能改 mods', (() => {
  const ids = ['crit', 'chill', 'lifesteal'];
  if (!ids.every((id) => CFG.SKILLS.some((s) => s.id === id))) return false;
  ids.forEach((id) => Skills.apply(b9, CFG.SKILLS.find((s) => s.id === id)));
  return b9.mods.crit > 0 && b9.mods.chill > 0 && b9.mods.lifesteal > 0;
})());

// ---------- 18. Boss 前预警 ----------
console.log('\n[18] Boss 前预警');
touch('start', 348, 27); // ⏸ 先离开 [17] 的战斗
step(0.05);
const homeFromPause2 = center(d.battle.modal.rects.home);
tap(homeFromPause2.x, homeFromPause2.y);
step(0.1);
d.meta.bestLevel = 4; // 第 4 关是 Boss 关
tap(187.5, 320);
step(0.2);
const b11 = d.battle;
check('进入第 4 关（Boss 关）', d.scene === 'battle' && b11.level === 4 && b11.cfg.isBoss === true);
check('关卡配置带 Boss 出场秒数', b11.cfg.bossAt > 0);
d.debug.setTime(b11.cfg.bossAt - CFG.BOSS_WARN_SEC - 3); // 还早
d.debug.setTimeLeft(60);
step(0.2);
check('离 Boss 还有 11 秒时不预警', !b11.bossWarn);
H.clearTexts();
d.debug.setTime(b11.cfg.bossAt - CFG.BOSS_WARN_SEC + 0.5); // 进入预警窗口
step(0.2);
check('进入预警窗口后显示倒计时', b11.bossWarn > 0 && b11.bossWarn <= CFG.BOSS_WARN_SEC);
check('预警真的画到了屏幕上', H.hasText('秒后老板来查岗'));
check('预警有埋点', H.countEvents('boss_warning') >= 1);
d.debug.setTime(b11.cfg.bossAt + 0.1); // Boss 出场
step(0.2);
check('Boss 出场后预警撤掉', !b11.bossWarn);
check('Boss 已登场', !!b11.bossRef);

// ---------- 19. 每日任务与免费宝箱 ----------
console.log('\n[19] 每日任务与免费宝箱');
exitToHome(); // 上一节停在 Boss 关的战斗里，先回首页
check('回到首页（本节前提）', d.scene === 'home');
d.meta.daily = null;
Daily.ensure(d);
check('新的一天从 0 进度开始', Daily.state(d).every((t) => t.progress === 0 && !t.claimed));
check('免费宝箱每天 1 次', Daily.freeChestLeft(d) === 1);
// 一局打完按局结算（一次写入）
Daily.flush(d, { win: true, kills: 40, merges: 12 });
const stOf = (id) => Daily.state(d).find((t) => t.id === id);
check('通关任务完成 1/1', stOf('clearRun').progress === 1 && stOf('clearRun').done === true);
check('合成任务按局封顶 10/10', stOf('merge10').progress === 10);
check('击杀任务记 40/60', stOf('kill60').progress === 40);
check('可领取数 = 2（通关 + 合成）', Daily.claimableCount(d) === 2);
const coinsBeforeClaim = d.meta.coins;
check('领取返回奖励金币', Daily.claim(d, 'clearRun') === CFG.DAILY_TASKS[0].coins);
check('奖励金币到账', d.meta.coins === coinsBeforeClaim + CFG.DAILY_TASKS[0].coins);
check('同一个任务不能重复领', Daily.claim(d, 'clearRun') === 0);
check('没完成的任务领不到', Daily.claim(d, 'kill60') === 0);
const coinsBeforeFree = d.meta.coins;
check(`免费宝箱给 ${CFG.FREE_CHEST_COINS} 金币（不用看广告）`, Daily.takeFreeChest(d) === CFG.FREE_CHEST_COINS);
check('免费宝箱到账且每天只能领一次', d.meta.coins === coinsBeforeFree + CFG.FREE_CHEST_COINS &&
  Daily.takeFreeChest(d) === 0 && Daily.freeChestLeft(d) === 0);
// 跨天重置
d.meta.daily.date = '2000-1-1';
Daily.ensure(d);
check('跨天进度与宝箱都重置', Daily.state(d).every((t) => t.progress === 0 && !t.claimed) && Daily.freeChestLeft(d) === 1);
// 首页 UI：打开面板 → 领取 → 免费宝箱 → 关闭
tap(33, 59); // 左上角 📋
step(0.1);
check('打开每日任务面板', app.home.panel === 'daily');
check('面板画出了任务名与免费宝箱', H.hasText('今天先摸一局') && H.hasText('每日免费宝箱'));
check('未完成的任务没有领取按钮', app.home.rects.claims.length === 0);
Daily.flush(d, { win: true, kills: 0, merges: 0 });
step(0.05);
const claimBtn = app.home.rects.claims[0];
check('完成后出现领取按钮', !!claimBtn);
const coinsBeforeUi = d.meta.coins;
if (claimBtn) { tap(claimBtn.x + claimBtn.w / 2, claimBtn.y + claimBtn.h / 2); step(0.05); }
check('点领取按钮奖励到账', d.meta.coins === coinsBeforeUi + CFG.DAILY_TASKS[0].coins);
const fcBtn = app.home.rects.freeChest;
const coinsBeforeFc = d.meta.coins;
if (fcBtn) { tap(fcBtn.x + fcBtn.w / 2, fcBtn.y + fcBtn.h / 2); step(0.05); }
check('点免费宝箱按钮到账', d.meta.coins === coinsBeforeFc + CFG.FREE_CHEST_COINS);
const dClose = app.home.rects.dailyClose;
tap(dClose.x + dClose.w / 2, dClose.y + dClose.h / 2);
step(0.05);
check('关闭每日任务面板', app.home.panel === null);
// 集成：真的在战斗里合成，并且走真实结算路径，进度才会进每日任务
d.meta.daily = null;
Daily.ensure(d);
d.meta.bestLevel = 1;
tap(187.5, 320);
step(0.2);
const b12 = d.battle;
check('新局开局（用于每日任务集成测试）', d.scene === 'battle' && b12.merges === 0);
const m0 = cellRect(0);
const m5 = cellRect(5);
H.drag({ x: m0.x + m0.w / 2, y: m0.y + m0.h / 2 }, { x: m5.x + m5.w / 2, y: m5.y + m5.h / 2 });
step(0.05);
check('局内合成计数 +1', b12.merges === 1);
check('合成后每日任务进度还没结算（要等一局结束）', stOf('merge10').progress === 0);
d.debug.damageBase(99999);
step(0.1);
const giveUp3 = b12.modal && b12.modal.type === 'revive' ? center(b12.modal.rects.giveup) : null;
if (giveUp3) { tap(giveUp3.x, giveUp3.y); step(0.1); }
check('真实结算路径把局内进度写进了每日任务', stOf('merge10').progress === 1);
check('失败不算通关任务', stOf('clearRun').progress === 0);

// ---------- 20. 成就与图鉴 ----------
console.log('\n[20] 成就与图鉴');
exitToHome();
check('回到首页（本节前提）', d.scene === 'home');
d.meta.dex = null;
d.meta.achClaimed = [];
d.meta.coins = 0;
Ach.ensure(d);
check(`成就数量在 6-10 之间（${CFG.ACHIEVEMENTS.length} 个）`,
  CFG.ACHIEVEMENTS.length >= 6 && CFG.ACHIEVEMENTS.length <= 10);
check('初始全部未达成、可领取数 0',
  Ach.state(d).every((a) => !a.done && !a.claimed) && Ach.claimableCount(d) === 0);
// 一局结算写入长期统计（合成 12 次 / 击杀 30 / 回收 2 / 最高 LV3 / 各类敌人分布）
Ach.flush(d, {
  win: true, kills: 30, merges: 12, recycled: 2, maxLv: 3,
  killsByType: { bug: 20, group: 10 },
});
const dex = Ach.ensure(d);
check('统计并入：局数/胜场/击杀/合成/回收/最高等级',
  dex.runs === 1 && dex.wins === 1 && dex.kills === 30 && dex.merges === 12 &&
  dex.recycled === 2 && dex.maxLv === 3);
check('图鉴按敌人类型累计击杀', dex.byType.bug === 20 && dex.byType.group === 10);
check('图鉴列表覆盖全部敌人（含 Boss）', Ach.dexList(d).length === Object.keys(CFG.ENEMIES).length &&
  Ach.dexList(d).some((e) => e.boss === true));
// 再打一局：累计而不是覆盖
Ach.flush(d, { win: false, kills: 5, merges: 3, recycled: 0, maxLv: 2, killsByType: { bug: 5 } });
check('跨局累计（击杀 30+5，合成 12+3）', dex.kills === 35 && dex.merges === 15 && dex.runs === 2 && dex.wins === 1);
// 达成与领取
dex.kills = 100; // 直接推到「手速上来了」的门槛
const killsAch = Ach.state(d).find((a) => a.id === 'kills100');
check('达到阈值后成就变为已达成', killsAch.done === true && killsAch.value === 100);
check('未达成的成就领不到', Ach.claim(d, 'kills1000') === 0);
const coinsBeforeAch = d.meta.coins;
check('领取成就返回奖励', Ach.claim(d, 'kills100') === CFG.ACHIEVEMENTS.find((a) => a.id === 'kills100').coins);
check('成就奖励到账', d.meta.coins === coinsBeforeAch + CFG.ACHIEVEMENTS.find((a) => a.id === 'kills100').coins);
check('成就不能重复领取', Ach.claim(d, 'kills100') === 0);
// 看广告计数（成就「广告鉴赏家」靠它）：必须走真实的激励视频流程，不能直接调回调
const adsBefore = Ach.ensure(d).adsWatched;
const chestBtn = app.home.rects.chest;
tap(chestBtn.x + chestBtn.w / 2, chestBtn.y + chestBtn.h / 2);
step(3.3); // 模拟广告 3 秒后发奖
check('看完激励视频才计入长期统计（走真实流程）', Ach.ensure(d).adsWatched === adsBefore + 1);
// UI：打开 📖、切图鉴、领取、关闭
tap(79, 59); // 左上角第二个按钮 📖
step(0.1);
check('打开成就与图鉴面板', app.home.panel === 'codex' && app.home.codexTab === 0);
check('面板画出了成就与累计统计', H.hasText('成就与图鉴') && H.hasText('手速上来了'));
dex.merges = 200; // 推到「合成工人」门槛，制造一个可领取
step(0.05);
const achBtn = app.home.rects.achClaims[0];
check('达成后出现成就领取按钮', !!achBtn);
const coinsBeforeAchUi = d.meta.coins;
if (achBtn) { tap(achBtn.x + achBtn.w / 2, achBtn.y + achBtn.h / 2); step(0.05); }
check('点成就领取按钮到账', d.meta.coins === coinsBeforeAchUi + CFG.ACHIEVEMENTS.find((a) => a.id === 'merge200').coins);
// 切到图鉴页
const tabDex = app.home.rects.codexTabs[1];
tap(tabDex.x + tabDex.w / 2, tabDex.y + tabDex.h / 2);
step(0.05);
check('切到图鉴页', app.home.codexTab === 1);
check('图鉴页画出了敌人名与击杀数', H.hasText('已击退') || H.hasText('还没遇到过'));
const codexCloseBtn = app.home.rects.codexClose;
tap(codexCloseBtn.x + codexCloseBtn.w / 2, codexCloseBtn.y + codexCloseBtn.h / 2);
step(0.05);
check('关闭成就与图鉴面板', app.home.panel === null);
// 集成：真的打一局（合成/击杀）后，长期统计里能看到
d.meta.dex = null;
Ach.ensure(d);
d.meta.bestLevel = 1;
tap(187.5, 320);
step(0.2);
const b13 = d.battle;
const cell0 = cellRect(0);
const cell5 = cellRect(5);
H.drag({ x: cell0.x + cell0.w / 2, y: cell0.y + cell0.h / 2 }, { x: cell5.x + cell5.w / 2, y: cell5.y + cell5.h / 2 });
step(0.05);
d.debug.damageBase(99999);
step(0.1);
const giveUp4 = b13.modal && b13.modal.type === 'revive' ? center(b13.modal.rects.giveup) : null;
if (giveUp4) { tap(giveUp4.x, giveUp4.y); step(0.1); }
check('真实结算路径写入了长期统计', Ach.ensure(d).runs === 1 && Ach.ensure(d).merges === 1);

// ---------- 21. 广告价值：收益告知 + 线上失败不发奖励 ----------
console.log('\n[21] 广告收益告知与失败策略');
exitToHome();
check('回到首页（本节前提）', d.scene === 'home');
// 收益告知：首页宝箱按钮写清能拿到多少
check('首页宝箱按钮写清了金币范围', H.hasText('看广告开宝箱 +') && H.hasText('今日剩'));
// 收益告知：三选一刷新按钮写明"换一批技能"
d.meta.bestLevel = 1;
tap(187.5, 320);
step(0.2);
d.debug.addExp(400);
step(0.1);
check('三选一刷新按钮写明了能换到什么', H.hasText('看广告换一批技能'));
check('复活面板不再写"满血"（实际只回 50%）', !H.hasText('满血复活'));
drainLevelups();
exitToHome();

(async () => {
  const tick = () => new Promise((r) => setImmediate(r));
  const adSvc = app.adService;
  // 场景一：未配置广告位（开发/未配置）→ 走模拟广告并发奖励
  check('未配置广告位时 AD_UNIT_ID 为空', CFG.AD_UNIT_ID === '');
  let devRewarded = false;
  adSvc.show('double', () => { devRewarded = true; });
  check('未配置时走模拟广告', !!adSvc.simulating);
  step(3.3);
  check('模拟广告到点发奖励（开发期行为）', devRewarded === true);

  // 场景二：线上广告加载失败 → 重试若干次后提示"广告暂时不可用"且【不发奖励】
  CFG.AD_UNIT_ID = 'test-ad-unit';
  adSvc._ad = null;
  wx.createRewardedVideoAd = () => ({
    onClose() {}, offClose() {},
    show: () => Promise.reject(new Error('no fill')),
    load: () => Promise.reject(new Error('no fill')),
  });
  global.__lastToast = null;
  let failRewarded = false;
  let failNotified = false;
  const adsWatchedBefore = Ach.ensure(d).adsWatched;
  adSvc.show('double', () => { failRewarded = true; }, () => { failNotified = true; });
  check('播放中占用位生效（挡住重复触发）', adSvc.showing === true);
  for (let i = 0; i < 12; i++) await tick(); // 等重试链走完
  check('线上失败不发奖励（绝不降级成白送）', failRewarded === false);
  check('线上失败不计入看广告统计', Ach.ensure(d).adsWatched === adsWatchedBefore);
  check('提示"广告暂时不可用"', global.__lastToast === '广告暂时不可用，稍后再试');
  check('失败回调被执行、占用位释放', failNotified === true && adSvc.showing === false);
  check('失败有埋点 ad_unavailable', H.countEvents('ad_unavailable') >= 1);

  // 场景三：线上广告正常 → 看完才发奖励（确认新策略没把正常路径改坏）
  let closedCb = null;
  wx.createRewardedVideoAd = () => ({
    onClose(cb) { closedCb = cb; }, offClose() { closedCb = null; },
    show: () => Promise.resolve(),
    load: () => Promise.resolve(),
  });
  adSvc._ad = null;
  let okRewarded = false;
  adSvc.show('revive', () => { okRewarded = true; });
  for (let i = 0; i < 3; i++) await tick();
  check('正常广告进入等待关闭状态', adSvc.showing === true && !!closedCb);
  if (closedCb) closedCb({ isEnded: true });
  check('看完整个广告才发奖励', okRewarded === true && adSvc.showing === false);
  // 中途关掉广告不发奖励
  adSvc._ad = null;
  let skipRewarded = false;
  adSvc.show('revive', () => { skipRewarded = true; });
  for (let i = 0; i < 3; i++) await tick();
  if (closedCb) closedCb({ isEnded: false });
  check('没看完广告不发奖励', skipRewarded === false);

  // 复位（后续如需再测，走回开发期路径）
  CFG.AD_UNIT_ID = '';
  adSvc._ad = null;
  delete wx.createRewardedVideoAd;

  // ---------- 结果 ----------
  console.log(`\n========== 冒烟测试：${pass} 通过 / ${fail} 失败 ==========`);
  process.exit(fail ? 1 : 0);
})();
