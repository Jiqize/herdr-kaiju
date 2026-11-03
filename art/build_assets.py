# 一键生成 mods/kaiju/assets/：底座、8 楼位 ×（4 损坏级别 + 空地）、怪兽帧、特效图标与 manifest.json
# 用法：python3 -I art/build_assets.py
# 所有图片按 1 美术像素 = 1 逻辑像素绘制，导出时最近邻放大 2 倍（Retina 下 1 美术像素 = 2 设备像素）
import colorsys, json, os, shutil, subprocess, sys, tempfile
import numpy as np
from PIL import Image

ART = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(ART)
sys.path.insert(0, ART)
import render as R

OUT = os.path.join(ROOT, "mods", "kaiju", "assets")
SAMPLES = os.path.join(ART, "samples")
MODES = ("day", "night")
FRAMES = ("idle", "walk", "smash", "roar", "wave")   # 与 AI 动作表从左到右的顺序一致
SPRITE_H = 60

def save2x(arr_or_img, path, k=2):
    im = arr_or_img if isinstance(arr_or_img, Image.Image) else Image.fromarray(arr_or_img, "RGBA")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.resize((im.width * k, im.height * k), Image.NEAREST).save(path)

def save1x(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)

def bbox(arr):
    ys, xs = np.where(arr[:, :, 3] > 0)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1

# ---------- 城市图层 ----------
def build_city(mode, manifest):
    R.reset(mode)
    R.draw_plate()
    snap = R.snapshot()
    plate = Image.fromarray(R.clouds(), "RGBA")
    plate.alpha_composite(R.shadow())
    plate.alpha_composite(Image.fromarray(R.layer(), "RGBA"))
    save2x(plate, f"{OUT}/{mode}/plate.png")
    layers = {"plate": np.asarray(plate)}
    for i in range(len(R.SLOTS)):
        for dmg in (-1, 0, 1, 2, 3):
            R.restore(snap)
            lo = R._next[0] + 1
            R.draw_slot(i, dmg)
            arr = R.layer((lo, R._next[0] + 1))
            name = f"slot{i}-empty.png" if dmg < 0 else f"slot{i}-{dmg}.png"
            save2x(arr, f"{OUT}/{mode}/{name}")
            layers[(i, dmg)] = arr
    if mode == "day":
        for i, (x, y, w, d, h, color, kind) in enumerate(R.SLOTS):
            x0, y0, x1, y1 = bbox(layers[(i, 0)])
            cx, _ = R.P(x + w / 2, y + d / 2, h)
            stands = []
            for (sx, sy) in R.STANDS[i]:
                px, py = R.P(sx, sy, 0)
                stands.append({"x": round(px), "y": round(py), "depth": sx + sy})
            manifest["slots"].append({
                "i": i, "color": color,
                "roof": {"x": round(cx), "y": y0},
                # 各损坏级别的实际楼顶 y（箭头、警报灯跟着楼高走）
                "roofs": [bbox(layers[(i, k)])[1] for k in range(4)],
                "stand": stands,
                "hit": {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0},
                "depth": x + w / 2 + y + d / 2,
                "layers": [f"slot{i}-{k}.png" for k in range(4)], "empty": f"slot{i}-empty.png",
            })
        ex, ey = R.ENTRY
        px, py = R.P(ex, ey, -4)
        manifest["entry"] = {"x": round(px), "y": round(py), "depth": ex + ey}
    return layers

# ---------- 怪兽 ----------
def is_glow(rgb):
    # 夜晚发光像素：青色系，且高饱和，或中饱和但很亮（巨蜥背鳍、机甲面罩）
    h, s, v = colorsys.rgb_to_hsv(*(np.asarray(rgb) / 255.0))
    return 170 <= h * 360 <= 205 and (s > 0.5 or (s > 0.25 and v > 0.8))

def to_night(arr):
    out = arr.astype(float)
    glow_tint = np.array([110, 232, 255.0])
    for yy, xx in zip(*np.where(arr[:, :, 3] > 0)):
        rgb = out[yy, xx, :3]
        if is_glow(arr[yy, xx, :3]):
            out[yy, xx, :3] = rgb * 0.7 + glow_tint * 0.3
        else:
            out[yy, xx, :3] = rgb * 0.78
    return np.clip(out, 0, 255).astype(np.uint8)

def pixelize(sheet):
    tmp = tempfile.mkdtemp(prefix="kaiju-px-")
    subprocess.run([sys.executable, "-I", os.path.join(ART, "pixelize.py"), os.path.join(ROOT, sheet), tmp, str(SPRITE_H), "--poses", str(len(FRAMES))],
                   check=True, capture_output=True)
    frames = [np.asarray(Image.open(f"{tmp}/frame{k}.png").convert("RGBA")) for k in range(len(FRAMES))]
    assert not os.path.exists(f"{tmp}/frame{len(FRAMES)}.png"), f"{sheet}: 姿势数不是 {len(FRAMES)}"
    shutil.rmtree(tmp)
    return dict(zip(FRAMES, frames))

