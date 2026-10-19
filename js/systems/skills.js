/**
 * 肉鸽技能系统：三选一抽取 + 词缀生效
 */
const C = require('../core/config');
const U = require('../core/utils');

// 全部技能都点满时用的兜底卡：三选一弹层必须永远有卡可选，
// 否则（没有关闭按钮的）弹层会把玩家永久卡住
const MASTERY_OFFER = {
  id: 'mastery', name: '样样精通', rarity: 4, desc: `技能全部满级：+${C.MASTERY_COINS} 金币`,
};

// 抽一个可用技能（考虑叠加层数与品质权重），offerCount 个互不重复
function rollOffers(battle, count = 3) {
  const available = C.SKILLS.filter((s) => {
    const owned = battle.skills.find((k) => k.id === s.id);
    return !owned || owned.stacks < s.max;
  });
  if (!available.length) return [MASTERY_OFFER];
  const offers = [];
  for (let i = 0; i < count && available.length; i++) {
    // 按品质权重抽
    let total = 0;
    for (const s of available) total += C.RARITY_WEIGHT[s.rarity];
    let r = Math.random() * total;
    let chosen = available[0];
    for (const s of available) {
      r -= C.RARITY_WEIGHT[s.rarity];
      if (r <= 0) { chosen = s; break; }
    }
    offers.push(chosen);
    available.splice(available.indexOf(chosen), 1);
  }
  return offers;
}

// 词缀部分：只改 battle.mods（以及由它派生的即时状态），**可以安全地重复应用**。
// 跨关继承 build 时就是靠按层数重放这个函数来重建词缀，所以这里绝不能放"一次性"效果。
function applyMods(battle, id) {
  const m = battle.mods;
  switch (id) {
    case 'coffeeFrenzy': m.coffeeSpdMul += 0.30; break;
    case 'keyboardSmash': m.keyboardDmgMul += 0.45; break;
    case 'bugFix': m.bugDmgMul += 0.45; break;
    case 'bassBoost': m.orbitRMul += 0.45; break;
    case 'autofish': m.spdMul += 0.12; break;
    case 'swiftHands': m.atkMul += 0.10; break;
    case 'mute': m.dmgTakenMul *= 0.85; break;
    case 'bossAway': m.enemySpdMul *= 0.80; applyEnemySpd(battle); break;
    case 'toiletBreak': m.regen += 4; break;
    case 'overtimePay': m.coinMul += 0.40; break;
    case 'fishology': m.expMul += 0.25; break;
    case 'slowNet': m.enemyDpsMul *= 0.75; break;
    case 'refill': m.pierce += 2; break;
    case 'postpone': m.spawnGapMul += 0.18; break;
    case 'efficiency': m.atkMul += 0.20; break;
    case 'leave': m.enemyHpMul *= 0.7; break;
    case 'layoff': m.killExplode = Math.min(1, m.killExplode + 0.30); break;
    case 'crit': m.crit += 0.20; break;
    case 'chill': m.chill = Math.min(0.6, m.chill + 0.30); break;
    case 'lifesteal': m.lifesteal += 0.03; break; // 按生命上限的百分比回血，才能撑住 Boss 关的持续掉血
    default: break;
  }
}

// 应用技能：改 mods 或立即效果
function apply(battle, skill) {
  if (skill.id === 'mastery') {         // 兜底卡：直接给金币，不进技能列表
    battle.coins += C.MASTERY_COINS;
    return 0;
  }
  let owned = battle.skills.find((k) => k.id === skill.id);
  if (!owned) {
    owned = { id: skill.id, stacks: 0 };
    battle.skills.push(owned);
  }
  owned.stacks++;

  // 1) 词缀（可重复应用，跨关重建时也走这一份）
  applyMods(battle, skill.id);

  // 2) 一次性效果：只在被选中的那一刻发生一次，**不参与跨关重建**
  switch (skill.id) {
    case 'shield':
      battle.baseShield += C.SHIELD_PER_STACK;
      break;
    case 'annualLeave':
      battle.baseHpMax += C.ANNUAL_LEAVE_HP;
      battle.baseHp = battle.baseHpMax;
      break;
    case 'leave':
      // 对场上已有的敌人也要立即生效
      battle.enemies.forEach((e) => {
        e.hpMax *= 0.7;
        e.hp = Math.min(e.hp, e.hpMax);
      });
      break;
    default: break;
  }
  return owned.stacks;
}

// 跨关重建 build（P14 的核心改动）。
// 背景：newBattle() 每关都会造一个全新的 battle，skills/mods 全归零 ——
// 于是"肉鸽 build"的寿命只有一个单场（210~255 秒），永远影响不到"能打多深"，
// 三选一也就退化成了每关重开的一次性 buff。
// 现在把上一关的技能带过来，并把它们的**词缀**按层数重放一遍。
// 注意只重放词缀：shield（一次性护盾）不该跨关白送，
// annualLeave 的 +80 生命上限属于持久属性，要单独补回来。
function rebuild(battle, carried) {
  battle.skills = [];
  (carried || []).forEach((s) => {
    if (!s || !skillOf(battle, s.id) || !(s.stacks > 0)) return;
    battle.skills.push({ id: s.id, stacks: s.stacks });
    for (let i = 0; i < s.stacks; i++) applyMods(battle, s.id);
    if (s.id === 'annualLeave') {
      battle.baseHpMax += C.ANNUAL_LEAVE_HP * s.stacks;
      battle.baseHp = battle.baseHpMax;
    }
  });
  return battle.skills;
}

// 老板不在：对已在线敌人也生效
function applyEnemySpd(battle) {
  battle.enemies.forEach((e) => { e.speed *= 0.85; });
}

// 升级加经验，返回升了几级（可能连升）
function gainExp(battle, amount) {
  battle.exp += Math.round(amount * battle.mods.expMul);
  let levels = 0;
  while (battle.exp >= C.expNeed(battle.charLevel)) {
    battle.exp -= C.expNeed(battle.charLevel);
    battle.charLevel++;
    levels++;
  }
  return levels;
}

function skillOf(battle, id) {
  return C.SKILLS.find((s) => s.id === id);
}

module.exports = { rollOffers, apply, applyMods, rebuild, gainExp, skillOf };
