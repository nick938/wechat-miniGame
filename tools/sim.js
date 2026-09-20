/**
 * 无头对局模拟器：让启发式机器人通过「触摸入口」玩真实游戏代码，产出可对比的指标
 *
 * 用法：
 *   node tools/sim.js                          # 默认 普通 机器人 3 玩家 × 8 局
 *   node tools/sim.js --tier novice|normal|expert
 *   node tools/sim.js --players 5 --sessions 12 --seed 1 --label baseline
 *
 * 原则：
 * - 只加载真实游戏代码（js/main.js），不复制任何游戏逻辑；机器人操作全部走触摸入口（与真人同路径）
 * - 观测只做只读采样 + 包装 board.dropSupply 计数（不改行为），保证指标反映真实玩法
 * - 固定随机种子：同一 seed + 同一份代码 ⇒ 完全相同的指标，可用于改动前后对比
 */
'use strict';

const fs = require('fs');

const { createHarness } = require('../test/harness');
const C = require('../js/core/config');
const { cellRect } = require('../js/ui/board');
const Daily = require('../js/systems/daily');

// ---------- 参数 ----------
const LABEL_RE = /^[a-z0-9_-]{1,32}$/i;
function parseArgs(argv) {
  const a = { tier: 'normal', players: 3, sessions: 8, seed: 1, maxLevel: 40, label: 'last', trace: false, prefer: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--tier') { a.tier = v; i++; }
    else if (k === '--players') { a.players = parseInt(v, 10); i++; }
    else if (k === '--sessions') { a.sessions = parseInt(v, 10); i++; }
    else if (k === '--seed') { a.seed = parseInt(v, 10); i++; }
    else if (k === '--max-level') { a.maxLevel = parseInt(v, 10); i++; }
    else if (k === '--label') { a.label = LABEL_RE.test(String(v)) ? v : 'last'; i++; }
    else if (k === '--trace') { a.trace = true; }
    else if (k === '--prefer') { a.prefer = String(v).split(',').filter(Boolean); i++; }
  }
  return a;
}
const ARGS = parseArgs(process.argv.slice(2));

// ---------- 启动游戏（必须在 harness.install() 之后） ----------
const H = createHarness({ seed: ARGS.seed, fast: true });
H.install();
require('../js/main');
const app = GameGlobal.app;
const d = GameGlobal.databus;

// ---------- 档位参数 ----------
const TIERS = {
  // 反应间隔以帧计（1 帧 = 16.7ms）；新手机器人慢半拍，熟练机器人手快
  // mergeChance：看到可合成的一对时会不会马上去合——新手只有不到一半概率注意得到，
  // 这样才会真实出现「棋盘被塞满」「满盘且无可合成对」的场景，否则死局指标永远是 0
  novice: { react: 30, speed: 1, sortByLevel: false, reroll: false, revive: true, double: false, chest: false, synergy: false, mergeChance: 0.45, recycle: false, recycleAt: 0, daily: false },
  normal: { react: 14, speed: 2, sortByLevel: true, reroll: true, revive: true, double: true, chest: true, synergy: false, mergeChance: 0.85, recycle: true, recycleAt: 10, daily: true },
  expert: { react: 8, speed: 3, sortByLevel: true, reroll: true, revive: true, double: true, chest: true, synergy: true, mergeChance: 1, recycle: true, recycleAt: 10, daily: true },
};

// ---------- 工具 ----------
function median(arr) {
  if (!arr.length) return 0;
  const s = arr.slice().sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 100) / 100;
}
function pct(a, b) { return b > 0 ? Math.round((a / b) * 1000) / 10 : 0; }
function bump(obj, key, n) { obj[key] = (obj[key] || 0) + (n === undefined ? 1 : n); }

// 工位三线全部升满所需金币（用于估算「满级所需局数」，短跑也能观测）
function totalUpgradeCost() {
  let total = 0;
  Object.keys(C.UPGRADES).forEach((k) => {
    for (let t = 0; t < C.UPGRADES[k].maxTier; t++) total += C.UPGRADE_COST(t);
  });
  return total;
}

// 机器人自带 LCG：机器人决策不依赖 Math.random（那是游戏自己的随机源）
let botSeed = 12345;
function botRandom() {
  botSeed = (botSeed * 1103515245 + 12345) % 2147483648;
  return botSeed / 2147483648;
}

// 机器人对技能的偏好权重（只影响机器人怎么选，不影响游戏本身）
const SKILL_VALUE = {
  coffeeFrenzy: 1.0, keyboardSmash: 1.0, bugFix: 1.0, bassBoost: 0.9,
  autofish: 1.2, swiftHands: 1.2, efficiency: 1.3,
  mute: 0.8, slowNet: 0.8, toiletBreak: 0.7, leave: 1.1, annualLeave: 0.9,
  shield: 0.9, refill: 0.8, postpone: 0.7, layoff: 0.9,
  overtimePay: 0.85, fishology: 0.85,              // 金币/经验类：对局外成长有用，别让机器人一律无视（这是模型选择，不是强度结论）
  crit: 1.35, chill: 1.0, lifesteal: 1.15,           // P2 机制技能：会改打法，优先拿
};
const DEFENSIVE = ['mute', 'slowNet', 'toiletBreak', 'shield', 'annualLeave'];

