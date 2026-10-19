/**
 * 数据驱动配置：武器 / 敌人 / 技能 / 关卡 / 工位升级 / 布局常量
 * 数值调优只改这个文件
 */

// ---------- 剧情 ----------
// 目标很朴素：给玩家一个"想知道后面发生了什么"的理由，从而愿意再打一关。
// 所以它必须**极轻**——每关开场一张卡、三行以内（第 9 关收尾四行）、点一下就过，绝不打断节奏：
//   · 只在每个关卡**第一次**进入时出现（记在 meta.storySeen），重玩不再打扰
//   · 每次只推进一点点，跟关卡名咬合（周一早会 / 临时需求 / 改需求了 …）
//   · 第 8 关通关后给一个收尾，把"无尽模式"接上去
const STORY = {
  1: { title: '周一 09:00', lines: [
    '例会。二十七个人在讨论「如何提高会议效率」。',
    '你坐在最后一排，把手机藏在键盘后面。',
    '—— 只要工位还在，班就还能摸。'] },
  2: { title: '临时需求', lines: [
    '「这个很简单，半小时就能好。」',
    '产品经理说这句话的时候，你正在看第 100 次同样的表情。'] },
  3: { title: '改需求了', lines: [
    '「需求没变，只是调整了一下方向。」',
    '你打开文档，版本号停在 v7。'] },
  4: { title: 'Bug 大爆发', lines: [
    '上线前两小时。Bug 从屏幕上方涌下来，像周五的下班人流。',
    '而产品经理，正站在你和下班之间。'] },
  5: { title: '老板巡查', lines: [
    '主管开始绕工位了。脚步声从左到右，越来越近。',
    '—— 别慌。把键盘往他那个方向挪一挪。'] },
  6: { title: '灰度发布', lines: [
    '「只放 1% 的流量，应该不会出事吧。」',
    '这句话本身，就是事故预告。'] },
  7: { title: '年底冲 KPI', lines: [
    '十二月。所有人都在表演努力。',
    '只有你知道：真正被优化掉的，从来不是最闲的那个。'] },
  8: { title: '年终述职', lines: [
    '你站上台，背后是一整年的摸鱼记录。',
    '直属领导和大老板同时出现 —— 这是决战。'] },
  // 赢下第 8 关之后进第 9 关时放一次，顺势把无尽模式接上
  9: { title: '—— 然后呢？', lines: [
    '「你被优化了。」',
    '「但你的摸鱼分，留在了公司内网上。」',
    '于是你打开电脑，发现工位还在，需求还在，周一早会也还在。',
    '摸鱼是没有尽头的。'] },
};
// 无尽关（第 10 关及以后）不再有专属剧情，避免每关都打断
const storyFor = (level) => STORY[level] || null;

// 这一关该不该放剧情卡（纯函数，便于单独测试与反向验证）：
// 有剧情 **且** 这一关没看过。去重是必须的 —— 玩家会反复重试同一关，每次都弹就是骚扰。
const shouldShowStory = (level, seen) =>
  !!STORY[level] && !(Array.isArray(seen) && seen.indexOf(level) >= 0);

