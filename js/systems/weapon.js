/**
 * 武器系统：棋盘上每件装备按自身节奏攻击
 * 返回的攻击意图由战场结算（生成弹丸/炸弹/伤害）
 */
const C = require('../core/config');
const U = require('../core/utils');

// 每件装备的运行时计时器，key = 棋盘格 index
const timers = {};

// 战场每帧调用；scene 为 BattleScene 实例（提供 spawnProjectile/spawnBomb/damageEnemy/b）
function update(scene, dt, time) {
  const b = scene.b;
  const cells = b.board.cells;
  const mods = b.mods;

  for (let i = 0; i < cells.length; i++) {
    const item = cells[i];
    if (!item) continue;
    const wcfg = C.WEAPONS[item.type];
    const cx = cellCenterX(i);
    const cy = cellCenterY(i);

    if (item.type === 'headphone') {
      updateHeadphone(scene, b, item, i, cx, cy, dt, time, mods);
      continue;
    }

    const key = 't' + i;
    const sig = item.type + item.lv;
    // 换了装备（合成/交换）则计时器重置
    if (!timers[key] || timers[key].sig !== sig) {
      timers[key] = { sig, t: 0 };
    }
    timers[key].t -= dt;
    if (timers[key].t > 0) continue;

    let interval = wcfg.interval[item.lv - 1];
    if (item.type === 'coffee') interval /= mods.coffeeSpdMul;
    interval /= mods.spdMul;
    if (interval < 0.08) interval = 0.08;
    timers[key].t = interval;

    if (item.type === 'coffee') {
      const target = nearestEnemy(b);
      if (!target) { timers[key].t = 0.1; continue; } // 没怪就歇会
      const dmg = wcfg.dmg[item.lv - 1] * mods.atkMul;
      const shots = item.lv >= 5 ? 3 : (item.lv >= 4 && Math.random() < 0.5 ? 2 : 1);
      for (let s = 0; s < shots; s++) {
        scene.spawnProjectile('bean', cx + (s - 1) * 10, cy - 20, {
          speed: 420, dmg, pierce: mods.pierce, targetId: target.id, target,
        });
      }
    } else if (item.type === 'keyboard') {
      const dmg = wcfg.dmg[item.lv - 1] * mods.atkMul * mods.keyboardDmgMul;
      scene.spawnProjectile('wave', cx, cy - 24, {
        speed: 480, dmg, width: wcfg.width[item.lv - 1],
      });
    } else if (item.type === 'bug') {
      const dmg = wcfg.dmg[item.lv - 1] * mods.atkMul * mods.bugDmgMul;
      const radius = wcfg.radius[item.lv - 1];
      // 优先丢在随机敌人脚下，没怪丢战场随机点
      const target = b.enemies.find((e) => !e.dying && !e.attacking);
      const x = target ? target.x : U.rand(40, C.DESIGN_W - 40);
      const y = target ? target.y : U.rand(C.HUD_H + 30, C.BASE_Y - 40);
      scene.spawnBomb(x, y, dmg, radius, wcfg.fuse);
    }
  }
}

function updateHeadphone(scene, b, item, i, cx, cy, dt, time, mods) {
  const wcfg = C.WEAPONS.headphone;
  const n = wcfg.orbs[item.lv - 1];
  const orbitR = wcfg.orbitR[item.lv - 1] * mods.orbitRMul;
  const dmg = wcfg.dmg[item.lv - 1] * mods.atkMul;
  const spin = wcfg.spin * mods.spdMul;

  if (!b.orbs[i]) b.orbs[i] = { angle: 0 };
  const st = b.orbs[i];
  st.angle += spin * dt;

  for (let k = 0; k < n; k++) {
    const a = st.angle + (Math.PI * 2 * k) / n;
    const ox = cx + Math.cos(a) * orbitR;
    const oy = cy + Math.sin(a) * orbitR;
    st['x' + k] = ox;
    st['y' + k] = oy;

    // 接触伤害：每个敌人有独立受击冷却（持续伤害不弹伤害数字）
    for (const e of b.enemies) {
      if (e.dying) continue;
      if (time - e.lastOrbHit < wcfg.hitCd) continue;
      if (U.dist(ox, oy, e.x, e.y) < e.r + 10) {
        e.lastOrbHit = time;
        scene.damageEnemy(e, dmg, false);
      }
    }
  }
}

function nearestEnemy(battle) {
  // 最靠近工位的怪（y 最大）
  let best = null;
  for (const e of battle.enemies) {
    if (e.dying) continue;
    if (!best || e.y > best.y) best = e;
  }
  return best;
}

function cellCenterX(index) {
  const col = index % C.BOARD_COLS;
  return C.BOARD_X0 + col * (C.BOARD_CELL + C.BOARD_GAP) + C.BOARD_CELL / 2;
}

function cellCenterY(index) {
  const row = Math.floor(index / C.BOARD_COLS);
  return C.BOARD_Y0 + row * (C.BOARD_CELL + C.BOARD_GAP) + C.BOARD_CELL / 2;
}

// 换局时清计时器
function reset() {
  for (const k of Object.keys(timers)) delete timers[k];
}

module.exports = { update, reset, cellCenterX, cellCenterY, nearestEnemy };
