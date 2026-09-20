/**
 * 结算弹层：胜利（下一关/双倍奖励）与失败（再战/回首页）
 * 打开时立刻把本局金币入账存档；双倍奖励为额外加一次通关奖励
 */
const C = require('../core/config');
const U = require('../core/utils');
const LB = require('../services/leaderboard');
const Daily = require('../systems/daily');
const Ach = require('../systems/achievements');

const BTN_W = 240;
const BTN_H = 48;

class Result {
  static open(scene, win) {
    const d = scene.app.databus;
    const b = d.battle;
    b.settled = true; // 标记已结算，防止中途退出逻辑重复入账
    b.winBonus = b.winBonus || 0;

    // 摸鱼分结算 + 历史最高
    const score = C.calcScore(b);
    b.finalScore = score;
    const newRecord = score > (d.meta.bestScore || 0);
    if (newRecord) d.meta.bestScore = score;

    // 本局收益入账（只入一次）
    d.meta.coins += b.coins;
    d.meta.totalKills += b.kills;
    if (win) {
      d.meta.bestLevel = Math.max(d.meta.bestLevel, b.level + 1);
    }
    d.saveMeta();

    // 好友排行榜上报（开放数据域）
    LB.submitScore(d.meta, score);

    // 每日任务进度（一局一结算，只写一次存储）
    Daily.flush(d, { win, kills: b.kills, merges: b.merges });
    // 长期统计（成就 + 图鉴）同样一局只写一次
    Ach.flush(d, {
      win, kills: b.kills, merges: b.merges, recycled: b.recycled,
      maxLv: b.maxLv, killsByType: b.killsByType,
    });

    b.modal = {
      type: 'result',
      win,
      score,
      newRecord: score > 0 && newRecord,
      doubled: false,
      rects: {},
      justOpened: true,
    };
  }

  static render(ctx, scene) {
    const d = scene.app.databus;
    const b = d.battle;
    const m = b.modal;
    const W = C.DESIGN_W;
    const H = C.DESIGN_H;
    ctx.fillStyle = 'rgba(30,30,40,0.6)';
    ctx.fillRect(0, 0, W, H);

    const panelY = H / 2 - 230;
    U.drawPanel(ctx, W / 2 - 160, panelY, 320, 470, 16, '#ffffff');
    U.drawText(ctx, m.win ? '🎉 摸鱼成功！' : '😤 工位沦陷…', W / 2, panelY + 44, 26, m.win ? '#3aa76d' : '#ff6b6b', 'center', 'bold');
    U.drawText(ctx, `第 ${b.level} 关 · ${b.cfg.name}`, W / 2, panelY + 78, 14, '#888888');

    // 摸鱼分（核心展示）
    U.drawText(ctx, '摸鱼分', W / 2, panelY + 110, 13, '#999999');
    U.drawText(ctx, `${m.score}`, W / 2, panelY + 140, 32, '#e8a33d', 'center', 'bold');
    if (m.newRecord) {
      U.drawText(ctx, '🎉 新纪录！', W / 2, panelY + 168, 13, '#ff8c00', 'center', 'bold');
    } else {
      U.drawText(ctx, `历史最高 ${d.meta.bestScore}`, W / 2, panelY + 168, 12, '#aaaaaa');
    }

    const statY = panelY + 200;
    U.drawText(ctx, '本局金币', W / 2 - 70, statY, 14, '#999999');
    U.drawText(ctx, `+${b.coins}`, W / 2 - 70, statY + 28, 20, '#e8a33d', 'center', 'bold');
    U.drawText(ctx, '击退需求', W / 2 + 70, statY, 14, '#999999');
    U.drawText(ctx, `${b.kills}`, W / 2 + 70, statY + 28, 20, '#4a90d9', 'center', 'bold');
    U.drawText(ctx, `💰 总金币 ${d.meta.coins}`, W / 2, panelY + 258, 14, '#666666');

    const rects = {};
    let y = panelY + 292;
    if (m.win) {
      if (!m.doubled) {
        rects.double = { x: (W - BTN_W) / 2, y, w: BTN_W, h: BTN_H };
        U.drawPanel(ctx, rects.double.x, y, BTN_W, BTN_H, 24, '#e8a33d');
        // 写清具体能拿到多少（值一眼可见）
        U.drawText(ctx, `📺 看广告 本局金币 ×2（+${b.coins} 🪙）`, W / 2, y + 24, 14, '#ffffff', 'center', 'bold');
        y += BTN_H + 12;
      }
      rects.next = { x: (W - BTN_W) / 2, y, w: BTN_W, h: BTN_H };
      U.drawPanel(ctx, rects.next.x, y, BTN_W, BTN_H, 24, '#3aa76d');
      U.drawText(ctx, `下一关：第 ${b.level + 1} 关 ▶`, W / 2, y + 24, 15, '#ffffff', 'center', 'bold');
      y += BTN_H + 12;
    } else {
      // 失败复盘：说清是怎么输的、这一关差多少、下次怎么改（别只丢一句"工位沦陷"）
      const killer = C.ENEMIES[b.lastHitBy];
      U.drawText(ctx, `被 ${killer ? `${killer.emoji} ${killer.name}` : '一波需求'} 啃掉了最后一点血`,
        W / 2, panelY + 276, 12, '#ff6b6b', 'center', 'bold');
      U.drawText(ctx, `撑到 ${Math.round(b.time)}s / ${b.cfg.duration}s · 场上还剩 ${b.enemies.length} 只`,
        W / 2, panelY + 298, 11, '#999999');
      U.drawText(ctx, C.lossTip(b), W / 2, panelY + 320, 11, '#4a90d9');
      y = panelY + 344;
      rects.retry = { x: (W - BTN_W) / 2, y, w: BTN_W, h: BTN_H };
      U.drawPanel(ctx, rects.retry.x, y, BTN_W, BTN_H, 24, '#4a90d9');
      U.drawText(ctx, '再战一局 🔁', W / 2, y + 24, 15, '#ffffff', 'center', 'bold');
      y += BTN_H + 12;
    }
    rects.home = { x: (W - BTN_W) / 2, y, w: BTN_W, h: BTN_H };
    U.drawPanel(ctx, rects.home.x, y, BTN_W, BTN_H, 24, '#e5ded2');
    U.drawText(ctx, '回首页', W / 2, y + 24, 15, '#666666', 'center', 'bold');
    m.rects = rects;
  }

  static onTouch(scene, x, y) {
    const d = scene.app.databus;
    const b = d.battle;
    const m = b.modal;
    if (m.justOpened) { m.justOpened = false; return; }
    const hit = (r) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    const rects = m.rects;

    if (m.win && !m.doubled && hit(rects.double)) {
      scene.app.adService.show('double', () => {
        d.meta.coins += b.coins; // 翻倍 = 本局收益再发一次
        d.saveMeta();
        m.doubled = true;
      });
      return;
    }
    if (m.win && hit(rects.next)) {
      b.modal = null;
      scene.start(b.level + 1);
      return;
    }
    if (!m.win && hit(rects.retry)) {
      b.modal = null;
      scene.start(b.level);
      return;
    }
    if (hit(rects.home)) {
      b.modal = null;
      scene.exitToHome();
    }
  }
}

module.exports = Result;
