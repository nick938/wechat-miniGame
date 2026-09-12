/**
 * 埋点：计划书 §30 的关键事件
 * 微信后台「数据分析-自定义事件」配置同名事件后，wx.reportAnalytics 自动生效；
 * 未配置时静默跳过，不影响游戏。
 * 建议后台创建事件：level_start / level_end / skill_pick / weapon_merge / ad_show
 */
function track(event, params) {
  try {
    if (typeof wx !== 'undefined' && wx.reportAnalytics) {
      wx.reportAnalytics(event, params || {});
    }
  } catch (e) { /* 忽略 */ }
}

module.exports = { track };
