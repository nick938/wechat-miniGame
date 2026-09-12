/**
 * 错误监控：全局 JS 异常 / Promise 未捕获拒绝 → 微信实时日志
 * 在 mp 后台「开发管理 → 运维中心 → 实时日志」按 errMsg 检索
 */
let logger = null;
let inited = false;

function init() {
  if (inited || typeof wx === 'undefined') return;
  inited = true;
  try {
    if (wx.getRealtimeLogManager) logger = wx.getRealtimeLogManager();
    if (wx.onError) {
      wx.onError((msg) => error('jsError', String(msg).slice(0, 500)));
    }
    if (wx.onUnhandledRejection) {
      wx.onUnhandledRejection((res) => {
        error('promiseRejection', String(res && res.reason).slice(0, 500));
      });
    }
  } catch (e) { /* 监控不可用不影响游戏 */ }
}

function error(tag, msg) {
  try {
    if (logger && logger.error) {
      logger.error(tag, msg);
      if (logger.flush) logger.flush();
    }
    if (typeof console !== 'undefined' && console.error) console.error('[monitor]', tag, msg);
  } catch (e) { /* 忽略 */ }
}

module.exports = { init, error };
