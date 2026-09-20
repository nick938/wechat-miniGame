/**
 * 战斗场景：战场刷怪 / 武器结算 / 弹丸与爆炸命中 / HUD / 暂停与复活 / 新手引导
 */
const C = require('../core/config');
const U = require('../core/utils');
const Enemy = require('../entities/enemy');
const { Projectile, Bomb } = require('../entities/projectile');
const Fx = require('../entities/fx');
const WeaponSys = require('../systems/weapon');
const Skills = require('../systems/skills');
const WaveCtl = require('../systems/waves');
const Daily = require('../systems/daily');
const Ach = require('../systems/achievements');
const { track } = require('../services/track');
const { Board, cellRect, cellAt } = require('./board');
const LevelUp = require('./levelup');
const Result = require('./result');

const PAUSE_BTN = { x: C.DESIGN_W - 46, y: 8, w: 38, h: 38 };
const SPEED_BTN = { x: C.DESIGN_W - 90, y: 8, w: 38, h: 38 };
const DESK_Y = C.BASE_Y - 14;

class BattleScene {
  constructor(app) {
    this.app = app; // {databus, audio, adService, goHome()}
    this.waves = null;
    this.board = null;
    this.spawnQueue = [];
  }

  start(levelIndex) {
    const d = this.app.databus;
    const b = d.newBattle(levelIndex);
    this.waves = new WaveCtl(b.cfg);
    this.board = new Board(b);
    // 新手手把手教学：仅第 1 关且未完成过
    this.tutorial = (!d.meta.tutorialDone && levelIndex === 1)
      ? { step: 'merge', t: 0 }
      : null;
    this.board.onMerge = (idx, item) => {
      U.vibrate();
      this.app.audio.playHit();
      this.b.merges++;                             // 每日任务「合成 N 次」用
      if (item.lv > this.b.maxLv) this.b.maxLv = item.lv; // 成就「LV5 达成」用
      track('weapon_merge', { lv: item.lv, type: item.type });
      this.addFx('ring', WeaponSys.cellCenterX(idx), WeaponSys.cellCenterY(idx), { r1: 34, color: '#69cd8c' });
      this.addFx('text', WeaponSys.cellCenterX(idx), WeaponSys.cellCenterY(idx) - 24, {
        text: `${C.WEAPONS[item.type].name} LV${item.lv}`, color: '#3aa76d', size: 12,
      });
      // 教学第 1 步完成：解锁刷怪
      if (this.tutorial && this.tutorial.step === 'merge') {
        this.tutorial.step = 'auto';
        this.tutorial.t = 0;
        d.meta.tutorialDone = true;
        d.saveMeta();
      }
    };
    // 拖到桌面回收条：装备换金币（有舍才有得，也是棋盘堵住时的手动出路）
    this.board.onRecycle = (idx, item) => {
      const coins = C.recycleCoins(item.lv);
      this.b.coins += coins;
      U.vibrate();
      this.app.audio.playHit();
      this.addFx('text', WeaponSys.cellCenterX(idx), WeaponSys.cellCenterY(idx) - 20, {
        text: `♻️ +${coins} 🪙`, color: '#e8a33d', size: 16,
      });
      track('weapon_recycle', { lv: item.lv, coins });
    };
    WeaponSys.reset();
    this.app.audio.playBgm();
    d.scene = 'battle';
    track('level_start', { level: levelIndex });
  }

  get b() {
    return this.app.databus.battle;
  }

  // ---------- 生成与结算 ----------
  spawnEnemy(type, col) {
    const d = this.app.databus;
    const b = d.battle;
    if (b.enemies.length > 80) return;
    const e = d.pool.getItemByClass('enemy', Enemy);
    // 主攻列：这一波的怪集中落在该列（±带内），其余随机撒开
    let x = null;
    if (col != null && col >= 0) {
      const cx = WeaponSys.cellCenterX(col);
      x = U.clamp(cx + U.rand(-C.HOT_COL_BAND, C.HOT_COL_BAND), 20, C.DESIGN_W - 20);
      b.hotCol = { col, t: C.HOT_COL_SHOW_SEC };
      if (!b.hotColTipShown) {
        b.hotColTipShown = true;
        this.showHint('这波从红色那列涌来：把键盘拖过去能穿一整列');
        track('hot_col', { col });
      }
    }
    e.init(type, b.cfg, b.mods, x);
    b.enemies.push(e);
    if (e.boss) {
      b.bossRef = e;
      this.addFx('text', C.DESIGN_W / 2, C.BASE_Y - 120, { text: `${e.cfg.name}来了！`, color: '#ff6b6b', size: 22 });
      this.app.audio.playBoom();
      U.vibrate();
      track('boss_spawn', { level: b.level, type });
    }
  }

  spawnBossMinions(boss) {
    const n = boss.cfg.summonCount || 2;
    for (let i = 0; i < n; i++) {
      this.spawnQueue.push('request');
    }
    this.addFx('text', boss.x, boss.y - 50, { text: `疯狂加需求！×${n}`, color: '#e8a33d', size: 13 });
  }

