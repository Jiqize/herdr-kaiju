# 画风打样：等距像素城市沙盘 + 原创背鳍巨蜥
# 用法：python3 -I art/proto.py <输出目录> [day|night]
import math, sys
from PIL import Image, ImageDraw

OUT = sys.argv[1]
MODE = sys.argv[2] if len(sys.argv) > 2 else "day"
NIGHT = MODE == "night"
W, H = 300, 290          # 原生像素画布（1 美术像素 = 1 逻辑像素）
OX, OY = 150, 92         # 世界原点在画布上的位置

def hexc(h, a=255):
    return (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16), a)

def shade(c, k):  # k>0 变亮，k<0 变暗
    r, g, b, a = c
    if k >= 0:
        return (int(r + (255 - r) * k), int(g + (255 - g) * k), int(b + (255 - b) * k), a)
    return (int(r * (1 + k)), int(g * (1 + k)), int(b * (1 + k)), a)

def P(x, y, z=0):  # 世界坐标 → 屏幕（2:1 等距）
    return (round(OX + (x - y)), round(OY + (x + y) / 2 - z))

img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

def poly(pts, fill):
    d.polygon([P(*p) for p in pts], fill=fill)

def box(x, y, z, w, dd, h, base, windows=True, win_rows=None):
    top, left, right = shade(base, 0.28), base, shade(base, -0.28)
    # 左前面（沿 x，位于 y+dd）与右前面（沿 y，位于 x+w）
    poly([(x, y + dd, z), (x + w, y + dd, z), (x + w, y + dd, z + h), (x, y + dd, z + h)], left)
    poly([(x + w, y, z), (x + w, y + dd, z), (x + w, y + dd, z + h), (x + w, y, z + h)], right)
    poly([(x, y, z + h), (x + w, y, z + h), (x + w, y + dd, z + h), (x, y + dd, z + h)], top)
    if not windows:
        return
    lit = hexc("#ffd36b") if NIGHT else None
    rows = win_rows or range(int(z) + 5, int(z + h) - 4, 6)
    for i, wz in enumerate(rows):
        for u in range(2, int(w) - 2, 4):
            on = NIGHT and (hash((x, y, u, wz)) % 5 < 2)
            c = lit if on else shade(base, -0.55)
            poly([(x + u, y + dd, wz), (x + u + 2, y + dd, wz), (x + u + 2, y + dd, wz + 3), (x + u, y + dd, wz + 3)], c)
        for u in range(2, int(dd) - 2, 4):
            on = NIGHT and (hash((x, y, -u, wz)) % 5 < 2)
            c = lit if on else shade(base, -0.62)
            poly([(x + w, y + u, wz), (x + w, y + u + 2, wz), (x + w, y + u + 2, wz + 3), (x + w, y + u, wz + 3)], c)

# ---- 底座 ----
S = 132  # 沙盘边长（世界单位）
T = 14   # 底座厚度
ground = hexc("#2a2e35") if NIGHT else hexc("#cfcac1")
# 底座两侧剖面：上层路基，下层深色
poly([(0, S, 0), (S, S, 0), (S, S, -T), (0, S, -T)], shade(ground, -0.32))
poly([(S, 0, 0), (S, S, 0), (S, S, -T), (S, 0, -T)], shade(ground, -0.45))
poly([(0, S, -T + 4), (S, S, -T + 4), (S, S, -T), (0, S, -T)], hexc("#33302d"))
poly([(S, 0, -T + 4), (S, S, -T + 4), (S, S, -T), (S, 0, -T)], hexc("#2a2725"))
poly([(0, 0, 0), (S, 0, 0), (S, S, 0), (0, S, 0)], ground)
# 前角海水剖面
wx, wy = 34, 92
water_top = hexc("#1f6fb2") if NIGHT else hexc("#3a9be0")
poly([(wx, wy, -3), (S - 40, wy, -3), (S - 40, S, -3), (wx, S, -3)], water_top)
poly([(wx, S, -3), (S - 40, S, -3), (S - 40, S, -T + 4), (wx, S, -T + 4)], shade(water_top, -0.35))
for i in range(40):  # 浪花
    fx = wx + 3 + (i * 37) % (S - 40 - wx - 6)
    fy = wy + 3 + (i * 53) % (S - wy - 6)
    poly([(fx, fy, -3), (fx + 4, fy, -3), (fx + 4, fy + 1, -3), (fx, fy + 1, -3)], hexc("#e9f6ff"))