// ---------- 指标容器 ----------
const M = {
  sessions: 0,
  runs: 0,
  wins: 0,
  loses: 0,
  passByLevel: {},
  sessionEndLevels: [],
  lastRunLevel: 1,
  firstKill: [], firstMerge: [], firstLevelup: [],
  runDuration: [], merges: [], levelups: [],
  supplyDropped: [], supplyLost: [],
  coins: [],
  deathsChewed: 0, deathsTimeout: 0,
  battleFrames: 0, fullFrames: 0, deadlockFrames: 0,
  deadlockEvents: 0, deadlockMaxStreak: 0,
  adShows: {}, adRewards: {}, adOpportunities: {},
  peak: { enemies: 0, projectiles: 0, fxs: 0 },
  runsToMaxUpgrade: [],
  totalFrames: 0,
  mergeDone: 0, mergeSkipped: 0,                    // 机器人「看到可合成却没动手」的次数
  builds: {},                                       // build 签名（本局点到的所有技能）→ 次数
  picked: {},                                       // 每个技能被点到的总次数
  offered: {},                                      // 每个技能出现在三选一里的次数（用于算被选率）
  mechanicRuns: 0, mechanicPicks: 0,                // 点到"机制类"技能（改打法，不是纯数值）的局数/次数
  stuck: [],                                        // 触到帧上限仍未结束的 session（诊断卡死）
};

// 机制类技能：不是"数值 +x%"，而是改变这一局怎么打
const MECHANIC_IDS = ['crit', 'chill', 'lifesteal', 'refill', 'layoff', 'shield', 'annualLeave'];

// ---------- 机器人 ----------
class Bot {
  constructor(tier) {
    this.cfg = Object.assign({}, TIERS[tier]);
    this.tier = tier;
    this.cool = 0;
    this.sessionEnded = false;
    this.run = null;
  }

  beginRun() {
    const b = d.battle;
    this.run = {
      level: b.level,
      battle: b,                                    // 战斗实例：换关（next 直接开下一关）时用它切分「一局」
      mergeBase: H.countEvents('weapon_merge'),
      startEventIdx: H.events.length,                // 本局埋点起点（用于统计本局点了哪些技能）
      merges: 0, levelups: 0, supplyDropped: 0, supplyLost: 0,
      firstKill: 0, firstMerge: 0, firstLevelup: 0,
      deadStreak: 0, deadMax: 0,
      levelupModalOpen: false, reviveModalOpen: false, resultModalOpen: false,
      lastOfferSig: '',
      result: null, coins: 0, duration: 0,
      wrappedBoard: null,
    };
    this.wrapBoard();
  }

  // 只读观测 + 只包装一次 dropSupply（不改变行为，仅区分「补给了」和「棋盘满丢了」）
  // 注意：d.battle.board 是棋盘数据（{cells, dragging}），dropSupply 在场景的 Board 实例上
  wrapBoard() {
    const scene = app.battle;
    const st = this.run;
    if (!scene || !scene.board || st.wrappedBoard === scene.board) return;
    st.wrappedBoard = scene.board;
    const board = scene.board;
    const orig = board.dropSupply.bind(board);
    board.dropSupply = (type) => {
      const r = orig(type);
      if (r) st.supplyDropped++; else st.supplyLost++;
      return r;
    };
  }

