/**
 * 数据驱动配置：武器 / 敌人 / 技能 / 关卡 / 工位升级 / 布局常量
 * 数值调优只改这个文件
 */

// ---------- 布局 ----------
const DESIGN_W = 375;
const DESIGN_H = 667;
const HUD_H = 52;            // 顶部信息栏高度
const BASE_Y = 366;          // 工位防线：敌人越过此线开始啃工位
const BOARD_CELL = 64;       // 合成棋盘格子边长
const BOARD_GAP = 6;         // 格子间距
const BOARD_COLS = 4;
const BOARD_ROWS = 4;
const BOARD_X0 = (DESIGN_W - (BOARD_COLS * BOARD_CELL + (BOARD_COLS - 1) * BOARD_GAP)) / 2;
const BOARD_Y0 = 383;        // 棋盘顶部 y

// ---------- 武器 ----------
// 等级数组下标 = 等级-1，最高 LV5
const WEAPONS = {
  coffee: {
    id: 'coffee',
    name: '咖啡',
    emoji: '☕',
    desc: '高攻速单体',
    dmg: [10, 15, 21, 29, 38],
    interval: [0.5, 0.46, 0.42, 0.38, 0.32],
    // LV4 概率双发，LV5 三连发
  },
  keyboard: {
    id: 'keyboard',
    name: '键盘',
    emoji: '⌨️',
    desc: '键帽冲击波，穿透一列',
    dmg: [18, 25, 34, 45, 58],
    interval: [1.6, 1.5, 1.4, 1.3, 1.2],
    width: [70, 78, 86, 96, 110],
  },
  bug: {
    id: 'bug',
    name: 'Bug',
    emoji: '🐞',
    desc: '投放自爆 Bug，范围爆炸',
    dmg: [28, 38, 52, 70, 92],
    interval: [3.2, 3.0, 2.8, 2.6, 2.4],
    radius: [55, 62, 70, 78, 88],
    fuse: 1.1,
  },
  headphone: {
    id: 'headphone',
    name: '耳机',
    emoji: '🎧',
    desc: '声波环绕，护体近战',
    dmg: [7, 10, 14, 18, 24],
    orbs: [1, 1, 2, 2, 3],
    orbitR: [46, 52, 58, 64, 70],
    hitCd: 0.4,
    spin: 2.4,
  },
};
const WEAPON_TYPES = ['coffee', 'keyboard', 'bug', 'headphone'];
const MAX_WEAPON_LV = 5;

// ---------- 敌人 ----------
const ENEMIES = {
  bug:      { id: 'bug',      name: 'Bug',      emoji: '🐛', hp: 12, speed: 32, dps: 4,  exp: 2, coin: 1, r: 14 },
  group:    { id: 'group',    name: '群消息',   emoji: '💬', hp: 6,  speed: 46, dps: 2,  exp: 1, coin: 1, r: 10 },
  request:  { id: 'request',  name: '紧急需求', emoji: '📋', hp: 28, speed: 26, dps: 6,  exp: 3, coin: 2, r: 16 },
  product:  { id: 'product',  name: '产品需求', emoji: '📄', hp: 36, speed: 22, dps: 5,  exp: 3, coin: 2, r: 17, split: 3 },
  mini:     { id: 'mini',     name: '小需求',   emoji: '🗒️', hp: 7,  speed: 44, dps: 2,  exp: 1, coin: 1, r: 11 },
  boss:     { id: 'boss',     name: '产品经理', emoji: '👔', hp: 850, speed: 12, dps: 15, exp: 40, coin: 60, r: 30, boss: true },
};
// 各关刷怪池（按关卡解锁种类）
const ENEMY_POOL_BY_LEVEL = [
  { from: 1, types: ['bug', 'bug', 'group'] },
  { from: 2, types: ['request'] },
  { from: 3, types: ['product'] },
];

