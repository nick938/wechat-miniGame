/**
 * 好友排行榜（开放数据域）主域侧服务
 * - 微信不允许开发者直接读好友关系数据，必须走开放数据域：
 *   主域把分数写入用户云存储 → 开放数据域 getFriendCloudStorage 读好友分数 → 画在 sharedCanvas → 主域上屏
 * - 主域与开放数据域通信只能 postMessage（单向）
 */
const { weekKey } = require('../../openDataContext/rank.js');

function available() {
  return typeof wx !== 'undefined' && !!wx.getOpenDataContext;
}

// 本周最高分（存在 meta.weekBest，跨周自动重置）
function weeklyBest(meta, score) {
  const week = weekKey(new Date());
  if (!meta.weekBest || meta.weekBest.week !== week) meta.weekBest = { week, score: 0 };
  const s = Math.max(0, Math.round(score || 0));
  if (s > meta.weekBest.score) meta.weekBest.score = s;
  return meta.weekBest.score;
}

// 分数写入用户云端托管数据：同时上报总分与本周分（周榜用），并带上周 key
// 注意：每局限一次，微信侧对写入有频控
function submitScore(meta, score) {
  try {
    if (!available() || !wx.setUserCloudStorage) return;
    const best = weeklyBest(meta, score);
    wx.setUserCloudStorage({
      KVDataList: [
        { key: 'score', value: String(Math.max(0, Math.round(score || 0))) },
        { key: 'weekScore', value: String(best) },
        { key: 'week', value: weekKey(new Date()) },

      ],
    });
  } catch (e) { /* 忽略 */ }
}

function getSharedCanvas() {
  try {
    const od = wx.getOpenDataContext();
    return (od && od.canvas) || null;
  } catch (e) {
    return null;
  }
}

// 通知开放数据域刷新好友榜：把"我的最高分 / 本周分 / 当前周 key / 看哪个榜"都传过去
// （开放数据域读不到主域存档，不给这些它就算不出名次与追赶目标）
function requestRefresh(meta, mode) {
  try {
    if (!available()) return;
    const m = meta || {};
    wx.getOpenDataContext().postMessage({
      type: 'refresh',
      mode: mode === 'week' ? 'week' : 'total',
      week: weekKey(new Date()),
      myScore: Math.max(0, Math.round(m.bestScore || 0)),
      myWeekScore: Math.max(0, Math.round((m.weekBest && m.weekBest.week === weekKey(new Date())) ? m.weekBest.score : 0)),
    });
  } catch (e) { /* 忽略 */ }
}

module.exports = { available, submitScore, weeklyBest, getSharedCanvas, requestRefresh };