// Boss 登场台词：一句话把这三个人的性格钉住
const BOSS_LINES = {
  boss: '产品经理：「在吗？」',
  bossLead: '直属领导：「我看你最近状态不太对啊。」',
  bossBig: '大老板：「来我办公室一趟。」',
};

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
// boss:true 的都会走"Boss 血条 + 登场特效"；行为参数都从这里读（enemy.js 不写死）
//   summonCount/summonGap：周期性召唤几个紧急需求
//   rallyGap/rallyBoost/rallySec：周期性给全场敌人加速（直属领导"催进度"）
//   dmgTakenMul：受到的伤害倍率（大老板抗揍）
//   enrageAt：残血狂暴阈值
const ENEMIES = {
  bug:      { id: 'bug',      name: 'Bug',      emoji: '🐛', hp: 12,  speed: 32, dps: 4,  exp: 2, coin: 1, r: 14 },
  group:    { id: 'group',    name: '群消息',   emoji: '💬', hp: 6,   speed: 46, dps: 2,  exp: 1, coin: 1, r: 10 },
  request:  { id: 'request',  name: '紧急需求', emoji: '📋', hp: 28,  speed: 26, dps: 6,  exp: 3, coin: 2, r: 16 },
  product:  { id: 'product',  name: '产品需求', emoji: '📄', hp: 36,  speed: 22, dps: 5,  exp: 3, coin: 2, r: 17, split: 3 },
  mini:     { id: 'mini',     name: '小需求',   emoji: '🗒️', hp: 7,   speed: 44, dps: 2,  exp: 1, coin: 1, r: 11 },
  // 计划书 §9.1 的坦克怪：血厚、慢、抗打，逼玩家堆穿透/爆炸
  meeting:  { id: 'meeting',  name: '会议邀请', emoji: '📅', hp: 95,  speed: 17, dps: 10, exp: 5, coin: 4, r: 19, dmgTakenMul: 0.7 },
  boss:     { id: 'boss',     name: '产品经理', emoji: '👔', hp: 850,  speed: 12, dps: 15, exp: 40, coin: 60,  r: 30, boss: true, summonCount: 2, summonGap: 6, enrageAt: 0.4 },
  bossLead: { id: 'bossLead', name: '直属领导', emoji: '🧑‍💼', hp: 1050, speed: 15, dps: 18, exp: 55, coin: 85,  r: 29, boss: true, summonCount: 2, summonGap: 7, rallyGap: 9, rallyBoost: 1.35, rallySec: 3, enrageAt: 0.4 },
  bossBig:  { id: 'bossBig',  name: '大老板',   emoji: '🕴️', hp: 1700, speed: 9,  dps: 22, exp: 80, coin: 130, r: 34, boss: true, summonCount: 4, summonGap: 12, dmgTakenMul: 0.75, enrageAt: 0.5 },
};
// Boss 轮换：每 BOSS_EVERY 关换一种（4 关产品经理 → 8 关直属领导 → 12 关大老板 → 循环）
const BOSS_ROTATION = ['boss', 'bossLead', 'bossBig'];
// 各关刷怪池（按关卡解锁种类）
const ENEMY_POOL_BY_LEVEL = [
  { from: 1, types: ['bug', 'bug', 'group'] },
  { from: 2, types: ['request'] },
  { from: 3, types: ['product'] },
  { from: 5, types: ['meeting'] },
];
// 关卡主题加成：让关卡名与刷怪组合对得上（"Bug大爆发"就该满屏 Bug）
const LEVEL_POOL_BONUS = {
  4: ['bug', 'bug', 'bug'],
  5: ['meeting'],
  6: ['request', 'request'],
  7: ['product', 'product'],
};

// ---------- 关卡 ----------
const LEVEL_NAMES = ['周一早会', '临时需求', '改需求了', 'Bug大爆发', '老板巡查', '灰度发布', '年底冲KPI', '年终述职'];
const BOSS_EVERY = 4;          // 每 4 关一个 Boss（第 4、8、12 关…）
// Boss 关额外血量倍率，按 Boss 序号给：第 4 关当"教学 Boss"、第 8 关是真正的"墙"、
// 第 12 关不再额外加（关卡自身的成长已经够陡，再加就变成谁都打不过的死墙）
// 修订（P14）：原来是 [1.2, 3.1, 0.8] —— 第 8 关 ×3.1、第 12 关反而 ×0.8，
// 结果是"第三个 Boss 比第二个还好打"（L8 曲线 7.44 > L12 的 5.67），玩家体感很怪。
// 现在改成"教学 Boss 温和、第二关是墙、第三关持平"，三个 Boss 的强度单调递增。
const BOSS_HP_MUL_BY_INDEX = [1.2, 2.0, 1.25];
const BOSS_WARN_SEC = 8;       // Boss 出场前多少秒开始预警（给玩家整理棋盘的时间）
// 补给间隔（秒）：合成是这游戏的主操作，间隔太大就会"每局只合 6 次"（基线实测），
// 9 秒一投 ⇒ 每局到手约 24 件，合成次数才够（目标 15 次/场），棋盘也才会真的挤起来，
// 让"回收换金币"和"棋盘满了"的提示有存在意义
const SUPPLY_INTERVAL = 9;
const BASE_HP = 100;           // 工位基础生命
// 补给类型偏向棋盘上已有的装备（跟着玩家正在堆的那条线走）。
// 为什么需要：4 种装备均分时，单场约 23 次补给里每种期望只有 5.75 个，
// 而合出一件 LV5 需要 16 个同种 LV1 —— LV5 实际上**永远做不出来**
// （实测 30 玩家 × 4 套配置，最高装备等级全是 LV4，成就「LV5 达成」不可达）。
// 让补给有 62% 概率跟随玩家正在堆的线，合成链才收得住，LV5 才会真的出现。
const SUPPLY_FOCUS_CHANCE = 0.62;