  observe() {
    const b = d.battle;
    if (!b || d.scene !== 'battle' || !this.run) return;
    const st = this.run;
    this.wrapBoard();
    M.totalFrames++;
    if (!b.modal) M.battleFrames++;
    if (b.kills > 0 && !st.firstKill) st.firstKill = b.time;
    st.merges = H.countEvents('weapon_merge') - st.mergeBase;
    if (st.merges > 0 && !st.firstMerge) st.firstMerge = b.time;

    const isLevelup = !!(b.modal && b.modal.type === 'levelup');
    if (isLevelup && !st.levelupModalOpen) {
      st.levelupModalOpen = true;
      st.levelups++;
      if (!st.firstLevelup) st.firstLevelup = b.time;
      // 广告机会：每次弹出三选一只要还有刷新次数，就是一个可选点（上升沿计一次）
      if (b.modal.rects && b.modal.rects.reroll) bump(M.adOpportunities, 'reroll');
    }
    // 记下每一批「出现过的选项」：用签名比对，这样刷新后的新选项也算供给，
    // 否则被选率会算出 >100%（刷出来的技能被选却不计供给）
    if (isLevelup && b.modal.options && b.modal.options.length) {
      const sig = b.modal.options.map((o) => o.id).join(',');
      if (sig !== st.lastOfferSig) {
        st.lastOfferSig = sig;
        b.modal.options.forEach((o) => { if (o && o.id !== 'mastery') bump(M.offered, o.id); });
      }
    }
    if (!isLevelup) st.levelupModalOpen = false;

    const isRevive = !!(b.modal && b.modal.type === 'revive');
    if (isRevive && !st.reviveModalOpen) { st.reviveModalOpen = true; bump(M.adOpportunities, 'revive'); }
    if (!isRevive) st.reviveModalOpen = false;

    const isResult = !!(b.modal && b.modal.type === 'result');
    if (isResult && !st.resultModalOpen) {
      st.resultModalOpen = true;
      st.result = b.modal.win ? 'win' : 'lose';
      st.coins = b.coins;
      st.duration = b.time;
      if (b.modal.win) bump(M.adOpportunities, 'double');
      M.runs++;
      const pl = M.passByLevel[b.level] || (M.passByLevel[b.level] = { win: 0, lose: 0 });
      if (st.result === 'win') { pl.win++; M.wins++; } else { pl.lose++; M.loses++; }
      if (st.firstKill) M.firstKill.push(st.firstKill);
      if (st.firstMerge) M.firstMerge.push(st.firstMerge);
      if (st.firstLevelup) M.firstLevelup.push(st.firstLevelup);
      M.runDuration.push(st.duration);
      M.merges.push(st.merges);
      M.levelups.push(st.levelups);
      M.supplyDropped.push(st.supplyDropped);
      M.supplyLost.push(st.supplyLost);
      M.coins.push(st.coins);
      if (st.result === 'lose') {
        if (b.timeLeft <= 0) M.deathsTimeout++; else M.deathsChewed++;
      }
      // build 原型：只看"会改变打法"的技能（机制类 + 紫/橙品质），纯数值叠加不参与签名，
      // 否则每局的组合都独一无二，占比永远是 0%，看不出"是不是每局都一个样"
      const picks = [];
      for (let k = st.startEventIdx; k < H.events.length; k++) {
        const ev = H.events[k];
        if (ev.ev === 'skill_pick' && ev.params && ev.params.id !== 'mastery') picks.push(ev.params.id);
      }
      const key = picks.filter((id) => {
        if (MECHANIC_IDS.indexOf(id) >= 0) return true;
        const cfg = C.SKILLS.find((s) => s.id === id);
        return cfg && cfg.rarity >= 3;
      }).sort();
      const sig = key.length ? key.join('+') : '(纯数值流)';
      bump(M.builds, sig.length > 60 ? sig.slice(0, 60) + '…' : sig);
      picks.forEach((id) => { bump(M.picked, id); if (MECHANIC_IDS.indexOf(id) >= 0) M.mechanicPicks++; });
      if (picks.some((id) => MECHANIC_IDS.indexOf(id) >= 0)) M.mechanicRuns++;
    }
    if (!isResult) st.resultModalOpen = false;
    M.peak.enemies = Math.max(M.peak.enemies, b.enemies.length);
    M.peak.projectiles = Math.max(M.peak.projectiles, b.projectiles.length);
    M.peak.fxs = Math.max(M.peak.fxs, b.fxs.length);
  }

  // 满盘 / 真死局（只在战斗进行中采样，冻结帧不计）
  sampleBoardPressure() {
    const b = d.battle;
    if (!b || d.scene !== 'battle' || b.modal || !this.run) return;
    const st = this.run;
    const cells = b.board.cells;
    const full = cells.every(Boolean);
    if (!full) { st.deadStreak = 0; return; }
    M.fullFrames++;
    let mergeable = false;
    const seen = {};
    for (const c of cells) {
      if (!c || c.lv >= C.MAX_WEAPON_LV) continue;
      const key = c.type + c.lv;
      if (seen[key]) { mergeable = true; break; }
      seen[key] = 1;
    }
    if (mergeable) { st.deadStreak = 0; return; }
    M.deadlockFrames++;
    st.deadStreak++;
    if (st.deadStreak === 1) M.deadlockEvents++;
    st.deadMax = Math.max(st.deadMax, st.deadStreak);
    M.deadlockMaxStreak = Math.max(M.deadlockMaxStreak, st.deadStreak);
  }

  act() {
    if (this.cool > 0) { this.cool--; return; }
    if (d.scene === 'home') this.actHome();
    else if (d.scene === 'battle') this.actBattle();
  }

  cheapestAffordable() {
    const keys = Object.keys(C.UPGRADES);
    let best = -1;
    let bestCost = Infinity;
    keys.forEach((k, i) => {
      const tier = d.meta.upgrades[k];
      if (tier >= C.UPGRADES[k].maxTier) return;
      const cost = C.UPGRADE_COST(tier);
      if (cost <= d.meta.coins && cost < bestCost) { best = i; bestCost = cost; }
    });
    return best;
  }

