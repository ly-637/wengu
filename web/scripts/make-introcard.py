"""演示视频的片头卡（1920x1080）。"""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1920, 1080
PAPER = (246, 243, 236)
INK = (27, 26, 22)
DIM = (138, 130, 116)
ACCENT = (23, 100, 63)

BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
REG = r"C:\Windows\Fonts\msyh.ttc"

out = r"C:\Users\刘屹\Downloads\ds学习agent\shots\demo\introcard.png"
img = Image.new("RGB", (W, H), PAPER)
d = ImageDraw.Draw(img)

d.line([(W // 2 - 40, 392), (W // 2 + 40, 392)], fill=ACCENT, width=3)
d.text((W // 2, 362), "学习地图", font=ImageFont.truetype(REG, 26), fill=DIM, anchor="ms")
d.text((W // 2, 480), "今晚先做什么", font=ImageFont.truetype(BOLD, 92), fill=INK, anchor="mm")
d.text((W // 2, 570), "一个会算「什么时候会忘」的学习计划器", font=ImageFont.truetype(REG, 34), fill=DIM, anchor="mm")

steps = ["1  首页给出一件事", "2  进去学、讲一遍、考三题", "3  颜色随时间变浅", "4  换成期末冲刺", "5  碎片阅读另开一条路"]
y = 700
for s in steps:
    d.text((W // 2, y), s, font=ImageFont.truetype(REG, 27), fill=(110, 103, 92), anchor="mm")
    y += 46

d.text((W // 2, 985), "中国近代史纲要 · 演示数据 · 约 2 分钟", font=ImageFont.truetype(REG, 24), fill=(170, 162, 148), anchor="mm")

img.save(out, "PNG")
print("ok", out, os.path.getsize(out))
