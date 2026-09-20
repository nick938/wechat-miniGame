#!/usr/bin/env python3
"""生成《摸鱼保卫战》小游戏头像。

三个方案，均按 4x 超采样绘制后缩到 512/144。所有坐标一律用 512 空间，
由 sc()/ell()/poly() 等包装统一乘以 SS。
  v1 躺平摸鱼：蓝底 + 闭眼躺平的橙鱼 + 咖啡 + Zzz
  v2 工位守卫：青底 + 工位掩体后探头的鱼 + 咖啡豆子弹 + 逃跑的 Bug
  v3 咸鱼躺平：暖黄底 + 灰蓝咸鱼 X 眼吐舌
"""
import os
from PIL import Image, ImageDraw, ImageFont

SS = 4
SIZE = 512 * SS
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "icon")

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def font(size):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size * SS)
            except OSError:
                continue
    return ImageFont.load_default()


def sc(v):
    return v * SS


def ell(d, box, **kw):
    d.ellipse(tuple(sc(v) for v in box), **kw)


def poly(d, pts, **kw):
    d.polygon([tuple(sc(v) for v in p) for p in pts], **kw)


def lin(d, a, b, width, **kw):
    d.line((tuple(sc(v) for v in a), tuple(sc(v) for v in b)), width=sc(width), **kw)


def arc(d, box, a0, a1, width, **kw):
    d.arc(tuple(sc(v) for v in box), a0, a1, width=sc(width), **kw)


def rrect(d, box, radius, **kw):
    d.rounded_rectangle(tuple(sc(v) for v in box), radius=sc(radius), **kw)


def rounded_bg(top_rgb, bottom_rgb):
    """全画布垂直渐变；圆角由 save() 的 mask 统一裁剪。"""
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for y in range(SIZE):
        t = y / (SIZE - 1)
        r = int(top_rgb[0] + (bottom_rgb[0] - top_rgb[0]) * t)
        g = int(top_rgb[1] + (bottom_rgb[1] - top_rgb[1]) * t)
        b = int(top_rgb[2] + (bottom_rgb[2] - top_rgb[2]) * t)
        d.line([(0, y), (SIZE, y)], fill=(r, g, b, 255))
    return img


def overlay(img):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    return layer, ImageDraw.Draw(layer)


def grid(img, alpha=26):
    """底部 4xN 淡格线，呼应合成棋盘。"""
    layer, d = overlay(img)
    c = (255, 255, 255, alpha)
    for x in (128, 256, 384):
        d.line([(sc(x), sc(256)), (sc(x), sc(448))], fill=c, width=sc(3))
    for y in (320, 384):
        d.line([(sc(32), sc(y)), (sc(480), sc(y))], fill=c, width=sc(3))
    img.alpha_composite(layer)


def zzz(img, base=(388, 58)):
    d = ImageDraw.Draw(img)
    d.text((sc(base[0]), sc(base[1])), "Z", font=font(80), fill="white")
    d.text((sc(base[0] + 60), sc(base[1] + 58)), "z", font=font(54), fill="white")
    d.text((sc(base[0] + 94), sc(base[1] + 108)), "z", font=font(34), fill="white")


def fish_base(img, body_bbox, fin_color="#F0801F", body="#FFA23A", belly="#FFD9A6"):
    d = ImageDraw.Draw(img)
    poly(d, [(118, 289), (38, 208), (62, 289), (38, 370)], fill=fin_color)  # 尾
    poly(d, [(205, 205), (258, 118), (318, 205)], fill=fin_color)  # 背鳍
    ell(d, body_bbox, fill=body)
    ell(d, (150, 296, 398, 384), fill=belly)  # 肚皮


def save(img, name):
    os.makedirs(OUT, exist_ok=True)
    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, SIZE - 1, SIZE - 1), radius=sc(110), fill=255
    )
    img.putalpha(mask)
    paths = []
    for px, suffix in ((512, "512"), (144, "144")):
        p = os.path.join(OUT, f"{name}-{suffix}.png")
        img.resize((px, px), Image.LANCZOS).save(p)
        paths.append(p)
    return paths


def v1_layflat():
    """v1 躺平摸鱼：蓝底，闭眼躺平的橙鱼抱着咖啡。"""
    img = rounded_bg((90, 167, 240), (46, 95, 190))
    grid(img)
    fish_base(img, (100, 180, 412, 398))
    d = ImageDraw.Draw(img)
    poly(d, [(288, 318), (326, 370), (243, 360)], fill="#F0801F")  # 胸鳍
    arc(d, (318, 248, 368, 298), 200, 340, 9, fill="#6B3A12")  # 闭眼 ∩
    layer, ld = overlay(img)
    ld.ellipse(tuple(sc(v) for v in (378, 300, 406, 328)), fill=(255, 111, 145, 150))
    img.alpha_composite(layer)
    arc(d, (344, 304, 384, 340), 20, 140, 8, fill="#6B3A12")  # 微笑
    # 咖啡杯
    rrect(d, (150, 336, 222, 414), 12, fill="#FFF7EE")
    ell(d, (150, 320, 222, 352), fill="#8B5A2B")
    arc(d, (214, 350, 256, 398), -70, 80, 13, fill="#FFF7EE")  # 杯把
    layer, ld = overlay(img)
    for box in ((166, 266, 196, 310), (198, 274, 228, 318)):
        ld.arc(tuple(sc(v) for v in box), 90, 270, fill=(255, 255, 255, 210), width=sc(6))
    img.alpha_composite(layer)
    zzz(img)
    return save(img, "icon-v1")


