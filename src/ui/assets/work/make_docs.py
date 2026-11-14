# 用程式排版四張「文件類」的圖：押金確認單、班表、兩張檔案資訊截圖。
# 上面的字都是文本對話和使用者確認過的事實（見 docs/design.md 第 5 節），不要在這裡自己改數字。
# 用法：python3 src/ui/assets/work/make_docs.py   （在專案根目錄執行）
# 輸出到 src/ui/assets/photos/。只是製作素材的工具，不會被打包進遊戲。

import random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

OUT = 'src/ui/assets/photos'
WORK = 'src/ui/assets/work'

KAI = '/System/Library/AssetsV2/com_apple_MobileAsset_Font7/584ea2a48d14147049c2f9eaee147fe5a1f279ac.asset/AssetData/BiauKai.ttc'
PINGFANG = '/System/Library/AssetsV2/com_apple_MobileAsset_Font7/3419f2a427639ad8c8e139149a287865a90fa17e.asset/AssetData/PingFang.ttc'
HAND = '/Users/knight/Library/Fonts/wt071.ttf'  # 王漢宗中行書，當手寫字用
HEI = '/Users/knight/Library/Fonts/wt011.ttf'   # 王漢宗細黑體

INK = (28, 38, 92)     # 藍黑色原子筆
PRINT = (30, 30, 34)


def font(path, size, index=0):
    return ImageFont.truetype(path, size, index=index)


def pingfang(size, bold=False):
    # PingFang.ttc 裡繁體中文的一般與中粗
    for idx in ((16, 17, 9, 3) if bold else (13, 14, 7, 1)):
        try:
            f = ImageFont.truetype(PINGFANG, size, index=idx)
            if 'TC' in f.getname()[0] or 'HK' in f.getname()[0]:
                return f
        except Exception:
            pass
    return ImageFont.truetype(PINGFANG, size, index=0)


def handwrite(img, xy, text, size, rng, color=INK, tilt=3.0):
    """把一段字當成手寫貼上去：每次位置、角度略有不同，墨色有一點深淺。"""
    f = font(HAND, size)
    box = f.getbbox(text)
    w, h = box[2] - box[0] + 24, box[3] - box[1] + 24
    layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.text((12 - box[0], 12 - box[1]), text, font=f, fill=color + (rng.randint(205, 245),))
    layer = layer.rotate(rng.uniform(-tilt, tilt), resample=Image.BICUBIC, expand=True)
    img.alpha_composite(layer, (int(xy[0] + rng.uniform(-4, 4)), int(xy[1] + rng.uniform(-5, 3))))


def scribble(img, xy, width, rng, color=INK):
    """一筆潦草的簽名尾巴。"""
    d = ImageDraw.Draw(img)
    x, y = xy
    pts = []
    for i in range(26):
        t = i / 25
        pts.append((x + t * width, y + np.sin(t * 9.5) * 16 * (1 - t * 0.6) + rng.uniform(-2, 2) - t * 10))
    d.line(pts, fill=color + (230,), width=4, joint='curve')


def perspective_coeffs(src, dst):
    a = []
    for (x, y), (u, v) in zip(dst, src):
        a.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        a.append([0, 0, 0, x, y, 1, -v * x, -v * y])
    b = np.array(src).reshape(8)
    return np.linalg.solve(np.array(a, dtype=float), b)


def surface(size, base, rng, grain=10):
    """桌面或櫃面：一個底色加上細細的橫向紋理。"""
    w, h = size
    rows = rng_np(rng).normal(0, grain, (h, 1))
    rows = np.repeat(rows, w, axis=1)
    fine = rng_np(rng).normal(0, 3, (h, w))
    arr = np.clip(np.array(base)[None, None, :] + (rows + fine)[:, :, None], 0, 255).astype(np.uint8)
    return Image.fromarray(arr).filter(ImageFilter.GaussianBlur(0.8))


def rng_np(rng):
    return np.random.default_rng(rng.randint(0, 10**9))


