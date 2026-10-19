/**
 * 激励视频广告服务
 * - 配置了 config.AD_UNIT_ID 且环境支持 → 走真实激励视频
 * - 否则降级为「模拟广告」倒计时浮层（开发期与未配置广告位时使用）
 * show(placement, onReward) —— placement 用于模拟浮层文案与埋点
 */
const C = require('../core/config');

const SHOW_TIMEOUT = 30;  // 秒：广告占用位的看门狗上限（真机回调不触发时解占用）
const AD_RETRY = 2;       // 线上加载失败的额外重试次数（失败即不发奖励，不降级成模拟广告）

let instance;

class AdService {
  constructor() {
    if (instance) return instance;
    instance = this;

    this._ad = null;
    this.simulating = null; // {placement, t, dur, onReward}
    this.showing = false;   // 激励视频进行中：挡住重复触发（否则同一奖励可能白扣/多发）
    this.showTimer = 0;     // 占用计时，供看门狗用
    this._closeHandler = null; // 当前挂在广告实例上的 onClose（必须留着引用才能 offClose）
    this._errHandler = null;   // 当前挂在广告实例上的 onError
    this.onFailCb = null;      // 看门狗超时后要通知的调用方
  }

  // 广告播放期间要吞掉游戏输入。
  // 模拟广告只是自绘浮层（render() 画的那层半透明遮罩），真机上玩家完全能点到底下的按钮：
  // 点了"复活"再点"认命下班"→ 3 秒后复活回调把玩家拉回一场已结算的战斗、金币入账两次；
  // 点了"双倍"再点"下一关"→ 老局的金币打到新关卡上。所以必须在输入入口挡住。
  blocksInput() {
    return !!(this.simulating || this.showing);
  }

  // 解绑当前挂在广告实例上的回调。
  // 微信的 onClose / onError 是**订阅**语义：不 offClose 就会一直留在实例上，
  // 之后任何一次广告关闭都会把积压的回调全部触发一遍 —— 于是"曾经加载失败过"的
  // placement 会在别人看完广告时白拿一份奖励，失败几次就白拿几份。
  detach() {
    const ad = this._ad;
    const close = this._closeHandler;
    const err = this._errHandler;
    this._closeHandler = null;
    this._errHandler = null;
    if (!ad) return;
    try { if (close && ad.offClose) ad.offClose(close); } catch (e) { /* 忽略 */ }
    try { if (err && ad.offError) ad.offError(err); } catch (e) { /* 忽略 */ }
  }

  getAd() {
    if (this._ad) return this._ad;
    if (typeof wx === 'undefined' || !wx.createRewardedVideoAd || !C.AD_UNIT_ID) return null;
    try {
      const ad = wx.createRewardedVideoAd({ adUnitId: C.AD_UNIT_ID });
      this._ad = ad;
      return ad;
    } catch (e) {
      return null;
    }
  }

  show(placement, onReward, onFail) {
    if (this.showing) return; // 上一个广告还没结束，忽略这次触发
    this.showing = true;
    this.showTimer = 0;
    this.onFailCb = onFail || null;
    const { track } = require('./track');
    track('ad_show', { placement });
    const reward = () => {
      track('ad_reward', { placement });
      if (this.onAnyReward) this.onAnyReward(placement); // 长期统计（成就）用，不影响奖励逻辑
      onReward();
    };
    const ad = this.getAd();
    if (!ad) {
      // 没配置广告位（开发/未配置）才走模拟广告：这是唯一的"白给"场景
      this.simulate(placement, reward);
      return;
    }
    // 关键：先把上一次遗留的回调解绑，再挂新的（否则监听器越积越多）
    this.detach();
    let settled = false; // 同一次观看只兑现一次
    const finish = (ended) => {
      if (settled) return;
      settled = true;
      this.detach();
      this.showing = false;
      this.showTimer = 0;
      this.onFailCb = null;
      if (ended) reward();
      else if (typeof wx !== 'undefined' && wx.showToast) {
        wx.showToast({ title: '看完整个广告才有奖励哦', icon: 'none' });
      }
    };
    const onClose = (res) => finish(!!(res && res.isEnded));
    const onError = () => {
      if (settled) return;
      settled = true;
      this.detach();
      this.fail(placement, onFail);
    };
    this._closeHandler = onClose;
    this._errHandler = onError;
    ad.onClose(onClose);
    if (ad.onError) ad.onError(onError);
    // 线上：加载失败要重试；重试仍失败就明确告知并【不发奖励】，绝不降级成白送
    let attempt = 0;
    const tryShow = () => {
      if (settled) return;
      ad.show().catch(() => {
        if (settled) return;
        attempt++;
        if (attempt <= AD_RETRY) {
          ad.load().then(() => tryShow()).catch(() => tryShow()); // 重新加载后再试
          return;
        }
        settled = true;
        this.detach();
        this.fail(placement, onFail);
      });
    };
    tryShow();
  }

  // 广告不可用：解占用、提示玩家、双方都不发奖励（reward 一定不会被调用）
  fail(placement, onFail) {
    const { track } = require('./track');
    track('ad_unavailable', { placement });
    this.showing = false;
    this.showTimer = 0;
    this.onFailCb = null;
    if (typeof wx !== 'undefined' && wx.showToast) {
      wx.showToast({ title: '广告暂时不可用，稍后再试', icon: 'none' });
    }
    if (onFail) onFail();
  }

  simulate(placement, onReward) {
    this.simulating = { placement, t: 3, dur: 3, onReward };
  }

  tick(dt) {
    // 看门狗：真机上广告回调有可能不触发，超时就强制解占用 + 解绑回调 + 通知调用方，
    // 否则 showing 永远为真、后续广告全部被静默挡掉（比重复触发更糟）
    if (this.showing) {
      this.showTimer += dt;
      if (this.showTimer > SHOW_TIMEOUT) {
        const cb = this.onFailCb;
        this.detach();
        this.showing = false;
        this.showTimer = 0;
        this.onFailCb = null;
        if (typeof wx !== 'undefined' && wx.showToast) {
          wx.showToast({ title: '广告暂时不可用，稍后再试', icon: 'none' });
        }
        if (cb) cb();
      }
    }
    const s = this.simulating;
    if (!s) return;
    s.t -= dt;
    if (s.t <= 0) {
      this.simulating = null;
      this.showing = false;
      this.showTimer = 0;
      this.onFailCb = null;
      s.onReward();
    }
  }

  // 模拟广告浮层渲染（主循环最后画，盖在最上层）
  render(ctx) {
    const s = this.simulating;
    if (!s) return;
    const { drawPanel, drawText } = require('../core/utils');
    const W = C.DESIGN_W;
    const H = C.DESIGN_H;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);
    drawPanel(ctx, W / 2 - 120, H / 2 - 90, 240, 180, 16, '#ffffff');
    drawText(ctx, '模拟广告', W / 2, H / 2 - 40, 22, '#333333', 'center', 'bold');
    drawText(ctx, `（正式包请配置广告位 ID）`, W / 2, H / 2 - 8, 12, '#999999');
    drawText(ctx, `${Math.ceil(s.t)}s`, W / 2, H / 2 + 32, 40, '#4a90d9', 'center', 'bold');
  }
}

module.exports = AdService;
