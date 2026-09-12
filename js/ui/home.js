/**
 * 首页：开始 / 工位升级 / 每日广告宝箱 / 分享
 */
const C = require('../core/config');
const U = require('../core/utils');
const Share = require('../services/share');

class Home {
  constructor(app) {
    this.app = app;
    this.time = 0;
    this.panel = null; // null | 'upgrade'
    this.layout();
  }

  layout() {
    const W = C.DESIGN_W;
    this.rects = {
      start: { x: (W - 280) / 2, y: 288, w: 280, h: 64 },
      upgrade: { x: (W - 280) / 2, y: 378, w: 280, h: 52 },
      chest: { x: (W - 280) / 2, y: 442, w: 280, h: 52 },
      share: { x: (W - 280) / 2, y: 506, w: 280, h: 52 },
      help: { x: W - 52, y: 40, w: 38, h: 38 },
      helpClose: { x: W / 2 + 128, y: 150, w: 34, h: 34 },
      closePanel: { x: W / 2 + 128, y: 96, w: 34, h: 34 },
      buys: [],
    };
  }

  update(dt) {
    this.time += dt;
  }

  today() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  chestLeft() {
    const m = this.app.databus.meta;
    if (m.chest.date !== this.today()) {
      m.chest = { date: this.today(), used: 0 };
      this.app.databus.saveMeta();
    }
    return C.CHEST_PER_DAY - m.chest.used;
  }

  onTouchStart(x, y) {
    const d = this.app.databus;
    const hit = (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    const R = this.rects;

    if (this.panel === 'upgrade') {
      if (hit(R.closePanel)) {
        this.panel = null;
        return;
      }
      // 购买按钮
      const keys = Object.keys(C.UPGRADES);
      for (let i = 0; i < keys.length; i++) {
        const r = R.buys[i];
        if (r && hit(r)) {
          this.buy(keys[i]);
          return;
        }
      }
      return;
    }

    if (this.panel === 'help') {
      if (hit(R.helpClose)) {
        this.panel = null;
      }
      return;
    }

    if (hit(R.help)) {
      this.panel = 'help';
    } else if (hit(R.start)) {
      U.vibrate();
      this.app.startBattle(d.meta.bestLevel);
    } else if (hit(R.upgrade)) {
      this.panel = 'upgrade';
    } else if (hit(R.chest)) {
      this.openChest();
    } else if (hit(R.share)) {
      Share.share(d.meta, null);
    }
  }

  buy(key) {
    const d = this.app.databus;
    const cfg = C.UPGRADES[key];
    const tier = d.meta.upgrades[key];
    if (tier >= cfg.maxTier) return;
    const cost = C.UPGRADE_COST(tier);
    if (d.meta.coins < cost) {
      if (typeof wx !== 'undefined' && wx.showToast) {
        wx.showToast({ title: '金币不够，先去摸几局鱼', icon: 'none' });
      }
      return;
    }
    d.meta.coins -= cost;
    d.meta.upgrades[key] = tier + 1;
    d.saveMeta();
    U.vibrate();
  }

  openChest() {
    const d = this.app.databus;
    if (this.chestLeft() <= 0) {
      if (typeof wx !== 'undefined' && wx.showToast) {
        wx.showToast({ title: '今天的宝箱领完啦，明天再来', icon: 'none' });
      }
      return;
    }
    this.app.adService.show('chest', () => {
      const reward = Math.round((80 + Math.random() * 140) * (1 + d.meta.bestLevel * 0.05));
      d.meta.coins += reward;
      d.meta.chest.used++;
      d.saveMeta();
      if (typeof wx !== 'undefined' && wx.showToast) {
        wx.showToast({ title: `宝箱开出 ${reward} 金币 🪙`, icon: 'none' });
      }
    });
  }

  // ---------- 渲染 ----------
  render(ctx) {
    const d = this.app.databus;
    const W = C.DESIGN_W;
    const H = C.DESIGN_H;

    // 背景
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#fdf6e9');
    grad.addColorStop(1, '#f3e9d6');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    U.drawText(ctx, `💰 ${d.meta.coins}`, W / 2, 56, 16, '#b8860b', 'center', 'bold');

    const bob = Math.sin(this.time * 2) * 4;
    U.drawText(ctx, '🐟 摸鱼保卫战', W / 2, 140 + bob, 36, '#333333', 'center', 'bold');
    U.drawText(ctx, '上班是不可能认真上班的', W / 2, 180 + bob, 13, '#999999');

    const nextLv = d.meta.bestLevel;
    const lvCfg = C.buildLevel(nextLv);
    U.drawPanel(ctx, (W - 300) / 2, 212, 300, 52, 12, '#ffffff');
    U.drawText(ctx, `第 ${nextLv} 关 · ${lvCfg.name}`, W / 2, 232, 15, '#4a90d9', 'center', 'bold');
    U.drawText(ctx, `最高纪录：第 ${Math.max(1, d.meta.bestLevel - 1)} 关 ｜ 累计击退 ${d.meta.totalKills} 个需求`, W / 2, 252, 11, '#aaaaaa');

    this.drawBtn(ctx, this.rects.start, '▶  开始摸鱼', '#3aa76d', '#ffffff', 20);
    this.drawBtn(ctx, this.rects.upgrade, '🪑 工位升级', '#ffffff', '#4a90d9', 16, '#4a90d9');
    const left = this.chestLeft();
    this.drawBtn(ctx, this.rects.chest, `🎁 广告宝箱（今日剩 ${left} 次）`, '#ffffff', '#e8a33d', 16, '#e8a33d');
    this.drawBtn(ctx, this.rects.share, '📣 分享给工友', '#ffffff', '#666666', 16, '#cccccc');

    // 玩法说明按钮（右上角）
    const hr = this.rects.help;
    U.drawPanel(ctx, hr.x, hr.y, hr.w, hr.h, 19, '#ffffff', '#d8cfc0');
    U.drawText(ctx, '❓', hr.x + hr.w / 2, hr.y + hr.h / 2, 18, '#4a90d9');

    U.drawText(ctx, 'v1.0 · 纯广告变现 · 无内购', W / 2, H - 24, 10, '#c5bba8');

    if (this.panel === 'upgrade') this.renderUpgrade(ctx);
    if (this.panel === 'help') this.renderHelp(ctx);
  }

  renderHelp(ctx) {
    const W = C.DESIGN_W;
    const H = C.DESIGN_H;
    ctx.fillStyle = 'rgba(30,30,40,0.5)';
    ctx.fillRect(0, 0, W, H);
    const px = (W - 320) / 2;
    const py = 150;
    U.drawPanel(ctx, px, py, 320, 340, 16, '#ffffff');
    U.drawText(ctx, '📖 玩法说明', W / 2, py + 38, 20, '#333333', 'center', 'bold');
    const lines = [
      ['🖱️', '拖动相同的装备合成升级，', '装备会自动攻击敌人'],
      ['⬆️', '击杀得经验，升级时三选一拿技能'],
      ['🛡️', '敌人啃到工位就掉血，血条空了就输'],
      ['🪙', '金币用来升级工位，越摸越强'],
      ['📺', '看广告可复活、翻倍奖励、开宝箱'],
    ];
    let y = py + 86;
    for (const [icon, l1, l2] of lines) {
      U.drawEmoji(ctx, icon, px + 36, y + (l2 ? 14 : 0), 20);
      U.drawText(ctx, l1, px + 62, y, 13, '#444444', 'left');
      if (l2) U.drawText(ctx, l2, px + 62, y + 20, 13, '#444444', 'left');
      y += l2 ? 58 : 42;
    }
    U.drawText(ctx, '第 1 关有手把手教学，放心冲', W / 2, py + 300, 12, '#999999');
    const cr = this.rects.helpClose;
    U.drawPanel(ctx, cr.x, cr.y, cr.w, cr.h, 17, '#e5ded2');
    U.drawText(ctx, '✕', cr.x + cr.w / 2, cr.y + cr.h / 2, 16, '#666666');
  }

  drawBtn(ctx, r, text, fill, color, size, stroke) {
    U.drawPanel(ctx, r.x, r.y, r.w, r.h, r.h / 2, fill, stroke);
    if (fill === '#ffffff') {
      // 白底按钮加一点阴影感
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.08)';
      ctx.shadowOffsetY = 2;
      U.drawPanel(ctx, r.x, r.y, r.w, r.h, r.h / 2, fill, stroke);
      ctx.restore();
    }
    U.drawText(ctx, text, r.x + r.w / 2, r.y + r.h / 2, size, color, 'center', 'bold');
  }