  actHome() {
    const h = app.home;
    if (h.panel === 'help') {                       // 首进首页的玩法说明：一路翻完
      const r = h.rects.helpNext;
      H.touch('start', r.x + r.w / 2, r.y + r.h / 2);
      this.cool = 6;
      return;
    }
    if (h.panel === 'daily') {
      const c = h.rects.claims[0];
      if (c) { H.tap(c.x + c.w / 2, c.y + c.h / 2); this.cool = 8; return; }
      if (h.rects.freeChest) { H.tap(h.rects.freeChest.x + 30, h.rects.freeChest.y + 26); this.cool = 8; return; }
      const cl = h.rects.dailyClose;
      H.tap(cl.x + cl.w / 2, cl.y + cl.h / 2);
      this.cool = 8;
      return;
    }
    if (h.panel === 'upgrade') {
      const idx = this.cheapestAffordable();
      if (idx >= 0) {
        const r = h.rects.buys[idx];
        H.touch('start', r.x + r.w / 2, r.y + r.h / 2);
        this.cool = 20;                             // 避开 0.25s 防连点
        return;
      }
      const c = h.rects.closePanel;
      H.touch('start', c.x + c.w / 2, c.y + c.h / 2);
      this.cool = 6;
      return;
    }
    if (h.panel) return;                            // 其它面板机器人不会打开
    // 每日任务/免费宝箱：有红点就点开领（和真人一样的习惯）
    if (this.cfg.daily) {
      if (Daily.claimableCount(d) > 0 || Daily.freeChestLeft(d) > 0) {
        const r0 = h.rects.daily;
        H.tap(r0.x + r0.w / 2, r0.y + r0.h / 2);
        this.cool = 8;
        return;
      }
    }
    if (this.cfg.chest && h.chestLeft() > 0) {      // 广告宝箱（每天 3 次）
      const r = h.rects.chest;
      H.tap(r.x + r.w / 2, r.y + r.h / 2);
      this.cool = 10;
      return;
    }
    if (this.cheapestAffordable() >= 0) {           // 有闲钱先升级工位
      const r = h.rects.upgrade;
      H.tap(r.x + r.w / 2, r.y + r.h / 2);
      this.cool = 8;
      return;
    }
    this.sessionEnded = false;
    const r = h.rects.start;
    H.tap(r.x + r.w / 2, r.y + r.h / 2);
    this.cool = 8;
  }

  // 挑一件最该丢的：优先"没有同类同级伙伴的孤品"（等级最低的先丢）；
  // 还能合且棋盘不挤时不动手——回收是主动选择，不是被逼的（休闲游戏不该有高 APM 压力）
  pickRecycleTarget(cells, hasMerge) {
    if (hasMerge && botRandom() < 0.5) return -1;   // 用机器人自带 LCG，保证可复现
    let best = -1;
    let bestLv = 99;
    cells.forEach((c, i) => {
      if (!c) return;
      const partner = cells.some((o, j) => o && j !== i && o.type === c.type && o.lv === c.lv && c.lv < C.MAX_WEAPON_LV);
      if (partner) return;
      if (c.lv < bestLv) { bestLv = c.lv; best = i; }
    });
    return best;
  }

  actBattle() {
    const b = d.battle;
    const m = b.modal;
    if (!m) { this.doMerge(); return; }

    if (m.type === 'levelup') {
      if (!m.rects || !m.rects.cards || !m.rects.cards.length) return;
      if (this.cfg.reroll && b.rerollLeft > 0 && m.rects.reroll && m.options.every((s) => s.rarity <= 1)) {
        const r = m.rects.reroll;
        H.tap(r.x + r.w / 2, r.y + r.h / 2);
        this.cool = 10;                             // 模拟广告 3 秒后才会重抽
        return;
      }
      const r = m.rects.cards[this.pickSkill(m.options)];
      H.tap(r.x + r.w / 2, r.y + r.h / 2);
      this.cool = 4;
      return;
    }

    if (m.type === 'result') {
      if (m.win) {
        if (this.cfg.double && !m.doubled && m.rects.double) {
          const r = m.rects.double;
          H.tap(r.x + r.w / 2, r.y + r.h / 2);
          this.cool = 10;
          return;
        }
        if (b.level >= ARGS.maxLevel) {              // 打到自己设定的上限：本 session 收工
          this.sessionEnded = true;
          this.hitLevelCap = true;
          const r = m.rects.home;
          H.tap(r.x + r.w / 2, r.y + r.h / 2);
          this.cool = 8;
          return;
        }
        const r = m.rects.next;
        H.tap(r.x + r.w / 2, r.y + r.h / 2);
      } else {
        this.sessionEnded = true;                   // 本 session 到此为止（一次复活也没能救回来）
        const r = m.rects.home;
        H.tap(r.x + r.w / 2, r.y + r.h / 2);
      }
      this.cool = 8;
      return;
    }

    if (m.type === 'revive') {
      const r = this.cfg.revive ? m.rects.revive : m.rects.giveup;
      if (r) { H.tap(r.x + r.w / 2, r.y + r.h / 2); this.cool = 10; }
      return;
    }
    if (m.type === 'pause' && m.rects.resume) {      // 机器人不主动暂停，保险恢复
      const r = m.rects.resume;
      H.tap(r.x + r.w / 2, r.y + r.h / 2);
      this.cool = 6;
    }
  }

