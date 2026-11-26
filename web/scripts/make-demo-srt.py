"""把录屏的字幕时间轴导出成 srt，方便以后再剪辑或改文案。"""
import json, os

DEMO = r"C:\Users\刘屹\Downloads\ds学习agent\shots\demo"
frames = json.load(open(os.path.join(DEMO, "frames.json"), encoding="utf-8"))
caps = json.load(open(os.path.join(DEMO, "captions.json"), encoding="utf-8"))

base = frames[0]["t"]
shift = float(os.environ.get("CAP_SHIFT", "4.0"))
end_at = 130.6

items = []
for i, c in enumerate(caps):
    start = max(0.0, c["t"] - base - shift)
    if start >= end_at:
        break
    nxt = caps[i + 1]["t"] - base - shift if i + 1 < len(caps) else end_at
    end = min(nxt, end_at)
    if end - start < 0.4:
        continue
    items.append((start, end, c["text"]))


def ts(t):
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = int(t % 60)
    ms = int(round((t - int(t)) * 1000))
    return "%02d:%02d:%02d,%03d" % (h, m, s, ms)


out = []
for i, (s, e, text) in enumerate(items, 1):
    out.append("%d\n%s --> %s\n%s\n" % (i, ts(s), ts(e), text))

path = os.path.join(DEMO, "demo.srt")
open(path, "w", encoding="utf-8").write("\n".join(out))
print("ok", path, len(items), "cues")
