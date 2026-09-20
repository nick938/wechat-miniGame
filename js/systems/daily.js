/**
 * 每日任务与每日免费宝箱：给玩家一个"明天再来"的理由
 * - 进度由局内结果驱动（一局结束时一次性结算写入，避免每次击杀都写存储）
 * - 跨天自动重置；领取状态与宝箱状态都存 meta.daily
 * - 纯本地、不联网、不涉及任何付费；免费宝箱不看广告
 */
const C = require('../core/config');

function dayKey(d) {
  const x = d || new Date();
  return `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`;
}

function today() {
  return dayKey(new Date());
}

// 按日期从任务池里抽 N 个（纯函数：同一天永远同一组，跨天才会变）
function pickDailyTasks(dateKey, count) {
  const n = count || C.DAILY_TASKS_PER_DAY;
  let h = 0;
  const s = String(dateKey);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000003;
  const pool = C.DAILY_POOL.slice();
  const out = [];
  for (let i = 0; i < n && pool.length; i++) {
    h = (h * 1103515245 + 12345) % 2147483648;
    out.push(pool.splice(h % pool.length, 1)[0]);
  }
  return out;
}

// 连续登录推进（纯函数：传进来的 streak 形如 {last, days, claimed:[]}）
// 返回 { streak, reward, milestone }；跨天且是连续第二天才累加，断档则从 1 重新算
function advanceStreak(streak, dateKey, rewards) {
  const st = Object.assign({ last: '', days: 0, claimed: [] }, streak || {});
  const rw = rewards || C.STREAK_REWARDS;
  if (st.last === dateKey) return { streak: st, reward: 0, milestone: 0 };
  const prev = st.last ? new Date(st.last.replace(/-/g, '/')) : null;
  const cur = new Date(String(dateKey).replace(/-/g, '/'));
  const isNextDay = prev && !isNaN(prev.getTime()) &&
    Math.round((cur - prev) / 86400000) === 1;
  st.days = isNextDay ? st.days + 1 : 1;
  st.last = dateKey;
  const reward = rw[st.days] || 0;
  if (reward > 0 && st.claimed.indexOf(st.days) < 0) {
    st.claimed.push(st.days);
    return { streak: st, reward, milestone: st.days };
  }
  return { streak: st, reward: 0, milestone: 0 };
}

// 取当天的每日数据，跨天则重置（同时推进连续登录并自动发放里程碑奖励）
function ensure(databus) {
  const m = databus.meta;
  const todayKey = today();
  if (!m.daily || m.daily.date !== todayKey) {
    const picked = pickDailyTasks(todayKey);
    m.daily = {
      date: todayKey,
      taskIds: picked.map((t) => t.id),
      progress: {},
      claimed: [],
      freeChest: false,
    };
    const adv = advanceStreak(m.streak, todayKey);
    m.streak = adv.streak;
    if (adv.reward > 0) {
      m.coins += adv.reward;
      m.daily.streakReward = { day: adv.milestone, coins: adv.reward };
    }
    databus.saveMeta();
  }
  return m.daily;
}

// 今天这 3 个任务的完整定义（面板按这个顺序渲染）
function todaysTasks(databus) {
  const dl = ensure(databus);
  return dl.taskIds.map((id) => C.DAILY_POOL.find((t) => t.id === id)).filter(Boolean);
}

function addProgress(dl, id, n) {
  if (dl.taskIds && dl.taskIds.indexOf(id) < 0) return; // 不是今天的任务就不记（不留看不见的进度）
  const t = C.DAILY_POOL.find((x) => x.id === id);
  if (!t || n <= 0) return;
  const cur = dl.progress[id] || 0;
  if (cur >= t.need) return;
  dl.progress[id] = Math.min(t.need, cur + n);
}

// 一局打完（或中途退出）时结算进度：只写一次存储
function flush(databus, run) {
  const dl = ensure(databus);
  addProgress(dl, 'clearRun', run && run.win ? 1 : 0);
  addProgress(dl, 'clear2', run && run.win ? 1 : 0);
  addProgress(dl, 'merge10', (run && run.merges) || 0);
  addProgress(dl, 'merge25', (run && run.merges) || 0);
  addProgress(dl, 'kill60', (run && run.kills) || 0);
  addProgress(dl, 'kill150', (run && run.kills) || 0);
  addProgress(dl, 'recycle5', (run && run.recycled) || 0);
  addProgress(dl, 'bossOne', (run && run.bossKills) || 0);
  databus.saveMeta();
}

// 看完一次激励视频（每日任务池里的可选任务，自愿行为）
function countAd(databus) {
  const dl = ensure(databus);
  addProgress(dl, 'adOne', 1);
  databus.saveMeta();
}

function state(databus) {
  const dl = ensure(databus);
  return todaysTasks(databus).map((t) => ({
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
  const t = C.DAILY_POOL.find((x) => x.id === id);
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

module.exports = {
  today, dayKey, pickDailyTasks, advanceStreak, ensure, todaysTasks,
  flush, countAd, state, claimableCount, claim, freeChestLeft, takeFreeChest,
};
