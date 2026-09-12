/**
 * 音效服务：bgm 循环 + 爆炸音，非微信环境安全降级
 * 音效开关存档在 meta.soundOn
 */
let instance;

class AudioMgr {
  constructor() {
    if (instance) return instance;
    instance = this;

    this.enabled = true;
    this.bgm = this.make('audio/bgm.mp3', true);
    this.boom = this.make('audio/boom.mp3', false);
    this.hit = this.make('audio/bullet.mp3', false);
    this._lastHit = 0;
  }

  make(src, loop) {
    try {
      if (typeof wx === 'undefined' || !wx.createInnerAudioContext) return null;
      const a = wx.createInnerAudioContext();
      a.src = src;
      a.loop = loop;
      return a;
    } catch (e) {
      return null;
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.bgm) {
      if (on && this.bgmShouldPlay) this.bgm.play();
      if (!on) this.bgm.pause();
    }
  }

  playBgm() {
    this.bgmShouldPlay = true;
    if (this.bgm && this.enabled) this.bgm.play();
  }

  stopBgm() {
    this.bgmShouldPlay = false;
    if (this.bgm) this.bgm.pause();
  }

  playBoom() {
    if (this.boom && this.enabled) {
      try {
        this.boom.stop();
        this.boom.play();
      } catch (e) { /* 忽略 */ }
    }
  }

  // 击杀/合成短促音效：60ms 节流，避免同帧多杀刷屏
  playHit() {
    if (!this.hit || !this.enabled) return;
    const now = Date.now();
    if (now - this._lastHit < 60) return;
    this._lastHit = now;
    try {
      this.hit.stop();
      this.hit.play();
    } catch (e) { /* 忽略 */ }
  }
}

module.exports = AudioMgr;
