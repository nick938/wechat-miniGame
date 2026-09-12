/** 通用工具：随机 / 几何 / 绘制辅助 / 震动 */

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function dist(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

// 圆角矩形路径（不 fill/stroke，由调用方决定）
function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// 画一个圆角按钮底
function drawPanel(ctx, x, y, w, h, r, fill, stroke) {
  roundRectPath(ctx, x, y, w, h, r);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

// 居中文字
function drawText(ctx, text, x, y, size, color, align = 'center', weight = '') {
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.font = `${weight} ${size}px sans-serif`;
  ctx.fillText(text, x, y);
}

function drawEmoji(ctx, emoji, x, y, size, alpha = 1) {
  if (alpha < 1) ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${size}px sans-serif`;
  ctx.fillText(emoji, x, y);
  if (alpha < 1) ctx.globalAlpha = 1;
}

// 震动（短），非微信环境安全降级
function vibrate() {
  if (typeof wx !== 'undefined' && wx.vibrateShort) {
    try {
      wx.vibrateShort({ type: 'light' });
    } catch (e) { /* 忽略 */ }
  }
}

module.exports = { rand, randInt, pick, clamp, dist, roundRectPath, drawPanel, drawText, drawEmoji, vibrate };
