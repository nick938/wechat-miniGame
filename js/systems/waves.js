/**
 * 波次控制：按关卡事件表刷怪
 */
const C = require('../core/config');

class WaveCtl {
  constructor(levelCfg) {
    this.cfg = levelCfg;
    // 事件按时间排序，逐个消费
    this.events = levelCfg.events.slice().sort((a, b) => a.t - b.t);
    this.cursor = 0;
    this.elapsed = 0;
    this.pending = []; // {type, left, interval, timer}
  }

  // 返回本帧要生成的敌人类型数组
  update(dt, mods) {
    const out = [];

    // 新事件触发
    while (this.cursor < this.events.length) {
      const ev = this.events[this.cursor];
      if (this.elapsed >= ev.t) {
        this.pending.push({ type: ev.type, left: ev.count, interval: ev.interval, timer: 0 });
        this.cursor++;
      } else break;
    }

    // 排队中的逐个放
    for (const p of this.pending) {
      if (p.left <= 0) continue;
      p.timer -= dt;
      if (p.timer <= 0) {
        p.timer = p.interval / mods.spawnGapMul;
        p.left--;
        out.push(p.type);
      }
    }
    this.pending = this.pending.filter((p) => p.left > 0);
    return out;
  }

  setElapsed(t) {
    this.elapsed = t;
  }

  get done() {
    return this.cursor >= this.events.length && this.pending.length === 0;
  }
}

module.exports = WaveCtl;