  pickSkill(options) {
    if (this.tier === 'novice') return Math.floor(botRandom() * options.length);
    let bi = 0;
    let bv = -1;
    options.forEach((s, i) => {
      const v = this.skillValue(s);
      if (v > bv) { bv = v; bi = i; }
    });
    return bi;
  }

  skillValue(s) {
    const b = d.battle;
    // --prefer：对照实验用，把指定技能顶到最优先（仍然走真实的三选一弹层去点，不绕过玩法）
    if (ARGS.prefer.length && ARGS.prefer.indexOf(s.id) >= 0) return 99;
    const kw = { coffeeFrenzy: 'coffee', keyboardSmash: 'keyboard', bugFix: 'bug', bassBoost: 'headphone' };
    if (this.cfg.synergy && kw[s.id] && !b.board.cells.some((c) => c && c.type === kw[s.id])) {
      return 0.3;                                   // 熟练机器人：本局没这件装备就不点它的专属加成
    }
    const base = SKILL_VALUE[s.id] === undefined ? 0.6 : SKILL_VALUE[s.id];
    if (this.cfg.synergy && b.baseHp / b.baseHpMax < 0.5 && DEFENSIVE.indexOf(s.id) >= 0) {
      return base + 0.8;                            // 血少时优先防守
    }
    return base;
  }

  doMerge() {
    const b = d.battle;
    const cells = b.board.cells;
    const moves = [];
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const a = cells[i];
        const c = cells[j];
        if (a && c && a.type === c.type && a.lv === c.lv && a.lv < C.MAX_WEAPON_LV) {
          moves.push({ i, j, lv: a.lv, type: a.type });
        }
      }
    }
    // 回收：新手不知道有这个机制（模型化成永远不用），普通/熟练在棋盘挤的时候会丢孤品
    if (this.cfg.recycle) {
      const occupied = cells.filter(Boolean).length;
      if (occupied >= this.cfg.recycleAt) {
        const target = this.pickRecycleTarget(cells, moves.length > 0, occupied);
        if (target >= 0) {
          const r = cellRect(target);
          H.drag(
            { x: r.x + r.w / 2, y: r.y + r.h / 2 },
            { x: C.RECYCLE_RECT.x + C.RECYCLE_RECT.w / 2, y: C.RECYCLE_RECT.y + C.RECYCLE_RECT.h / 2 }
          );
          this.cool = this.cfg.react;
          return;
        }
      }
    }
    if (!moves.length) {
      this.cool = 6;
      return;                                       // 满盘且无对可合时只能等（除非回收腾位）
    }
    if (this.cfg.mergeChance < 1 && botRandom() > this.cfg.mergeChance) {
      this.cool = this.cfg.react * 4;                // 没注意到：拖一会儿再看
      M.mergeSkipped++;
      return;
    }
    M.mergeDone++;
    if (this.cfg.sortByLevel) {
      const counts = {};
      cells.forEach((c) => { if (c) bump(counts, c.type); });
      moves.sort((x, y) => (y.lv - x.lv) || ((counts[y.type] || 0) - (counts[x.type] || 0)));
    }
    const mv = moves[0];
    const from = cellRect(mv.i);
    const to = cellRect(mv.j);
    H.drag(
      { x: from.x + from.w / 2, y: from.y + from.h / 2 },
      { x: to.x + to.w / 2, y: to.y + to.h / 2 }
    );
    this.cool = this.cfg.react;
  }
}

// ---------- 主循环 ----------
// 单 session 帧上限：一次 session 可能打十几关（每关 150-255s），给足 60 虚拟分钟
const MAX_FRAMES_PER_SESSION = 60 * 60 * 60;

