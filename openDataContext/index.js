/**
 * 开放数据域入口（封闭独立作用域，与主域唯一桥梁是 sharedCanvas）
 * 职责：读好友的「摸鱼分」托管数据 → 画好友排行榜 → 主域 drawImage 上屏
 * 注意：这里不能 require 主域代码、不能联网，只能用开放数据域白名单 API
 */
const sharedCanvas = wx.getSharedCanvas();
const ctx = sharedCanvas.getContext('2d');
sharedCanvas.width = 320;
sharedCanvas.height = 400;

let avatarCache = {}; // avatarUrl -> Image（已加载的）
let pendingRedraw = false;

wx.onMessage((msg) => {
  if (msg && msg.type === 'refresh') refresh();
});

function refresh() {
  wx.getFriendCloudStorage({
    keyList: ['score'],
    success: (res) => {
      const list = (res.data || [])
        .map((u) => {
          let score = 0;
          (u.KVDataList || []).forEach((kv) => {
            if (kv.key === 'score') score = parseInt(kv.value, 10) || 0;
          });
          return { nickname: u.nickname || '神秘工友', avatar: u.avatarUrl || '', score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 10); // 一屏 10 行，头像 40px
      drawList(list);
    },
    fail: () => {
      drawMsg('暂时拿不到好友数据');
    },
  });
}

function drawMsg(text) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, sharedCanvas.width, sharedCanvas.height);
  ctx.fillStyle = '#999999';
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, sharedCanvas.width / 2, sharedCanvas.height / 2);
}

function drawList(list) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, sharedCanvas.width, sharedCanvas.height);
  if (!list.length) {
    drawMsg('还没有好友玩过，分享出去比一比！');
    return;
  }
  ctx.font = '12px sans-serif';
  ctx.textBaseline = 'middle';
  list.forEach((u, i) => {
    const y = 20 + i * 38;
    // 名次
    ctx.textAlign = 'center';
    ctx.fillStyle = i < 3 ? '#e8a33d' : '#999999';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(String(i + 1), 20, y);
    // 头像占位（异步加载完成后整体重画）
    if (u.avatar) {
      if (avatarCache[u.avatar] && avatarCache[u.avatar].width) {
        ctx.drawImage(avatarCache[u.avatar], 40, y - 14, 28, 28);
      } else if (!avatarCache[u.avatar]) {
        pendingRedraw = true;
        const img = wx.createImage();
        avatarCache[u.avatar] = img;
        img.onload = () => {
          drawList(list);
        };
        img.onerror = () => {};
        img.src = u.avatar;
      }
    } else {
      ctx.fillStyle = '#ddd5c6';
      ctx.fillRect(40, y - 14, 28, 28);
    }
    // 昵称
    ctx.textAlign = 'left';
    ctx.fillStyle = '#333333';
    ctx.font = '13px sans-serif';
    let name = u.nickname;
    while (ctx.measureText(name).width > 150 && name.length > 1) name = name.slice(0, -1);
    ctx.fillText(name, 78, y);
    // 分数
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e8a33d';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(String(u.score), 300, y);
  });
  ctx.fillStyle = '#bbbbbb';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('每周和工友比比谁更会摸鱼', sharedCanvas.width / 2, sharedCanvas.height - 14);
}
