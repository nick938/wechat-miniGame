/**
 * 弹丸：咖啡豆（跟踪、可穿透）/ 键帽冲击波（穿透一列）/ 自爆 Bug（定时爆炸）
 * 命中判定与伤害结算在战场里做，这里只维护位置与生命周期
 */
const C = require('../core/config');
const U = require('../core/utils');

class Projectile {
  // kind: 'bean' | 'wave'
  init(kind, x, y, opts) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.speed = opts.speed || 420;
    this.vx = 0;
    this.vy = -this.speed;
    this.dmg = opts.dmg;
    this.pierce = opts.pierce || 0;   // bean 可额外穿透数
    this.width = opts.width || 10;    // wave 列宽
    this.targetId = opts.targetId || 0; // bean 跟踪目标 id
    this.target = opts.target || null;  // 直接存目标引用：省掉每帧 O(弹丸×敌人) 的查找
    this.hitSet = {};                 // 已命中敌人 id（wave 用）
    this.dead = false;
    return this;
  }

  update(dt, enemies) {
    if (this.kind === 'bean') {
      // 跟踪：直接用目标引用（校验 id，防止池子把对象回收给别人）
      if (this.target) {
        const t = this.target;
        if (t.dying || t.id !== this.targetId) this.target = null;
        else {
          const dx = t.x - this.x;
          const dy = t.y - this.y;
          const dist = U.dist(this.x, this.y, t.x, t.y) || 1;
          this.vx = (dx / dist) * this.speed;
          this.vy = (dy / dist) * this.speed;
        }
      }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.y < -30 || this.x < -20 || this.x > C.DESIGN_W + 20) this.dead = true;
    } else {
      this.y -= this.speed * dt;
      if (this.y < -30) this.dead = true;
    }
  }

  render(ctx) {
    if (this.kind === 'bean') {
      ctx.fillStyle = '#8b5a2b';
      ctx.beginPath();
      ctx.arc(this.x, this.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#5d3a1a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y - 4);
      ctx.quadraticCurveTo(this.x + 3, this.y, this.x, this.y + 4);
      ctx.stroke();
    } else {
      // 键帽冲击波：一列发光横带
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#7ec8ff';
      ctx.fillRect(this.x - this.width / 2, this.y - 14, this.width, 28);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(this.x - 3, this.y - 12, 6, 24);
    }
  }
}

class Bomb {
  // Bug 自爆炸弹：落地倒计时，爆炸结算在战场
  init(x, y, dmg, radius, fuse) {
    this.x = x;
    this.y = y;
    this.dmg = dmg;
    this.radius = radius;
    this.fuse = fuse;
    this.total = fuse;
    this.dead = false;
    return this;
  }

  update(dt) {
    this.fuse -= dt;
    if (this.fuse <= 0) this.dead = true;
  }

  render(ctx) {
    const blink = this.fuse < 0.4 && Math.floor(this.fuse * 12) % 2 === 0;
    if (blink) ctx.globalAlpha = 0.4;
    U.drawEmoji(ctx, '🐞', this.x, this.y, 26);
    ctx.globalAlpha = 1;
    // 引信圈
    ctx.strokeStyle = 'rgba(255,107,107,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 16, 0, Math.PI * 2);
    ctx.stroke();
  }
}

module.exports = { Projectile, Bomb };
