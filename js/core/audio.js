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
}

module.exports = AudioMgr;