// 按棋盘现状挑一个补给类型（纯函数，便于测试）
// 权重 2^(lv-1)：已经在堆的那条线权重最高，玩家"想要什么"就多给什么
function pickSupplyType(cells, rand) {
  const r = rand || Math.random;
  const list = (cells || []).filter(Boolean);
  if (list.length && r() < SUPPLY_FOCUS_CHANCE) {
    const score = {};
    list.forEach((c) => { score[c.type] = (score[c.type] || 0) + Math.pow(2, c.lv - 1); });
    let best = null;
    Object.keys(score).forEach((t) => { if (best === null || score[t] > score[best]) best = t; });
    if (best && WEAPONS[best]) return best;
  }
  return WEAPON_TYPES[Math.floor(r() * WEAPON_TYPES.length)];
}

// 某一关的刷怪池（抽出来是为了可测：关卡主题是否真的生效）
function levelPool(n) {
  const pool = ['bug', 'bug', 'group'];
  ENEMY_POOL_BY_LEVEL.forEach((p) => {
    if (n >= p.from) pool.push(...p.types);
  });
  const bonus = LEVEL_POOL_BONUS[n];
  if (bonus) pool.push(...bonus);          // 关卡主题：本关的"主角怪"多刷几个
  return pool;
}

// 关卡的"静态信息"：纯函数，不抽随机事件。
// 意义：UI（首页显示下一关名、结算面板预告）必须用这个，而不是 buildLevel——
// buildLevel 会 Math.random() 抽刷怪事件，从 render 里调用会污染游戏的随机数流（每帧抽一次）
function levelMeta(n) {
  const isBoss = n % BOSS_EVERY === 0;
  const bossIdx = isBoss ? Math.floor(n / BOSS_EVERY - 1) % BOSS_HP_MUL_BY_INDEX.length : -1;
  return {
    index: n,
    name: n <= LEVEL_NAMES.length ? LEVEL_NAMES[n - 1] : `无尽 · 第${n}周`,
    isBoss,
    bossType: isBoss ? BOSS_ROTATION[bossIdx] : null,
  };
}

