/**
 * 主入口：初始化全局服务，主循环与场景路由
 */
require('./render'); // 初始化 canvas 与触摸转发（副作用模块）

const Databus = require('./core/databus');
const AudioMgr = require('./core/audio');
const AdService = require('./services/ads');
const Share = require('./services/share');
const Monitor = require('./services/monitor');
const Ach = require('./systems/achievements');
const Home = require('./ui/home');
const Battle = require('./ui/battle');

class App {
  constructor() {
    Monitor.init(); // 全局错误 → 微信实时日志

    const databus = new Databus();
    GameGlobal.databus = databus;
    this.databus = databus;

    this.audio = new AudioMgr();
    this.audio.setEnabled(databus.meta.soundOn);

    this.adService = new AdService();
    // 每次看完激励视频（任何位置）都计入长期统计，成就「广告鉴赏家」用
    this.adService.onAnyReward = () => Ach.countAd(databus);
    GameGlobal.adService = this.adService;

    this.home = new Home(this);
    this.battle = new Battle(this);
    this.scene = this.home;

    // render.js 把触摸事件转发到 GameGlobal.app
    GameGlobal.app = this;

    // 右上角"转发"也要带战绩：传入取数函数，转发时实时读；
    // 只在战斗场景里才把 battle 交出去（回首页后 battle 仍是上一局的残留对象）
    Share.initMenu(() => ({
      meta: this.databus.meta,
      battle: this.databus.scene === 'battle' ? this.databus.battle : null,
    }));

    this.last = 0;
    this.paused = false;
    // 切后台：停 BGM、暂停模拟（rAF 本来就会停，但要防"回来时一帧跳一大步"）
    if (wx.onHide) {
      wx.onHide(() => {
        this.paused = true;
        this.audio.stopBgm();
      });
    }
    if (wx.onShow) {
      wx.onShow(() => {
        this.paused = false;
        this.last = 0;               // 丢掉后台期间的时间差
        if (databus.scene === 'battle' && databus.meta.soundOn) this.audio.playBgm();
      });
    }
    this.aniId = requestAnimationFrame(this.loop.bind(this));
  }

  goHome() {
    this.databus.scene = 'home';
    this.scene = this.home;
  }

  startBattle(level) {
    this.battle.start(level);
    this.scene = this.battle;
  }

  onTouchStart(x, y) {
    if (this.scene && this.scene.onTouchStart) this.scene.onTouchStart(x, y);
  }

  onTouchMove(x, y) {
    if (this.scene && this.scene.onTouchMove) this.scene.onTouchMove(x, y);
  }

  onTouchEnd(x, y) {
    if (this.scene && this.scene.onTouchEnd) this.scene.onTouchEnd(x, y);
  }

  loop(ts) {
    const dt = this.paused ? 0 : Math.min(0.033, (ts - this.last) / 1000 || 0.016);
    this.last = ts;

    this.adService.tick(dt);

    const screen = GameGlobal.screen;
    screen.beginFrame('#f7f4ec');
    if (this.scene) {
      this.scene.update(dt);
      this.scene.render(screen.ctx);
    }
    this.adService.render(screen.ctx);

    this.aniId = requestAnimationFrame(this.loop.bind(this));
  }
}

new App();

module.exports = App;
