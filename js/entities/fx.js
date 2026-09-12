/**
 * 特效：飘字 / 爆炸圆环（对象池复用）
 */
const U = require('../core/utils');

class Fx {
  // kind: 'text' | 'boom' | 'ring'
  init(kind, x, y, opts = {}) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.text = opts.text || '';
    this.color = opts.color || '#ffffff';
    this.size = opts.size || 14;
    this.r0 = opts.r0 || 8;
    this.r1 = opts.r1 || 40;
    this.life = opts.life || (kind === 'text' ? 0.8 : 0.4);
    this.total = this.life;
    this.dead = false;
    return this;
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
    if (this.kind === 'text') this.y -= 34 * dt;
  }

  render(ctx) {
    const t = U.clamp(this.life / this.total, 0, 1);
    ctx.globalAlpha = t;
    if (this.kind === 'text') {
      U.drawText(ctx, this.text, this.x, this.y, this.size, this.color, 'center', 'bold');
    } else if (this.kind === 'boom') {
      const r = this.r0 + (this.r1 - this.r0) * (1 - t);
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 4 * t + 1;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = t * 0.35;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // ring：合成/升级涟漪
      const r = this.r1 * (1 - t);
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

module.exports = Fx;
