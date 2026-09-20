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

module.exports = { myRank, nextTarget };