// ---------- 关卡 ----------
const LEVEL_NAMES = ['周一早会', '临时需求', '改需求了', 'Bug大爆发', '老板巡查', '灰度发布', '年底冲KPI', '年终述职'];
const BOSS_EVERY = 4;          // 每 4 关一个 Boss（第 4、8 关…）
const BOSS_WARN_SEC = 8;       // Boss 出场前多少秒开始预警（给玩家整理棋盘的时间）
// 补给间隔（秒）：合成是这游戏的主操作，间隔太大就会"每局只合 6 次"（基线实测），
// 9 秒一投 ⇒ 每局到手约 24 件，合成次数才够（目标 15 次/场），棋盘也才会真的挤起来，
// 让"回收换金币"和"棋盘满了"的提示有存在意义
const SUPPLY_INTERVAL = 9;
const BASE_HP = 100;           // 工位基础生命

// 生成第 n 关配置（n 从 1 开始；>8 为无尽）
function buildLevel(n) {
  const duration = Math.min(255, 150 + (n - 1) * 15);
  const hpMul = (1 + (n - 1) * 0.35) * (n > 8 ? Math.pow(1.35, n - 8) : 1);
  const spMul = 1 + Math.min(0.5, (n - 1) * 0.04);
  const isBoss = n % BOSS_EVERY === 0;

  const pool = ['bug', 'bug', 'group'];
  ENEMY_POOL_BY_LEVEL.forEach((p) => {
    if (n >= p.from) pool.push(...p.types);
  });

  const events = [];
  let t = 3;
  while (t < duration - (isBoss ? 55 : 20)) {
    const type = pool[Math.floor(Math.random() * pool.length)];
    const count = 2 + Math.floor(Math.random() * 2) + Math.floor(n / 3);
    events.push({ t, type, count, interval: 0.9 });
    t += Math.max(6.5, 13 - n * 0.7) + Math.random() * 2;
  }
  // 中期精英波：一波产品需求（会分裂，喜剧效果）
  events.push({ t: duration * 0.55, type: 'product', count: 2, interval: 1.2 });
  if (isBoss) events.push({ t: duration - 50, type: 'boss', count: 1, interval: 1 });

  return {
    index: n,
    name: n <= LEVEL_NAMES.length ? LEVEL_NAMES[n - 1] : `无尽 · 第${n}周`,
    duration,
    hpMul,
    spMul,
    isBoss,
    bossAt: isBoss ? duration - 50 : 0,   // Boss 出场秒数（前预警用）
    events,
  };
}

// ---------- 失败复盘 ----------
// 输的时候给一句"下次怎么改"，别让玩家只看到"工位沦陷"
const lossTip = (b) => {
  const cells = b.board.cells.filter(Boolean);
  const maxLv = cells.reduce((m, c) => (c.lv > m ? c.lv : m), 0);
  const attacking = b.enemies.filter((e) => e.attacking).length;
  if (attacking >= 3) return '被怪贴脸是主因：合成键盘（穿透一列）清贴脸最快';
  if (cells.length >= 12) return '棋盘快满了：拖几件到 ♻️ 换金币，腾位置接空投';
  if (maxLv < 3) return '先把同类装备堆出一件 LV3，火力会有明显台阶';
  return '下一把试试把三选一留给全局加成（降本增效 / 自动摸鱼脚本）';
};