  renderUpgrade(ctx) {
    const d = this.app.databus;
    const W = C.DESIGN_W;
    const H = C.DESIGN_H;
    ctx.fillStyle = 'rgba(30,30,40,0.5)';
    ctx.fillRect(0, 0, W, H);

    const px = (W - 320) / 2;
    const py = 96;
    U.drawPanel(ctx, px, py, 320, 470, 16, '#ffffff');
    U.drawText(ctx, '🪑 工位升级', W / 2, py + 34, 20, '#333333', 'center', 'bold');
    U.drawText(ctx, `💰 ${d.meta.coins}`, W / 2, py + 62, 14, '#b8860b', 'center', 'bold');

    this.rects.buys = [];
    const keys = Object.keys(C.UPGRADES);
    keys.forEach((key, i) => {
      const cfg = C.UPGRADES[key];
      const tier = d.meta.upgrades[key];
      const y = py + 92 + i * 96;
      U.drawPanel(ctx, px + 16, y, 288, 82, 12, '#f7f4ec');
      U.drawEmoji(ctx, cfg.emoji, px + 44, y + 41, 30);
      U.drawText(ctx, cfg.name, px + 72, y + 24, 15, '#333333', 'left', 'bold');
      const value = cfg.perTier * (tier + 1);
      U.drawText(ctx, `${cfg.desc} ${tier > 0 ? `当前 ${cfg.fmt(cfg.perTier * tier)}` : '未升级'} → ${cfg.fmt(value)}`,
        px + 72, y + 46, 11, '#888888', 'left');
      // 等级点
      for (let t = 0; t < cfg.maxTier; t++) {
        ctx.fillStyle = t < tier ? '#e8a33d' : '#ddd5c6';
        ctx.beginPath();
        ctx.arc(px + 76 + t * 14, y + 64, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      // 购买按钮
      const maxed = tier >= cfg.maxTier;
      const cost = C.UPGRADE_COST(tier);
      const br = { x: px + 196, y: y + 22, w: 96, h: 38 };
      U.drawPanel(ctx, br.x, br.y, br.w, br.h, 19, maxed ? '#ddd5c6' : '#3aa76d');
      U.drawText(ctx, maxed ? '已满级' : `💰 ${cost}`, br.x + br.w / 2, br.y + 19, 13,
        maxed ? '#999999' : '#ffffff', 'center', 'bold');
      this.rects.buys[i] = br;
    });

    const cr = this.rects.closePanel;
    U.drawPanel(ctx, cr.x, cr.y, cr.w, cr.h, 17, '#e5ded2');
    U.drawText(ctx, '✕', cr.x + cr.w / 2, cr.y + cr.h / 2, 16, '#666666');
  }
}

module.exports = Home;
