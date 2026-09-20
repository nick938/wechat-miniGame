/**
 * 开放数据域入口（封闭独立作用域，与主域唯一桥梁是 sharedCanvas）
 * 职责：读好友的「摸鱼分」托管数据 → 画好友排行榜 → 主域 drawImage 上屏
 * 注意：这里不能 require 主域代码、不能联网，只能用开放数据域白名单 API
 */
const sharedCanvas = wx.getSharedCanvas();
const ctx = sharedCanvas.getContext('2d');
const { myRank, nextTarget, weekKey, weekList } = require('./rank.js');
sharedCanvas.width = 320;
sharedCanvas.height = 400;

let avatarCache = {}; // avatarUrl -> Image（已加载的）
let pendingRedraw = false;
let myScore = 0;      // 主域传进来的"我的最高摸鱼分"
let myWeekScore = 0;  // 主域传进来的"我的本周最高分"
let curWeek = '';     // 当前周 key（由主域给，双方必须一致）
let mode = 'total';   // 看哪个榜：total（总榜）/ week（本周榜）

wx.onMessage((msg) => {
  if (msg && msg.type === 'refresh') {
    if (typeof msg.myScore === 'number') myScore = msg.myScore;
    if (typeof msg.myWeekScore === 'number') myWeekScore = msg.myWeekScore;
    if (typeof msg.week === 'string') curWeek = msg.week;
    if (msg.mode === 'week' || msg.mode === 'total') mode = msg.mode;
    refresh();
  }
});

function refresh() {
  wx.getFriendCloudStorage({
    keyList: ['score'],
    success: (res) => {
      const raw = (res.data || []).map((u) => {
        const o = { nickname: u.nickname || '神秘工友', avatar: u.avatarUrl || '', score: 0, weekScore: 0, week: '' };
        (u.KVDataList || []).forEach((kv) => {
          if (kv.key === 'score') o.score = parseInt(kv.value, 10) || 0;
          else if (kv.key === 'weekScore') o.weekScore = parseInt(kv.value, 10) || 0;
          else if (kv.key === 'week') o.week = String(kv.value || '');
        });
        return o;
      });
      if (mode === 'week') {
        const all = weekList(raw, curWeek);
        drawList(all, all.slice(0, 8), myWeekScore, 'week');
      } else {
        const all = raw.slice().sort((a, b) => b.score - a.score);
        drawList(all, all.slice(0, 8), myScore, 'total');
      }
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

function drawList(all, list, myScoreArg, modeArg) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, sharedCanvas.width, sharedCanvas.height);
  if (!list.length) {
    drawMsg('还没有好友玩过，分享出去比一比！');
    return;
  }
  const myScoreNow = myScoreArg || 0;
  const isWeek = modeArg === 'week';
  const rank = myRank(all, myScoreNow);
  ctx.font = '12px sans-serif';
  ctx.textBaseline = 'middle';
  list.forEach((u, i) => {
    const y = 20 + i * 34;
    // 自己那一行（分数相同则视为我）：淡绿底 + 标记
    const isMe = myScoreNow > 0 && u.score === myScoreNow;
    if (isMe) {
      ctx.fillStyle = '#e8f5ec';
      ctx.fillRect(6, y - 14, 308, 30);
    }
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
          drawList(all, list, myScoreArg, modeArg);
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
    ctx.fillStyle = isMe ? '#2f8f5b' : '#333333';
    ctx.font = `${isMe ? 'bold ' : ''}13px sans-serif`;
    let name = u.nickname + (isMe ? '（我）' : '');
    while (ctx.measureText(name).width > 150 && name.length > 1) name = name.slice(0, -1);
    ctx.fillText(name, 78, y);
    // 分数
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e8a33d';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(String(u.score), 300, y);
  });

  // 底部三行：我的位置 + 追赶目标（这是玩家最想看的两个信息）
  const baseY = sharedCanvas.height - 56;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#4a90d9';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText(isWeek ? `我的本周摸鱼分 ${myScoreNow} · 第 ${rank} 名` : `我的最高摸鱼分 ${myScoreNow} · 第 ${rank} 名`,
    sharedCanvas.width / 2, baseY);
  const target = nextTarget(all, myScoreNow);
  ctx.font = '12px sans-serif';
  if (target) {
    ctx.fillStyle = '#e8a33d';
    ctx.fillText(`再摸 ${target.gap} 分就能超过 ${target.nickname}`, sharedCanvas.width / 2, baseY + 20);
  } else if (myScoreNow > 0) {
    ctx.fillStyle = '#3aa76d';
    ctx.fillText('好友里你是第一，守住这个位置！', sharedCanvas.width / 2, baseY + 20);
  } else {
    ctx.fillStyle = '#999999';
    ctx.fillText(isWeek ? '本周还没人上榜，先摸一局' : '先摸一局，才有分数上榜', sharedCanvas.width / 2, baseY + 20);
  }
  ctx.fillStyle = '#bbbbbb';
  ctx.font = '11px sans-serif';
  ctx.fillText(isWeek ? '本周榜每周一 0 点重新开始' : '每周和工友比比谁更会摸鱼', sharedCanvas.width / 2, sharedCanvas.height - 14);
}