// ---------- 肉鸽技能 ----------
// rarity: 1白 2蓝 3紫 4橙；maxStack 为最大叠加层数
const SKILLS = [
  { id: 'coffeeFrenzy', name: '咖啡狂热',     rarity: 1, max: 3, desc: '咖啡攻速 +30%' },
  { id: 'keyboardSmash', name: '键盘侠',      rarity: 1, max: 3, desc: '键盘伤害 +30%' },
  { id: 'bugFix',       name: '修Bug大师',   rarity: 1, max: 3, desc: 'Bug 炸弹伤害 +30%' },
  { id: 'bassBoost',    name: '重低音',       rarity: 1, max: 3, desc: '耳机范围 +25%' },
  { id: 'autofish',     name: '自动摸鱼脚本', rarity: 1, max: 3, desc: '全体攻速 +12%' },
  { id: 'swiftHands',   name: '手速惊人',     rarity: 1, max: 3, desc: '全体伤害 +10%' },
  { id: 'mute',         name: '工作群静音',   rarity: 2, max: 2, desc: '受到的伤害 -15%' },
  { id: 'bossAway',     name: '老板不在',     rarity: 2, max: 2, desc: '敌人移速 -15%' },
  { id: 'toiletBreak',  name: '带薪如厕',     rarity: 2, max: 3, desc: '每 5 秒回复 2 点生命' },
  { id: 'overtimePay',  name: '加班费',       rarity: 2, max: 2, desc: '金币获取 +25%' },
  { id: 'fishology',    name: '摸鱼学导论',   rarity: 2, max: 2, desc: '经验获取 +25%' },
  { id: 'slowNet',      name: '办公网限速',   rarity: 2, max: 2, desc: '敌人对工位伤害 -25%' },
  { id: 'refill',       name: '咖啡续杯',     rarity: 3, max: 1, desc: '咖啡豆可穿透 1 个敌人' },
  { id: 'postpone',     name: '需求延期',     rarity: 3, max: 2, desc: '刷怪间隔 +18%' },
  { id: 'shield',       name: '明天再说',     rarity: 3, max: 3, desc: '立即获得 50 点护盾' },
  { id: 'efficiency',   name: '降本增效',     rarity: 3, max: 2, desc: '全体伤害 +20%' },
  { id: 'leave',        name: '老板今天请假', rarity: 4, max: 1, desc: '所有敌人生命 -30%' },
  { id: 'layoff',       name: '优化毕业',     rarity: 4, max: 1, desc: '击杀时 15% 概率引爆周围敌人' },
  { id: 'annualLeave',  name: '带薪年假',     rarity: 4, max: 1, desc: '生命上限 +50 并回满' },
  // 会改变打法的机制技能：让"选什么"真的影响这一局怎么玩，而不只是数值变大
  { id: 'crit',         name: '手气不错',     rarity: 3, max: 2, desc: '每次命中 20% 概率造成三倍伤害' },
  { id: 'chill',        name: '冷处理',       rarity: 2, max: 2, desc: '命中让敌人减速 25%，持续 1.5 秒' },
  { id: 'lifesteal',    name: '摸鱼回血',     rarity: 2, max: 2, desc: '每次击杀回复 1 点工位生命' },
];
const RARITY_WEIGHT = { 1: 55, 2: 30, 3: 12, 4: 3 };
const RARITY_NAME = { 1: '白', 2: '蓝', 3: '紫', 4: '橙' };
const RARITY_COLOR = { 1: '#9aa5b1', 2: '#4a90d9', 3: '#9b59d0', 4: '#e8a33d' };
// 所有技能都点满后的兜底奖励卡（否则三选一弹层会没有可选卡，把玩家永久卡在弹层里）
const MASTERY_COINS = 80;

// ---------- 装备回收 ----------
// 拖拽时出现在工位桌面上的回收条：把装备丢进去换金币（有舍才有得，也是解堵的唯一手动出路）
const RECYCLE_RECT = {
  x: BOARD_X0,
  y: BASE_Y - 16,
  w: BOARD_COLS * BOARD_CELL + (BOARD_COLS - 1) * BOARD_GAP,
  h: 30,
};
const recycleCoins = (lv) => Math.round(12 * Math.pow(2.2, lv - 1)); // LV1 12 → LV5 280
const HINT_SEC = 3.2;          // 战场提示条停留时长

// ---------- 局外成长（工位升级） ----------
const UPGRADES = {
  screen: { id: 'screen', name: '显示器', emoji: '🖥️', desc: '全体伤害', perTier: 0.06, maxTier: 5, fmt: (v) => `+${Math.round(v * 100)}%` },
  chair:  { id: 'chair',  name: '人体工学椅', emoji: '🪑', desc: '工位生命', perTier: 12, maxTier: 5, fmt: (v) => `+${v} HP` },
  fish:   { id: 'fish',   name: '摸鱼学', emoji: '🐟', desc: '金币收益', perTier: 0.06, maxTier: 5, fmt: (v) => `+${Math.round(v * 100)}%` },
};
const UPGRADE_COST = (tier) => Math.round(60 * Math.pow(1.85, tier)); // tier 从 0 计：60/111/205/379/701，三线合计 4368