  // 直属领导"催进度"：全场敌人短时加速（用 rallyUntil 自动过期，不需要回收）
  rallyEnemies(boss) {
    const b = this.b;
    const boost = boss.cfg.rallyBoost || 1.3;
    const sec = boss.cfg.rallySec || 3;
    for (const e of b.enemies) {
      e.rallyMul = boost;
      e.rallyUntil = b.time + sec;
    }
    this.addFx('text', C.DESIGN_W / 2, C.BASE_Y - 90, { text: '催进度！全场加速', color: '#ff6b6b', size: 15 });
    track('boss_rally', { level: b.level, type: boss.type });
  }

  spawnProjectile(kind, x, y, opts) {
    const d = this.app.databus;
    const b = this.b;
    if (b.projectiles.length >= C.PROJ_MAX) return; // 弹丸硬上限（叠加攻速后兜底）
    const p = d.pool.getItemByClass('proj', Projectile).init(kind, x, y, opts);
    b.projectiles.push(p);
  }

  spawnBomb(x, y, dmg, radius, fuse) {
    const d = this.app.databus;
    const bomb = d.pool.getItemByClass('bomb', Bomb).init(x, y, dmg, radius, fuse);
    this.b.bombs.push(bomb);
  }

  damageEnemy(e, dmg, showNum = true) {
    const b = this.b;
    const mods = b.mods;
    let d = dmg;
    let crit = false;
    // 手气不错：命中概率暴击（打谁都算，爆炸也会暴击）
    if (mods.crit > 0 && Math.random() < mods.crit) {
      d *= 3;
      crit = true;
    }
    e.takeDamage(d);
    // 冷处理：命中即冰缓（持续时间内敌人走得慢，宽面武器收益更高）
    if (mods.chill > 0) {
      e.chillT = 1.5;
      e.chillMul = 1 - mods.chill;
    }
    // 伤害飘字（耳机持续音免展示；特效池过载时丢弃保帧率）
    if (showNum && this.b.fxs.length < 40) {
      this.addFx('text', e.x + U.rand(-10, 10), e.y - e.r - 6, {
        text: crit ? `${Math.round(d)}!` : String(Math.round(d)),
        color: crit ? '#ffd166' : '#ffffff',
        size: crit ? 14 : 10,
        life: crit ? 0.55 : 0.45,
      });
    }
  }

  explodeAt(x, y, dmg, radius) {
    this.addFx('boom', x, y, { r1: radius, color: '#ffb14a' });
    this.app.audio.playBoom();
    for (const e of this.b.enemies) {
      if (!e.dying && U.dist(x, y, e.x, e.y) < radius + e.r) {
        this.damageEnemy(e, dmg);
      }
    }
  }

  onEnemyKilled(e) {
    const b = this.b;
    b.kills++;
    b.killsByType[e.type] = (b.killsByType[e.type] || 0) + 1; // 图鉴统计
    b.coins += Math.max(1, Math.round(e.coin * b.mods.coinMul));

    // 击杀小爆点（打击感）
    this.addFx('boom', e.x, e.y, { r0: 4, r1: e.r + 12, color: '#ffffff', life: 0.25 });
    if (!e.boss) this.app.audio.playHit();
    const levels = Skills.gainExp(b, e.exp);
    if (levels > 0) b.pendingLevels += levels;

    // 分裂：产品需求 → 3 个小需求
    if (e.splitLeft) {
      for (let i = 0; i < e.splitLeft; i++) {
        this.spawnQueue.push('mini');
      }
    }
    // 优化毕业：击杀引爆周围
    if (b.mods.killExplode > 0 && Math.random() < b.mods.killExplode) {
      this.explodeAt(e.x, e.y, Math.round(e.hpMax * 0.3), 70);
    }
    // 摸鱼回血：击杀回一点工位血（配合清场快的 build 才能续航）
    if (b.mods.lifesteal > 0 && b.baseHp < b.baseHpMax) {
      b.baseHp = Math.min(b.baseHpMax, b.baseHp + b.mods.lifesteal);
    }
    if (e.boss) {
      b.bossRef = null;
      this.addFx('text', e.x, e.y, { text: `+${Math.round(e.coin * b.mods.coinMul)} 🪙`, color: '#e8a33d', size: 18 });
      this.app.audio.playBoom();
      // 打死 Boss 得升星券：给玩家一次"想升谁就升谁"的定向决策
      if (b.starTickets < C.STAR_TICKET_MAX) {
        b.starTickets += C.STAR_TICKET_PER_BOSS;
        this.addFx('text', C.DESIGN_W / 2, C.BASE_Y - 60, { text: '⬆️ 升星券 +1', color: '#9b59d0', size: 16 });
        this.showHint('拿到升星券：点 ⬆️ 再点装备，直接升一级');
      }
      track('star_ticket', { level: b.level, tickets: b.starTickets });
    }
    this.app.databus.pool.recover('enemy', e);
  }

