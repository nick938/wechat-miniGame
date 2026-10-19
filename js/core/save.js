/**
 * 存档结构：默认值 / 版本迁移 / 字段兜底
 *
 * 为什么要单独抽一个文件：存档结构在 P3→P12 之间改了七八次，但一直**没有版本号**
 * 也没有迁移函数，全靠"默认值 + Object.assign"糊过去。结果是 ——
 * P3 写出的 daily 没有 taskIds，P11 才加上，而 daily.ensure() 只在"跨天"时重建，
 * 于是"当天玩过 + 当天收到热更新"的玩家，存档里的 daily 被原样返回，
 * 首页第一帧就 `dl.taskIds.map` 抛 TypeError；又因为 main.js 的帧循环把
 * requestAnimationFrame 的重注册写在异常点之后，**这一帧之后再也不出帧**，
 * 玩家永远停在半张画面上，只能删掉小游戏才能恢复。
 *
 * 本模块是纯函数（不碰 wx），所以迁移与兜底逻辑可以被真实测试覆盖，
 * 也能做"把实现退回 → 用例必须失败"的反向验证。
 */

// 存档 key 保持 v1 不变：key 里带版本号会让老存档直接读不到（等于清档），
// 版本号必须存在**数据里**（saveVer）而不是 key 里。
const SAVE_KEY = 'moyu_defense_save_v1';

// 当前存档结构版本。**每次改动 meta 的结构就 +1，并在 migrate() 里补一段 v(n)→v(n+1)。**
const SAVE_VER = 2;

function defaultMeta() {
  return {
    saveVer: SAVE_VER,
    coins: 0,
    upgrades: { screen: 0, chair: 0, fish: 0, score: 0 }, // 工位升级等级（第四条是摸鱼分加成）
    bestLevel: 1,          // 解锁到的最高关卡
    bestScore: 0,          // 历史最高摸鱼分
    totalKills: 0,
    chest: { date: '', used: 0 }, // 每日广告宝箱
    daily: null,           // 每日任务/免费宝箱（跨天由 systems/daily.js 重置）
    streak: { last: '', days: 0, claimed: [] }, // 连续登录
    dex: blankDex(),       // 长期统计（成就与图鉴的数据来源）
    achClaimed: [],        // 已领取的成就 id
    weekBest: { week: '', score: 0 }, // 本周最高摸鱼分（周榜）
    storySeen: [],         // 已看过的剧情关卡号（每关只在第一次进入时放一次）
    soundOn: true,
    helpSeen: false,       // 首页玩法说明弹窗已看过
    speed: 1,              // 战斗倍速偏好（×1/×2/×3）
    tutorialDone: false,   // 合成教学（手把手）完成
    skillTipDone: false,   // 首次三选一提示已展示过
  };
}

// 长期统计的空白结构（与 systems/achievements.js 的 blankDex 同形）
function blankDex() {
  return {
    kills: 0, merges: 0, recycled: 0, runs: 0, wins: 0,
    adsWatched: 0, maxLv: 0, byType: {},
  };
}

/**
 * 版本迁移：把老结构显式抬到当前版本。
 * 只处理"结构语义变了"的部分；字段级的类型/缺失兜底统一交给 normalizeMeta()。
 */
function migrate(m, fromVer) {
  let v = Math.max(1, fromVer || 1);
  if (v < 2) {
    // v1 → v2：daily 从"可选字段"变成"必须有 taskIds 才能用"。
    // v1 存档的 daily 没有 taskIds，且 ensure() 在同一天会原样返回它 —— 必须在这里作废，
    // 让 ensure() 按今天重建。代价只是丢掉当天那条任务的进度，不碰金币与其它统计。
    if (m.daily && (!Array.isArray(m.daily.taskIds) || !m.daily.taskIds.length)) m.daily = null;
    v = 2;
  }
  m.saveVer = v;
  return m;
}

function num(v, d) {
  return (typeof v === 'number' && isFinite(v)) ? v : d;
}
function intGE(v, d) {
  return Math.max(d, Math.round(num(v, d)));
}

