/**
 * 好友榜的排名计算（纯函数）
 * 放在开放数据域目录下：index.js 与主域的测试都能 require 它，
 * 这样"我的名次 / 还差多少超过下一个好友"这套逻辑可以被真实测试覆盖（开放数据域本身跑不了 Node）。
 */

// 我在榜单里的名次（比我分高的有几个人 + 1）；平手算并列
function myRank(list, myScore) {
  const s = myScore || 0;
  let better = 0;
  for (const u of list) {
    if (u.score > s) better++;
  }
  return better + 1;
}

// 下一个可追赶的目标：分数刚好比我高的最弱那个（"再摸 N 分超过 TA"）
function nextTarget(list, myScore) {
  const s = myScore || 0;
  let best = null;
  for (const u of list) {
    if (u.score <= s) continue;
    if (!best || u.score < best.score) best = u;
  }
  if (!best) return null;
  return { nickname: best.nickname, score: best.score, gap: best.score - s + 1 };
}

// 周 key：按"周一起算"的自然周，形如 2026-W38（主域与开放数据域必须算出一致的值）
function weekKey(date) {
  const d = date ? new Date(date.getTime()) : new Date();
  d.setHours(0, 0, 0, 0);
  // 周一为一周起点：getDay() 周日=0 → 转成 1..7
  const day = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - (day - 1));      // 回到本周一
  const year = d.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const days = Math.floor((d - jan1) / 86400000);
  const week = Math.floor(days / 7) + 1;
  return `${year}-W${week < 10 ? '0' : ''}${week}`;
}

// 周榜：只统计"本周上报过"的好友（跨周后旧数据不再参与排名，避免上周的分一直挂榜）
function weekList(all, currentWeek) {
  return all
    .filter((u) => u.week === currentWeek && u.weekScore > 0)
    .map((u) => ({ nickname: u.nickname, avatar: u.avatar, score: u.weekScore }))
    .sort((a, b) => b.score - a.score);
}

module.exports = { myRank, nextTarget, weekKey, weekList };
