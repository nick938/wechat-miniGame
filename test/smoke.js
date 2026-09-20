/**
 * 无头冒烟测试：在 Node 里用桩替身模拟 wx/canvas，跑通完整游戏循环
 * 运行：node test/smoke.js
 * 覆盖：首页→进关→刷怪击杀→拖拽合成→三选一→暂停→胜利→双倍奖励→下一关→失败→复活→结算→工位升级→存档
 *      →减伤/护盾词缀生效→技能刷新扣次数时机→链式引爆不留僵尸怪
 */
'use strict';

// ---------- 无头运行环境：与 tools/sim.js 共用 test/harness.js ----------
const { createHarness } = require('./harness');
const H = createHarness({ seed: 42 }); // 固定随机种子：测试结果可复现
H.install();

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
touch('start', buy0.x, buy0.y); // 单击购买（首页面板无防误触，双击会连买两级）
check('购买成功：显示器 +1 级（扣 80 金币）',
  d.meta.upgrades.screen === 1 && d.meta.coins === coinsBeforeBuy - 80);
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
const Skills = require('../js/systems/skills');
const CFG = require('../js/core/config');
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
CFG.SKILLS.forEach((s) => {
  const owned = b7.skills.find((k) => k.id === s.id);
  if (owned) owned.stacks = s.max;
  else b7.skills.push({ id: s.id, stacks: s.max });
});
d.debug.addExp(400);
step(0.1);
check('全满级后三选一仍有卡可选', b7.modal && b7.modal.type === 'levelup' &&
  b7.modal.options.length >= 1 && !!b7.modal.rects.cards[0]);
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

// ---------- 结果 ----------
console.log(`\n========== 冒烟测试：${pass} 通过 / ${fail} 失败 ==========`);
process.exit(fail ? 1 : 0);
