#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
软著申报材料生成器（供《摸鱼保卫战游戏软件 V1.0》在中国版权保护中心登记使用）

生成两份 PDF 到 软著材料/：
  1. 摸鱼保卫战V1.0-源程序.pdf   —— 前 30 页 + 后 30 页、每页 50 行（总量不足 60 页则全部提交）
  2. 摸鱼保卫战V1.0-软件说明书.pdf —— 用户手册格式，含目录/界面说明/内容说明

运行：python3 tools/gen_ruanzhu.py
"""
import math
import os
import sys

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas as pdfcanvas

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, '软著材料')

SOFT_NAME = '摸鱼保卫战游戏软件V1.0'
FONT = 'STSong-Light'

PAGE_W, PAGE_H = A4
MARGIN_X = 45
MARGIN_TOP = 55
MARGIN_BOTTOM = 50
LINE_H = 12.2          # 源程序行距
FONT_SIZE_CODE = 9.3
LINES_PER_PAGE = 50
BODY_W = PAGE_W - MARGIN_X * 2

pdfmetrics.registerFont(UnicodeCIDFont(FONT))


def display_width(s):
    """粗略显示宽度：中文按 2 个半角宽。"""
    w = 0
    for ch in s:
        w += 2 if ord(ch) > 127 else 1
    return w


def wrap_line(s, max_w):
    """把一行按显示宽度折成多行。"""
    out = []
    cur = ''
    w = 0
    for ch in s:
        cw = 2 if ord(ch) > 127 else 1
        if w + cw > max_w:
            out.append(cur)
            cur = ch
            w = cw
        else:
            cur += ch
            w += cw
    out.append(cur)
    return out or ['']


def new_page_header_footer(c, header, page_no, total_pages):
    c.setFont(FONT, 9)
    c.setFillColorRGB(0.35, 0.35, 0.35)
    c.drawCentredString(PAGE_W / 2, PAGE_H - 32, header)
    c.drawCentredString(PAGE_W / 2, 26, '第 %d 页  共 %d 页' % (page_no, total_pages))
    c.setFillColorRGB(0, 0, 0)


# ---------------- 源程序 ----------------

SOURCE_ORDER = [
    'game.js',
    'js/main.js',
    'js/render.js',
    'js/core/config.js',
    'js/core/utils.js',
    'js/core/pool.js',
    'js/core/databus.js',
    'js/core/audio.js',
    'js/entities/enemy.js',
    'js/entities/projectile.js',
    'js/entities/fx.js',
    'js/systems/weapon.js',
    'js/systems/skills.js',
    'js/systems/waves.js',
    'js/ui/board.js',
    'js/ui/levelup.js',
    'js/ui/result.js',
    'js/ui/battle.js',
    'js/ui/home.js',
    'js/services/ads.js',
    'js/services/share.js',
    'js/services/track.js',
]


def collect_source_lines():
    lines = []
    for rel in SOURCE_ORDER:
        path = os.path.join(ROOT, rel)
        with open(path, encoding='utf-8') as f:
            text = f.read()
        lines.extend(text.rstrip('\n').split('\n'))
    return lines


def gen_source_pdf():
    raw = collect_source_lines()
    # 折行长行，保持每页正好 50 个渲染行
    wrapped = []
    for ln in raw:
        wrapped.extend(wrap_line(ln.replace('\t', '    '), 100))
    total_lines = len(wrapped)
    total_pages = math.ceil(total_lines / LINES_PER_PAGE)

    if total_pages <= 60:
        page_indices = list(range(total_pages))
        note = '全'
    else:
        page_indices = list(range(30)) + list(range(total_pages - 30, total_pages))
        note = '前30页+后30页'

    out_path = os.path.join(OUT_DIR, '摸鱼保卫战V1.0-源程序.pdf')
    c = pdfcanvas.Canvas(out_path, pagesize=A4)
    header = '《%s》源程序' % SOFT_NAME
    for seq, pi in enumerate(page_indices, start=1):
        new_page_header_footer(c, header, seq, len(page_indices))
        chunk = wrapped[pi * LINES_PER_PAGE:(pi + 1) * LINES_PER_PAGE]
        y = PAGE_H - MARGIN_TOP
        c.setFont(FONT, FONT_SIZE_CODE)
        for ln in chunk:
            c.drawString(MARGIN_X, y, ln)
            y -= LINE_H
        c.showPage()
    c.save()
    print('源程序：源代码共 %d 行 / %d 页，本次提交 %s（%d 页）→ %s'
          % (total_lines, total_pages, note, len(page_indices), out_path))
    return out_path


# ---------------- 软件说明书 ----------------

MANUAL = {
    'cover': {
        'title': '摸鱼保卫战游戏软件',
        'version': 'V1.0',
        'subtitle': '软件说明书（用户手册）',
        'meta': [
            ('软件名称', '摸鱼保卫战游戏软件'),
            ('版本号', 'V1.0'),
            ('开发完成日期', '2026年9月12日'),
            ('编写日期', '2026年9月'),
            ('运行平台', '微信客户端（iOS / Android）'),
        ],
    },
    'toc': [
        '一、软件概述',
        '二、运行环境',
        '三、软件结构',
        '四、使用说明',
        '五、游戏内容说明',
        '六、广告与未成年人保护说明',
        '七、注意事项',
    ],
    'sections': [
        ('一、软件概述', [
            ('1.1 开发目的', [
                '本软件是一款运行于微信客户端的休闲小游戏，以"打工人守护工位"为题材，'
                '将装备合成、塔防与随机技能选择三种玩法相结合。玩家通过拖动合成装备、'
                '选择随机技能抵御敌人波次，在碎片时间内获得轻松有趣的娱乐体验。',
            ]),
            ('1.2 主要功能', [
                '（1）合成玩法：玩家在 4×4 合成棋盘上拖动两件相同类型且相同等级的装备进行合成，'
                '得到等级提升 1 级的新装备，装备等级最高为 5 级；',
                '（2）塔防战斗：敌人从战场顶部持续出现并向底部工位移动，棋盘上的装备自动攻击敌人，'
                '工位具有生命值，被敌人持续攻击降至 0 时本局失败；',
                '（3）随机技能：玩家通过击杀敌人获得经验，升级时游戏暂停并随机提供三个技能供选择，'
                '技能分为白、蓝、紫、橙四种品质，可叠加；',
                '（4）关卡推进：游戏包含 8 个主题关卡，每 4 关设置一个首领敌人，通关后进入无尽模式；',
                '（5）局外成长：玩家使用金币在首页对工位进行三项永久升级（伤害、生命、金币收益）；',
                '（6）激励视频广告：玩家可自愿观看广告换取复活、结算奖励翻倍、技能刷新与每日宝箱；',
                '（7）社交分享：玩家可分享战绩卡片邀请好友挑战；',
                '（8）新手引导：首次进入游戏时提供分页玩法说明弹窗与第一关手把手合成教学。',
            ]),
            ('1.3 软件特点', [
                '（1）单手竖屏操作，单局时长约 2.5 至 4 分钟，适合碎片化娱乐；',
                '（2）全程无强制广告、无内购，纯休闲免费游戏；',
                '（3）数值配置数据驱动，便于持续调整游戏平衡；',
                '（4）对象池管理战斗对象，保证中低端手机的流畅运行。',
            ]),
        ]),
        ('二、运行环境', [
            ('2.1 运行硬件环境', [
                '搭载微信客户端的智能手机（iOS 12 及以上，或 Android 8.0 及以上），建议内存 4GB 以上。',
            ]),
            ('2.2 运行软件环境', [
                '微信客户端 8.0 及以上版本；微信开发者工具（开发调试环境）。',
            ]),
            ('2.3 开发环境', [
                '开发语言：JavaScript（ECMAScript 2017）；开发工具：微信开发者工具、Visual Studio Code；'
                '运行框架：微信小游戏运行时（Canvas 2D 渲染）。',
            ]),
        ]),
        ('三、软件结构', [
            ('', [
                '本软件由以下模块构成：',
                '（1）入口与主循环模块：负责游戏启动、帧循环与场景调度；',
                '（2）渲染适配模块：统一设计分辨率与触摸坐标换算，适配不同机型；',
                '（3）配置模块：集中管理武器、敌人、技能、关卡等全部数值；',
                '（4）数据模块：管理玩家存档与局内战斗状态；',
                '（5）实体模块：敌人、弹丸、特效等战斗对象及其对象池；',
                '（6）系统模块：武器行为、技能抽取、波次控制；',
                '（7）界面模块：首页、战斗、合成棋盘、升级三选一、结算、工位升级等界面；',
                '（8）服务模块：激励视频广告、社交分享、数据埋点、音效。',
            ]),
        ]),
        ('四、使用说明', [
            ('4.1 启动软件', [
                '用户在微信中搜索或通过分享卡片打开本小游戏，加载完成后进入首页。'
                '首次进入时自动弹出三页图文玩法说明，阅读后点击"知道了，开始摸鱼"关闭；'
                '之后可随时点击首页右上角"？"按钮重新查看。',
            ]),
            ('4.2 首页', [
                '首页自上而下显示：金币余额、游戏标题、当前关卡信息、主要按钮。'
                '按钮功能如下：',
                '（1）"开始摸鱼"：从当前进度关卡开始游戏；',
                '（2）"工位升级"：打开局外成长面板，使用金币升级显示器（全体伤害）、'
                '人体工学椅（工位生命）、摸鱼学（金币收益）三个项目，各 5 级，永久生效；',
                '（3）"广告宝箱"：自愿观看激励视频广告领取金币，每日 3 次；',
                '（4）"分享给工友"：调起微信分享，发送战绩卡片邀请好友。',
            ]),
            ('4.3 战斗界面', [
                '战斗界面自上而下分为三个区域：',
                '（1）顶部信息栏：左侧为关卡名称与剩余时间，中间为金币与角色等级，右侧为暂停按钮；'
                '信息栏下方细条为经验进度；出现首领敌人时显示其专属血条；',
                '（2）中部战场：敌人自顶部出现向下移动，越过工位防线后开始持续削减工位生命值；'
                '战场底部为工位桌面、工位生命条与护盾条；',
                '（3）底部合成棋盘：4×4 共 16 格，格子中的装备自动向战场开火。',
            ]),
            ('4.4 装备合成操作', [
                '玩家按住棋盘上的一件装备并拖动：',
                '（1）拖到另一件"同种类且同等级"的装备上，两件装备合为一件，等级加一（最高 5 级）；',
                '（2）拖到其他装备或空格上，两件装备交换位置；',
                '（3）拖出棋盘范围则装备放回原格。',
                '游戏中每隔约 22 秒自动向棋盘空格投放一件新的 1 级装备。棋盘空间有限，'
                '玩家需要不断合成以腾出空位，规划装备的升级路线与站位。',
            ]),
            ('4.5 升级三选一', [
                '击杀敌人获得经验，经验条满时游戏自动暂停，弹出三张随机技能卡片。'
                '点击任意一张即选择该技能并继续战斗。技能效果包括提升全体伤害、提升攻速、'
                '减速敌人、回复生命、增加金币经验收益等；品质分为白、蓝、紫、橙四档，'
                '稀有度依次提高，同一技能可多次选择进行叠加。点击"看广告刷新"可重新随机三张卡片，每局限 2 次。',
            ]),
            ('4.6 暂停、复活与结算', [
                '（1）点击右上角暂停按钮可暂停游戏，面板内提供继续、重开本关、音效开关与返回首页；',
                '（2）工位生命值降为 0 时弹出复活面板：观看广告可恢复 50% 生命并将全部敌人击退回入口，'
                '每局限一次；选择放弃则进入结算；',
                '（3）结算界面显示本局金币与击退数量：胜利时可观看广告使本局金币翻倍，'
                '并可进入下一关；失败时可再次挑战或返回首页。本局所得金币无论胜负均会保存。',
            ]),
            ('4.7 新手引导', [
                '首次进入第 1 关时，游戏暂停刷怪并高亮两件相同装备，以手指动画演示拖拽轨迹，'
                '玩家完成第一次合成后敌人方才开始出现；首次升级三选一时界面附加提示文字。'
                '引导状态分别记录，完成后不再重复出现。',
            ]),
        ]),
        ('五、游戏内容说明', [
            ('5.1 装备', [
                '咖啡（高攻速单体射击，弹丸自动追踪）、键盘（向前方发射穿透一列的键帽冲击波）、'
                'Bug（向敌人脚下投放定时自爆炸弹，造成范围伤害）、耳机（产生环绕自身旋转的声波，'
                '对接触到的敌人持续伤害）。每件装备均有 5 个等级，数值随等级提升。',
            ]),
            ('5.2 敌人', [
                'Bug：速度快、数量多；群消息：体积小、成群出现；紧急需求：中等血量的常规敌人；'
                '产品需求：死亡时分裂为 3 个小需求；小需求：由产品需求分裂产生的快速敌人；'
                '产品经理（首领）：周期性召唤增援，生命值低于 40% 时进入狂暴状态，攻速与攻击提升。',
            ]),
            ('5.3 关卡', [
                '普通关卡 1 至 8 关，关卡时长 150 至 255 秒，敌人数量与强度逐关递增；'
                '第 4、8 关结尾出现首领敌人；第 8 关之后进入无尽模式，敌人强度持续提升，'
                '供玩家挑战最高纪录。',
            ]),
        ]),
        ('六、广告与未成年人保护说明', [
            ('', [
                '本软件全部广告均为用户自愿观看的激励视频广告，用于换取游戏内奖励，'
                '不存在任何强制广告、开屏广告或内购付费项目。用户实名认证、未成年人识别'
                '与防沉迷限制由微信平台统一的健康系统提供，本软件不收集任何用户个人信息，'
                '用户数据仅保存在用户本人的微信本地存储中。',
            ]),
        ]),
        ('七、注意事项', [
            ('', [
                '（1）本软件为免费休闲游戏，请合理安排游戏时间，注意劳逸结合；',
                '（2）游戏进度保存在用户微信本地存储中，删除小程序或更换设备可能导致进度丢失；',
                '（3）本软件的全部画面元素与代码为开发者原创，未经许可请勿抄袭或商用。',
            ]),
        ]),
    ],
}


def gen_manual_pdf():
    out_path = os.path.join(OUT_DIR, '摸鱼保卫战V1.0-软件说明书.pdf')
    c = pdfcanvas.Canvas(out_path, pagesize=A4)
    header = '《%s》软件说明书' % SOFT_NAME

    # 展平正文内容流：(style, text)
    cur = []
    for title, blocks in MANUAL['sections']:
        cur.append(('h1', title))
        for sub, paras in blocks:
            if sub:
                cur.append(('h2', sub))
            for p in paras:
                cur.append(('body', p))

    def count_lines(style, text):
        if style in ('h1', 'h2'):
            return 2
        return len(wrap_line(text, 62)) + (1 if text == '' else 0)

    def layout():
        pg, used = [], 0
        out = []
        for style, text in cur:
            n = count_lines(style, text)
            if used + n > 30 and pg:
                out.append(pg)
                pg, used = [], 0
            pg.append((style, text))
            used += n
        if pg:
            out.append(pg)
        return out

    pages = layout()
    total = len(pages) + 2  # 含封面与目录

    # 封面
    new_page_header_footer(c, header, 1, total)
    c.setFont(FONT, 30)
    c.drawCentredString(PAGE_W / 2, PAGE_H - 200, MANUAL['cover']['title'])
    c.setFont(FONT, 20)
    c.drawCentredString(PAGE_W / 2, PAGE_H - 240, MANUAL['cover']['version'])
    c.setFont(FONT, 15)
    c.drawCentredString(PAGE_W / 2, PAGE_H - 290, MANUAL['cover']['subtitle'])
    c.setFont(FONT, 12)
    yy = PAGE_H - 400
    for k, v in MANUAL['cover']['meta']:
        c.drawString(PAGE_W / 2 - 120, yy, '%s：' % k)
        c.drawString(PAGE_W / 2 - 10, yy, v)
        yy -= 26
    c.showPage()

    # 目录
    new_page_header_footer(c, header, 2, total)
    c.setFont(FONT, 16)
    c.drawString(MARGIN_X, PAGE_H - MARGIN_TOP, '目录')
    c.setFont(FONT, 12)
    yy = PAGE_H - MARGIN_TOP - 40
    for t in MANUAL['toc']:
        c.drawString(MARGIN_X + 10, yy, t)
        yy -= 28
    c.showPage()

    # 正文
    for i, pg in enumerate(pages, start=3):
        new_page_header_footer(c, header, i, total)
        y = PAGE_H - MARGIN_TOP
        for style, text in pg:
            if style == 'h1':
                c.setFont(FONT, 14)
                y -= 8
                c.drawString(MARGIN_X, y, text)
                y -= 22
            elif style == 'h2':
                c.setFont(FONT, 12)
                y -= 4
                c.drawString(MARGIN_X + 10, y, text)
                y -= 20
            elif style == 'cover':
                pass
            else:
                c.setFont(FONT, 11)
                if text == '':
                    y -= 10
                    continue
                for sub in wrap_line(text, 62):
                    c.drawString(MARGIN_X + 10, y, sub)
                    y -= 17
        c.showPage()
    c.save()
    print('说明书：共 %d 页（含封面目录）→ %s' % (total, out_path))
    return out_path


if __name__ == '__main__':
    os.makedirs(OUT_DIR, exist_ok=True)
    gen_source_pdf()
    gen_manual_pdf()
    print('完成。实名认证后到 register.ccopyright.com.cn 提交申请表并上传这两份 PDF。')
