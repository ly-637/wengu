"""生成演示视频的片尾卡（1920x1080，纸色底 + 两行字）。"""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1920, 1080
PAPER = (246, 243, 236)
INK = (27, 26, 22)
DIM = (138, 130, 116)
ACCENT = (23, 100, 63)

FONT_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
FONT_REG = r"C:\Windows\Fonts\msyh.ttc"

out = r"C:\Users\刘屹\Downloads\ds学习agent\shots\demo\endcard.png"

img = Image.new("RGB", (W, H), PAPER)
d = ImageDraw.Draw(img)

# 一条细横线 + 小字品牌
d.line([(W // 2 - 40, 430), (W // 2 + 40, 430)], fill=ACCENT, width=3)
f_small = ImageFont.truetype(FONT_REG, 26)
d.text((W // 2, 400), "学习地图", font=f_small, fill=DIM, anchor="ms")

f_title = ImageFont.truetype(FONT_BOLD, 76)
d.text((W // 2, 510), "把「记住」变成一件看得见的事", font=f_title, fill=INK, anchor="mm")

f_sub = ImageFont.truetype(FONT_REG, 32)
d.text((W // 2, 600), "排程、评分、时间旅行都是纯函数，47 个单元测试守着它们", font=f_sub, fill=DIM, anchor="mm")

f_tiny = ImageFont.truetype(FONT_REG, 24)
d.text((W // 2, 940), "中国近代史纲要 · 演示数据", font=f_tiny, fill=(170, 162, 148), anchor="mm")

img.save(out, "PNG")
print("ok", out, os.path.getsize(out))
