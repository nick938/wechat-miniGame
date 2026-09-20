#!/usr/bin/env python3
"""生成分享卡片图（微信分享卡片规格 5:4，输出 500x400）。

画法与 tools/gen_icon.py 一致：4x 超采样绘制后缩到目标尺寸，坐标一律用 500x400 空间。
内容是通用的"战绩炫耀"模板（分数是动态的，由分享文案承载，卡片图保持静态）。

用法：python3 tools/gen_share_card.py
输出：assets/share/card-500x400.png
"""
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 500, 400
SS = 4  # 超采样倍数
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "share", "card-500x400.png")

# 中文字体优先（缺中文会画不出字，脚本会给出提示）
CJK_CANDIDATES = [
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
]
LATIN_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]


def pick_font(candidates, size):
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size * SS, index=0)
            except OSError:
                continue
    return None


def font(size, cjk=True):
    f = pick_font(CJK_CANDIDATES if cjk else LATIN_CANDIDATES, size)
    if f is None:
        f = pick_font(LATIN_CANDIDATES, size) or ImageFont.load_default()
    return f


def sc(v):
    return v * SS


def ell(d, box, **kw):
    d.ellipse(tuple(sc(v) for v in box), **kw)


def poly(d, pts, **kw):
    d.polygon([tuple(sc(v) for v in p) for p in pts], **kw)


def rrect(d, box, r, **kw):
    d.rounded_rectangle(tuple(sc(v) for v in box), radius=sc(r), **kw)


def draw_fish(d, cx, cy, s):
    """简笔摸鱼鱼：橙色椭圆身体 + 三角尾 + 白眼睛 + 闭眼线（躺平感）"""
    body = (cx - 62 * s, cy - 34 * s, cx + 62 * s, cy + 34 * s)
    poly(d, [(cx - 58 * s, cy), (cx - 96 * s, cy - 30 * s), (cx - 96 * s, cy + 30 * s)], fill=(232, 163, 61))
    ell(d, body, fill=(245, 158, 66))
    ell(d, (cx - 62 * s, cy - 34 * s, cx + 62 * s, cy + 34 * s), outline=(200, 122, 40), width=int(sc(3 * s)))
    ell(d, (cx + 22 * s, cy - 12 * s, cx + 40 * s, cy + 6 * s), fill=(255, 255, 255))     # 眼白
    poly(d, [(cx + 26 * s, cy - 3 * s), (cx + 36 * s, cy - 3 * s), (cx + 31 * s, cy - 12 * s)], fill=(60, 60, 70))
    d.line([(sc(cx - 40 * s), sc(cy + 6 * s)), (sc(cx - 8 * s), sc(cy + 10 * s))], fill=(200, 122, 40), width=int(sc(3 * s)))
    d.line([(sc(cx + 10 * s), sc(cy + 10 * s)), (sc(cx + 40 * s), sc(cy + 6 * s))], fill=(200, 122, 40), width=int(sc(3 * s)))
    d.text((sc(cx + 60 * s), sc(cy - 54 * s)), "z", font=font(int(26 * s), cjk=False), fill=(74, 144, 217))
    d.text((sc(cx + 86 * s), sc(cy - 78 * s)), "Z", font=font(int(34 * s), cjk=False), fill=(74, 144, 217))


def main():
    img = Image.new("RGB", (sc(W), sc(H)), (74, 144, 217))
    d = ImageDraw.Draw(img)
    # 背景：竖向渐变（上深下浅的蓝）
    for y in range(sc(H)):
        t = y / sc(H)
        c = (int(74 + 60 * t), int(144 + 40 * t), int(217 - 30 * t))
        d.line([(0, y), (sc(W), y)], fill=c)
    # 桌面横带（工位感）
    d.rectangle(tuple(sc(v) for v in (0, 344, W, H)), fill=(201, 160, 106))
    d.rectangle(tuple(sc(v) for v in (0, 344, W, 349)), fill=(183, 140, 88))
    # 白卡片
    rrect(d, (46, 40, W - 46, 322), 22, fill=(255, 255, 255))
    # 标题与副标题（注意：文字坐标同样要按超采样倍数缩放）
    d.text((sc(W / 2), sc(84)), "摸鱼保卫战", font=font(38), fill=(51, 51, 51), anchor="mm")
    d.text((sc(W / 2), sc(120)), "上班是不可能认真上班的", font=font(17), fill=(153, 153, 153), anchor="mm")
    # 鱼
    draw_fish(d, 250, 200, 0.95)
    # 假榜单：暗示"和好友比分数"
    d.text((sc(96), sc(258)), "好友摸鱼榜", font=font(14), fill=(153, 153, 153), anchor="lm")
    for i in range(3):
        x0 = 96 + i * 104
        rrect(d, (x0, 270, x0 + 88, 306), 10, fill=(247, 244, 236))
        ell(d, (x0 + 6, 278, x0 + 26, 298), fill=(221, 213, 198))
        w1 = [56, 40, 28][i]
        d.rectangle(tuple(sc(v) for v in (x0 + 32, 288, x0 + 32 + w1, 292)), fill=(232, 163, 61))
        d.rectangle(tuple(sc(v) for v in (x0 + 32, 280, x0 + 32 + w1 - 12, 283)), fill=(74, 144, 217))
    # 底部一句话
    d.text((sc(W / 2), sc(372)), "来比比谁更会摸鱼", font=font(21), fill=(255, 255, 255), anchor="mm")

    img = img.resize((W, H), Image.LANCZOS)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img.save(OUT, "PNG", optimize=True)
    print(f"已生成 {os.path.normpath(OUT)} （{img.size[0]}x{img.size[1]}, {os.path.getsize(OUT) // 1024}KB）")
    if pick_font(CJK_CANDIDATES, 20) is None:
        print("提示：没找到中文字体，卡片上的中文可能没画出来（装 Noto Sans CJK 或改 CJK_CANDIDATES）")


if __name__ == "__main__":
    main()