// 生成第 n 关配置（n 从 1 开始；>8 为无尽）
// 曲线形状：Boss 关做"墙"（血量额外 ×1.6），非 Boss 关放缓（每关 +26%）
// —— 这样技巧/资源积累够的玩家能在 Boss 关之后继续往深走，不够的会卡在 Boss 关
function buildLevel(n) {
  const duration = Math.min(255, 150 + (n - 1) * 15);
  const isBoss = n % BOSS_EVERY === 0;
  const bossIdx = isBoss ? Math.floor(n / BOSS_EVERY - 1) % BOSS_HP_MUL_BY_INDEX.length : -1;
  const bossMul = isBoss ? BOSS_HP_MUL_BY_INDEX[bossIdx] : 1;
  // 难度成长（P14 重新配平）：技能现在跨关继承，玩家的强度是**累加**的，
  // 所以敌人的成长必须比原来更陡，否则会出现"越打越轻松、永远死不掉"——
  // 实测把成长留在接近旧值（步进 0.20 / 指数 1.13）时，第 8 关通过率就是 100%，
  // 机器人全部打满 60 虚拟分钟仍未结束（HEAD 的原始值是步进 0.20 / 指数 1.22，更陡一点，同样不够）。
  // 现在：每关基础步进 +26%，8 关之后按 1.24 指数加速（高于原来的 1.22，
  // 用来抵消 build 累加带来的强度增长）。
  const hpMul = (1 + (n - 1) * 0.26) * (n > 8 ? Math.pow(1.24, n - 8) : 1) * bossMul;
  const spMul = 1 + Math.min(0.5, (n - 1) * 0.04);
  const pool = levelPool(n);
  const bossType = isBoss ? BOSS_ROTATION[Math.floor(n / BOSS_EVERY - 1) % BOSS_ROTATION.length] : null;

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
  if (isBoss) events.push({ t: duration - 50, type: bossType, count: 1, interval: 1 });

  return Object.assign(levelMeta(n), {
    duration,
    hpMul,
    spMul,
    bossAt: isBoss ? duration - 50 : 0,   // Boss 出场秒数（前预警用）
    events,
  });
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
// 修订（P14）：同品质内被严格支配的选项要抬起来 —— 否则"三选一"里经常出现
// 一张明显更差的卡，选择就是假的。被抬的 9 张：keyboardSmash / bugFix / bassBoost
// （单武器增益被同品质的全体增益支配）、bossAway（被同品质 chill 的减速支配）、
// toiletBreak（回复量相对后期承伤可忽略）、overtimePay（金币很快溢出）、
// refill（单体场景零收益）、layoff / annualLeave（被同品质 leave 支配）。
const SKILLS = [
  { id: 'coffeeFrenzy', name: '咖啡狂热',     rarity: 1, max: 3, desc: '咖啡攻速 +30%' },
  { id: 'keyboardSmash', name: '键盘侠',      rarity: 1, max: 3, desc: '键盘伤害 +45%' },
  { id: 'bugFix',       name: '修Bug大师',   rarity: 1, max: 3, desc: 'Bug 炸弹伤害 +45%' },
  { id: 'bassBoost',    name: '重低音',       rarity: 1, max: 3, desc: '耳机范围 +45%' },
  { id: 'autofish',     name: '自动摸鱼脚本', rarity: 1, max: 3, desc: '全体攻速 +12%' },
  { id: 'swiftHands',   name: '手速惊人',     rarity: 1, max: 3, desc: '全体伤害 +10%' },
  { id: 'mute',         name: '工作群静音',   rarity: 2, max: 2, desc: '受到的伤害 -15%' },
  { id: 'bossAway',     name: '老板不在',     rarity: 2, max: 2, desc: '敌人移速 -20%' },
  { id: 'toiletBreak',  name: '带薪如厕',     rarity: 2, max: 3, desc: '每 5 秒回复 4 点生命' },
  { id: 'overtimePay',  name: '加班费',       rarity: 2, max: 2, desc: '金币获取 +40%' },
  { id: 'fishology',    name: '摸鱼学导论',   rarity: 2, max: 2, desc: '经验获取 +25%' },
  { id: 'slowNet',      name: '办公网限速',   rarity: 2, max: 2, desc: '敌人对工位伤害 -25%' },
  { id: 'refill',       name: '咖啡续杯',     rarity: 3, max: 1, desc: '咖啡豆可穿透 2 个敌人' },
  { id: 'postpone',     name: '需求延期',     rarity: 3, max: 2, desc: '刷怪间隔 +18%' },
  { id: 'shield',       name: '明天再说',     rarity: 3, max: 3, desc: '立即获得 50 点护盾' },
  { id: 'efficiency',   name: '降本增效',     rarity: 3, max: 2, desc: '全体伤害 +20%' },
  { id: 'leave',        name: '老板今天请假', rarity: 4, max: 1, desc: '所有敌人生命 -30%' },
  { id: 'layoff',       name: '优化毕业',     rarity: 4, max: 1, desc: '击杀时 30% 概率引爆周围敌人' },
  { id: 'annualLeave',  name: '带薪年假',     rarity: 4, max: 1, desc: '生命上限 +80 并回满' },
  // 会改变打法的机制技能：让"选什么"真的影响这一局怎么玩，而不只是数值变大
  { id: 'crit',         name: '手气不错',     rarity: 3, max: 3, desc: '每次命中 20% 概率造成三倍伤害（可叠 3 层）' },
  { id: 'chill',        name: '冷处理',       rarity: 2, max: 2, desc: '命中让敌人减速 30%，持续 1.5 秒' },
  { id: 'lifesteal',    name: '摸鱼回血',     rarity: 2, max: 2, desc: '每次击杀回复 3% 工位生命上限（可叠 2 层）' },
];
const RARITY_WEIGHT = { 1: 55, 2: 30, 3: 12, 4: 3 };
const RARITY_NAME = { 1: '白', 2: '蓝', 3: '紫', 4: '橙' };
const RARITY_COLOR = { 1: '#9aa5b1', 2: '#4a90d9', 3: '#9b59d0', 4: '#e8a33d' };
// 所有技能都点满后的兜底奖励卡（否则三选一弹层会没有可选卡，把玩家永久卡在弹层里）
const MASTERY_COINS = 80;
// 一次性/持久效果的数值（skills.js 里 apply 与 rebuild 共用，避免两处写死导致漂移）
const SHIELD_PER_STACK = 50;   // 明天再说：立即获得的护盾（一次性，不跨关重建）
const ANNUAL_LEAVE_HP = 80;    // 带薪年假：生命上限加成（持久属性，跨关要补回来）

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
const FX_MAX = 80;             // 单帧特效上限（超过就丢弃新特效，保帧率）
const PROJ_MAX = 60;           // 单帧弹丸上限（叠加了攻速后仍要有硬上限兜底）

// ---------- 定向升星 ----------
// 打死 Boss 得一张「升星券」：点 ⬆️ 进入选择状态，再点棋盘上任意一件装备直接升一级。
// 与"拖动合成"互补——合成要有同类同级的一对，升星券想升谁升谁，是给玩家的定向决策
const STAR_TICKET_PER_BOSS = 1;
const STAR_TICKET_MAX = 3;     // 一局最多攒这么多，防囤积
const STAR_BTN = { x: DESIGN_W - 134, y: 8, w: 38, h: 38 }; // 战斗 HUD 上的升星按钮（在倍速左边）

// ---------- 摸鱼值：全游戏唯一一个"可以主动按"的键 ----------
// 设计动机：原先"摸鱼"只是皮肤 —— 操作只有拖拽合成，中后期玩家没别的事可干。
// 现在击杀与合成会积累**摸鱼值**，攒满后玩家可以主动按一下进入「深度摸鱼」：
// 限时全体攻速翻倍 + 金币翻倍。它同时解决三件事：
//   1) 操作感：玩家有了一个"什么时候放"的决策，而不只是被动拖拽；
//   2) 高光时刻：爆发窗口是天然的爽点，也给了"再攒一点就满了"的短期目标；
//   3) 主题：摸鱼终于是一个机制，而不是一层皮。
const SLACK_MAX = 100;          // 摸鱼值上限
const SLACK_PER_KILL = 1.1;     // 每击杀 +1.1
const SLACK_PER_MERGE = 4;      // 每次合成 +4（鼓励继续做核心动作）
const SLACK_DURATION = 8;       // 深度摸鱼持续秒数
const SLACK_FIRE_MUL = 2.0;     // 期间全体攻速倍率
const SLACK_COIN_MUL = 2.0;     // 期间金币倍率
const SLACK_BTN = { x: DESIGN_W - 178, y: 8, w: 38, h: 38 }; // HUD 按钮（在升星券左边）

// ---------- 敌人主攻列（站位取舍） ----------
// 七成的波次会集中在某一列压进来，并在战场上打出红色预警带：
// 玩家据此决定"要不要把键盘挪到那一列"——这就是站位这件事的意义
const HOT_COL_CHANCE = 0.7;
const HOT_COL_BAND = 42;       // 主攻列两侧各多少像素算"这一列"
const HOT_COL_SHOW_SEC = 2.5;  // 预警带残留时间

// ---------- 局外成长（工位升级） ----------
const UPGRADES = {
  screen: { id: 'screen', name: '显示器', emoji: '🖥️', desc: '全体伤害', perTier: 0.06, maxTier: 5, fmt: (v) => `+${Math.round(v * 100)}%` },
  chair:  { id: 'chair',  name: '人体工学椅', emoji: '🪑', desc: '工位生命', perTier: 12, maxTier: 5, fmt: (v) => `+${v} HP` },
  fish:   { id: 'fish',   name: '摸鱼学', emoji: '🐟', desc: '金币收益', perTier: 0.06, maxTier: 5, fmt: (v) => `+${Math.round(v * 100)}%` },
  // 第四条是给老玩家的长期金币出口：前三条 12-17 局就满级，之后金币将无处可花。
  // 它只放大摸鱼分（排行榜/分享用），不动关卡内的战斗平衡，所以不会破坏难度曲线
  score:  { id: 'score',  name: '摸鱼达人', emoji: '🏅', desc: '摸鱼分加成', perTier: 0.03, maxTier: 10, fmt: (v) => `+${Math.round(v * 100)}%` },
};
// 修订（P14）：三线总价从 4377 提到约 13000。
// 原因：每日奖励（免费宝箱 + 3 次宝箱广告 + 任务 + 连续登录）大约 861 金币/天，
// 原价 4377 意味着**只登录不打架，5 天就能把三条战斗线全部买满**，
// 难度曲线被自己的留存奖励抹平了。正确做法是把 sink 做大，而不是砍每日奖励
// （砍奖励会伤次日留存）。现在约 50 个单场 / 10 局 / 3 小时以上的成长空间。
const UPGRADE_COST = (tier) => Math.round(180 * Math.pow(1.85, tier)); // tier 从 0 计：180/333/616/1140/2108，单线 4377，三线合计 13131

// ---------- 广告总开关 ----------
// 现实约束：个人主体要**先开通流量主**才能创建广告位，而开通流量主需要游戏圈有效活跃 /
// 累计 UV > 500 —— 也就是说首发版本在相当长一段时间里**一分钱广告收入都没有**。
// 既然如此，就不该给玩家看四个点了没用的按钮：点了只会走 3 秒"模拟广告"然后白送奖励，
// 既污染经济（金币通胀、成就与任务被假观看刷），又会让玩家形成"这游戏的广告是假的"的印象。
//
// false = 广告**代码与埋点全部保留**（服务层、失败重试、看门狗、4 个 placement 都在），
//         只是界面上不出现入口，玩家走各自的"不看广告"出路：
//           复活  → 仍然有「认命，下班」
//           双倍  → 直接点「下一关」，只是少了翻倍
//           刷新  → 三张卡照常选
//           宝箱  → 首页的「每日免费宝箱」照领（本来就不看广告）
//         同时，与广告绑定的任务/成就一起下线 —— 否则会留下"永远做不完的任务"，
//         那正是 LV5 那条死内容的同类问题。
// true  = 开通流量主、填好 AD_UNIT_ID 之后改这一行 + 重新提审即可，不需要动其它代码。
const ADS_ENABLED = false;

// ---------- 每日任务与免费宝箱 ----------
// 每日任务池：每天从中抽 3 个（按日期确定，同一天进游戏看到的任务固定）。
// 池子大一点才不至于"第 3 天就腻"；全部由玩法推进，只有一个可选任务需要自愿看广告
const DAILY_POOL = [
  { id: 'clearRun', name: '今天先摸一局（通关任意关卡）', need: 1,   coins: 60 },
  { id: 'merge10',  name: '合成 10 次装备',              need: 10,  coins: 80 },
  { id: 'kill60',   name: '击退 60 个需求',              need: 60,  coins: 80 },
  { id: 'clear2',   name: '通关 2 局',                   need: 2,   coins: 100 },
  { id: 'merge25',  name: '合成 25 次装备',              need: 25,  coins: 110 },
  { id: 'kill150',  name: '击退 150 个需求',             need: 150, coins: 120 },
  { id: 'recycle5', name: '回收 5 件用不上的装备',        need: 5,   coins: 90 },
  { id: 'bossOne',  name: '打死 1 个 Boss',              need: 1,   coins: 130 },
  { id: 'adOne',    name: '看完 1 次激励视频（自愿）',     need: 1,   coins: 90 },
];
// 实际可抽取的任务池：广告关闭时摘掉与广告绑定的任务，否则会留下一条永远做不完的任务
// （同 LV5 那条死内容的问题）。
// 注意读的是 module.exports 上的**实时值**而不是模块内的 const —— UI 各处读的是
// `C.ADS_ENABLED`（导出对象属性），两边必须同一个来源，否则运行期改开关会出现
// "界面没了但任务池还留着"这种半开半关的状态。
const adsOn = () => !!module.exports.ADS_ENABLED;
const dailyPool = () => (adsOn() ? DAILY_POOL : DAILY_POOL.filter((t) => t.id !== 'adOne'));
const DAILY_TASKS_PER_DAY = 3;
// 连续登录奖励：跨天登录会自动结算（第 3 天 / 第 7 天各一次）
const STREAK_REWARDS = { 3: 150, 7: 400 };
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
// 实际展示的成就表：广告关闭时摘掉"广告鉴赏家"（不可能达成）。同样读导出的实时值。
const achievements = () => (adsOn() ? ACHIEVEMENTS : ACHIEVEMENTS.filter((a) => a.id !== 'ad10'));

// ---------- 广告 ----------
const AD_UNIT_ID = ''; // 上线前在微信后台创建激励视频广告位并填到这里；留空则走模拟广告
const CHEST_PER_DAY = 3;
const REROLL_PER_RUN = 2;      // 每局技能刷新次数（看广告）
// 广告总开关见上方 ADS_ENABLED（任务池与成就表要按它过滤，所以必须定义在它们前面）

// ---------- 经验曲线 ----------
// 前段刻意偏快：让玩家 30 秒内迎来第一次三选一（计划书 §38 的节奏目标）。
//
// 修订（P14）——这条曲线现在是"build 成熟速度"的总闸门，两次调整都是被模拟数据逼出来的：
// 1) 技能改成**跨关继承**后，如果还按每关 9 次三选一发，22 个技能（合计 49 层）
//    在第 5 关左右就被点满，之后每次选择只能拿"样样精通"兜底金币，决策深度归零。
// 2) 更严重的是强度：一个点满的 build ≈ 13 倍输出（暴击 60%×3 倍 × 攻速 +126% × 伤害 +70%），
//    而关卡血量倍率到第 8 关才 5.6 倍 —— 实测 8 个机器人第 1~19 关通过率全是 100%，
//    全部打满 60 虚拟分钟都死不掉。把前期步进从 0.26 一路加到 0.70 仍然是 100%，
//    证明问题不在血量曲线，而在**build 成熟得太快**。
// 现在的经验曲线只管"这一关的三选一什么时候来"，不管"一关能拿几次"——
// 后者由 MAX_PICKS_PER_BATTLE 硬性封顶（原因见那里的说明）。
const expNeed = (lvl) => 9 + 9 * (lvl - 1);

// 单个战场（一关）最多拿几次三选一。
// 这是本轮配平里最关键的一个数字，因为它切断了一个**正反馈回路**：
//   技能跨关继承 → build 越强 → 打得越深 → 单关经验收入越高（第 16 关约 765）→ 拿到更多三选一 → build 更强
// 实测这条回路会让 8 个机器人一路 100% 通过到第 23 关、打满 60 虚拟分钟都死不掉。
// 封顶 3 次/关后，单关三选一从 16 次降到 3 次，一局十几关合计约 45 次，
// 正好把 49 层的 build 摊到整局成型。
const MAX_PICKS_PER_BATTLE = 3;

// 技能是否跨关继承（P14 的核心玩法改动，可在这一行关掉退回旧手感）。
//
// ⚠️ 尚未配平完成，请知悉后再决定是否上线：
// 开关打开后，肉鸽 build 才真正成立（"选什么"会影响"能打多深"），但它同时
// 把玩家的强度变成**累加**的，实测会把第 8 关通过率从 61.5% 抬到 100%、
// 把一局打到第 26 关且不死。已经试过并且**证明无效**的手段：
//   · 难度曲线：同时加大基础步进与 Boss 倍率，把第 8 关血量倍率从 5.6 一路试到 19.2，L8 仍 100%
//   · 经验曲线：线性 / 几何 1.32 / 按实测收入反推的 5.4k，越调越糟（降 expNeed 反而加速回路）
//   · 补给聚焦：关掉 SUPPLY_FOCUS_CHANCE 后 L8 仍 100%，不是主因
// 结论（本轮最有价值的发现）：**瓶颈不在敌人血量，而在"到达工位的压力"**——
// 每关刷怪排程是固定的，且 spawnEnemy 在场上超过 80 只时会**静默丢弃**新的怪，
// 所以单纯堆血量只会让每只更肉、并不会让更多怪压到工位。
// 下一轮应该动的是「每波数量 / 刷怪间隔 / 敌人上限」，而不是 hpMul。
const CARRY_SKILLS = true;

// ---------- 快进 ----------
const SPEED_STEPS = [1, 2, 3]; // 战斗内倍速循环档位

// ---------- 摸鱼分 ----------
// 单局综合分数：击杀×8 + 关卡×800 + 剩余工位血量×25（复活不扣分）
// 权重调过一轮：此前血量只值 5 分/点，100 血才 500 分 < 一关的 1000 分，
// "守得好"几乎不值钱；现在满血守住 ≈ 多推一关的量级，两种打法都能拿分
// scoreMul 来自局外「摸鱼达人」加成（只放大分数，不影响战斗平衡）
const calcScore = (b) => Math.max(0, Math.round((
  (b.kills || 0) * 8 +
  (b.level || 1) * 800 +
  Math.max(0, b.baseHp || 0) * 25
) * (b.scoreMul || 1)));

module.exports = {
  DESIGN_W, DESIGN_H, HUD_H, BASE_Y, BOARD_CELL, BOARD_GAP, BOARD_COLS, BOARD_ROWS, BOARD_X0, BOARD_Y0,
  WEAPONS, WEAPON_TYPES, MAX_WEAPON_LV,
  ENEMIES, ENEMY_POOL_BY_LEVEL, LEVEL_POOL_BONUS, BOSS_ROTATION, LEVEL_NAMES, BOSS_EVERY, BOSS_HP_MUL_BY_INDEX, BOSS_WARN_SEC, SUPPLY_INTERVAL, BASE_HP,
  RECYCLE_RECT, recycleCoins, HINT_SEC, FX_MAX, PROJ_MAX,
  SUPPLY_FOCUS_CHANCE, pickSupplyType,
  STAR_TICKET_PER_BOSS, STAR_TICKET_MAX, STAR_BTN,
  SLACK_MAX, SLACK_PER_KILL, SLACK_PER_MERGE, SLACK_DURATION, SLACK_FIRE_MUL, SLACK_COIN_MUL, SLACK_BTN,
  HOT_COL_CHANCE, HOT_COL_BAND, HOT_COL_SHOW_SEC,
  lossTip,
  buildLevel,
  levelMeta,
  levelPool,
  SKILLS, RARITY_WEIGHT, RARITY_NAME, RARITY_COLOR, MASTERY_COINS, SHIELD_PER_STACK, ANNUAL_LEAVE_HP,
  UPGRADES, UPGRADE_COST,
  AD_UNIT_ID, ADS_ENABLED, CHEST_PER_DAY, REROLL_PER_RUN,
  DAILY_POOL, dailyPool, DAILY_TASKS_PER_DAY, STREAK_REWARDS, FREE_CHEST_COINS, ACHIEVEMENTS, achievements,
  STORY, storyFor, shouldShowStory, BOSS_LINES,
  expNeed, MAX_PICKS_PER_BATTLE, CARRY_SKILLS,
  SPEED_STEPS,
  calcScore,
};