/**
 * 字段级兜底：不管存档来自哪个版本、被改坏成什么样，跑完这个函数之后
 * meta 一定是"结构完整"的。这是**通用防御**，让未来任何一次结构变更
 * 都不会再复现 P3→P11 那种"老存档把游戏打崩"的事故。
 * 就地修改并返回 m。
 */
function normalizeMeta(m) {
  const def = defaultMeta();
  if (!m || typeof m !== 'object') return def;

  m.coins = intGE(m.coins, 0);
  m.bestLevel = intGE(m.bestLevel, 1);
  m.bestScore = intGE(m.bestScore, 0);
  m.totalKills = intGE(m.totalKills, 0);
  m.soundOn = m.soundOn !== false;
  m.helpSeen = !!m.helpSeen;
  m.tutorialDone = !!m.tutorialDone;
  m.skillTipDone = !!m.skillTipDone;
  if ([1, 2, 3].indexOf(m.speed) < 0) m.speed = 1;

  // 嵌套对象：Object.assign 是整对象替换，所以每个嵌套结构都必须自己兜底
  m.upgrades = Object.assign({ screen: 0, chair: 0, fish: 0, score: 0 }, m.upgrades || {});
  ['screen', 'chair', 'fish', 'score'].forEach((k) => { m.upgrades[k] = intGE(m.upgrades[k], 0); });

  m.chest = Object.assign({ date: '', used: 0 }, m.chest || {});
  m.chest.used = intGE(m.chest.used, 0);
  if (typeof m.chest.date !== 'string') m.chest.date = '';

  // daily：结构不完整就作废重建（详见 migrate 里的说明）
  if (m.daily !== null && (typeof m.daily !== 'object' || Array.isArray(m.daily))) m.daily = null;
  if (m.daily) {
    if (typeof m.daily.date !== 'string' || !Array.isArray(m.daily.taskIds) || !m.daily.taskIds.length) {
      m.daily = null;
    } else {
      if (!m.daily.progress || typeof m.daily.progress !== 'object') m.daily.progress = {};
      if (!Array.isArray(m.daily.claimed)) m.daily.claimed = [];
      if (typeof m.daily.freeChest !== 'boolean') m.daily.freeChest = false;
      m.daily.taskIds = m.daily.taskIds.filter((x) => typeof x === 'string');
      if (!m.daily.taskIds.length) m.daily = null;
    }
  }

  if (!m.streak || typeof m.streak !== 'object') m.streak = { last: '', days: 0, claimed: [] };
  if (!Array.isArray(m.streak.claimed)) m.streak.claimed = [];
  m.streak.days = intGE(m.streak.days, 0);
  if (typeof m.streak.last !== 'string') m.streak.last = '';

  if (!m.dex || typeof m.dex !== 'object') m.dex = blankDex();
  ['kills', 'merges', 'recycled', 'runs', 'wins', 'adsWatched', 'maxLv'].forEach((k) => {
    m.dex[k] = intGE(m.dex[k], 0);
  });
  if (!m.dex.byType || typeof m.dex.byType !== 'object') m.dex.byType = {};

  if (!Array.isArray(m.achClaimed)) m.achClaimed = [];

  if (!Array.isArray(m.storySeen)) m.storySeen = [];
  m.storySeen = m.storySeen.filter((n) => typeof n === 'number' && n > 0);

  if (!m.weekBest || typeof m.weekBest !== 'object') m.weekBest = { week: '', score: 0 };
  m.weekBest.score = intGE(m.weekBest.score, 0);
  if (typeof m.weekBest.week !== 'string') m.weekBest.week = '';

  m.saveVer = SAVE_VER;
  return m;
}

/** 读档 → 迁移 → 兜底。saved 为 null/非对象时给默认存档。 */
function buildMeta(saved) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return defaultMeta();
  const m = Object.assign(defaultMeta(), saved);
  const from = intGE(saved.saveVer, 1);
  if (from < SAVE_VER) migrate(m, from);
  return normalizeMeta(m);
}

module.exports = { SAVE_KEY, SAVE_VER, defaultMeta, blankDex, migrate, normalizeMeta, buildMeta };