def in_box(arr, bw, bh):
    # 放进统一画布：脚底中点对齐画布底边中点
    box = np.zeros((bh, bw, 4), dtype=np.uint8)
    fh, fw = arr.shape[:2]
    left = (bw - fw) // 2
    box[bh - fh:, left:left + fw] = arr
    return box

def face_center(arr):
    # 五官中心：帧上 70% 里、轮廓内部（四邻都不透明）的很深像素 = 眼睛、嘴；找不到返回 None
    top = arr[:round(arr.shape[0] * 0.7)]
    a = top[:, :, 3] > 0
    inner = np.zeros_like(a)
    inner[1:-1, 1:-1] = a[1:-1, 1:-1] & a[:-2, 1:-1] & a[2:, 1:-1] & a[1:-1, :-2] & a[1:-1, 2:]
    luma = top[:, :, :3].astype(int) @ np.array([299, 587, 114]) // 1000
    ys, xs = np.where(inner & (luma < 45))
    if len(xs) < 3:
        return None
    return int(round(xs.mean())), int(round(ys.mean()))

def head_crop(arr, size):
    # 头部：按五官中心裁 size×size（背刺、翅膀不会把脸挤出框；弯腰的拆楼帧也能裁到脸）
    x0, y0, x1, y1 = bbox(arr)
    fc = face_center(arr)
    cx, cy = fc if fc else ((x0 + x1) // 2, y0 + size // 2)
    # 五官放在框里偏下一点（上面留给头顶），框不超出角色轮廓
    left = min(max(cx - size // 2, x0), max(x0, x1 - size))
    top = min(max(cy - size * 9 // 16, y0), max(y0, y1 - size))
    box = np.zeros((size, size, 4), dtype=np.uint8)
    src = arr[top:top + size, left:left + size]
    oy = (size - src.shape[0]) // 2
    ox = (size - src.shape[1]) // 2
    box[oy:oy + src.shape[0], ox:ox + src.shape[1]] = src
    return box

def build_monsters(manifest):
    roster = json.load(open(os.path.join(ART, "roster.json")))
    raw = {m["id"]: pixelize(m["sheet"]) for m in roster}
    bw = max(f.shape[1] for fr in raw.values() for f in fr.values()) + 4
    bh = max(f.shape[0] for fr in raw.values() for f in fr.values())
    bw += bw % 2; bh += bh % 2
    manifest["sprite"] = {"w": bw, "h": bh, "ax": bw // 2, "ay": bh}
    sprites = {}
    for m in roster:
        mid, fr = m["id"], raw[m["id"]]
        entry = {"id": mid, "name": m["name"], "frames": {}, "heads": {}, "top": bh - fr["idle"].shape[0]}
        for mode in MODES:
            conv = (lambda a: a) if mode == "day" else to_night
            for k in FRAMES:
                save2x(in_box(conv(fr[k]), bw, bh), f"{OUT}/{mode}/monsters/{mid}/{k}.png")
                # 头像 48×48 原尺寸保存：按 24 逻辑像素显示时 1 美术像素 = 1 设备像素
                save1x(Image.fromarray(head_crop(conv(fr[k]), 48), "RGBA"), f"{OUT}/{mode}/monsters/{mid}/head-{k}.png")
                # 名册大头像：和快讯同样 32×32 紧裁（脸撑满），3 倍导出 96px，按 48 逻辑像素显示
                save2x(head_crop(conv(fr[k]), 32), f"{OUT}/{mode}/monsters/{mid}/avatar-{k}.png", 3)
            # 快讯大头像：咆哮帧头部 32×32，2 倍导出，按 32 逻辑像素显示
            save2x(head_crop(conv(fr["roar"]), 32), f"{OUT}/{mode}/monsters/{mid}/face-roar.png")
            if mode == "day":
                sprites[mid] = {k: in_box(fr[k], bw, bh) for k in FRAMES}
        entry["avatars"] = {k: f"monsters/{mid}/avatar-{k}.png" for k in FRAMES}
        for k in FRAMES:
            entry["frames"][k] = f"monsters/{mid}/{k}.png"
        entry["frames"]["head"] = f"monsters/{mid}/head-idle.png"
        for k in FRAMES:
            entry["heads"][k] = f"monsters/{mid}/head-{k}.png"
        entry["face"] = f"monsters/{mid}/face-roar.png"
        manifest["monsters"].append(entry)
    return sprites

# ---------- 特效图标（字符画） ----------
FX = {
    "arrow": ("""
..KKKKK..
..KYYOK..
..KYYOK..
KKKYYOKKK
KYYYYYYOK
.KYYYYOK.
..KYYOK..
...KYK...
....K....""", {"K": "#2b2620", "Y": "#ffd23f", "O": "#e8a21c"}),
    "bang": ("""
.KKKKKKKKKKK.
KWWWWWWWWWWWK
KWWWRRWRRWWWK
KWWWRRWRRWWWK
KWWWRRWRRWWWK
KWWWRRWRRWWWK
KWWWWWWWWWWWK
KWWWRRWRRWWWK
KWWWWWWWWWWWK
.KKKKWWKKKKK.
....KWK......
....KK.......""", {"K": "#2b2620", "W": "#ffffff", "R": "#e8402f"}),
    "question": ("""
.KKKKKKKKKKK.
KWWWWWWWWWWWK
KWWWWBBBWWWWK
KWWWBWWWBWWWK
KWWWWWWWBWWWK
KWWWWWWBWWWWK
KWWWWWBWWWWWK
KWWWWWWWWWWWK
KWWWWWBWWWWWK
KWWWWWWWWWWWK
.KKKKWWKKKKK.
....KWK......
....KK.......""", {"K": "#2b2620", "W": "#ffffff", "B": "#2f6fe0"}),
    "zz": ("""
KKKKKK.......
KZZZZK.......
KKKZZK.KKKKK.
.KZZKK.KzzzK.
KZZKKK.KKzKK.
KZZZZK.KzzzK.
KKKKKK.KKKKK.""", {"K": "#2b3a55", "Z": "#9cc7ff", "z": "#c9e0ff"}),
    "siren": ("""
.KKK.
KRWRK
KRRRK
KKKKK""", {"K": "#2b2620", "R": "#ff3b3b", "W": "#ffd0d0"}),
    "brick": ("""
KKKKKKKKKKKK
KBBBBKBBBBBK
KBBBBKBBBBBK
KKKKKKKKKKKK
KBBKBBBBBKBK
KBBKBBBBBKBK
KKKKKKKKKKKK
KBBBBBKBBBBK
KBBBBBKBBBBK
KKKKKKKKKKKK""", {"K": "#6b3524", "B": "#d9673f"}),
    # 名册卡片行首小图标：任务、位置、时钟、残楼（战绩）
    "i-task": ("""
KKKKKKK..
KWWWWWKK.
KWKKKWWK.
KWWWWWWK.
KWKKKKWK.
KWWWWWWK.
KWKKKWWK.
KWWWWWWK.
KKKKKKKK.""", {"K": "#6b655d", "W": "#fffdf5"}),
    "i-pin": ("""
..KKKKK..
.KRRRRRK.
KRRWWRRRK
KRRWWRRRK
KRRRRRRRK
.KRRRRRK.
..KRRRK..
...KRK...
....K....""", {"K": "#6b3524", "R": "#e8402f", "W": "#ffd0d0"}),
    "i-clock": ("""
..KKKKK..
.KWWKWWK.
KWWWKWWWK
KWWWKWWWK
KWWWKKKWK
KWWWWWWWK
KWWWWWWWK
.KWWWWWK.
..KKKKK..""", {"K": "#2b3a55", "W": "#cfe3ff"}),
    "i-rubble": ("""
..K..K...
.KGKKGK..
.KGGGGGK.
.KGYGYGK.
.KGGGGGK.
.KGYGYGK.
KKGGGGGKK
KDDKDDKDK
KKKKKKKKK""", {"K": "#2b2620", "G": "#a3acbd", "Y": "#ffd23f", "D": "#9b958c"}),
}

def fx_bitmap(art, colors, mode):
    rows = [r for r in art.strip("\n").split("\n")]
    w = max(len(r) for r in rows)
    out = np.zeros((len(rows), w + (w % 2), 4), dtype=np.uint8)
    for yy, r in enumerate(rows):
        for xx, ch in enumerate(r):
            if ch in colors:
                c = R.hexc(colors[ch]).astype(int)
                if mode == "night" and ch in "KB" and colors is FX["brick"][1]:
                    c[:3] = (c[:3] * 0.8).astype(int)
                out[yy, xx] = c
    return out

def build_fx(mode, manifest):
    sizes = {}
    for name, (art, colors) in FX.items():
        arr = fx_bitmap(art, colors, mode)
        save2x(arr, f"{OUT}/{mode}/fx/{name}.png")
        sizes[name] = [arr.shape[1], arr.shape[0]]
    R.reset(mode)
    dust = R.puff(0, 0, 0.6).c.astype(np.uint8)
    dust = dust[:dust.shape[0] // 2 * 2, :dust.shape[1] // 2 * 2]
    save2x(dust, f"{OUT}/{mode}/fx/dust.png")
    sizes["dust"] = [dust.shape[1], dust.shape[0]]
    if mode == "day":
        manifest["fx"] = {k: f"fx/{k}.png" for k in sizes}
        # 1 倍逻辑尺寸 [宽, 高]
        manifest["fxSize"] = sizes

# ---------- 检查 ----------
def verify(manifest):
    names = ["plate.png"]
    for s in manifest["slots"]:
        names += s["layers"] + [s["empty"]]
    for m in manifest["monsters"]:
        names += list(m["frames"].values()) + list(m["heads"].values()) + list(m["avatars"].values()) + [m["face"]]
    names += list(manifest["fx"].values())
    cw, ch = manifest["canvas"]["w"] * 2, manifest["canvas"]["h"] * 2
    for mode in MODES:
        for n in names:
            p = f"{OUT}/{mode}/{n}"
            assert os.path.exists(p), f"缺文件 {p}"
            w, h = Image.open(p).size
            assert w % 2 == 0 and h % 2 == 0, f"尺寸不是 2 的整数倍 {p} {w}×{h}"
            if n == "plate.png" or n.startswith("slot"):
                assert (w, h) == (cw, ch), f"图层尺寸不对 {p} {w}×{h}"
    return len(names) * len(MODES)

def check_image(manifest, layers, sprites):
    # 合成检查图：底座 + 全部楼（按 depth）+ 怪兽各就各位；再附一条橙楼损坏级别对照
    slots = manifest["slots"]
    sp = manifest["sprite"]
    ids = [m["id"] for m in manifest["monsters"]]
    actors = [  # (站位, 图像)
        (slots[1]["stand"][0], sprites[ids[0]]["smash"]),
        (slots[1]["stand"][1], sprites[ids[1 % len(ids)]]["wave"]),
        (slots[2]["stand"][0], sprites[ids[1 % len(ids)]]["roar"]),
        (slots[6]["stand"][0], sprites[ids[2 % len(ids)]]["wave"]),
        (slots[5]["stand"][0], sprites[ids[2 % len(ids)]]["smash"]),
        (manifest["entry"], sprites[ids[0]]["walk"]),
    ]
    canvas = Image.new("RGBA", (R.W, R.H), (245, 245, 244, 255))
    canvas.alpha_composite(Image.fromarray(layers["plate"]))
    items = [(s["depth"], Image.fromarray(layers[(s["i"], 0)])) for s in slots]
    for pos, img in actors:
        layer = Image.new("RGBA", (R.W, R.H), (0, 0, 0, 0))
        layer.alpha_composite(Image.fromarray(img), (pos["x"] - sp["ax"], pos["y"] - sp["ay"]))
        items.append((pos["depth"], layer))
    # 楼按 depth，怪兽一律在楼之上（与 city.js 一致）
    items = [(0, d, img) for d, img in items[:len(slots)]] + [(1, d, img) for d, img in items[len(slots):]]
    for _, _, img in sorted(items, key=lambda t: (t[0], t[1])):
        canvas.alpha_composite(img)
    strip = Image.new("RGBA", (R.W, R.H), (245, 245, 244, 255))
    strip.alpha_composite(Image.fromarray(layers["plate"]))
    dmg_row = Image.new("RGBA", (R.W * 5, R.H), (245, 245, 244, 255))
    for k, dmg in enumerate((0, 1, 2, 3, -1)):
        cell = strip.copy()
        cell.alpha_composite(Image.fromarray(layers[(1, dmg)]))
        dmg_row.paste(cell, (k * R.W, 0))
    os.makedirs(SAMPLES, exist_ok=True)
    canvas.resize((R.W * 3, R.H * 3), Image.NEAREST).save(f"{SAMPLES}/assets-check.png")
    dmg_row.crop((0, 150, R.W * 5, R.H)).save(f"{SAMPLES}/assets-damage.png")

def main():
    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    manifest = {"canvas": {"w": R.W, "h": R.H}, "slots": [], "monsters": []}
    day_layers = None
    for mode in MODES:
        layers = build_city(mode, manifest)
        if mode == "day":
            day_layers = layers
        build_fx(mode, manifest)
    sprites = build_monsters(manifest)
    with open(f"{OUT}/manifest.json", "w") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    # mod 里同步 import 用的同一份数据
    with open(os.path.join(ROOT, "mods", "kaiju", "manifest.js"), "w") as f:
        f.write("// 由 art/build_assets.py 生成，勿手改\nexport default " + json.dumps(manifest, ensure_ascii=False) + ";\n")
    n = verify(manifest)
    check_image(manifest, day_layers, sprites)
    print(f"ok: {n} 张素材，{len(manifest['slots'])} 楼位，{len(manifest['monsters'])} 只怪兽 → {OUT}")

if __name__ == "__main__":
    main()
