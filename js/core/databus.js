/**
 * 全局状态单例（挂在 GameGlobal.databus）
 * - meta：局外持久数据（存档）
 * - battle：局内实时状态，进关时重建
 * - debug：调试钩子，方便开发者工具控制台调数值
 */
const Pool = require('./pool');
const C = require('./config');

const SAVE_KEY = 'moyu_defense_save_v1';

function defaultMeta() {
  return {
    coins: 0,
    upgrades: { screen: 0, chair: 0, fish: 0, score: 0 }, // 工位升级等级（第四条是摸鱼分加成，老存档缺这条会补 0）
    bestLevel: 1,          // 解锁到的最高关卡
    bestScore: 0,          // 历史最高摸鱼分
    totalKills: 0,
    chest: { date: '', used: 0 }, // 每日广告宝箱
    daily: null,           // 每日任务/免费宝箱（跨天由 systems/daily.js 重置）
    soundOn: true,
    helpSeen: false,       // 首页玩法说明弹窗已看过
    speed: 1,              // 战斗倍速偏好（×1/×2/×3）
    tutorialDone: false,   // 合成教学（手把手）完成
    skillTipDone: false,   // 首次三选一提示已展示过
  };
}

let instance;

class Databus {
  constructor() {
    if (instance) return instance;
    instance = this;

    this.pool = new Pool();
    this.scene = 'home';          // home | battle
    this.meta = this.loadMeta();
    this.battle = null;
    this.debug = this.makeDebug();
  }

  // ---------- 存档 ----------
  loadMeta() {
    const def = defaultMeta();
    try {
      if (typeof wx !== 'undefined' && wx.getStorageSync) {
        const saved = wx.getStorageSync(SAVE_KEY);
        if (saved && typeof saved === 'object') {
          // 只取认识的字段，防脏数据
          return Object.assign(def, saved, {
            upgrades: Object.assign(def.upgrades, saved.upgrades || {}),
            chest: Object.assign(def.chest, saved.chest || {}),
          });
        }
      }
    } catch (e) { /* 存档损坏则用默认 */ }
    return def;
  }

  saveMeta() {
    try {
      if (typeof wx !== 'undefined' && wx.setStorageSync) {
        wx.setStorageSync(SAVE_KEY, this.meta);
      }
    } catch (e) { /* 忽略 */ }
  }

  // ---------- 局内状态 ----------
  newBattle(levelIndex) {
    const cfg = C.buildLevel(levelIndex);
    const m = this.meta;
    this.battle = {
      level: levelIndex,
      cfg,
      time: 0,
      timeLeft: cfg.duration,
      baseHpMax: C.BASE_HP + C.UPGRADES.chair.perTier * m.upgrades.chair,
      baseHp: 0, // init 时回满
      baseShield: 0,
      coins: 0,
      exp: 0,
      charLevel: 1,
      kills: 0,
      merges: 0,            // 本局合成次数（每日任务结算用）
      maxLv: 1,             // 本局合出的最高装备等级（成就用）
      killsByType: {},      // 本局各类敌人击杀数（图鉴用）
      bossKills: 0,         // 本局打死的 Boss 数（每日任务用）
      revived: false,
      settled: false, // 本局金币是否已入账（防中途退出重复/遗漏结算）
      speed: C.SPEED_STEPS.indexOf(m.speed) >= 0 ? m.speed : 1, // 本局倍速（沿用上次偏好）
      // 摸鱼分加成（局外「摸鱼达人」）：只影响分数，不影响战斗
      scoreMul: 1 + C.UPGRADES.score.perTier * (m.upgrades.score || 0),
      rerollLeft: C.REROLL_PER_RUN,
      pendingLevels: 0,
      supplyTimer: C.SUPPLY_INTERVAL * 0.6, // 首次补给稍早一点
      regenAcc: 0,
      lastHitBy: '',        // 最近一次啃到工位的敌人类型（失败复盘用）
      recycled: 0,          // 本局回收装备件数
      starTickets: 0,       // 本局升星券（打死 Boss 得）
      starArmed: false,     // 是否处于"选装备升星"状态
      hint: null,           // 战场提示条 {text, t}
      bossWarn: 0,          // Boss 出场倒计时（秒，0 = 不显示）
      bossWarned: false,    // 本轮预警是否已上报埋点
      skills: [],           // [{id, stacks}]
      enemies: [],
      projectiles: [],
      bombs: [],
      fxs: [],
      orbs: {}, // 耳机声波状态，key=格子 index：{angle, x0..}
      board: {
        cells: new Array(C.BOARD_COLS * C.BOARD_ROWS).fill(null),
        dragging: null,     // {index, x, y}
      },
      modal: null,          // null | {type:'levelup'|'pause'|'revive'|'result', ...}
      bossRef: null,
      // 全局词缀（技能+局外成长折算进来）
      mods: {
        atkMul: 1 + C.UPGRADES.screen.perTier * m.upgrades.screen,
        spdMul: 1,
        dmgTakenMul: 1,
        enemySpdMul: 1,
        enemyDpsMul: 1,
        enemyHpMul: 1,
        regen: 0,
        coinMul: 1,
        expMul: 1,
        coffeeSpdMul: 1,
        keyboardDmgMul: 1,
        bugDmgMul: 1,
        orbitRMul: 1,
        pierce: 0,
        spawnGapMul: 1,
        killExplode: 0,
        crit: 0,          // 暴击概率（手气不错）
        chill: 0,         // 命中减速强度（冷处理）
        lifesteal: 0,     // 击杀回血（摸鱼回血）
      },
    };
    this.battle.baseHp = this.battle.baseHpMax;
    this.battle.mods.coinMul = 1 + C.UPGRADES.fish.perTier * m.upgrades.fish;

    // 初始装备：2 咖啡 + 1 键盘
    this.giveWeapon('coffee', 1, 0);
    this.giveWeapon('coffee', 1, 5);
    this.giveWeapon('keyboard', 1, 10);
    return this.battle;
  }

  giveWeapon(type, lv, cellIndex) {
    const b = this.battle;
    if (!b) return false;
    const cells = b.board.cells;
    let idx = cellIndex;
    if (idx == null) {
      idx = cells.findIndex((c) => c === null);
    }
    if (idx == null || idx < 0 || idx >= cells.length || cells[idx]) return false;
    cells[idx] = { type, lv };
    return true;
  }

  // ---------- debug 钩子（开发者工具控制台用） ----------
  makeDebug() {
    const d = this;
    return {
      giveWeapon: (type, lv) => d.giveWeapon(type, lv || 1),
      damageBase: (n) => { if (d.battle) d.battle.baseHp -= (n || 999); },
      setTimeLeft: (s) => { if (d.battle) d.battle.timeLeft = s; },
      setTime: (s) => { if (d.battle) d.battle.time = s; }, // 快进波次时间轴
      addExp: (n) => {
        if (!d.battle) return;
        const Skills = require('../systems/skills');
        d.battle.pendingLevels += Skills.gainExp(d.battle, n || 100);
      },
      addCoins: (n) => { if (d.battle) d.battle.coins += (n || 100); },
      killAll: () => {
        if (!d.battle) return;
        d.battle.enemies.forEach((e) => { e.hp = 0; e.dying = true; });
      },
      resetSave: () => {
        d.meta = defaultMeta();
        d.saveMeta();
      },
    };
  }
}

module.exports = Databus;