def photoize(flat, out_size, quad, bg, rng, warm=1.0):
    """把平的文件變成「用手機拍的」：放到一個表面上，帶一點透視、陰影、不均勻的光和雜訊。
    quad 是紙張四個角在照片裡的位置（左上、右上、右下、左下）。"""
    W, H = out_size
    fw, fh = flat.size
    coeffs = perspective_coeffs([(0, 0), (fw, 0), (fw, fh), (0, fh)], quad)
    paper = flat.convert('RGBA').transform((W, H), Image.PERSPECTIVE, coeffs, Image.BICUBIC)
    mask = Image.new('L', (fw, fh), 255).transform((W, H), Image.PERSPECTIVE, coeffs, Image.BICUBIC)

    canvas = bg.copy().convert('RGB')
    shadow = Image.new('L', (W, H), 0)
    shadow.paste(mask, (14, 18))
    shadow = shadow.filter(ImageFilter.GaussianBlur(16)).point(lambda v: int(v * 0.5))
    canvas = Image.composite(Image.new('RGB', (W, H), (20, 14, 8)), canvas, shadow)
    canvas.paste(paper.convert('RGB'), (0, 0), mask)

    # 不均勻的室內光：一角亮、對角暗，再加一點暖色
    yy, xx = np.mgrid[0:H, 0:W]
    light = 1.06 - 0.26 * ((xx / W) * 0.55 + (yy / H) * 0.45) ** 1.3
    arr = np.asarray(canvas).astype(float) * light[:, :, None]
    arr *= np.array([1.0 + 0.05 * warm, 1.0, 1.0 - 0.09 * warm])[None, None, :]
    arr += rng_np(rng).normal(0, 4.5, arr.shape)
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    return img.filter(ImageFilter.GaussianBlur(0.6))


# ───────────────────────── 押金確認單 ─────────────────────────

def make_deposit():
    rng = random.Random(1104)
    W, H = 1240, 1754
    page = Image.new('RGBA', (W, H), (250, 248, 242, 255))
    d = ImageDraw.Draw(page)
    title = font(KAI, 62)
    label = font(KAI, 38)
    small = font(KAI, 30)

    d.text((W / 2, 150), '點交暨押金返還確認單', font=title, fill=PRINT, anchor='mm')
    d.line([(150, 205), (W - 150, 205)], fill=PRINT, width=3)

    x0, y = 150, 270
    gap = 104

    def row(text, line_from=None, line_to=W - 150):
        nonlocal y
        d.text((x0, y), text, font=label, fill=PRINT)
        if line_from:
            d.line([(line_from, y + 50), (line_to, y + 50)], fill=(90, 90, 96), width=2)
        y += gap

    row('租賃標的：', 350)
    handwrite(page, (360, y - gap - 12), '新北市永和區○○路○○巷○號四樓', 44, rng)
    row('出 租 人：', 350, 640)
    handwrite(page, (380, y - gap - 12), '許先生', 46, rng)
    d.text((700, y - gap), '承租代表人：', font=label, fill=PRINT)
    d.line([(930, y - gap + 50), (W - 150, y - gap + 50)], fill=(90, 90, 96), width=2)
    handwrite(page, (950, y - gap - 12), '周宗翰', 46, rng)
    row('租    期：', 350)
    handwrite(page, (360, y - gap - 10), '2019 年 8 月 1 日 至 2026 年 10 月 31 日', 40, rng)
    row('點交日期：', 350, 800)
    handwrite(page, (380, y - gap - 12), '2026 年 11 月 4 日', 44, rng)

    y += 16
    d.rectangle([x0, y, W - 150, y + 470], outline=PRINT, width=3)
    yy = y + 44
    d.text((x0 + 36, yy), '押金金額：新台幣', font=label, fill=PRINT)
    d.line([(x0 + 370, yy + 50), (x0 + 660, yy + 50)], fill=(90, 90, 96), width=2)
    handwrite(page, (x0 + 400, yy - 14), '90,000', 50, rng)
    d.text((x0 + 680, yy), '元整', font=label, fill=PRINT)

    yy += 110
    d.text((x0 + 36, yy), '修繕扣款：', font=label, fill=PRINT)
    d.line([(x0 + 240, yy + 50), (x0 + 660, yy + 50)], fill=(90, 90, 96), width=2)
    handwrite(page, (x0 + 300, yy - 18), '無', 56, rng)

    yy += 110
    bx = x0 + 40
    d.rectangle([bx, yy + 4, bx + 40, yy + 44], outline=PRINT, width=3)
    d.text((bx + 60, yy), '押金全額返還', font=label, fill=PRINT)
    tick = [(bx + 4, yy + 22), (bx + 17, yy + 40), (bx + 50, yy - 10)]
    d.line(tick, fill=INK + (240,), width=6, joint='curve')
    bx2 = x0 + 480
    d.rectangle([bx2, yy + 4, bx2 + 40, yy + 44], outline=PRINT, width=3)
    d.text((bx2 + 60, yy), '部分返還', font=label, fill=PRINT)

    yy += 110
    d.text((x0 + 36, yy), '返還金額：新台幣', font=label, fill=PRINT)
    d.line([(x0 + 370, yy + 50), (x0 + 660, yy + 50)], fill=(90, 90, 96), width=2)
    handwrite(page, (x0 + 400, yy - 14), '90,000', 50, rng)
    d.text((x0 + 680, yy), '元整', font=label, fill=PRINT)

    y += 470 + 60
    d.text((x0, y), '備    註：', font=label, fill=PRINT)
    d.line([(350, y + 50), (W - 150, y + 50)], fill=(90, 90, 96), width=2)
    handwrite(page, (360, y - 12), '鑰匙於 11 月 30 日交屋時歸還', 42, rng)

    y += 150
    d.text((x0, y), '雙方確認上列事項無誤，簽名如下：', font=small, fill=PRINT)
    y += 120
    d.text((x0, y), '出租人簽名：', font=label, fill=PRINT)
    d.line([(390, y + 56), (640, y + 56)], fill=(90, 90, 96), width=2)
    handwrite(page, (400, y - 30), '許', 66, rng, tilt=8)
    scribble(page, (462, y + 20), 150, rng)
    d.text((700, y), '承租代表人簽名：', font=label, fill=PRINT)
    d.line([(1005, y + 56), (W - 100, y + 56)], fill=(90, 90, 96), width=2)
    handwrite(page, (1000, y - 34), '周宗翰', 60, rng, tilt=7)

    flat = page.convert('RGB')
    flat.save(f'{WORK}/deposit_flat.png')

    out = (1086, 1448)
    bg = surface(out, (176, 150, 120), rng, grain=7)       # 鞋櫃的木紋貼皮
    wall = Image.new('RGB', (out[0], 150), (214, 208, 196))  # 上方露出一截牆
    bg.paste(wall, (0, 0))
    ImageDraw.Draw(bg).line([(0, 150), (out[0], 150)], fill=(96, 78, 60), width=5)
    quad = [(178, 236), (930, 200), (986, 1338), (96, 1318)]
    photoize(flat, out, quad, bg, rng).save(f'{OUT}/deposit.jpg', quality=86, optimize=True)


