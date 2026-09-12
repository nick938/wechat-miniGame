/**
 * 升级三选一弹层（战斗内模态）
 */
const C = require('../core/config');
const U = require('../core/utils');
const Skills = require('../systems/skills');
const { track } = require('../services/track');

const CARD_W = 300;
const CARD_H = 74;
const CARD_TOP = 170;

class LevelUp {
  static open(battle) {
    battle.modal = {
      type: 'levelup',
      options: Skills.rollOffers(battle, 3),
      rects: { cards: [], reroll: null },
      justOpened: true, // 本帧打开：吞掉本次触摸，防止误触
    };
  }

  static render(ctx, battle) {
    const m = battle.modal;
    const W = C.DESIGN_W;
    const H = C.DESIGN_H;
    ctx.fillStyle = 'rgba(30,30,40,0.55)';
    ctx.fillRect(0, 0, W, H);

    U.drawText(ctx, `⬆️ 升级！Lv.${battle.charLevel}`, W / 2, 120, 24, '#ffffff', 'center', 'bold');
    if (m.skillTip) {
      U.drawPanel(ctx, W / 2 - 130, 140, 260, 30, 15, 'rgba(232,163,61,0.9)');
      U.drawText(ctx, '第一次升级！点击一张卡片选择技能', W / 2, 155, 13, '#ffffff', 'center', 'bold');
    } else {
      U.drawText(ctx, '选择一个摸鱼技能', W / 2, 148, 13, 'rgba(255,255,255,0.75)');
    }

    m.rects.cards = m.options.map((skill, i) => {
      const r = { x: (W - CARD_W) / 2, y: CARD_TOP + i * (CARD_H + 14), w: CARD_W, h: CARD_H };
      const color = C.RARITY_COLOR[skill.rarity];
      const owned = battle.skills.find((k) => k.id === skill.id);
      U.drawPanel(ctx, r.x, r.y, r.w, r.h, 12, '#ffffff', color);
      ctx.fillStyle = color;
      U.roundRectPath(ctx, r.x + 10, r.y + 12, 50, 50, 10);
      ctx.fill();
      U.drawText(ctx, C.RARITY_NAME[skill.rarity], r.x + 35, r.y + 37, 20, '#ffffff', 'center', 'bold');
      U.drawText(ctx, skill.name, r.x + 76, r.y + 26, 17, '#333333', 'left', 'bold');
      U.drawText(ctx, skill.desc, r.x + 76, r.y + 50, 12, '#888888', 'left');
      if (owned) {
        U.drawText(ctx, `已有${owned.stacks}层`, r.x + r.w - 12, r.y + 26, 11, color, 'right', 'bold');
      }
      m.rects.cards[i] = r;
      return r;
    });

    // 技能刷新（看广告）
    if (battle.rerollLeft > 0) {
      const rr = { x: (W - 160) / 2, y: CARD_TOP + 3 * (CARD_H + 14) + 6, w: 160, h: 40 };
      U.drawPanel(ctx, rr.x, rr.y, rr.w, rr.h, 20, 'rgba(255,255,255,0.9)', '#4a90d9');
      U.drawText(ctx, `📺 看广告刷新（剩${battle.rerollLeft}次）`, W / 2, rr.y + 20, 13, '#4a90d9', 'center', 'bold');
      m.rects.reroll = rr;
    }
  }

  static onTouch(scene, x, y) {
    const app = scene.app;
    const battle = scene.b;
    const m = battle.modal;
    if (m.justOpened) { m.justOpened = false; return; }
    const hit = (r) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

    const cardIdx = m.rects.cards.findIndex((r) => hit(r));
    if (cardIdx >= 0) {
      const skill = m.options[cardIdx];
      Skills.apply(battle, skill);
      track('skill_pick', { id: skill.id, stacks: battle.skills.find((k) => k.id === skill.id).stacks });
      battle.pendingLevels--;
      battle.modal = null;
      U.vibrate();
      if (m.skillTip) {
        app.databus.meta.skillTipDone = true;
        app.databus.saveMeta();
      }
      scene.checkPendingLevels(); // 还有余量经验就继续弹
      return;
    }
    if (hit(m.rects.reroll)) {
      const adService = app.adService;
      battle.rerollLeft--;
      adService.show('reroll', () => {
        if (battle.modal && battle.modal.type === 'levelup') {
          battle.modal.options = Skills.rollOffers(battle, 3);
        }
      });
    }
  }
}

module.exports = LevelUp;
