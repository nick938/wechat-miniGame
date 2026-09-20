/**
 * 渲染适配层
 * - 统一设计分辨率 375×667，等比缩放居中，屏蔽真机分辨率差异
 * - 把微信触摸事件换算成设计坐标后转发给 GameGlobal.app（由 main.js 注册）
 */
const DESIGN_W = 375;
const DESIGN_H = 667;

const info = wx.getSystemInfoSync();
const canvas = wx.createCanvas();
const ctx = canvas.getContext('2d');

const scale = Math.min(info.windowWidth / DESIGN_W, info.windowHeight / DESIGN_H);
const offX = (info.windowWidth - DESIGN_W * scale) / 2;
const offY = (info.windowHeight - DESIGN_H * scale) / 2;
// 设备像素比限幅：大屏高 DPR 机上用满 3x 会让填充面积翻倍、低端机掉帧，
// 2x 在观感与开销之间够用（微信小游戏的常见做法）
const MAX_DPR = 2;
const dpr = Math.min(info.pixelRatio || 1, MAX_DPR);

canvas.width = info.windowWidth * dpr;
canvas.height = info.windowHeight * dpr;

// 屏幕物理像素 → 设计坐标
function toDesign(px, py) {
  return {
    x: (px - offX) / scale,
    y: (py - offY) / scale,
  };
}

// 每帧开头调用：应用变换并铺满背景色
function beginFrame(bgColor) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr,
    offX * dpr, offY * dpr);
}

GameGlobal.screen = {
  W: DESIGN_W,
  H: DESIGN_H,
  scale,
  offX,
  offY,
  dpr,
  toDesign,
  beginFrame,
  ctx,
  canvas,
  // 离屏画布（静态背景缓存用）：拿不到就返回 null，调用方退回直接绘制
  createOffscreen(w, h) {
    try {
      if (typeof wx === 'undefined' || !wx.createCanvas) return null;
      const c = wx.createCanvas();
      if (!c || !c.getContext) return null;
      c.width = w;
      c.height = h;
      const octx = c.getContext('2d');
      if (!octx) return null;
      return { canvas: c, ctx: octx, w, h };
    } catch (e) {
      return null;
    }
  },
};

// 触摸事件统一换成设计坐标再分发
// 注意：touchend/cancel 的坐标在 changedTouches 里，touches 是剩余手指
function forward(event, name) {
  const app = GameGlobal.app;
  if (!app) return;
  const src = (event.changedTouches && event.changedTouches.length)
    ? event.changedTouches[0]
    : (event.touches && event.touches[0]);
  if (!src) return;
  const p = toDesign(src.clientX, src.clientY);
  if (typeof app[name] === 'function') app[name](p.x, p.y);
}

wx.onTouchStart((e) => forward(e, 'onTouchStart'));
wx.onTouchMove((e) => forward(e, 'onTouchMove'));
wx.onTouchEnd((e) => forward(e, 'onTouchEnd'));
wx.onTouchCancel((e) => forward(e, 'onTouchEnd'));

module.exports = { ctx, canvas };