// ---------- 每日任务与免费宝箱 ----------
// 隔天回来的最短回路：3 个任务覆盖"打一局 / 合成 / 击杀"，全部由玩法推进（不逼看广告）
const DAILY_TASKS = [
  { id: 'clearRun', name: '今天先摸一局（通关任意关卡）', need: 1, coins: 60 },
  { id: 'merge10',  name: '合成 10 次装备',              need: 10, coins: 80 },
  { id: 'kill60',   name: '击退 60 个需求',              need: 60, coins: 80 },
];
const FREE_CHEST_COINS = 120;  // 每日免费宝箱（每天 1 次，不看广告）

// ---------- 成就 ----------
// 长期目标感：每项都是一个明确的里程碑（不是日常重复劳动），达成后手动领取
// stat 对应 meta.dex / meta.bestLevel / meta.bestScore 里的统计量
const ACHIEVEMENTS = [
  { id: 'kills100',  name: '手速上来了',   desc: '累计击退 100 个需求',       stat: 'kills',      need: 100,  coins: 60 },
  { id: 'kills1000', name: '需求粉碎机',   desc: '累计击退 1000 个需求',      stat: 'kills',      need: 1000, coins: 200 },
  { id: 'merge200',  name: '合成工人',     desc: '累计合成 200 次装备',       stat: 'merges',     need: 200,  coins: 100 },
  { id: 'maxLv5',    name: 'LV5 达成',     desc: '合成出一件 LV5 装备',       stat: 'maxLv',      need: 5,    coins: 150 },
  { id: 'clear8',    name: '无尽开启',     desc: '通过第 8 关，进入无尽模式', stat: 'bestLevel',  need: 9,    coins: 200 },
  { id: 'level15',   name: '摸到第 15 关', desc: '最高打到第 15 关',          stat: 'bestLevel',  need: 15,   coins: 300 },
  { id: 'score5000', name: '摸鱼分 5000',  desc: '单局摸鱼分达到 5000',       stat: 'bestScore',  need: 5000, coins: 150 },
  { id: 'ad10',      name: '广告鉴赏家',   desc: '累计看完 10 次激励视频',    stat: 'adsWatched', need: 10,   coins: 150 },
];

// ---------- 广告 ----------
const AD_UNIT_ID = ''; // 上线前在微信后台创建激励视频广告位并填到这里；留空则走模拟广告
const CHEST_PER_DAY = 3;
const REROLL_PER_RUN = 2;      // 每局技能刷新次数（看广告）

// ---------- 经验曲线 ----------
// 前段刻意偏快：让玩家 30 秒内迎来第一次三选一（计划书 §38 的节奏目标）；
// 后续也别拖：目标是每场 8 次以上三选一（每 20 秒左右一次决策），否则"决策深度"只是纸面
const expNeed = (lvl) => 5 + 4 * (lvl - 1);

// ---------- 快进 ----------
const SPEED_STEPS = [1, 2, 3]; // 战斗内倍速循环档位

// ---------- 摸鱼分 ----------
// 单局综合分数：击杀×10 + 关卡×1000 + 剩余工位血量×5（复活不扣分）
// 排行榜/分享/联机共用这一套，改权重只动这里
const calcScore = (b) => Math.max(0, Math.round(
  (b.kills || 0) * 10 +
  (b.level || 1) * 1000 +
  Math.max(0, b.baseHp || 0) * 5
));

module.exports = {
  DESIGN_W, DESIGN_H, HUD_H, BASE_Y, BOARD_CELL, BOARD_GAP, BOARD_COLS, BOARD_ROWS, BOARD_X0, BOARD_Y0,
  WEAPONS, WEAPON_TYPES, MAX_WEAPON_LV,
  ENEMIES, ENEMY_POOL_BY_LEVEL, LEVEL_NAMES, BOSS_EVERY, BOSS_WARN_SEC, SUPPLY_INTERVAL, BASE_HP,
  RECYCLE_RECT, recycleCoins, HINT_SEC,
  lossTip,
  buildLevel,
  SKILLS, RARITY_WEIGHT, RARITY_NAME, RARITY_COLOR, MASTERY_COINS,
  UPGRADES, UPGRADE_COST,
  AD_UNIT_ID, CHEST_PER_DAY, REROLL_PER_RUN,
  DAILY_TASKS, FREE_CHEST_COINS, ACHIEVEMENTS,
  expNeed,
  SPEED_STEPS,
  calcScore,
};
