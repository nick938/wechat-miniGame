/**
 * 激励视频广告服务
 * - 配置了 config.AD_UNIT_ID 且环境支持 → 走真实激励视频
 * - 否则降级为「模拟广告」倒计时浮层（开发期与未配置广告位时使用）
 * show(placement, onReward) —— placement 用于模拟浮层文案与埋点
 */
const C = require('../core/config');

const SHOW_TIMEOUT = 180; // 秒：广告占用位的看门狗上限

let instance;

class AdService {
  constructor() {
    if (instance) return instance;
    instance = this;

    this._ad = null;
    this._broken = false;
    this.simulating = null; // {placement, t, dur, onReward}
    this.showing = false;   // 激励视频进行中：挡住重复触发（否则同一奖励可能白扣/多发）
    this.showTimer = 0;     // 占用计时，供看门狗用
  }

  getAd() {
    if (this._ad) return this._ad;
    if (typeof wx === 'undefined' || !wx.createRewardedVideoAd || !C.AD_UNIT_ID) return null;
    try {
      const ad = wx.createRewardedVideoAd({ adUnitId: C.AD_UNIT_ID });
      ad.onError(() => { this._broken = true; });
      this._ad = ad;
      return ad;
    } catch (e) {
      return null;
    }
  }

  show(placement, onReward) {
    if (this.showing) return; // 上一个广告还没结束，忽略这次触发
    this.showing = true;
    this.showTimer = 0;
    const { track } = require('./track');
    track('ad_show', { placement });
    const reward = () => {
      track('ad_reward', { placement });
      onReward();
    };
    const ad = this.getAd();
    if (ad && !this._broken) {
      const onClose = (res) => {
        ad.offClose(onClose);
        this.showing = false;
        this.showTimer = 0;
        if (res && res.isEnded) reward();
        else if (typeof wx !== 'undefined' && wx.showToast) {
          wx.showToast({ title: '看完整个广告才有奖励哦', icon: 'none' });
        }
      };
      ad.onClose(onClose);
      ad.show().catch(() => {
        ad.load()
          .then(() => ad.show())
          .catch(() => {
            ad.offClose(onClose);
            this._broken = true;
            this.simulate(placement, reward); // showing 保持占用，交给模拟广告收尾
          });
      });
    } else {
      this.simulate(placement, reward);
    }
  }

  simulate(placement, onReward) {
    this.simulating = { placement, t: 3, dur: 3, onReward };
  }

  tick(dt) {
    // 看门狗：真机上广告回调有可能不触发，超时就强制解占用，
    // 否则 showing 永远为真、后续广告全部被挡掉（比重复触发更糟）
    if (this.showing) {
      this.showTimer += dt;
      if (this.showTimer > SHOW_TIMEOUT) {
        this.showing = false;
        this.showTimer = 0;
      }
    }
    const s = this.simulating;
    if (!s) return;
    s.t -= dt;
    if (s.t <= 0) {
      this.simulating = null;
      this.showing = false;
      this.showTimer = 0;
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
