/**
 * 首页：开始 / 工位升级 / 每日广告宝箱 / 分享
 */
const C = require('../core/config');
const U = require('../core/utils');
const Share = require('../services/share');
const LB = require('../services/leaderboard');
const Daily = require('../systems/daily');
const Ach = require('../systems/achievements');
const { track } = require('../services/track');

class Home {
  constructor(app) {
    this.app = app;
    this.time = 0;
    this.panel = null; // null | 'upgrade' | 'help'
    this.layout();
    this.initHelp();
    // 首次进入自动弹出玩法说明
    if (!app.databus.meta.helpSeen) {
      this.panel = 'help';
      this.helpPage = 0;
    }
  }

  // 分页式玩法说明内容
  initHelp() {
    this.helpPage = 0;
    this.helpPages = [
      {
        title: '🎯 守住你的工位',
        lines: [
          '敌人会从屏幕上方一波波压下来',
          '走到工位就会啃你的血条',
          '血条空了就输，撑到倒计时结束就赢',
          '装备全自动开火，你不用打怪',
        ],
        art: 'field',
      },
      {
        title: '🖱️ 拖动合成装备',
        lines: [
          '按住装备，拖到另一个相同的装备上',
          '合成升级：LV1 + LV1 → LV2（最高 LV5）',
          '拖动时红光会显示装备的攻击范围',
          '每约 9 秒空投一件新装备到空格',
          '用不上的装备拖到底部 ♻️ 回收换金币',
          '新手公式：先把咖啡合到 LV3',
        ],
        art: 'merge',
      },
      {
        title: '⬆️ 升级与变强',
        lines: [
          '杀怪得经验，升级三选一拿技能',
          '品质：白 < 蓝 < 紫 < 橙，可叠加',
          '金币回首页升级工位（伤害/血/收益）',
          '📺 广告换：复活 / 金币翻倍 / 宝箱',
          '👔 每 4 关一个 Boss，第 8 关后无尽',
        ],
        art: null,
      },
    ];
  }