# 岸边护栏
poly([(wx, wy, 0), (S - 40, wy, 0), (S - 40, wy + 1, 0), (wx, wy + 1, 0)], shade(ground, -0.2))

# ---- 道路 ----
road = hexc("#3b3f46") if NIGHT else hexc("#4a4d53")
poly([(0, 58, 0.1), (S, 58, 0.1), (S, 72, 0.1), (0, 72, 0.1)], road)
poly([(58, 0, 0.1), (72, 0, 0.1), (72, wy - 2, 0.1), (58, wy - 2, 0.1)], road)
for u in range(4, S, 10):
    if not 56 < u < 74:
        poly([(u, 64.6, 0.2), (u + 4, 64.6, 0.2), (u + 4, 65.4, 0.2), (u, 65.4, 0.2)], hexc("#f2f2f2"))
for u in range(4, wy - 4, 10):
    if not 56 < u < 74:
        poly([(64.6, u, 0.2), (65.4, u, 0.2), (65.4, u + 4, 0.2), (64.6, u + 4, 0.2)], hexc("#f2f2f2"))

# ---- 建筑（按深度排序画）----
buildings = [
    # x, y, w, d, h, color
    (8, 8, 22, 22, 74, "#6f8fc9"),     # 蓝
    (36, 10, 16, 16, 40, "#d9573f"),   # 红
    (78, 6, 24, 24, 118, "#9aa3b5"),   # 摩天楼
    (106, 34, 20, 18, 56, "#d9d2bf"),  # 米色
    (36, 32, 16, 18, 52, "#5fae6e"),   # 绿
    (8, 78, 18, 10, 30, "#d6a046"),    # 黄（靠海）
    (78, 36, 22, 18, 84, "#e07a3c"),   # 橙（被拆）
]
buildings.sort(key=lambda b: b[0] + b[1] + b[2] + b[3])
for (x, y, w, dd, h, c) in buildings:
    base = hexc(c)
    if NIGHT:
        base = shade(base, -0.35)
    if c == "#e07a3c":
        box(x, y, 0, w, dd, h - 30, base)
        # 缺口：上段只剩一半
        box(x, y, h - 30, w * 0.55, dd, 18, base)
        continue
    box(x, y, 0, w, dd, h, base)
    # 楼顶小水箱 + 天线
    box(x + w * 0.3, y + dd * 0.3, h, 6, 6, 4, shade(base, 0.1), windows=False)
    if h > 60:
        ax, ay = P(x + w / 2, y + dd / 2, h + 4)
        d.line([(ax, ay), (ax, ay - 12)], fill=hexc("#555a63"), width=1)
        if NIGHT:
            d.point((ax, ay - 12), fill=hexc("#ff4d4d"))