# ───────────────────────── 班表 ─────────────────────────

def make_roster():
    rng = random.Random(7)
    days = list(range(9, 23))                      # 照片只拍到 11 月 9 日到 22 日這兩週
    week = '一二三四五六日'
    # 林品妤這幾天是定案的事實：13 休、14 小夜、15 小夜、16 小夜、17 休
    pinyu = dict(zip(days, ['休', '白', '白', '白', '休', '小', '小', '小', '休', '休', '大', '大', '大', '休']))
    others = ['陳怡君', '張雅婷', '黃詩涵', '吳佩珊', '李宜蓁', '蔡孟潔']
    patterns = ['白白白休休小小小休大大大休休', '大大休休白白白白休休小小小休', '小小小休休大大大休白白白休休',
                '休白白白白休休小小小休休大大', '白休休小小小休大大大休休白白', '大休白白白休休小小休大大大休']
    rows = [('王淑惠', list('白白白白白休休白白白白白休休'))]
    for name, pat in zip(others[:3], patterns[:3]):
        rows.append((name, list(pat)))
    rows.append(('林品妤', [pinyu[d] for d in days]))
    for name, pat in zip(others[3:], patterns[3:]):
        rows.append((name, list(pat)))

    cw, rh, nx = 74, 86, 210
    W = nx + cw * len(days) + 120
    H = 300 + rh * (len(rows) + 2) + 110
    page = Image.new('RGB', (W, H), (252, 252, 250))
    d = ImageDraw.Draw(page)
    d.text((60, 70), '林口安康醫院　7B 病房　11 月班表', font=font(HEI, 54), fill=PRINT)
    top = 190
    hf, cf, nf = font(HEI, 30), font(HEI, 36), font(HEI, 38)
    # 表頭：日期和星期
    for i, day in enumerate(days):
        x = nx + i * cw
        wd = week[(day - 2) % 7]                    # 2026-11-02 是週一
        fill = (232, 232, 236) if wd in '六日' else (244, 244, 246)
        d.rectangle([x, top, x + cw, top + rh * 2], fill=fill, outline=(120, 120, 126))
        d.text((x + cw / 2, top + rh * 0.5), str(day), font=hf, fill=PRINT, anchor='mm')
        d.text((x + cw / 2, top + rh * 1.5), wd, font=hf, fill=PRINT, anchor='mm')
    d.rectangle([60, top, nx, top + rh * 2], fill=(244, 244, 246), outline=(120, 120, 126))
    d.text((nx / 2 + 30, top + rh), '姓名', font=hf, fill=PRINT, anchor='mm')
    colors = {'白': PRINT, '小': (150, 60, 20), '大': (40, 60, 140), '休': (150, 150, 156)}
    for r, (name, shifts) in enumerate(rows):
        y = top + rh * (2 + r)
        if name == '林品妤':                        # 她用螢光筆把自己那一列畫起來
            d.rectangle([60, y + 6, nx + cw * len(days), y + rh - 6], fill=(255, 240, 120))
        d.rectangle([60, y, nx, y + rh], outline=(120, 120, 126))
        d.text((nx / 2 + 30, y + rh / 2), name, font=nf, fill=PRINT, anchor='mm')
        for i, s in enumerate(shifts):
            x = nx + i * cw
            d.rectangle([x, y, x + cw, y + rh], outline=(120, 120, 126))
            d.text((x + cw / 2, y + rh / 2), s, font=cf, fill=colors[s], anchor='mm')
    ly = top + rh * (2 + len(rows)) + 40
    d.text((60, ly), '白＝白班 08–16　　小＝小夜 16–24　　大＝大夜 00–08　　休＝休假', font=font(HEI, 32), fill=PRINT)
    page.save(f'{WORK}/roster_flat.png')

    out = (1086, 1448)
    bg = surface(out, (170, 176, 170), rng, grain=4)        # 護理站的公佈欄
    # 整張紙都要在畫面裡，姓名那一欄不能被切掉
    quad = [(44, 262), (1046, 236), (1060, 1178), (30, 1192)]
    img = photoize(page, out, quad, bg, rng, warm=-0.4)
    img.save(f'{OUT}/roster.jpg', quality=86, optimize=True)