def v2_guard():
    """v2 工位守卫：青底，工位掩体后探头瞄准，咖啡豆子弹飞向逃跑的 Bug。"""
    img = rounded_bg((53, 194, 160), (15, 126, 134))
    d = ImageDraw.Draw(img)
    poly(d, [(195, 240), (252, 165), (310, 240)], fill="#F0801F")  # 背鳍
    ell(d, (96, 208, 416, 470), fill="#FFA23A")
    ell(d, (150, 320, 398, 440), fill="#FFD9A6")
    poly(d, [(112, 300), (34, 222), (58, 300), (34, 378)], fill="#F0801F")  # 尾
    ell(d, (326, 260, 378, 312), fill="white")  # 坚定圆眼
    ell(d, (348, 272, 372, 296), fill="#222831")
    lin(d, (318, 238), (384, 254), 10, fill="#6B3A12")  # 斜眉
    ell(d, (338, 336, 372, 368), fill="#6B3A12")  # 张嘴呐喊
    ell(d, (344, 352, 366, 368), fill="#FF6F91")
    rrect(d, (-20, 392, 532, 532), 24, fill="#C08552")  # 工位掩体
    d.rectangle((0, sc(392), SIZE, sc(414)), fill="#DBA36B")
    ell(d, (312, 60, 362, 105), fill="#7A4A21")  # 咖啡豆子弹（飞向右上）
    arc(d, (316, 56, 358, 110), 60, 120, 6, fill="#5C3617")
    layer, ld = overlay(img)
    for box, a in (((284, 112, 322, 152), 200), ((298, 102, 334, 142), 170)):
        ld.arc(tuple(sc(v) for v in box), 110, 250, fill=(255, 255, 255, a), width=sc(6))
    img.alpha_composite(layer)
    # 逃跑的 Bug
    ell(d, (392, 112, 452, 168), fill="#FF5A5A")
    ell(d, (404, 126, 418, 140), fill="#FFD1D1")
    ell(d, (428, 136, 440, 148), fill="#FFD1D1")
    lin(d, (446, 120), (464, 98), 5, fill="#7A2E2E")
    lin(d, (452, 128), (474, 112), 5, fill="#7A2E2E")
    lin(d, (400, 166), (392, 184), 5, fill="#7A2E2E")
    lin(d, (416, 168), (414, 188), 5, fill="#7A2E2E")
    lin(d, (432, 166), (436, 186), 5, fill="#7A2E2E")
    ell(d, (372, 180, 390, 204), fill=(255, 255, 255, 220))  # 汗滴（Bug 甩出的）
    return save(img, "icon-v2")


def v3_saltfish():
    """v3 咸鱼躺平：暖黄底，灰蓝咸鱼 X 眼吐舌。"""
    img = rounded_bg((255, 201, 60), (255, 159, 28))
    grid(img, alpha=34)
    d = ImageDraw.Draw(img)
    poly(d, [(104, 300), (28, 222), (52, 300), (28, 378)], fill="#93A9B8")  # 尾
    poly(d, [(190, 232), (250, 150), (310, 232)], fill="#93A9B8")  # 背鳍
    ell(d, (88, 208, 428, 392), fill="#AEC3D0")
    ell(d, (120, 300, 420, 382), fill="#E8F0F4")
    lin(d, (308, 256), (350, 298), 10, fill="#41586B")  # X 眼
    lin(d, (350, 256), (308, 298), 10, fill="#41586B")
    ell(d, (362, 312, 394, 342), fill="#41586B")  # 张嘴
    rrect(d, (384, 316, 420, 334), 9, fill="#FF8FA3")  # 吐舌
    zzz(img)
    return save(img, "icon-v3")


if __name__ == "__main__":
    made = v1_layflat() + v2_guard() + v3_saltfish()
    # 预览拼图：三个 512 各缩到 300 并排，方便快速比对
    sheet = Image.new("RGBA", (940, 320), (255, 255, 255, 255))
    for i, p in enumerate(made[::2]):
        tile = Image.open(p).resize((300, 300), Image.LANCZOS)
        sheet.paste(tile, (10 + i * 310, 10), tile)
    sheet.save(os.path.join(OUT, "preview-all.png"))
    print("\n".join(made))