  addFx(kind, x, y, opts) {
    const d = this.app.databus;
    const b = this.b;
    if (b && b.fxs.length >= C.FX_MAX) return; // 统一的特效上限，防群杀瞬间堆爆
    const fx = d.pool.getItemByClass('fx', Fx).init(kind, x, y, opts);
    b.fxs.push(fx);
  }

  // 一句话提示条（棋盘满了之类），到点自动消失
  showHint(text) {
    const b = this.b;
    if (b) b.hint = { text, t: C.HINT_SEC };
  }

  checkPendingLevels() {
    const b = this.b;
    if (!b.modal && b.pendingLevels > 0) {
      LevelUp.open(b);
      // 玩家第一次见到三选一：加一行教学提示
      if (!this.app.databus.meta.skillTipDone && b.modal) {
        b.modal.skillTip = true;
      }
    }
  }

  // ---------- 主更新 ----------
  // 倍速驱动：把 dt×速度 拆成 ≤33ms 的子步进跑，避免高速下弹丸穿模
  update(dt) {
    const b = this.b;
    if (!b || b.modal) return;
    let remaining = dt * (b.speed || 1);
    while (remaining > 1e-6 && !b.modal) {
      const s = Math.min(0.033, remaining);
      this.simStep(s);
      remaining -= s;
    }
  }

  simStep(dt) {
    const d = this.app.databus;
    const b = d.battle;
    if (!b || b.modal) return;

    b.time += dt;
    b.timeLeft = Math.max(0, b.timeLeft - dt);
    if (this.tutorial) this.tutorial.t += dt;
    if (b.hint) {
      b.hint.t -= dt;
      if (b.hint.t <= 0) b.hint = null;
    }
    if (b.hotCol) {
      b.hotCol.t -= dt;
      if (b.hotCol.t <= 0) b.hotCol = null;
    }

    const inMergeLesson = this.tutorial && this.tutorial.step === 'merge';
    if (!inMergeLesson) {
      // 刷怪
      this.waves.setElapsed(b.time);
      this.waves.update(dt, b.mods).forEach((sp) => this.spawnEnemy(sp.type, sp.col));
      while (this.spawnQueue.length) {
        this.spawnEnemy(this.spawnQueue.pop());
      }

      // Boss 前预警：让玩家有时间整理棋盘（合成/回收），而不是被突然查岗打死
      const bossAt = b.cfg.bossAt;
      if (bossAt && b.time < bossAt) {
        const left = bossAt - b.time;
        if (left <= C.BOSS_WARN_SEC) {
          b.bossWarn = Math.ceil(left);
          if (!b.bossWarned) {
            b.bossWarned = true;
            track('boss_warning', { level: b.level, sec: Math.round(left) });
          }
        }
      } else if (b.bossWarn) {
        b.bossWarn = 0;                             // Boss 已出场：撤掉预警
      }

      // 补给投放
      b.supplyTimer -= dt;
      if (b.supplyTimer <= 0) {
        b.supplyTimer = C.SUPPLY_INTERVAL;
        const pos = this.board.dropSupply(U.pick(C.WEAPON_TYPES));
        if (pos) {
          this.addFx('ring', pos.x, pos.y, { r1: 34, color: '#69cd8c' });
          this.addFx('text', pos.x, pos.y - 20, { text: '新装备！', color: '#3aa76d', size: 12 });
        } else {
          // 棋盘满了：别静默丢弃，明确告诉玩家怎么腾位置
          this.showHint('棋盘满了！拖一件到桌面 ♻️ 换金币腾位置');
          track('board_full', { level: b.level });
        }
      }
    }

    // 带薪如厕回血
    if (b.mods.regen > 0) {
      b.regenAcc += dt;
      if (b.regenAcc >= 5) {
        b.regenAcc -= 5;
        b.baseHp = Math.min(b.baseHpMax, b.baseHp + b.mods.regen);
      }
    }

    // 武器攻击
    WeaponSys.update(this, dt, b.time);

    // 弹丸移动与命中（原地压缩数组，避免每帧新建）
    for (const p of b.projectiles) {
      p.update(dt, b.enemies);
      if (p.dead) continue;
      for (const e of b.enemies) {
        if (e.dying) continue;
        if (p.kind === 'bean') {
          if (U.dist(p.x, p.y, e.x, e.y) < e.r + 6) {
            this.damageEnemy(e, p.dmg);
            if (p.pierce > 0) p.pierce--;
            else p.dead = true;
            break;
          }
        } else if (Math.abs(p.x - e.x) < p.width / 2 + e.r * 0.6 && !p.hitSet[e.id]) {
          p.hitSet[e.id] = 1;
          this.damageEnemy(e, p.dmg);
        }
      }
    }
    let pw = 0;
    for (let i = 0; i < b.projectiles.length; i++) {
      const p = b.projectiles[i];
      if (p.dead) { d.pool.recover('proj', p); continue; }
      b.projectiles[pw++] = p;
    }
    b.projectiles.length = pw;

    // 炸弹引爆
    for (const bomb of b.bombs) {
      bomb.update(dt);
      if (bomb.dead) {
        this.explodeAt(bomb.x, bomb.y, bomb.dmg, bomb.radius);
        d.pool.recover('bomb', bomb);
      }
    }
    let bw = 0;
    for (let i = 0; i < b.bombs.length; i++) {
      const bomb = b.bombs[i];
      if (bomb.dead) continue;
      b.bombs[bw++] = bomb;
    }
    b.bombs.length = bw;

    // 敌人（Boss 的召唤/狂暴特效在这里统一结算）
    for (const e of b.enemies) {
      if (!e.dying) e.update(dt, b);
      if (e.summonNow) {
        e.summonNow = false;
        this.spawnBossMinions(e);
      }
      if (e.rallyNow) {
        e.rallyNow = false;
        this.rallyEnemies(e);
      }
      if (e.justEnraged) {
        e.justEnraged = false;
        this.addFx('text', e.x, e.y - 40, { text: '需求爆发！', color: '#ff6b6b', size: 14 });
      }
    }
    // 死亡结算（可能引发连锁：分裂/爆炸）
    // 一帧内把整条连锁清干净：每轮至少移除一个 dying 敌人、且本轮不会往 b.enemies 里加新敌人，
    // 所以必然收敛；guard 只是防意外死循环的兜底（固定轮数上限会让长连锁跨帧慢慢消化）
    let guard = b.enemies.length + 1;
    while (guard-- > 0 && b.enemies.some((e) => e.dying)) {
      const dying = b.enemies.filter((e) => e.dying);
      b.enemies = b.enemies.filter((e) => !e.dying);
      for (const e of dying) this.onEnemyKilled(e);
    }

    // 有待选的升级就弹三选一
    this.checkPendingLevels();

    // 特效（原地压缩）
    for (const fx of b.fxs) fx.update(dt);
    let fw = 0;
    for (let i = 0; i < b.fxs.length; i++) {
      const fx = b.fxs[i];
      if (fx.dead) { d.pool.recover('fx', fx); continue; }
      b.fxs[fw++] = fx;
    }
    b.fxs.length = fw;

    // 失败 → 复活或结算
    if (b.baseHp <= 0) {
      b.baseHp = 0;
      if (!b.revived) {
        b.modal = { type: 'revive', rects: {}, justOpened: true };
      } else {
        this.openResult(false);
      }
      return;
    }

    // 胜利：时间到 + 清场 + 波次放完
    if (b.timeLeft <= 0 && b.enemies.length === 0 && this.waves.done && !this.spawnQueue.length) {
      b.winBonus = 30 + 10 * b.level;
      b.coins += b.winBonus;
      this.openResult(true);
    }
  }