# ───────────────────────── 檔案資訊截圖 ─────────────────────────

def art_crop():
    book = Image.open(f'{WORK}/bookpage.png').convert('RGB')
    w, h = book.size
    return book.crop((int(w * 0.135), int(h * 0.065), int(w * 0.865), int(h * 0.92)))


def make_fileinfo(key, name, layers, created, modified, canvas, size, thumb):
    W, H = 1086, 1448
    img = Image.new('RGB', (W, H), (24, 25, 29))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 110], fill=(34, 36, 42))
    d.line([(46, 55), (66, 35)], fill=(210, 212, 220), width=5)
    d.line([(46, 55), (66, 75)], fill=(210, 212, 220), width=5)
    d.text((W / 2, 55), '檔案資訊', font=pingfang(40, True), fill=(240, 240, 244), anchor='mm')

    th = ImageOps.fit(thumb, (420, 560), Image.LANCZOS)
    img.paste(th, ((W - 420) // 2, 170))
    d.rectangle([(W - 420) // 2 - 2, 168, (W + 420) // 2 + 2, 732], outline=(70, 72, 80), width=2)
    d.text((W / 2, 790), name, font=pingfang(46, True), fill=(244, 244, 248), anchor='mm')

    rows = [('檔名', name), ('畫布尺寸', canvas), ('圖層', f'{layers} 個'), ('檔案大小', size),
            ('建立日期', created), ('上次修改', modified), ('建立裝置', '以晴的 iPad')]
    y = 870
    d.rounded_rectangle([50, y, W - 50, y + 76 * len(rows)], radius=22, fill=(36, 38, 44))
    for i, (k, v) in enumerate(rows):
        yy = y + 76 * i
        if i:
            d.line([(84, yy), (W - 50, yy)], fill=(58, 60, 68), width=2)
        d.text((84, yy + 38), k, font=pingfang(34), fill=(150, 153, 164), anchor='lm')
        d.text((W - 84, yy + 38), v, font=pingfang(34), fill=(236, 236, 240), anchor='rm')
    img.save(f'{OUT}/{key}.jpg', quality=88, optimize=True)


def make_fileinfos():
    art = art_crop()
    # 內頁_03：就是並排比對裡那張路燈下的女孩
    make_fileinfo('fileinfo_inner', '內頁_03', 31, '2023 年 4 月 2 日', '2023 年 5 月 18 日',
                  '1748 × 2480 像素', '41.2 MB', art)
    # 封面_定稿：同一個角色的上半身，上了顏色
    w, h = art.size
    cover = art.crop((int(w * 0.30), int(h * 0.30), int(w * 0.98), int(h * 0.98)))
    cover = ImageOps.colorize(ImageOps.grayscale(cover), black=(22, 28, 66), white=(255, 236, 196), mid=(120, 110, 150))
    make_fileinfo('fileinfo_cover', '封面_定稿', 47, '2023 年 3 月 14 日', '2023 年 5 月 20 日',
                  '2480 × 3508 像素', '86.4 MB', cover)


if __name__ == '__main__':
    make_deposit()
    make_roster()
    make_fileinfos()
    print('done')
