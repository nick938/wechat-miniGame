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
    this.pending = []; // {type, left, interval, timer, col}
    this.hotCol = null; // 本次事件的主攻列（站位取舍：看见这一列就该把键盘挪过去）
  }

  // 返回本帧要生成的敌人类型数组
  update(dt, mods) {
    const out = [];

    // 新事件触发
    while (this.cursor < this.events.length) {
      const ev = this.events[this.cursor];
      if (this.elapsed >= ev.t) {
        // 七成的波次会指定"主攻列"，其余保持随机撒开，避免变成背板游戏
        const col = Math.random() < C.HOT_COL_CHANCE ? Math.floor(Math.random() * C.BOARD_COLS) : null;
        this.pending.push({ type: ev.type, left: ev.count, interval: ev.interval, timer: 0, col });
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
        this.hotCol = p.col;
        out.push({ type: p.type, col: p.col });
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
