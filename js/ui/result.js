/**
 * 结算弹层：胜利（下一关/双倍奖励）与失败（再战/回首页）
 * 打开时立刻把本局金币入账存档；双倍奖励为额外加一次通关奖励
 */
const C = require('../core/config');
const U = require('../core/utils');

const BTN_W = 240;
const BTN_H = 48;

class Result {
  static open(scene, win) {
    const d = scene.app.databus;
    const b = d.battle;
    b.settled = true; // 标记已结算，防止中途退出逻辑重复入账
    b.winBonus = b.winBonus || 0;

    // 本局收益入账（只入一次）
    d.meta.coins += b.coins;
    d.meta.totalKills += b.kills;
    if (win) {
      d.meta.bestLevel = Math.max(d.meta.bestLevel, b.level + 1);
    }
    d.saveMeta();

    b.modal = {
      type: 'result',
      win,
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

    const panelY = H / 2 - 210;
    U.drawPanel(ctx, W / 2 - 160, panelY, 320, 420, 16, '#ffffff');
    U.drawText(ctx, m.win ? '🎉 摸鱼成功！' : '😤 工位沦陷…', W / 2, panelY + 48, 26, m.win ? '#3aa76d' : '#ff6b6b', 'center', 'bold');
    U.drawText(ctx, `第 ${b.level} 关 · ${b.cfg.name}`, W / 2, panelY + 84, 14, '#888888');

    const statY = panelY + 130;
    U.drawText(ctx, '本局金币', W / 2 - 70, statY, 14, '#999999');
    U.drawText(ctx, `+${b.coins}`, W / 2 - 70, statY + 30, 22, '#e8a33d', 'center', 'bold');
    U.drawText(ctx, '击退需求', W / 2 + 70, statY, 14, '#999999');
    U.drawText(ctx, `${b.kills}`, W / 2 + 70, statY + 30, 22, '#4a90d9', 'center', 'bold');
    U.drawText(ctx, `💰 总金币 ${d.meta.coins}`, W / 2, panelY + 200, 14, '#666666');

    const rects = {};
    let y = panelY + 236;
    if (m.win) {
      if (!m.doubled) {
        rects.double = { x: (W - BTN_W) / 2, y, w: BTN_W, h: BTN_H };
        U.drawPanel(ctx, rects.double.x, y, BTN_W, BTN_H, 24, '#e8a33d');
        U.drawText(ctx, '📺 看广告 金币翻倍', W / 2, y + 24, 15, '#ffffff', 'center', 'bold');
        y += BTN_H + 12;
      }
      rects.next = { x: (W - BTN_W) / 2, y, w: BTN_W, h: BTN_H };
      U.drawPanel(ctx, rects.next.x, y, BTN_W, BTN_H, 24, '#3aa76d');
      U.drawText(ctx, `下一关：第 ${b.level + 1} 关 ▶`, W / 2, y + 24, 15, '#ffffff', 'center', 'bold');
      y += BTN_H + 12;
    } else {
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
