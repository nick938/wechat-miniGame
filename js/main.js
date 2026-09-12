/**
 * 主入口：初始化全局服务，主循环与场景路由
 */
require('./render'); // 初始化 canvas 与触摸转发（副作用模块）

const Databus = require('./core/databus');
const AudioMgr = require('./core/audio');
const AdService = require('./services/ads');
const Share = require('./services/share');
const Home = require('./ui/home');
const Battle = require('./ui/battle');

class App {
  constructor() {
    const databus = new Databus();
    GameGlobal.databus = databus;
    this.databus = databus;

    this.audio = new AudioMgr();
    this.audio.setEnabled(databus.meta.soundOn);

    this.adService = new AdService();
    GameGlobal.adService = this.adService;

    this.home = new Home(this);
    this.battle = new Battle(this);
    this.scene = this.home;

    // render.js 把触摸事件转发到 GameGlobal.app
    GameGlobal.app = this;

    Share.initMenu();

    this.last = 0;
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
    const dt = Math.min(0.033, (ts - this.last) / 1000 || 0.016);
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