  openResult(win) {
    this.app.audio.stopBgm();
    track('level_end', { level: this.b.level, win: win ? 1 : 0, kills: this.b.kills });
    Result.open(this, win);
  }

  // ---------- 触摸 ----------
  onTouchStart(x, y) {
    const b = this.b;
    if (!b) return;
    if (b.modal) {
      if (b.modal.type === 'levelup') LevelUp.onTouch(this, x, y);
      else if (b.modal.type === 'result') Result.onTouch(this, x, y);
      else if (b.modal.type === 'pause') this.pauseTouch(x, y);
      else if (b.modal.type === 'revive') this.reviveTouch(x, y);
      return;
    }
    const hit = (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    const inMergeLesson = this.tutorial && this.tutorial.step === 'merge';
    // 升星：点 ⬆️ 进入选择状态，再点一件装备直接升一级（先于拖拽判定，避免误拖）
    if (!inMergeLesson && b.starTickets > 0 && hit(C.STAR_BTN)) {
      b.starArmed = !b.starArmed;
      if (b.starArmed) this.showHint('选一件装备升一级（点棋盘上的装备）');
      return;
    }
    if (b.starArmed) {
      const ci = cellAt(x, y);
      const item = ci >= 0 ? b.board.cells[ci] : null;
      if (item) {
        if (item.lv < C.MAX_WEAPON_LV) {
          item.lv++;
          b.starTickets--;
          b.starArmed = b.starTickets > 0;
          if (item.lv > b.maxLv) b.maxLv = item.lv;
          U.vibrate();
          this.app.audio.playHit();
          this.addFx('ring', WeaponSys.cellCenterX(ci), WeaponSys.cellCenterY(ci), { r1: 38, color: '#9b59d0' });
          this.addFx('text', WeaponSys.cellCenterX(ci), WeaponSys.cellCenterY(ci) - 26, {
            text: `⬆️ ${C.WEAPONS[item.type].name} LV${item.lv}`, color: '#9b59d0', size: 14,
          });
          track('weapon_starup', { lv: item.lv, type: item.type });
        } else {
          this.showHint('这件已经满级了（LV5），换一件');
        }
        return;
      }
      // 点到棋盘外：取消选择，不当成误操作
      b.starArmed = false;
      return;
    }
    if (!inMergeLesson && hit(SPEED_BTN)) {
      // 倍速循环 ×1 → ×2 → ×3 → ×1，偏好存档
      const steps = C.SPEED_STEPS;
      b.speed = steps[(steps.indexOf(b.speed) + 1) % steps.length] || 1;
      this.app.databus.meta.speed = b.speed;
      this.app.databus.saveMeta();
      return;
    }
    if (hit(PAUSE_BTN)) {
      b.modal = { type: 'pause', rects: {}, justOpened: true };
      return;
    }
    this.board.onTouchStart(x, y);
  }

  onTouchMove(x, y) {
    const b = this.b;
    if (!b || b.modal) return;
    this.board.onTouchMove(x, y);
  }

  onTouchEnd(x, y) {
    const b = this.b;
    if (!b || b.modal) return;
    this.board.onTouchEnd(x, y);
  }

  // 中途重开/退出：本局已得金币入账，不让玩家白打
  settleAbandon() {
    const d = this.app.databus;
    const b = d.battle;
    if (!b || b.settled) return;
    b.settled = true;
    // 中途退出也算每日任务进度（合成/击杀不白费），但没有"通关"这一项
    Daily.flush(d, { win: false, kills: b.kills, merges: b.merges });
    Ach.flush(d, {
      win: false, kills: b.kills, merges: b.merges, recycled: b.recycled,
      maxLv: b.maxLv, killsByType: b.killsByType,
    });
    if (b.coins > 0) {
      d.meta.coins += b.coins;
      d.meta.totalKills += b.kills;
      d.saveMeta();
      if (typeof wx !== 'undefined' && wx.showToast) {
        wx.showToast({ title: `已保存本局金币 +${b.coins} 🪙`, icon: 'none' });
      }
    }
  }

  pauseTouch(x, y) {
    const b = this.b;
    const m = b.modal;
    if (m.justOpened) { m.justOpened = false; return; }
    const hit = (r) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    const R = m.rects;
    if (hit(R.resume)) {
      b.modal = null;
    } else if (hit(R.retry)) {
      this.settleAbandon();
      b.modal = null;
      this.start(b.level);
    } else if (hit(R.home)) {
      this.settleAbandon();
      b.modal = null;
      this.exitToHome();
    } else if (hit(R.sound)) {
      const d = this.app.databus;
      d.meta.soundOn = !d.meta.soundOn;
      d.saveMeta();
      this.app.audio.setEnabled(d.meta.soundOn);
    }
  }

  reviveTouch(x, y) {
    const b = this.b;
    const m = b.modal;
    if (m.justOpened) { m.justOpened = false; return; }
    const hit = (r) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    if (hit(m.rects.revive)) {
      this.app.adService.show('revive', () => {
        b.revived = true;
        b.baseHp = Math.round(b.baseHpMax * 0.5);
        // 把压境的敌人击退重进
        for (const e of b.enemies) {
          e.attacking = false;
          e.y = -20;
          e.baseX = U.rand(30, C.DESIGN_W - 30);
        }
        this.addFx('text', C.DESIGN_W / 2, C.BASE_Y - 80, { text: '元气恢复！继续摸鱼', color: '#3aa76d', size: 18 });
        b.modal = null;
      });
    } else if (hit(m.rects.giveup)) {
      b.modal = null;
      this.openResult(false);
    }
  }

  exitToHome() {
    this.app.audio.stopBgm();
    this.app.goHome();
  }

  // ---------- 渲染 ----------
  render(ctx) {
    const d = this.app.databus;
    const b = d.battle;
    if (!b) return;
    const W = C.DESIGN_W;

    this.renderField(ctx);
    for (const bomb of b.bombs) bomb.render(ctx);
    for (const e of b.enemies) e.render(ctx, b.time);
    for (const p of b.projectiles) p.render(ctx);
    this.renderOrbs(ctx);
    this.renderDesk(ctx);
    this.board.render(ctx);
    for (const fx of b.fxs) fx.render(ctx);
    this.renderHud(ctx);
    if (b.bossRef) this.renderBossBar(ctx);
    this.renderTutorial(ctx);
    this.renderBossWarn(ctx);
    this.renderHint(ctx);

    if (b.modal) {
      if (b.modal.type === 'levelup') LevelUp.render(ctx, b);
      else if (b.modal.type === 'result') Result.render(ctx, this);
      else if (b.modal.type === 'pause') this.renderPause(ctx);
      else if (b.modal.type === 'revive') this.renderRevive(ctx);
    }
  }

  renderField(ctx) {
    // 静态背景缓存：地毯条纹 + 工位桌面只画一次，之后每帧 drawImage 上屏
    // （拿不到离屏画布就退回逐帧绘制，行为完全一致）
    if (!this.fieldLayer) this.fieldLayer = this.buildFieldLayer();
    if (this.fieldLayer) {
      ctx.drawImage(this.fieldLayer.canvas, 0, C.HUD_H, C.DESIGN_W, C.BASE_Y - C.HUD_H);
    } else {
      this.paintField(ctx);
    }
    // 主攻列预警带是动态的，每帧画在缓存之上
    const hc = this.b.hotCol;
    if (hc) {
      const cx = WeaponSys.cellCenterX(hc.col);
      ctx.globalAlpha = 0.14 * Math.min(1, hc.t / 1);
      ctx.fillStyle = '#ff4d4d';
      ctx.fillRect(cx - C.HOT_COL_BAND, C.HUD_H, C.HOT_COL_BAND * 2, C.BASE_Y - C.HUD_H);
      ctx.globalAlpha = 1;
      U.drawText(ctx, '▼', cx, C.HUD_H + 12, 16, 'rgba(255,77,77,0.9)');
    }
  }

  // 把静态部分画进离屏画布（只做一次）
  buildFieldLayer() {
    const screen = GameGlobal.screen;
    if (!screen || !screen.createOffscreen) return null;
    const layer = screen.createOffscreen(C.DESIGN_W, C.BASE_Y - C.HUD_H);
    if (!layer) return null;
    const c = layer.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.translate(0, -C.HUD_H);      // 用屏幕坐标画，省得换算
    this.paintField(c);
    c.setTransform(1, 0, 0, 1, 0, 0);
    return layer;
  }

  // 静态部分的实际画法（离屏与回退路径共用同一份代码）
  paintField(ctx) {
    ctx.fillStyle = '#f0ebe1';
    ctx.fillRect(0, C.HUD_H, C.DESIGN_W, C.BASE_Y - C.HUD_H);
    ctx.fillStyle = 'rgba(210,200,185,0.35)';
    for (let y = C.HUD_H; y < C.BASE_Y; y += 36) {
      ctx.fillRect(0, y, C.DESIGN_W, 18);
    }
  }

  renderDesk(ctx) {
    const b = this.b;
    // 工位桌面
    ctx.fillStyle = '#c9a06a';
    ctx.fillRect(0, DESK_Y, C.DESIGN_W, C.BOARD_Y0 - DESK_Y);
    ctx.fillStyle = '#b78c58';
    ctx.fillRect(0, DESK_Y, C.DESIGN_W, 5);
    U.drawEmoji(ctx, '💻', C.DESIGN_W / 2, DESK_Y - 16, 26);

    // 工位生命条
    const ratio = U.clamp(b.baseHp / b.baseHpMax, 0, 1);
    const bw = C.DESIGN_W - 60;
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    U.roundRectPath(ctx, 30, DESK_Y - 34, bw, 10, 5);
    ctx.fill();
    ctx.fillStyle = ratio > 0.4 ? '#3aa76d' : '#ff6b6b';
    U.roundRectPath(ctx, 30, DESK_Y - 34, bw * ratio, 10, 5);
    ctx.fill();
    if (b.baseShield > 0) {
      ctx.fillStyle = 'rgba(126,200,255,0.75)';
      U.roundRectPath(ctx, 30, DESK_Y - 34, bw * U.clamp(b.baseShield / b.baseHpMax, 0, 1), 10, 5);
      ctx.fill();
    }
    U.drawText(ctx, '🛡', 20, DESK_Y - 29, 12, '#666666');
  }

  renderOrbs(ctx) {
    const b = this.b;
    for (const key of Object.keys(b.orbs)) {
      const st = b.orbs[key];
      const cfg = C.WEAPONS.headphone;
      const item = b.board.cells[key];
      if (!item) continue;
      const n = cfg.orbs[item.lv - 1];
      for (let k = 0; k < n; k++) {
        const ox = st['x' + k];
        const oy = st['y' + k];
        if (ox == null) continue;
        ctx.fillStyle = 'rgba(126,200,255,0.85)';
        ctx.beginPath();
        ctx.arc(ox, oy, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#4a90d9';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  renderHud(ctx) {
    const b = this.b;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, C.DESIGN_W, C.HUD_H);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, C.HUD_H - 2, C.DESIGN_W, 2);

    U.drawText(ctx, `${b.level}-${b.cfg.name}`, 12, 20, 15, '#333333', 'left', 'bold');
    const t = Math.ceil(b.timeLeft);
    U.drawText(ctx, `⏱ ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, 12, 40, 13, '#666666', 'left');
    U.drawText(ctx, `🪙 ${b.coins}`, C.DESIGN_W / 2 + 20, 20, 15, '#e8a33d', 'center', 'bold');
    U.drawText(ctx, `Lv.${b.charLevel}`, C.DESIGN_W / 2 + 20, 40, 11, '#888888');

    // 暂停按钮
    U.drawPanel(ctx, PAUSE_BTN.x, PAUSE_BTN.y, PAUSE_BTN.w, PAUSE_BTN.h, 10, '#f0ebe1');
    U.drawText(ctx, '⏸', PAUSE_BTN.x + PAUSE_BTN.w / 2, PAUSE_BTN.y + PAUSE_BTN.h / 2, 18, '#666666');

    // 倍速按钮（新手合成教学阶段隐藏：开局没怪，快进无意义）
    if (!(this.tutorial && this.tutorial.step === 'merge')) {
      const hot = b.speed > 1;
      U.drawPanel(ctx, SPEED_BTN.x, SPEED_BTN.y, SPEED_BTN.w, SPEED_BTN.h, 10,
        hot ? '#e8a33d' : '#f0ebe1');
      U.drawText(ctx, `×${b.speed}`, SPEED_BTN.x + SPEED_BTN.w / 2, SPEED_BTN.y + SPEED_BTN.h / 2, 14,
        hot ? '#ffffff' : '#666666', 'center', 'bold');
      // 升星券按钮：有券才显示，选装备状态高亮
      if (b.starTickets > 0) {
        const B = C.STAR_BTN;
        U.drawPanel(ctx, B.x, B.y, B.w, B.h, 10, b.starArmed ? '#9b59d0' : '#f0ebe1');
        U.drawText(ctx, `⬆️${b.starTickets}`, B.x + B.w / 2, B.y + B.h / 2, 13,
          b.starArmed ? '#ffffff' : '#666666', 'center', 'bold');
      }
    }

    // 经验条
    const need = C.expNeed(b.charLevel);
    ctx.fillStyle = 'rgba(74,144,217,0.15)';
    ctx.fillRect(0, C.HUD_H - 4, C.DESIGN_W, 4);
    ctx.fillStyle = '#4a90d9';
    ctx.fillRect(0, C.HUD_H - 4, C.DESIGN_W * U.clamp(b.exp / need, 0, 1), 4);
  }

  renderBossBar(ctx) {
    const boss = this.b.bossRef;
    if (!boss) return;
    const w = C.DESIGN_W - 80;
    const y = C.HUD_H + 8;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    U.roundRectPath(ctx, 40, y, w, 12, 6);
    ctx.fill();
    ctx.fillStyle = boss.enraged ? '#ff4d4d' : '#ff6b6b';
    U.roundRectPath(ctx, 40, y, w * U.clamp(boss.hp / boss.hpMax, 0, 1), 12, 6);
    ctx.fill();
    U.drawText(ctx, `${boss.cfg.emoji} ${boss.cfg.name}${boss.enraged ? '（狂暴）' : ''}`, C.DESIGN_W / 2, y - 4, 11, '#a33', 'center', 'bold');
  }

  // 提示条（棋盘满了之类）：橙色横幅，最后一小段淡出
  renderHint(ctx) {
    const h = this.b.hint;
    if (!h) return;
    const W = C.DESIGN_W;
    const y = C.HUD_H + 40;
    ctx.globalAlpha = 0.93 * Math.min(1, h.t / 0.5);
    U.drawPanel(ctx, W / 2 - 154, y, 308, 36, 18, 'rgba(232,163,61,0.95)');
    U.drawText(ctx, h.text, W / 2, y + 18, 13, '#ffffff', 'center', 'bold');
    ctx.globalAlpha = 1;
  }

  // Boss 前预警：红色倒计时，提醒玩家把棋盘收拾好（合成/回收）
  renderBossWarn(ctx) {
    const b = this.b;
    if (!b.bossWarn || b.bossWarn <= 0) return;
    const W = C.DESIGN_W;
    const y = C.HUD_H + 40;
    U.drawPanel(ctx, W / 2 - 150, y, 300, 34, 17, 'rgba(255,77,77,0.92)');
    U.drawText(ctx, `⚠️ ${b.bossWarn} 秒后老板来查岗！整理棋盘`, W / 2, y + 17, 13, '#ffffff', 'center', 'bold');
  }

  renderTutorial(ctx) {
    const t = this.tutorial;
    if (!t) return;
    const b = this.b;

    const banner = (text) => {
      const W = C.DESIGN_W;
      const y = C.HUD_H + 40;
      ctx.globalAlpha = 0.95;
      U.drawPanel(ctx, W / 2 - 150, y, 300, 38, 19, 'rgba(0,0,0,0.6)');
      U.drawText(ctx, text, W / 2, y + 19, 14, '#ffffff');
      ctx.globalAlpha = 1;
    };

    if (t.step === 'merge') {
      // 找到一对同类同级装备（玩家拖乱了也能动态适应）
      const cells = b.board.cells;
      const groups = {};
      cells.forEach((c, i) => {
        if (c) (groups[c.type + c.lv] = groups[c.type + c.lv] || []).push(i);
      });
      const pairKey = Object.keys(groups).find((k) => groups[k].length >= 2);
      if (!pairKey) return;
      const ra = cellRect(groups[pairKey][0]);
      const rb = cellRect(groups[pairKey][1]);

      // 两个目标格呼吸描边
      const pulse = 0.5 + 0.5 * Math.sin(t.t * 4);
      ctx.strokeStyle = `rgba(58,167,109,${0.45 + 0.45 * pulse})`;
      ctx.lineWidth = 3;
      [ra, rb].forEach((r) => {
        U.roundRectPath(ctx, r.x - 3, r.y - 3, r.w + 6, r.h + 6, 13);
        ctx.stroke();
      });

      // 轨迹虚线 + 往返滑动的手指光点
      const ax = ra.x + ra.w / 2;
      const ay = ra.y + ra.h / 2;
      const bx = rb.x + rb.w / 2;
      const by = rb.y + rb.h / 2;
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = 'rgba(74,144,217,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.setLineDash([]);

      const cyc = (t.t % 2.2) / 2.2;
      const ease = cyc < 0.4 ? cyc / 0.4 : (cyc < 0.6 ? 1 : 1 - (cyc - 0.6) / 0.4);
      const fx = ax + (bx - ax) * ease;
      const fy = ay + (by - ay) * ease;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.arc(fx, fy, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#4a90d9';
      ctx.lineWidth = 3;
      ctx.stroke();
      U.drawEmoji(ctx, '👆', fx, fy - 24, 20);

      banner('👆 按住 [咖啡]，拖到另一个 [咖啡] 上合成！');
    } else if (t.step === 'auto') {
      if (t.t < 4) {
        banner('装备会自动攻击，守住你的工位！');
      } else {
        this.tutorial = null; // 剩下的靠第一次三选一提示与“新装备”飘字
      }
    }
  }

  renderPause(ctx) {
    const b = this.b;
    const m = b.modal;
    const W = C.DESIGN_W;
    const H = C.DESIGN_H;
    ctx.fillStyle = 'rgba(30,30,40,0.55)';
    ctx.fillRect(0, 0, W, H);
    U.drawPanel(ctx, W / 2 - 130, H / 2 - 170, 260, 340, 16, '#ffffff');
    U.drawText(ctx, '⏸ 摸鱼中', W / 2, H / 2 - 128, 20, '#333333', 'center', 'bold');
    U.drawText(ctx, `摸鱼分 ${C.calcScore(b)}`, W / 2, H / 2 - 104, 13, '#e8a33d', 'center', 'bold');

    // 技能清单
    let sy = H / 2 - 76;
    if (b.skills.length) {
      for (const s of b.skills) {
        const cfg = Skills.skillOf(b, s.id);
        U.drawText(ctx, `${cfg.name} ×${s.stacks}`, W / 2, sy, 12, '#666666');
        sy += 18;
        if (sy > H / 2 + 10) break;
      }
    } else {
      U.drawText(ctx, '还没有技能，升级吧', W / 2, sy, 12, '#bbbbbb');
      sy += 18;
    }

    const rects = {};
    const btn = (key, y, text, fill, color) => {
      rects[key] = { x: W / 2 - 110, y, w: 220, h: 42 };
      U.drawPanel(ctx, W / 2 - 110, y, 220, 42, 21, fill);
      U.drawText(ctx, text, W / 2, y + 21, 14, color, 'center', 'bold');
    };
    let y = H / 2 + 26;
    btn('resume', y, '继续摸鱼 ▶', '#3aa76d', '#ffffff');
    y += 50;
    btn('retry', y, '重开本关 🔁', '#4a90d9', '#ffffff');
    y += 50;
    btn('sound', y, `音效：${this.app.databus.meta.soundOn ? '开' : '关'}`, '#f0ebe1', '#666666');
    y += 50;
    btn('home', y, '回首页 🏠', '#e5ded2', '#666666');
    m.rects = rects;
  }

  renderRevive(ctx) {
    const b = this.b;
    const m = b.modal;
    const W = C.DESIGN_W;
    const H = C.DESIGN_H;
    ctx.fillStyle = 'rgba(30,30,40,0.6)';
    ctx.fillRect(0, 0, W, H);
    U.drawPanel(ctx, W / 2 - 140, H / 2 - 150, 280, 300, 16, '#ffffff');
    U.drawText(ctx, '😵 工位要被占领了！', W / 2, H / 2 - 100, 20, '#ff6b6b', 'center', 'bold');
    U.drawText(ctx, '看个广告回半血复活，', W / 2, H / 2 - 60, 14, '#666666');
    U.drawText(ctx, '敌人全部击退回入口', W / 2, H / 2 - 38, 14, '#666666');

    const rr = { x: W / 2 - 110, y: H / 2 + 0, w: 220, h: 48 };
    U.drawPanel(ctx, rr.x, rr.y, rr.w, rr.h, 24, '#e8a33d');
    U.drawText(ctx, '📺 看广告 复活（回 50% 血）', W / 2, rr.y + 24, 15, '#ffffff', 'center', 'bold');
    const gr = { x: W / 2 - 110, y: H / 2 + 62, w: 220, h: 42 };
    U.drawPanel(ctx, gr.x, gr.y, gr.w, gr.h, 21, '#e5ded2');
    U.drawText(ctx, '认命，下班', W / 2, gr.y + 21, 14, '#666666');
    m.rects = { revive: rr, giveup: gr };
  }
}

module.exports = BattleScene;
