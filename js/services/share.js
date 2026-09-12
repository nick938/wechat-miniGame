/**
 * 分享服务
 */
const C = require('../core/config');

function buildTitle(kills, level, score) {
  const s = score || 0;
  if (s > 0) {
    return `我在《摸鱼保卫战》拿到摸鱼分 ${s}（第 ${level} 关），超过 92% 的打工人！来挑战我 👉`;
  }
  return `我在《摸鱼保卫战》摸到了第 ${level} 关，打退了 ${kills} 个需求，快来挑战我 👉`;
}

function share(meta, battle) {
  if (typeof wx === 'undefined' || !wx.shareAppMessage) return;
  const score = battle ? (battle.finalScore || 0) : (meta.bestScore || 0);
  const kills = battle ? battle.kills : meta.totalKills;
  const level = battle ? battle.level : meta.bestLevel;
  wx.shareAppMessage({
    title: buildTitle(kills, level, score),
    query: 'from=share',
  });
}

function initMenu() {
  if (typeof wx === 'undefined' || !wx.showShareMenu) return;
  try {
    wx.showShareMenu({});
  } catch (e) { /* 忽略 */ }
}

module.exports = { share, initMenu, buildTitle };