# ---- 怪兽：背鳍巨蜥（原创）----
def monster(cx, cy):
    m = Image.new("RGBA", (70, 80), (0, 0, 0, 0))
    g = ImageDraw.Draw(m)
    skin = hexc("#2f3a44")
    dark = shade(skin, -0.35)
    light = shade(skin, 0.18)
    fin = hexc("#5ad1ff") if NIGHT else hexc("#7f93a6")
    # 尾巴
    g.polygon([(30, 60), (6, 70), (2, 76), (16, 74), (36, 66)], fill=dark)
    # 腿
    g.rectangle([24, 58, 33, 76], fill=dark)
    g.rectangle([38, 58, 47, 76], fill=skin)
    g.rectangle([22, 74, 34, 78], fill=dark)
    g.rectangle([37, 74, 49, 78], fill=skin)
    # 躯干
    g.ellipse([20, 26, 52, 66], fill=skin)
    g.ellipse([22, 28, 36, 62], fill=light)
    g.ellipse([34, 38, 48, 62], fill=shade(skin, 0.3))  # 肚皮
    # 背鳍（锯齿）
    for i, (bx, by) in enumerate([(22, 30), (20, 38), (19, 46), (20, 54)]):
        g.polygon([(bx, by), (bx - 7, by - 4 + (i % 2)), (bx + 1, by + 6)], fill=fin)
    # 手臂
    g.polygon([(46, 40), (60, 44), (62, 48), (48, 46)], fill=skin)
    g.polygon([(60, 44), (66, 42), (64, 49), (62, 48)], fill=light)
    # 头（朝右上）
    g.ellipse([36, 8, 60, 30], fill=skin)
    g.polygon([(52, 14), (68, 16), (66, 24), (52, 26)], fill=skin)   # 吻部
    g.polygon([(54, 23), (66, 24), (64, 28), (54, 28)], fill=dark)   # 下颌（张嘴）
    g.point((61, 24), fill=hexc("#ffffff")); g.point((63, 24), fill=hexc("#ffffff"))
    g.rectangle([50, 14, 52, 16], fill=hexc("#7ff3ff") if NIGHT else hexc("#f6d04d"))  # 眼睛
    g.polygon([(40, 8), (36, 2), (44, 7)], fill=fin)
    # 1 像素描边
    a = m.split()[3]
    out = Image.new("RGBA", m.size, (0, 0, 0, 0))
    edge = hexc("#14181d")
    px, al = out.load(), a.load()
    for yy in range(m.size[1]):
        for xx in range(m.size[0]):
            if al[xx, yy] == 0 and any(0 <= xx + dx < m.size[0] and 0 <= yy + dy < m.size[1] and al[xx + dx, yy + dy] > 0
                                       for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                px[xx, yy] = edge
    out.alpha_composite(m)
    img.alpha_composite(out, (cx - 35, cy - 76))

# 碎石与烟尘（怪兽脚边、橙楼旁）
def dust(x, y, z, r):
    sx, sy = P(x, y, z)
    for k, (ddx, ddy, rr) in enumerate([(0, 0, r), (r * .8, -r * .3, r * .8), (-r * .7, -r * .2, r * .7), (r * .2, -r * .8, r * .75)]):
        c = hexc("#e8dcc6") if not NIGHT else hexc("#6f6a62")
        d.ellipse([sx + ddx - rr, sy + ddy - rr, sx + ddx + rr, sy + ddy + rr], fill=shade(c, -0.1 * (k % 2)), outline=shade(c, -0.3))

for i in range(14):
    rx, ry = 96 + (i * 7) % 26, 52 + (i * 11) % 22
    box(rx, ry, 0, 2 + i % 3, 2 + (i * 2) % 3, 1 + i % 3, hexc("#8c8277") if not NIGHT else hexc("#4a4540"), windows=False)

mx, my = P(112, 70, 0)
monster(mx, my)
dust(96, 40, 62, 6)
dust(104, 58, 40, 5)

# 沙盘投影 + 舞台背景
stage = Image.new("RGBA", (W, H), hexc("#0f1218") if NIGHT else hexc("#f4f4f4"))
sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sd = ImageDraw.Draw(sh)
sd.polygon([P(-6, -6, -T - 2), P(S + 8, -6, -T - 2), P(S + 8, S + 8, -T - 2), P(-6, S + 8, -T - 2)], fill=(0, 0, 0, 40 if not NIGHT else 90))
stage.alpha_composite(sh, (6, 10))
stage.alpha_composite(img)
stage.resize((W * 3, H * 3), Image.NEAREST).save(f"{OUT}/proto-{MODE}.png")
print("ok", MODE)