  layout() {
    const W = C.DESIGN_W;
    this.rects = {
      start: { x: (W - 280) / 2, y: 288, w: 280, h: 64 },
      upgrade: { x: (W - 280) / 2, y: 368, w: 280, h: 48 },
      chest: { x: (W - 280) / 2, y: 426, w: 280, h: 48 },
      rank: { x: (W - 280) / 2, y: 484, w: 280, h: 48 },
      share: { x: (W - 280) / 2, y: 542, w: 280, h: 48 },
      help: { x: W - 52, y: 40, w: 38, h: 38 },
      daily: { x: 14, y: 40, w: 38, h: 38 },      // 每日任务入口（左上角，带红点）
      codex: { x: 60, y: 40, w: 38, h: 38 },      // 成就/图鉴入口（左上角第二个）
      codexClose: { x: W / 2 + 128, y: 96, w: 34, h: 34 },
      codexTabs: [],
      achClaims: [],
      closePanel: { x: W / 2 + 128, y: 96, w: 34, h: 34 },
      rankClose: { x: W / 2 + 128, y: 100, w: 34, h: 34 },
      dailyClose: { x: W / 2 + 128, y: 96, w: 34, h: 34 },
      buys: [],
      claims: [],                                 // 每日任务面板的领取按钮
      freeChest: null,                            // 每日免费宝箱按钮
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

    if (this.panel === 'codex') {
      const d2 = this.app.databus;
      // 页签切换
      for (let i = 0; i < this.rects.codexTabs.length; i++) {
        const t = this.rects.codexTabs[i];
        if (t && hit(t)) { this.codexTab = i; return; }
      }
      // 成就领取
      for (let i = 0; i < this.rects.achClaims.length; i++) {
        const r = this.rects.achClaims[i];
        if (r && hit(r)) {
          const gained = Ach.claim(d2, r.id);
          if (gained > 0) {
            track('achievement_claim', { id: r.id, coins: gained });
            U.vibrate();
            if (typeof wx !== 'undefined' && wx.showToast) {
              wx.showToast({ title: `成就奖励 +${gained} 🪙`, icon: 'none' });
            }
          }
          return;
        }
      }
      if (hit(R.codexClose)) this.panel = null;
      return;
    }

    if (this.panel === 'daily') {
      const d2 = this.app.databus;
      // 领取任务奖励
      for (let i = 0; i < this.rects.claims.length; i++) {
        const r = this.rects.claims[i];
        if (r && hit(r)) {
          const gained = Daily.claim(d2, r.id);
          if (gained > 0) {
            track('daily_claim', { id: r.id, coins: gained });
            U.vibrate();
            if (typeof wx !== 'undefined' && wx.showToast) {
              wx.showToast({ title: `任务奖励 +${gained} 🪙`, icon: 'none' });
            }
          }
          return;
        }
      }
      // 领取每日免费宝箱
      if (this.rects.freeChest && hit(this.rects.freeChest)) {
        const got = Daily.takeFreeChest(d2);
        if (got > 0) {
          track('daily_chest', { coins: got });
          U.vibrate();
          if (typeof wx !== 'undefined' && wx.showToast) {
            wx.showToast({ title: `免费宝箱 +${got} 🪙`, icon: 'none' });
          }
        } else if (typeof wx !== 'undefined' && wx.showToast) {
          wx.showToast({ title: '今天的免费宝箱领过啦', icon: 'none' });
        }
        return;
      }
      if (hit(R.dailyClose)) this.panel = null;
      return;
    }

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
      const hitR = (r) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
      if (hitR(this.rects.helpNext)) {
        if (this.helpPage < this.helpPages.length - 1) this.helpPage++;
        else this.closeHelp();
      } else if (hitR(this.rects.helpCloseX)) {
        this.closeHelp();
      }
      return;
    }

    if (this.panel === 'rank') {
      if (x >= this.rects.rankClose.x && x <= this.rects.rankClose.x + 34 &&
        y >= this.rects.rankClose.y && y <= this.rects.rankClose.y + 34) {
        this.panel = null;
      }
      return;
    }

    if (hit(R.help)) {
      this.helpPage = 0;
      this.panel = 'help';
    } else if (hit(R.daily)) {
      this.panel = 'daily';
      track('daily_open', { claimable: Daily.claimableCount(d) });
    } else if (hit(R.codex)) {
      this.panel = 'codex';
      this.codexTab = 0;
      track('codex_open', { claimable: Ach.claimableCount(d) });
    } else if (hit(R.rank)) {
      this.panel = 'rank';
      LB.requestRefresh(d.meta.bestScore); // 打开时通知开放数据域刷新好友榜（带上我的最高分）
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

  closeHelp() {
    const d = this.app.databus;
    if (!d.meta.helpSeen) {
      d.meta.helpSeen = true;
      d.saveMeta();
    }
    this.panel = null;
  }

  buy(key) {
    if (this.time - (this._lastBuyT === undefined ? -9 : this._lastBuyT) < 0.25) return; // 防快速双击连买
    this._lastBuyT = this.time;
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
    U.drawText(ctx, `🏆 最高摸鱼分 ${d.meta.bestScore} ｜ 累计击退 ${d.meta.totalKills} 个需求`, W / 2, 252, 11, '#aaaaaa');

    // "差一点就成"：把最近能拿到的奖励摊在首页，不用玩家自己点开面板算
    const claimableD = Daily.claimableCount(d);
    const claimableA = Ach.claimableCount(d);
    let goalLine = '';
    if (claimableD + claimableA > 0) {
      goalLine = `🎁 有 ${claimableD + claimableA} 个奖励待领取（点 📋 / 📖）`;
    } else {
      const near = Ach.nearest(d);
      if (near) goalLine = `🎯 ${near.desc}（还差 ${near.need - near.value}）→ +${near.coins}🪙`;
    }
    if (goalLine) U.drawText(ctx, goalLine, W / 2, 276, 11, '#4a90d9');

    this.drawBtn(ctx, this.rects.start, '▶  开始摸鱼', '#3aa76d', '#ffffff', 20);
    this.drawBtn(ctx, this.rects.upgrade, '🪑 工位升级', '#ffffff', '#4a90d9', 16, '#4a90d9');
    const left = this.chestLeft();
    // 按钮上直接写清能换到多少金币（值一眼可见），范围与 openChest 的公式一致
    const chestMul = 1 + d.meta.bestLevel * 0.05;
    const chestRange = `${Math.round(80 * chestMul)}~${Math.round(220 * chestMul)}`;
    this.drawBtn(ctx, this.rects.chest, `🎁 看广告开宝箱 +${chestRange} 🪙（今日剩 ${left} 次）`, '#ffffff', '#e8a33d', 14, '#e8a33d');
    this.drawBtn(ctx, this.rects.rank, '🏆 好友摸鱼榜', '#ffffff', '#ff8c00', 16, '#ff8c00');
    this.drawBtn(ctx, this.rects.share, '📣 分享给工友', '#ffffff', '#666666', 16, '#cccccc');

    // 玩法说明按钮（右上角）
    const hr = this.rects.help;
    U.drawPanel(ctx, hr.x, hr.y, hr.w, hr.h, 19, '#ffffff', '#d8cfc0');
    U.drawText(ctx, '❓', hr.x + hr.w / 2, hr.y + hr.h / 2, 18, '#4a90d9');

    // 每日任务入口（左上角；有待领取时加红点）
    const dr = this.rects.daily;
    U.drawPanel(ctx, dr.x, dr.y, dr.w, dr.h, 19, '#ffffff', '#d8cfc0');
    U.drawText(ctx, '📋', dr.x + dr.w / 2, dr.y + dr.h / 2, 18, '#4a90d9');
    if (Daily.claimableCount(d) > 0 || Daily.freeChestLeft(d) > 0) {
      ctx.fillStyle = '#ff4d4d';
      ctx.beginPath();
      ctx.arc(dr.x + dr.w - 4, dr.y + 5, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // 成就/图鉴入口（左上角第二个）
    const xr = this.rects.codex;
    U.drawPanel(ctx, xr.x, xr.y, xr.w, xr.h, 19, '#ffffff', '#d8cfc0');
    U.drawText(ctx, '📖', xr.x + xr.w / 2, xr.y + xr.h / 2, 18, '#4a90d9');
    if (Ach.claimableCount(d) > 0) {
      ctx.fillStyle = '#ff4d4d';
      ctx.beginPath();
      ctx.arc(xr.x + xr.w - 4, xr.y + 5, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    U.drawText(ctx, 'v1.0 · 纯广告变现 · 无内购', W / 2, H - 24, 10, '#c5bba8');

    if (this.panel === 'upgrade') this.renderUpgrade(ctx);
    if (this.panel === 'help') this.renderHelp(ctx);
    if (this.panel === 'rank') this.renderRank(ctx);
    if (this.panel === 'daily') this.renderDaily(ctx);
    if (this.panel === 'codex') this.renderCodex(ctx);
  }

  // 成就与图鉴（两个页签共用一个面板）
  renderCodex(ctx) {
    const d = this.app.databus;
    const W = C.DESIGN_W;
    const H = C.DESIGN_H;
    ctx.fillStyle = 'rgba(30,30,40,0.6)';
    ctx.fillRect(0, 0, W, H);

    const px = (W - 330) / 2;
    const py = 88;
    U.drawPanel(ctx, px, py, 330, 470, 16, '#ffffff');
    U.drawText(ctx, '📖 成就与图鉴', W / 2, py + 30, 18, '#333333', 'center', 'bold');

    // 页签
    const tabNames = ['成就', '图鉴'];
    this.rects.codexTabs = tabNames.map((name, i) => {
      const r = { x: px + 20 + i * 90, y: py + 48, w: 84, h: 30 };
      const on = this.codexTab === i;
      U.drawPanel(ctx, r.x, r.y, r.w, r.h, 15, on ? '#4a90d9' : '#f0ebe1');
      U.drawText(ctx, name, r.x + r.w / 2, r.y + 15, 13, on ? '#ffffff' : '#888888', 'center', 'bold');
      return r;
    });
    const claimable = Ach.claimableCount(d);
    if (claimable > 0) {
      U.drawText(ctx, `${claimable} 项可领取`, px + 250, py + 63, 11, '#ff4d4d', 'left', 'bold');
    }

    if (this.codexTab === 1) this.renderCodexDex(ctx, d, px, py);
    else this.renderCodexAch(ctx, d, px, py);

    const cl = this.rects.codexClose;
    U.drawPanel(ctx, cl.x, cl.y, cl.w, cl.h, 17, '#f0ebe1');
    U.drawText(ctx, '✕', cl.x + cl.w / 2, cl.y + cl.h / 2, 15, '#999999');
  }

  // 成就页：8 项，带进度与领取
  renderCodexAch(ctx, d, px, py) {
    const W = C.DESIGN_W;
    this.rects.achClaims = [];
    Ach.state(d).forEach((a, i) => {
      const y = py + 88 + i * 46;
      U.drawPanel(ctx, px + 14, y, 302, 40, 10, a.claimed ? '#f0f0f0' : '#f7f4ec');
      U.drawText(ctx, a.name, px + 26, y + 14, 12, a.claimed ? '#a89f92' : '#333333', 'left', 'bold');
      U.drawText(ctx, `${a.desc} · ${a.value}/${a.need}`, px + 26, y + 30, 10, '#999999', 'left');
      const bw = 60;
      const ratio = U.clamp(a.value / a.need, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      U.roundRectPath(ctx, px + 232, y + 26, bw, 6, 3);
      ctx.fill();
      ctx.fillStyle = ratio >= 1 ? '#3aa76d' : '#4a90d9';
      U.roundRectPath(ctx, px + 232, y + 26, bw * ratio, 6, 3);
      ctx.fill();
      const br = { x: px + 216, y: y + 4, w: 88, h: 32, id: a.id };
      if (a.claimed) {
        U.drawPanel(ctx, br.x, br.y, br.w, br.h, 16, '#ddd5c6');
        U.drawText(ctx, '已领取', br.x + br.w / 2, br.y + 16, 11, '#999999', 'center', 'bold');
      } else if (a.done) {
        U.drawPanel(ctx, br.x, br.y, br.w, br.h, 16, '#3aa76d');
        U.drawText(ctx, `领取 +${a.coins}`, br.x + br.w / 2, br.y + 16, 11, '#ffffff', 'center', 'bold');
        this.rects.achClaims.push(br);
      } else {
        U.drawPanel(ctx, br.x, br.y, br.w, br.h, 16, '#e9e3d8');
        U.drawText(ctx, '未达成', br.x + br.w / 2, br.y + 16, 11, '#a89f92', 'center', 'bold');
      }
    });
  }

  // 图鉴页：每种敌人被击退多少只 + 长期统计
  renderCodexDex(ctx, d, px, py) {
    const W = C.DESIGN_W;
    Ach.dexList(d).forEach((e, i) => {
      const y = py + 92 + i * 40;
      U.drawPanel(ctx, px + 14, y, 302, 34, 10, e.kills > 0 ? '#f7f4ec' : '#f4f4f4');
      U.drawEmoji(ctx, e.emoji, px + 36, y + 17, 20);
      U.drawText(ctx, e.name + (e.boss ? '（Boss）' : ''), px + 56, y + 17, 12,
        e.kills > 0 ? '#333333' : '#a89f92', 'left', 'bold');
      U.drawText(ctx, e.kills > 0 ? `已击退 ${e.kills} 只` : '还没遇到过', px + 302 - 12, y + 17, 11,
        e.kills > 0 ? '#3aa76d' : '#a89f92', 'right');
    });
    const dex = Ach.ensure(d);
    const y0 = py + 92 + 6 * 40 + 6;
    U.drawText(ctx, `累计：打了 ${dex.runs} 局（胜 ${dex.wins}）｜合成 ${dex.merges} 次｜回收 ${dex.recycled} 件｜看过广告 ${dex.adsWatched} 次`,
      W / 2, y0, 10, '#888888');
    U.drawText(ctx, `最高装备等级 LV${dex.maxLv || 1}｜最高摸鱼分 ${d.meta.bestScore}｜最高第 ${d.meta.bestLevel} 关`,
      W / 2, y0 + 18, 10, '#888888');
  }

  // 每日任务面板：3 个任务（进度条 + 领取） + 每日免费宝箱
  renderDaily(ctx) {
    const d = this.app.databus;
    const W = C.DESIGN_W;
    const H = C.DESIGN_H;
    ctx.fillStyle = 'rgba(30,30,40,0.6)';
    ctx.fillRect(0, 0, W, H);

    const px = (W - 330) / 2;
    const py = 88;
    U.drawPanel(ctx, px, py, 330, 420, 16, '#ffffff');
    U.drawText(ctx, '📋 每日任务', W / 2, py + 34, 19, '#333333', 'center', 'bold');
    const doneCount = Daily.state(d).filter((t) => t.claimed).length;
    U.drawText(ctx, `今天已领 ${doneCount} / ${C.DAILY_TASKS.length} 个奖励 · 每天 0 点刷新`, W / 2, py + 58, 11, '#999999');

    this.rects.claims = [];
    Daily.state(d).forEach((t, i) => {
      const y = py + 80 + i * 74;
      U.drawPanel(ctx, px + 14, y, 302, 64, 12, t.done && t.claimed ? '#f0f0f0' : '#f7f4ec');
      U.drawText(ctx, t.name, px + 28, y + 22, 13, '#333333', 'left', 'bold');
      U.drawText(ctx, `奖励 🪙 ${t.coins}`, px + 28, y + 44, 11, '#b8860b', 'left');
      // 进度条
      const bw = 150;
      const ratio = U.clamp(t.progress / t.need, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      U.roundRectPath(ctx, px + 130, y + 40, bw, 8, 4);
      ctx.fill();
      ctx.fillStyle = ratio >= 1 ? '#3aa76d' : '#4a90d9';
      U.roundRectPath(ctx, px + 130, y + 40, bw * ratio, 8, 4);
      ctx.fill();
      U.drawText(ctx, `${t.progress}/${t.need}`, px + 130 + bw + 8, y + 44, 10, '#888888', 'left');
      // 领取按钮
      const br = { x: px + 214, y: y + 14, w: 88, h: 36, id: t.id };
      if (t.claimed) {
        U.drawPanel(ctx, br.x, br.y, br.w, br.h, 18, '#ddd5c6');
        U.drawText(ctx, '已领取', br.x + br.w / 2, br.y + 18, 12, '#999999', 'center', 'bold');
      } else if (t.done) {
        U.drawPanel(ctx, br.x, br.y, br.w, br.h, 18, '#3aa76d');
        U.drawText(ctx, '领取', br.x + br.w / 2, br.y + 18, 13, '#ffffff', 'center', 'bold');
        this.rects.claims.push(br);
      } else {
        U.drawPanel(ctx, br.x, br.y, br.w, br.h, 18, '#e9e3d8');
        U.drawText(ctx, '进行中', br.x + br.w / 2, br.y + 18, 12, '#a89f92', 'center', 'bold');
      }
    });

    // 每日免费宝箱（不看广告）
    const left = Daily.freeChestLeft(d);
    const cr = { x: px + 14, y: py + 302, w: 302, h: 52 };
    U.drawPanel(ctx, cr.x, cr.y, cr.w, cr.h, 12, left > 0 ? '#e8a33d' : '#f0f0f0');
    U.drawText(ctx, left > 0 ? `🎁 每日免费宝箱：+${C.FREE_CHEST_COINS} 🪙（不用看广告）` : '🎁 今天的免费宝箱已领，明天再来',
      W / 2, cr.y + 26, 13, left > 0 ? '#ffffff' : '#999999', 'center', 'bold');
    this.rects.freeChest = left > 0 ? cr : null;

    const cl = this.rects.dailyClose;
    U.drawPanel(ctx, cl.x, cl.y, cl.w, cl.h, 17, '#f0ebe1');
    U.drawText(ctx, '✕', cl.x + cl.w / 2, cl.y + cl.h / 2, 15, '#999999');
  }

  // 好友摸鱼榜：开放数据域画在 sharedCanvas，主域整体上屏；不可用时回退本地数据
  renderRank(ctx) {
    const d = this.app.databus;
    const W = C.DESIGN_W;
    const H = C.DESIGN_H;
    ctx.fillStyle = 'rgba(30,30,40,0.6)';
    ctx.fillRect(0, 0, W, H);

    const px = (W - 330) / 2;
    const py = 88;
    U.drawPanel(ctx, px, py, 330, 470, 16, '#ffffff');
    U.drawText(ctx, '🏆 好友摸鱼榜', W / 2, py + 34, 19, '#333333', 'center', 'bold');

    const shared = LB.available() ? LB.getSharedCanvas() : null;
    if (shared) {
      ctx.drawImage(shared, px + 5, py + 56, 320, 400);
    } else {
      // 开发者工具模拟器 / 环境不支持：展示本地数据兜底
      U.drawEmoji(ctx, '📱', W / 2, py + 140, 40);
      U.drawText(ctx, `我的最高摸鱼分  ${d.meta.bestScore}`, W / 2, py + 200, 15, '#e8a33d', 'center', 'bold');
      U.drawText(ctx, `最高关卡 第 ${d.meta.bestLevel} 关`, W / 2, py + 232, 13, '#666666');
      U.drawText(ctx, '好友排名需要在手机微信里打开才能看到，', W / 2, py + 290, 12, '#999999');
      U.drawText(ctx, '分享给工友，比比谁更会摸鱼！', W / 2, py + 312, 12, '#999999');
    }

    const cr = this.rects.rankClose;
    U.drawPanel(ctx, cr.x, cr.y, cr.w, cr.h, 17, '#f0ebe1');
    U.drawText(ctx, '✕', cr.x + cr.w / 2, cr.y + cr.h / 2, 15, '#999999');
  }

  renderHelp(ctx) {
    const W = C.DESIGN_W;
    const H = C.DESIGN_H;
    const page = this.helpPages[this.helpPage];
    const last = this.helpPage === this.helpPages.length - 1;

    ctx.fillStyle = 'rgba(30,30,40,0.65)';
    ctx.fillRect(0, 0, W, H);

    const px = (W - 330) / 2;
    const py = 88;
    const pw = 330;
    const ph = 490;
    U.drawPanel(ctx, px, py, pw, ph, 18, '#ffffff');

    U.drawText(ctx, page.title, W / 2, py + 44, 21, '#333333', 'center', 'bold');

    // 文案行
    let y = py + 92;
    if (page.art === 'merge') {
      // 文案与示意图上下排布：示意图占下半
      page.lines.forEach((line) => {
        U.drawText(ctx, line, px + 26, y, 13, '#444444', 'left');
        y += 30;
      });
      y += 10;
      this.drawMergeArt(ctx, W / 2, y + 55);
    } else if (page.art === 'field') {
      // 示意图在上，文案在下
      this.drawFieldArt(ctx, W / 2, py + 150);
      y = py + 250;
      page.lines.forEach((line) => {
        U.drawText(ctx, line, px + 26, y, 13, '#444444', 'left');
        y += 30;
      });
    } else {
      page.lines.forEach((line) => {
        U.drawText(ctx, line, px + 26, y, 13, '#444444', 'left');
        y += 34;
      });
    }

    // 翻页圆点
    const dotY = py + ph - 74;
    this.helpPages.forEach((_, i) => {
      ctx.fillStyle = i === this.helpPage ? '#4a90d9' : '#ddd5c6';
      ctx.beginPath();
      ctx.arc(W / 2 + (i - (this.helpPages.length - 1) / 2) * 18, dotY, 5, 0, Math.PI * 2);
      ctx.fill();
    });

    // 主按钮：下一页 / 完成
    const br = { x: (W - 220) / 2, y: py + ph - 56, w: 220, h: 44 };
    U.drawPanel(ctx, br.x, br.y, br.w, br.h, 22, '#3aa76d');
    U.drawText(ctx, last ? '知道了，开始摸鱼 ▶' : '下一页 ▶', W / 2, br.y + 22, 15, '#ffffff', 'center', 'bold');
    this.rects.helpNext = br;

    // 右上角跳过
    const cr = { x: px + pw - 42, y: py + 10, w: 32, h: 32 };
    U.drawPanel(ctx, cr.x, cr.y, cr.w, cr.h, 16, '#f0ebe1');
    U.drawText(ctx, '✕', cr.x + cr.w / 2, cr.y + cr.h / 2, 15, '#999999');
    this.rects.helpCloseX = cr;
  }

  // 示意图：敌人压向工位
  drawFieldArt(ctx, cx, cy) {
    const enemies = ['🐛', '📋', '📄'];
    enemies.forEach((e, i) => {
      U.drawEmoji(ctx, e, cx + (i - 1) * 60, cy, 30);
    });
    // 向下箭头
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy + 20);
    ctx.lineTo(cx, cy + 46);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy + 40);
    ctx.lineTo(cx, cy + 48);
    ctx.lineTo(cx + 6, cy + 40);
    ctx.stroke();
    // 工位 + 血条
    ctx.fillStyle = '#c9a06a';
    U.roundRectPath(ctx, cx - 70, cy + 54, 140, 22, 6);
    ctx.fill();
    U.drawEmoji(ctx, '💻', cx, cy + 65, 22);
    ctx.fillStyle = '#3aa76d';
    U.roundRectPath(ctx, cx - 70, cy + 82, 140, 8, 4);
    ctx.fill();
    U.drawText(ctx, '工位血条', cx + 92, cy + 86, 10, '#999999', 'left');
  }

  // 示意图：合成
  drawMergeArt(ctx, cx, cy) {
    const tile = (x, emoji, lv, highlight) => {
      U.drawPanel(ctx, x - 28, cy - 28, 56, 56, 10, '#f4efe6', highlight ? '#3aa76d' : '#d8cfc0');
      U.drawEmoji(ctx, emoji, x, cy - 4, 30);
      U.drawPanel(ctx, x - 16, cy + 8, 32, 16, 8, '#9aa5b1');
      U.drawText(ctx, `LV${lv}`, x, cy + 16.5, 10, '#ffffff');
    };
    tile(cx - 90, '☕', 1, true);
    tile(cx - 24, '☕', 1, true);
    // 加号与箭头
    U.drawText(ctx, '+', cx - 57, cy, 20, '#999999', 'center', 'bold');
    ctx.strokeStyle = '#3aa76d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx + 14, cy);
    ctx.lineTo(cx + 44, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 38, cy - 6);
    ctx.lineTo(cx + 46, cy);
    ctx.lineTo(cx + 38, cy + 6);
    ctx.stroke();
    tile(cx + 90, '☕', 2, false);
    U.drawText(ctx, '合体升级！', cx, cy + 52, 12, '#3aa76d', 'center', 'bold');
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
