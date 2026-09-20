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

// 应用技能：改 mods 或立即效果
function apply(battle, skill) {
  if (skill.id === 'mastery') {         // 兜底卡：直接给金币，不进技能列表
    battle.coins += C.MASTERY_COINS;
    return 0;
  }
  const m = battle.mods;
  let owned = battle.skills.find((k) => k.id === skill.id);
  if (!owned) {
    owned = { id: skill.id, stacks: 0 };
    battle.skills.push(owned);
  }
  owned.stacks++;

  switch (skill.id) {
    case 'coffeeFrenzy': m.coffeeSpdMul += 0.30; break;
    case 'keyboardSmash': m.keyboardDmgMul += 0.30; break;
    case 'bugFix': m.bugDmgMul += 0.30; break;
    case 'bassBoost': m.orbitRMul += 0.25; break;
    case 'autofish': m.spdMul += 0.12; break;
    case 'swiftHands': m.atkMul += 0.10; break;
    case 'mute': m.dmgTakenMul *= 0.85; break;
    case 'bossAway': m.enemySpdMul *= 0.85; applyEnemySpd(battle); break;
    case 'toiletBreak': m.regen += 2; break;
    case 'overtimePay': m.coinMul += 0.25; break;
    case 'fishology': m.expMul += 0.25; break;
    case 'slowNet': m.enemyDpsMul *= 0.75; break;
    case 'refill': m.pierce += 1; break;
    case 'postpone': m.spawnGapMul += 0.18; break;
    case 'shield': battle.baseShield += 50; break;
    case 'efficiency': m.atkMul += 0.20; break;
    case 'leave':
      m.enemyHpMul *= 0.7;
      battle.enemies.forEach((e) => {
        e.hpMax *= 0.7;
        e.hp = Math.min(e.hp, e.hpMax);
      });
      break;
    case 'layoff': m.killExplode = 0.15; break;
    case 'annualLeave':
      battle.baseHpMax += 50;
      battle.baseHp = battle.baseHpMax;
      break;
    default: break;
  }
  return owned.stacks;
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

module.exports = { rollOffers, apply, gainExp, skillOf };
