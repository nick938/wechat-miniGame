/**
 * 分享服务
 * - 文案只用真实数据（分数/关卡/击杀），不再编造"超过 92% 的打工人"这类百分比
 * - 主动分享与右上角菜单转发共用同一份文案，转发也要带战绩
 */
const C = require('../core/config');

// 分享卡片图（5:4，由 tools/gen_share_card.py 生成；缺失时微信会用页面截图）
const SHARE_IMAGE = 'assets/share/card-500x400.png';

function scoreOf(meta, battle) {
  // 只有本局真的结算出分数才用它；否则回落到历史最高分
  // （回首页后 databus.battle 仍是上一局的对象，不能拿它的空分数当战绩）
  const runScore = (battle && battle.finalScore) || 0;
  return runScore > 0 ? runScore : ((meta && meta.bestScore) || 0);
}

function buildTitle(kills, level, score) {
  const s = score || 0;
  if (s > 0) return `我在《摸鱼保卫战》拿到摸鱼分 ${s}（第 ${level} 关），来比比谁更会摸鱼 👉`;
  return `老板来了！我在第 ${level} 关打退了 ${kills} 个需求，快来帮我守住工位 👉`;
}

// 分享参数（主动分享与转发共用）
function shareOptions(meta, battle) {
  const m = meta || {};
  const score = scoreOf(m, battle);
  const kills = battle ? battle.kills : (m.totalKills || 0);
  const level = battle ? battle.level : (m.bestLevel || 1);
  return {
    title: buildTitle(kills, level, score),
    query: 'from=share',
    imageUrl: SHARE_IMAGE,
  };
}

function share(meta, battle) {
  if (typeof wx === 'undefined' || !wx.shareAppMessage) return;
  const opt = shareOptions(meta, battle);
  trackShare(scoreOf(meta, battle), 'button');
  wx.shareAppMessage(opt);
}

// 注册右上角"转发"菜单：每次转发时实时取当前战绩
function initMenu(provider) {
  if (typeof wx === 'undefined') return;
  if (wx.showShareMenu) {
    try { wx.showShareMenu({}); } catch (e) { /* 忽略 */ }
  }
  if (wx.onShareAppMessage) {
    wx.onShareAppMessage(() => {
      const data = (provider && provider()) || {};
      const opt = shareOptions(data.meta || {}, data.battle || null);
      trackShare(scoreOf(data.meta || {}, data.battle || null), 'menu');
      return opt;
    });
  }
}

function trackShare(score, from) {
  try {
    const { track } = require('./track');
    track('share', { from, score: score || 0 });
  } catch (e) { /* 埋点失败不影响分享 */ }
}

module.exports = { share, initMenu, buildTitle, shareOptions, scoreOf, SHARE_IMAGE };
