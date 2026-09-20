/**
 * 长期成长：成就 + 图鉴/击杀统计
 * - 统计量（累计击杀/合成/回收/最远关卡/最高装备等级/各敌人击杀数/看广告次数）存 meta.dex
 * - 成就条件全部来自 config.ACHIEVEMENTS 的 stat 字段，达成后手动领取（"差一点就成"的进度条）
 * - 与每日任务一样按局结算，避免战斗里高频写存储
 */
const C = require('../core/config');

function blankDex() {
  return {
    kills: 0, merges: 0, recycled: 0, runs: 0, wins: 0,
    adsWatched: 0, maxLv: 0, byType: {},
  };
}

function ensure(databus) {
  const m = databus.meta;
  if (!m.dex) m.dex = blankDex();
  if (!m.dex.byType) m.dex.byType = {};
  if (!m.achClaimed) m.achClaimed = [];
  return m.dex;
}

// 一局结算（通关/失败/中途退出）时并入长期统计，只写一次存储
function flush(databus, run) {
  const dex = ensure(databus);
  dex.runs++;
  if (run && run.win) dex.wins++;
  dex.kills += (run && run.kills) || 0;
  dex.merges += (run && run.merges) || 0;
  dex.recycled += (run && run.recycled) || 0;
  dex.maxLv = Math.max(dex.maxLv, (run && run.maxLv) || 0);
  const by = (run && run.killsByType) || null;
  if (by) Object.keys(by).forEach((k) => { dex.byType[k] = (dex.byType[k] || 0) + by[k]; });
  databus.saveMeta();
  return dex;
}

// 看完一次激励视频（成就有"广告鉴赏家"，自愿行为，不做强制）
function countAd(databus) {
  const dex = ensure(databus);
  dex.adsWatched++;
  databus.saveMeta();
}

function statValue(databus, key) {
  const m = databus.meta;
  if (key === 'bestLevel') return m.bestLevel || 1;
  if (key === 'bestScore') return m.bestScore || 0;
  return ensure(databus)[key] || 0;
}

function state(databus) {
  return C.ACHIEVEMENTS.map((a) => {
    const v = statValue(databus, a.stat);
    return {
      id: a.id,
      name: a.name,
      desc: a.desc,
      need: a.need,
      coins: a.coins,
      value: Math.min(a.need, v),
      done: v >= a.need,
      claimed: databus.meta.achClaimed.indexOf(a.id) >= 0,
    };
  });
}

function claimableCount(databus) {
  return state(databus).filter((a) => a.done && !a.claimed).length;
}

function claim(databus, id) {
  const a = C.ACHIEVEMENTS.find((x) => x.id === id);
  if (!a) return 0;
  ensure(databus);
  if (databus.meta.achClaimed.indexOf(id) >= 0) return 0;
  if (statValue(databus, a.stat) < a.need) return 0;
  databus.meta.achClaimed.push(id);
  databus.meta.coins += a.coins;
  databus.saveMeta();
  return a.coins;
}

// 图鉴：每种敌人被击退了多少只（含 Boss）
function dexList(databus) {
  const dex = ensure(databus);
  return Object.keys(C.ENEMIES).map((type) => ({
    type,
    name: C.ENEMIES[type].name,
    emoji: C.ENEMIES[type].emoji,
    boss: !!C.ENEMIES[type].boss,
    kills: dex.byType[type] || 0,
  }));
}

// 离完成最近的一项成就（首页"差一点就成"用）：未领取里进度比例最高的那个
function nearest(databus) {
  let best = null;
  state(databus).forEach((a) => {
    if (a.claimed || a.done) return;
    const ratio = a.value / a.need;
    if (!best || ratio > best.ratio) best = Object.assign({ ratio }, a);
  });
  return best;
}

module.exports = { ensure, flush, countAd, state, claimableCount, claim, dexList, statValue, nearest };
