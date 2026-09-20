/**
 * 敌人：普通怪 + Boss（产品经理：召唤需求，残血狂暴）
 * 只负责移动/受击/状态，死亡结算（经验/金币/分裂）由战场统一处理
 */
const C = require('../core/config');
const U = require('../core/utils');
const { damageBaseHp } = require('../systems/damage');

let idCounter = 1;

class Enemy {
  constructor() {
    this.id = 0;
    this.type = '';
    this.cfg = null;
    this.alive = false;
  }

  // levelCfg: buildLevel 产物；mods：全局词缀
  init(type, levelCfg, mods, x) {
    const cfg = C.ENEMIES[type];
    this.id = idCounter++;
    this.type = type;
    this.cfg = cfg;
    this.alive = true;
    this.dying = false;
    this.boss = !!cfg.boss;
    this.splitLeft = cfg.split || 0;

    const hpMul = levelCfg.hpMul * mods.enemyHpMul;
    this.hpMax = Math.max(1, Math.round(cfg.hp * hpMul));
    this.hp = this.hpMax;
    this.speed = cfg.speed * levelCfg.spMul * mods.enemySpdMul;
    this.dps = cfg.dps;
    this.r = cfg.r;
    this.exp = cfg.exp;
    this.coin = cfg.coin;

    this.baseX = x != null ? x : U.rand(30, C.DESIGN_W - 30);
    this.x = this.baseX;
    this.y = -20;
    this.phase = U.rand(0, Math.PI * 2);
    this.sway = this.boss ? 2 : U.rand(4, 10);
    this.attacking = false;
    this.attackAnim = 0;
    this.lastOrbHit = 0;
    // Boss 专属
    this.summonTimer = 4;
    this.enraged = false;
  }

  update(dt, battle) {
    const mods = battle.mods;
    if (!this.attacking) {
      this.y += this.speed * dt;
      this.x = this.baseX + Math.sin(battle.time * 1.5 + this.phase) * this.sway;
      this.x = U.clamp(this.x, 16, C.DESIGN_W - 16);
      if (this.y >= C.BASE_Y - this.r * 0.3) {
        this.attacking = true;
      }
    } else {
      // 啃工位（走统一结算：减伤词缀 → 护盾吸收 → 血条）
      this.attackAnim += dt;
      damageBaseHp(battle, this.dps * dt * mods.enemyDpsMul);
      battle.lastHitBy = this.type;  // 失败复盘：记下是谁在啃
    }

    // Boss：召唤需求 + 残血狂暴（通过标志位让战场结算特效与增援）
    if (this.boss && !this.dying) {
      this.summonTimer -= dt;
      if (this.summonTimer <= 0) {
        this.summonTimer = this.enraged ? 4.5 : 6;
        this.summonNow = true;
      }
      if (!this.enraged && this.hp < this.hpMax * 0.4) {
        this.enraged = true;
        this.justEnraged = true;
        this.speed *= 1.35;
        this.dps *= 1.5;
      }
    }
  }

  takeDamage(dmg) {
    if (this.dying) return false;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.dying = true;
      return true; // 告知战场：这一击击杀了
    }
    return false;
  }

  render(ctx, time) {
    const shake = this.attacking ? Math.sin(time * 30 + this.id) * 2 : 0;
    U.drawEmoji(ctx, this.cfg.emoji, this.x + shake, this.y, this.boss ? 52 : this.r * 2.2);

    // 血条（受伤后显示；Boss 由战场画大血条）
    if (!this.boss && this.hp < this.hpMax) {
      const w = this.r * 2;
      const ratio = U.clamp(this.hp / this.hpMax, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(this.x - w / 2, this.y - this.r - 8, w, 4);
      ctx.fillStyle = '#ff6b6b';
      ctx.fillRect(this.x - w / 2, this.y - this.r - 8, w * ratio, 4);
    }
  }
}

module.exports = Enemy;