function playSession(bot) {
  let frames = 0;
  const runsAtStart = M.runs;                       // 只统计真的打过一局的 session（防机器人状态 bug 污染指标）
  bot.sessionEnded = false;                         // 必须在入口重置：新 session 第一帧可能先去开宝箱/买升级
  bot.run = null;
  while (frames < MAX_FRAMES_PER_SESSION) {
    H.frame();
    frames++;
    bot.observe();
    bot.sampleBoardPressure();
    // 一局 = 一次战斗实例。注意「胜利 → 下一关」不会回首页，必须靠战斗实例换新来切分
    if (d.scene === 'battle' && d.battle) {
      if (!bot.run || bot.run.battle !== d.battle) bot.beginRun();
      M.lastRunLevel = d.battle.level;
    } else if (d.scene === 'home' && bot.run) {
      bot.run = null;
    }
    bot.act();
    if (ARGS.trace && M.sessions === 0 && frames % 30 === 0) {
      const b = d.battle;
      const cells = b ? b.board.cells.filter(Boolean).length : 0;
      console.log(`[trace] 帧${frames} ${d.scene}${b ? ` 第${b.level}关 剩${Math.round(b.timeLeft)}s 血${Math.round(b.baseHp)} 敌${b.enemies.length} 棋盘${cells} 弹${b.projectiles.length}` : ''}` +
        `${b && b.modal ? ' 模态=' + b.modal.type : ''} 合成${H.countEvents('weapon_merge')} 三选一${H.countEvents('skill_pick')}`);
    }
    if (bot.sessionEnded && d.scene === 'home') {
      if (M.lastRunLevel > 0 && M.runs > runsAtStart) {
        M.sessions++;
        M.sessionEndLevels.push(M.lastRunLevel);
      }
      return frames;
    }
  }
  // 触到帧上限：记一份现场快照，方便定位是游戏卡住还是机器人卡住
  const b = d.battle;
  M.stuck.push({
    scene: d.scene,
    panel: d.scene === 'home' ? app.home.panel : null,
    modal: b && b.modal ? b.modal.type : null,
    level: b ? b.level : 0,
    timeLeft: b ? Math.round(b.timeLeft) : 0,
    enemies: b ? b.enemies.length : 0,
    boardCount: b ? b.board.cells.filter(Boolean).length : 0,
    baseHp: b ? Math.round(b.baseHp) : 0,
    coins: d.meta.coins,
    virtualMin: Math.round(frames / 60 / 60 * 10) / 10,
  });
  return frames;
}

