/**
 * 每日任务与每日免费宝箱：给玩家一个"明天再来"的理由
 * - 进度由局内结果驱动（一局结束时一次性结算写入，避免每次击杀都写存储）
 * - 跨天自动重置；领取状态与宝箱状态都存 meta.daily
 * - 纯本地、不联网、不涉及任何付费；免费宝箱不看广告
 */
const C = require('../core/config');

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// 取当天的每日数据，跨天则重置
function ensure(databus) {
  const m = databus.meta;
  if (!m.daily || m.daily.date !== today()) {
    m.daily = { date: today(), progress: {}, claimed: [], freeChest: false };
    databus.saveMeta();
  }
  return m.daily;
}

function addProgress(dl, id, n) {
  const t = C.DAILY_TASKS.find((x) => x.id === id);
  if (!t || n <= 0) return;
  const cur = dl.progress[id] || 0;
  if (cur >= t.need) return;
  dl.progress[id] = Math.min(t.need, cur + n);
}

// 一局打完（或中途退出）时结算进度：只写一次存储
function flush(databus, run) {
  const dl = ensure(databus);
  addProgress(dl, 'clearRun', run && run.win ? 1 : 0);
  addProgress(dl, 'merge10', (run && run.merges) || 0);
  addProgress(dl, 'kill60', (run && run.kills) || 0);
  databus.saveMeta();
}

function state(databus) {
  const dl = ensure(databus);
  return C.DAILY_TASKS.map((t) => ({
    id: t.id,
    name: t.name,
    need: t.need,
    coins: t.coins,
    progress: Math.min(t.need, dl.progress[t.id] || 0),
    done: (dl.progress[t.id] || 0) >= t.need,
    claimed: dl.claimed.indexOf(t.id) >= 0,
  }));
}

// 可领取的任务 id 列表（供首页红点提示）
function claimableCount(databus) {
  return state(databus).filter((t) => t.done && !t.claimed).length;
}

function claim(databus, id) {
  const dl = ensure(databus);
  const t = C.DAILY_TASKS.find((x) => x.id === id);
  if (!t || dl.claimed.indexOf(id) >= 0) return 0;
  if ((dl.progress[id] || 0) < t.need) return 0;
  dl.claimed.push(id);
  databus.meta.coins += t.coins;
  databus.saveMeta();
  return t.coins;
}

// 每日免费宝箱（每天 1 次，无需看广告）
function freeChestLeft(databus) {
  return ensure(databus).freeChest ? 0 : 1;
}

function takeFreeChest(databus) {
  const dl = ensure(databus);
  if (dl.freeChest) return 0;
  dl.freeChest = true;
  databus.meta.coins += C.FREE_CHEST_COINS;
  databus.saveMeta();
  return C.FREE_CHEST_COINS;
}

module.exports = { today, ensure, flush, state, claimableCount, claim, freeChestLeft, takeFreeChest };
