# 把录制的帧序列 + 字幕时间轴合成 1920x1080 的 mp4
# 画面缩到 1920x988，底部留 92px 的字幕条——保证字幕永远不挡界面
# 用法：python scripts/make-demo-video.py
import json
import os
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEMO = os.path.normpath(os.path.join(ROOT, '..', 'shots', 'demo'))
FF = r'C:\Users\刘屹\AppData\Local\Programs\Python\Python310\lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v9.0.2.exe'

W, H = 1920, 1080
BAR = 92           # 底部字幕条高度
FPS = 30
TAIL = 2.4
PAPER = '0xf6f3ec'

frames = json.load(open(os.path.join(DEMO, 'frames.json'), encoding='utf-8'))
caps = json.load(open(os.path.join(DEMO, 'captions.json'), encoding='utf-8'))

clean = []
for f in frames:
    if not clean or f['t'] - clean[-1]['t'] >= 0.05:
        clean.append(f)

# 录制时钟从进程启动开始算，视频时间轴从第一帧开始算，这里统一平移到 0
base = clean[0]['t']
for f in clean:
    f['t'] = f['t'] - base

# screencast 的帧到达时间比画面实际时刻略晚，字幕会整体滞后；
# 用 CAP_SHIFT 秒数整体提前，实测默认 4.0 与画面基本对齐
shift = float(os.environ.get('CAP_SHIFT', '4.0'))
caps = [{'t': max(0.0, c['t'] - base - shift), 'text': c['text']} for c in caps]

# 第一句往往是「开录就说话」，平移后会掉到 0 之前变成零长度而消失；
# 把它钉在 0.15s，并保证每条字幕至少占 0.6s、起点严格递增（否则 ASS 事件会 start>end 直接不显示）
if caps and caps[0]['t'] < 0.15:
    caps[0]['t'] = 0.15
for i in range(1, len(caps)):
    if caps[i]['t'] < caps[i - 1]['t'] + 0.6:
        caps[i]['t'] = caps[i - 1]['t'] + 0.6

# 结尾常常是静止画面（没有新帧），按最后一帧硬截会把最后两句字幕切掉，
# 所以总时长至少覆盖到最后一条字幕之后 3.5 秒，多出来的时间就是在最后一张图上停住
TAIL = max(TAIL, (caps[-1]['t'] + 3.5) - clean[-1]['t'])

total = clean[-1]['t'] + TAIL

lines = []
for i, f in enumerate(clean):
    nxt = clean[i + 1]['t'] if i + 1 < len(clean) else total
    dur = max(0.04, nxt - f['t'])
    lines.append("file 'frames/%s'" % f['file'])
    lines.append('duration %.3f' % dur)
lines.append("file 'frames/%s'" % clean[-1]['file'])
open(os.path.join(DEMO, 'list.txt'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')


def ass_time(t):
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = t % 60
    return '%d:%02d:%05.2f' % (h, m, s)


def wrap(text, width=24):
    if len(text) <= width:
        return text
    lines, cur = [], ''
    for ch in text:
        cur += ch
        if len(cur) >= width and ch in '，。：；、！？」）':
            lines.append(cur)
            cur = ''
    if cur:
        lines.append(cur)
    return r'\N'.join(lines[:3])


header = """[Script Info]
ScriptType: v4.00+
PlayResX: %d
PlayResY: %d
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Microsoft YaHei,37,&H00241B1B,&H00241B1B,&H00F6F3EC,&H00F6F3EC,0,0,0,0,100,100,0.6,0,1,0,0,2,60,60,%d,1
Style: Brand,Microsoft YaHei,21,&H0088807A,&H0088807A,&H00F6F3EC,&H00F6F3EC,0,0,0,0,100,100,1.2,0,1,0,0,1,44,44,%d,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
""" % (W, H, BAR // 2 - 20, BAR // 2 - 14)

events = ['Dialogue: 0,0:00:00.00,%s,Brand,,0,0,0,,学习地图 · 演示' % ass_time(total)]
for i, c in enumerate(caps):
    start = c['t']
    end = caps[i + 1]['t'] if i + 1 < len(caps) else total
    events.append(
        'Dialogue: 0,%s,%s,Cap,,0,0,0,,%s' % (ass_time(start), ass_time(end), wrap(c['text']))
    )

open(os.path.join(DEMO, 'captions.ass'), 'w', encoding='utf-8').write(header + '\n'.join(events) + '\n')

out = os.path.join(DEMO, 'demo.mp4')
vf = (
    "scale=%d:%d:flags=lanczos,setsar=1,pad=%d:%d:0:0:color=%s,"
    "ass=captions.ass:fontsdir='C\\:/Windows/Fonts',format=yuv420p"
) % (W, H - BAR, W, H, PAPER)

cmd = [
    FF, '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'concat', '-safe', '0', '-i', os.path.join(DEMO, 'list.txt'),
    '-vf', vf,
    '-r', str(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out,
]
print('frames', len(clean), 'total %.1fs' % total)
subprocess.run(cmd, cwd=DEMO, check=True)
print('ok', out, os.path.getsize(out) // 1024, 'KB')