function main() {
  const t0 = Date.now();
  const tier = TIERS[ARGS.tier] ? ARGS.tier : 'normal';
  const bot = new Bot(tier);
  let maxedRecorded = false;

  for (let p = 0; p < ARGS.players; p++) {
    if (p > 0) {
      // 新玩家：清空养成与进度（用游戏自带的调试钩子，仍走真实存档路径）
      d.debug.resetSave();
      app.home.panel = null;
      app.goHome();
      H.step(0.1);
    }
    const runsAtPlayerStart = M.runs;
    maxedRecorded = false;
    for (let s = 0; s < ARGS.sessions; s++) {
      playSession(bot);
      const maxed = Object.keys(C.UPGRADES).every((k) => d.meta.upgrades[k] >= C.UPGRADES[k].maxTier);
      if (maxed && !maxedRecorded) {
        maxedRecorded = true;
        M.runsToMaxUpgrade.push(M.runs - runsAtPlayerStart);
      }
    }
  }

  H.events.forEach((e) => {
    if (e.ev === 'ad_show' && e.params) bump(M.adShows, e.params.placement);
    if (e.ev === 'ad_reward' && e.params) bump(M.adRewards, e.params.placement);
  });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const adOpp = Object.keys(M.adOpportunities).reduce((a, k) => a + M.adOpportunities[k], 0);
  const adShowTotal = Object.keys(M.adShows).reduce((a, k) => a + M.adShows[k], 0);
  const sess = Math.max(1, M.sessions);
  const levels = Object.keys(M.passByLevel).map(Number).sort((a, b) => a - b);
  const passLines = levels.map((lv) => {
    const p = M.passByLevel[lv];
    return `L${lv} ${pct(p.win, p.win + p.lose)}%(${p.win + p.lose})`;
  });

  const lines = [];
  const push = (s) => lines.push(s);
  push(`\n===== 对局模拟器 · 档位 ${tier} · 玩家 ${ARGS.players} × 每玩家 ${ARGS.sessions} 局 · seed ${ARGS.seed} =====`);
  push(`完成 ${M.sessions} session / ${M.runs} 局，虚拟帧 ${(M.totalFrames / 1000).toFixed(0)}k，耗时 ${elapsed}s`);
  push('');
  push(`【结果】胜 ${M.wins} / 负 ${M.loses}（胜率 ${pct(M.wins, M.runs)}%）`);
  push(`【分关通过率】${passLines.join('  ')}`);
  push(`【session 结束关卡】中位 ${median(M.sessionEndLevels)}，最高 ${M.sessionEndLevels.length ? Math.max.apply(null, M.sessionEndLevels) : 0}`);
  push(`【失败原因】被啃死 ${M.deathsChewed} / 时间到未清场 ${M.deathsTimeout}`);
  push('');
  push(`【节奏·秒】首杀 ${median(M.firstKill)}  首合成 ${median(M.firstMerge)}  首三选一 ${median(M.firstLevelup)}  单局时长 ${median(M.runDuration)}`);
  push(`【行为·每局】合成 ${median(M.merges)}  三选一 ${median(M.levelups)}  补给投放 ${median(M.supplyDropped)}  补给丢弃 ${median(M.supplyLost)}  机器人漏看可合成 ${M.mergeSkipped} 次/动手 ${M.mergeDone} 次`);
  push(`【挫败】满盘帧占比 ${pct(M.fullFrames, M.battleFrames)}%  真死局帧占比 ${pct(M.deadlockFrames, M.battleFrames)}%  死局次数 ${M.deadlockEvents}  最长死局 ${(M.deadlockMaxStreak / 60).toFixed(1)}s`);
  push(`【回收】(P1 新增) 回收件数 ${H.countEvents('weapon_recycle')}  棋盘满事件 ${H.countEvents('board_full')}  空投丢弃/场 ${median(M.supplyLost)}`);
  // build 多样性：同一套 build 出现得越多，说明"每局都一个样"
  const buildList = Object.keys(M.builds).map((k) => ({ k, n: M.builds[k] })).sort((a, c) => c.n - a.n);
  const topBuildShare = buildList.length ? Math.round((buildList[0].n / M.runs) * 100) : 0;
  const pickList = Object.keys(M.picked).map((k) => ({ k, n: M.picked[k] })).sort((a, c) => c.n - a.n);
  push(`【build】(P2 新增) 不同打法原型 ${buildList.length} 种 / ${M.runs} 局  最热原型占比 ${topBuildShare}%  点到机制技能的局数占比 ${Math.round((M.mechanicRuns / Math.max(1, M.runs)) * 100)}%`);
  push(`【原型 top5】${buildList.slice(0, 5).map((x) => `${x.k}×${x.n}`).join('  ')}`);
  push(`【技能热度 top6】${pickList.slice(0, 6).map((p) => `${p.k}:${p.n}`).join('  ')}`);
  push(`【每日】(P3 新增) 打开面板 ${H.countEvents('daily_open')} 次  领任务奖励 ${H.countEvents('daily_claim')} 次  领免费宝箱 ${H.countEvents('daily_chest')} 次`);
  // 被选率：机制类 vs 纯数值类（判断"三选一是不是真有取舍、机制技能够不够吸引")
  const rate = (ids) => {
    let o = 0;
    let p = 0;
    ids.forEach((id) => { o += M.offered[id] || 0; p += M.picked[id] || 0; });
    return o ? Math.round((p / o) * 100) : -1;
  };
  const allIds = Object.keys(M.offered);
  const mechIds = allIds.filter((id) => MECHANIC_IDS.indexOf(id) >= 0);
  const statIds = allIds.filter((id) => MECHANIC_IDS.indexOf(id) < 0);
  push(`【被选率】机制类 ${rate(mechIds)}%  纯数值类 ${rate(statIds)}%  （=被选中次数/出现在三选一里的次数）`);
  const rateList = allIds.filter((id) => M.offered[id] >= 100)
    .map((id) => ({ id, r: (M.picked[id] || 0) / M.offered[id], o: M.offered[id] }))
    .sort((a, c) => a.r - c.r);
  push(`【最冷门（被选率最低，出现≥100次）】${rateList.slice(0, 5).map((x) => `${x.id} ${Math.round(x.r * 100)}%`).join('  ')}`);
  push(`【最抢手】${rateList.slice(-5).reverse().map((x) => `${x.id} ${Math.round(x.r * 100)}%`).join('  ')}`);
  push(`【经济】每局金币中位 ${median(M.coins)}  三线满级所需局数 ${M.runsToMaxUpgrade.length ? M.runsToMaxUpgrade.join('/') : '未达成'}（按每局金币估算 ${Math.ceil(totalUpgradeCost() / Math.max(1, median(M.coins)))} 局，升级总价 ${totalUpgradeCost()}）`);
  push(`【广告·潜机会/单场】${JSON.stringify(M.adOpportunities)} 合计 ${(adOpp / sess).toFixed(2)}/局，${(adOpp / Math.max(1, M.runs)).toFixed(2)}/单场`);
  push(`【广告·实际看/单场】${JSON.stringify(M.adShows)} 合计 ${(adShowTotal / sess).toFixed(2)}/局，${(adShowTotal / Math.max(1, M.runs)).toFixed(2)}/单场`);
  push(`【压力峰值】敌人 ${M.peak.enemies}  弹丸 ${M.peak.projectiles}  特效 ${M.peak.fxs}`);
  if (M.stuck.length) {
    push(`【卡死 session】${M.stuck.length} 个未正常结束：`);
    M.stuck.slice(0, 5).forEach((s) => {
      push(`  → scene=${s.scene} panel=${s.panel} modal=${s.modal} 第${s.level}关 剩${s.timeLeft}s 敌人${s.enemies} 棋盘${s.boardCount} 血${s.baseHp} 金币${s.coins} 虚拟${s.virtualMin}分`);
    });
  }
  push('');
  const t = [];
  const chk = (name, ok, value) => t.push(`  ${ok ? '✓' : '✗'} ${name}：${value}`);
  chk('真死局帧占比 = 0', M.deadlockFrames === 0, `${pct(M.deadlockFrames, M.battleFrames)}%`);
  if (tier === 'novice') {
    chk('首杀 ≤ 12s', median(M.firstKill) <= 12, `${median(M.firstKill)}s`);
    chk('首次合成 ≤ 20s', median(M.firstMerge) <= 20, `${median(M.firstMerge)}s`);
    chk('首三选一 ≤ 30s', median(M.firstLevelup) <= 30, `${median(M.firstLevelup)}s`);
  }
  if (tier === 'normal') {
    const p8 = M.passByLevel[8] ? pct(M.passByLevel[8].win, M.passByLevel[8].win + M.passByLevel[8].lose) : 0;
    chk('第 8 关通过率 40%-70%', p8 >= 40 && p8 <= 70, `${p8}%`);
    chk('无尽中位关卡 ≥ 12', median(M.sessionEndLevels) >= 12, `${median(M.sessionEndLevels)}`);
  }
  chk('每局合成中位 ≥ 15', median(M.merges) >= 15, `${median(M.merges)}`);
  chk('每局三选一中位 ≥ 8', median(M.levelups) >= 8, `${median(M.levelups)}`);
  chk('每局自愿广告机会 ≥ 5', adOpp / sess >= 5, `${(adOpp / sess).toFixed(2)}/局（单场 ${(adOpp / Math.max(1, M.runs)).toFixed(2)}）`);
  chk('三线满级 ≤ 25 局', (M.runsToMaxUpgrade.length ? median(M.runsToMaxUpgrade) : Math.ceil(totalUpgradeCost() / Math.max(1, median(M.coins)))) <= 25,
    M.runsToMaxUpgrade.length
      ? `${median(M.runsToMaxUpgrade)} 局（实测）`
      : `${Math.ceil(totalUpgradeCost() / Math.max(1, median(M.coins)))} 局（按每局金币估算）`);
  push('【目标核对】');
  t.forEach(push);
  console.log(lines.join('\n'));

  const jsonPath = `${__dirname}/sim-${ARGS.label}.json`;
  fs.writeFileSync(jsonPath, JSON.stringify({
    meta: {
      tier, players: ARGS.players, sessions: ARGS.sessions, seed: ARGS.seed,
      elapsedSec: parseFloat(elapsed), frames: M.totalFrames,
    },
    summary: {
      sessions: M.sessions, runs: M.runs, wins: M.wins, loses: M.loses,
      passByLevel: M.passByLevel,
      sessionEndMedianLevel: median(M.sessionEndLevels),
      medianFirstKill: median(M.firstKill),
      medianFirstMerge: median(M.firstMerge),
      medianFirstLevelup: median(M.firstLevelup),
      medianRunDuration: median(M.runDuration),
      medianMerges: median(M.merges),
      medianLevelups: median(M.levelups),
      medianSupplyDropped: median(M.supplyDropped),
      medianSupplyLost: median(M.supplyLost),
      medianCoins: median(M.coins),
      medianSupplyLost: median(M.supplyLost),
      recycledTotal: H.countEvents('weapon_recycle'),
      boardFullEvents: H.countEvents('board_full'),
      buildCount: buildList.length,
      topBuildSharePct: topBuildShare,
      mechanicRunSharePct: Math.round((M.mechanicRuns / Math.max(1, M.runs)) * 100),
      topSkills: pickList.slice(0, 8),
      mechanicPickRate: rate(mechIds),
      statPickRate: rate(statIds),
      dailyOpen: H.countEvents('daily_open'),
      dailyClaim: H.countEvents('daily_claim'),
      dailyChest: H.countEvents('daily_chest'),
      runsToMaxUpgrade: M.runsToMaxUpgrade,
      runsToMaxUpgradeEstimated: Math.ceil(totalUpgradeCost() / Math.max(1, median(M.coins))),
      upgradeTotalCost: totalUpgradeCost(),
      adOpportunities: M.adOpportunities,
      adShows: M.adShows,
      adRewards: M.adRewards,
      adOpportunityPerSession: Math.round((adOpp / sess) * 100) / 100,
      adShowPerSession: Math.round((adShowTotal / sess) * 100) / 100,
      fullBoardFramePct: pct(M.fullFrames, M.battleFrames),
      deadlockFramePct: pct(M.deadlockFrames, M.battleFrames),
      deadlockEvents: M.deadlockEvents,
      deadlockMaxStreakSec: Math.round((M.deadlockMaxStreak / 60) * 10) / 10,
      deaths: { chewed: M.deathsChewed, timeout: M.deathsTimeout },
      peak: M.peak,
      battleFrames: M.battleFrames,
      stuckCount: M.stuck.length,
      stuck: M.stuck,
    },
  }, null, 2));
  console.log(`\n指标已落盘：tools/sim-${ARGS.label}.json`);
}

main();
