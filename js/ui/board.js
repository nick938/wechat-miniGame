/**
 * 合成棋盘：4×4，拖拽合成（同级同类 → 升一级）/ 交换位置
 * 设计决策：棋盘即防线，武器从格子上自动朝战场开火
 */
const C = require('../core/config');
const U = require('../core/utils');

const LV_COLOR = ['#b8c0c8', '#9aa5b1', '#4a90d9', '#9b59d0', '#e8a33d'];

function cellRect(i) {
  const col = i % C.BOARD_COLS;
  const row = Math.floor(i / C.BOARD_COLS);
  return {
    x: C.BOARD_X0 + col * (C.BOARD_CELL + C.BOARD_GAP),
    y: C.BOARD_Y0 + row * (C.BOARD_CELL + C.BOARD_GAP),
    w: C.BOARD_CELL,
    h: C.BOARD_CELL,
  };
}

function cellAt(x, y) {
  for (let i = 0; i < C.BOARD_COLS * C.BOARD_ROWS; i++) {
    const r = cellRect(i);
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}

class Board {
  constructor(battle) {
    this.battle = battle;
    this.onMerge = null; // 合成成功回调（音效/震动）
  }

  // ---------- 触摸 ----------
  onTouchStart(x, y) {
    const b = this.battle;
    const i = cellAt(x, y);
    if (i >= 0 && b.board.cells[i]) {
      b.board.dragging = { index: i, x, y };
    }
  }

  onTouchMove(x, y) {
    const d = this.battle.board.dragging;
    if (d) {
      d.x = x;
      d.y = y;
    }
  }

  onTouchEnd(x, y) {
    const b = this.battle;
    const d = b.board.dragging;
    if (!d) return;
    b.board.dragging = null;

    const from = d.index;
    const to = cellAt(x, y);
    if (to < 0 || to === from) return; // 丢出界/原格：放回

    const item = b.board.cells[from];
    const target = b.board.cells[to];

    if (target && target.type === item.type && target.lv === item.lv && item.lv < C.MAX_WEAPON_LV) {
      // 合成
      b.board.cells[from] = null;
      target.lv++;
      if (this.onMerge) this.onMerge(to, target);
    } else {
      // 交换（含移入空格）
      b.board.cells[from] = target || null;
      b.board.cells[to] = item;
    }
  }

  // 补给投放：找空格，成功返回 true
  dropSupply(type) {
    const cells = this.battle.board.cells;
    const empties = [];
    cells.forEach((c, i) => { if (!c) empties.push(i); });
    if (!empties.length) return false;
    const idx = empties[Math.floor(Math.random() * empties.length)];
    cells[idx] = { type, lv: 1 };
    const r = cellRect(idx);
    return { index: idx, x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }

  // ---------- 渲染 ----------
  render(ctx) {
    const b = this.battle;
    const cells = b.board.cells;

    // 棋盘底
    const bw = C.BOARD_COLS * C.BOARD_CELL + (C.BOARD_COLS - 1) * C.BOARD_GAP;
    const bh = C.BOARD_ROWS * C.BOARD_CELL + (C.BOARD_ROWS - 1) * C.BOARD_GAP;
    U.drawPanel(ctx, C.BOARD_X0 - 6, C.BOARD_Y0 - 6, bw + 12, bh + 12, 12, '#e5ded2');

    for (let i = 0; i < cells.length; i++) {
      const r = cellRect(i);
      U.drawPanel(ctx, r.x, r.y, r.w, r.h, 10, '#f4efe6', '#d8cfc0');
      const item = cells[i];
      if (!item) continue;

      const isDragged = b.board.dragging && b.board.dragging.index === i;
      // 拖拽目标提示：可合成=绿，可交换=蓝
      if (b.board.dragging) {
        const d = b.board.dragging;
        if (d.index !== i) {
          const src = cells[d.index];
          if (src && item && item.type === src.type && item.lv === src.lv && item.lv < C.MAX_WEAPON_LV) {
            U.drawPanel(ctx, r.x, r.y, r.w, r.h, 10, 'rgba(105,205,140,0.35)');
          } else {
            U.drawPanel(ctx, r.x, r.y, r.w, r.h, 10, 'rgba(126,200,255,0.25)');
          }
        }
      }

      const alpha = isDragged ? 0.35 : 1;
      U.drawEmoji(ctx, C.WEAPONS[item.type].emoji, r.x + r.w / 2, r.y + r.h / 2 - 4, 34, alpha);
      U.drawPanel(ctx, r.x + 4, r.y + 4, 26, 16, 8, LV_COLOR[item.lv - 1]);
      U.drawText(ctx, `LV${item.lv}`, r.x + 17, r.y + 12.5, 10, '#ffffff');
    }

    // 跟手的装备
    if (b.board.dragging) {
      const d = b.board.dragging;
      const item = cells[d.index];
      if (item) {
        U.drawEmoji(ctx, C.WEAPONS[item.type].emoji, d.x, d.y - 30, 40);
      }
    }
  }
}

module.exports = { Board, cellRect, cellAt };
