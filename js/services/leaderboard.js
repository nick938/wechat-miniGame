/**
 * 好友排行榜（开放数据域）主域侧服务
 * - 微信不允许开发者直接读好友关系数据，必须走开放数据域：
 *   主域把分数写入用户云存储 → 开放数据域 getFriendCloudStorage 读好友分数 → 画在 sharedCanvas → 主域上屏
 * - 主域与开放数据域通信只能 postMessage（单向）
 */
function available() {
  return typeof wx !== 'undefined' && !!wx.getOpenDataContext;
}

// 分数写入用户云端托管数据（每局限一次，微信侧有写入频控）
function submitScore(score) {
  try {
    if (!available() || !wx.setUserCloudStorage) return;
    wx.setUserCloudStorage({
      KVDataList: [{ key: 'score', value: String(Math.max(0, Math.round(score))) }],
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

// 通知开放数据域刷新好友榜（开放后调用一次即可）
function requestRefresh() {
  try {
    if (!available()) return;
    wx.getOpenDataContext().postMessage({ type: 'refresh' });
  } catch (e) { /* 忽略 */ }
}

module.exports = { available, submitScore, getSharedCanvas, requestRefresh };
