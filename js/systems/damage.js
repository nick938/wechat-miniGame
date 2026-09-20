/**
 * 工位伤害结算：所有落到工位上的伤害都走这里
 * 顺序：减伤词缀（工作群静音）→ 护盾吸收（明天再说）→ 扣血条
 * 抽出统一入口是为了让「减伤/护盾」这类词缀只在一个地方生效，避免技能白拿
 */

function damageBaseHp(battle, amount) {
  if (!battle || !(amount > 0)) return 0;
  const dmg = amount * (battle.mods.dmgTakenMul || 1);
  let left = dmg;
  if (battle.baseShield > 0) {
    const absorb = Math.min(battle.baseShield, left);
    battle.baseShield -= absorb;
    left -= absorb;
  }
  if (left > 0) battle.baseHp -= left;
  return dmg;
}

module.exports = { damageBaseHp };
