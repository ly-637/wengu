import io, os

edits = [
    (r"src\lib\mock.ts", "export const COURSE_TITLE = '学习地图 · 中国近代史纲要'", "export const COURSE_TITLE = '中国近代史纲要'"),
    (r"src\components\Sidebar.tsx", "<span>{COURSE_TITLE.replace('学习地图 · ', '')}</span>", "<span>{COURSE_TITLE}</span>"),
    (r"src\components\Sidebar.tsx", "<b>学习地图</b>", "<b>温故</b>"),
    (r"src\app\layout.tsx", "title: '学习地图',", "title: '温故 · 记忆的时间表',"),
]

for path, old, new in edits:
    p = os.path.join(os.getcwd(), path)
    s = io.open(p, encoding="utf-8").read()
    if old not in s:
        print("MISS", path, old[:24])
        continue
    io.open(p, "w", encoding="utf-8", newline="\n").write(s.replace(old, new))
    print("ok", path)
