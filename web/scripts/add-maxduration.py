"""给所有 /api/ai/* 路由加上 maxDuration，避免部署到 Vercel 后被 10 秒的默认函数超时掐断。"""
import io, os, glob

marker = "export const maxDuration = 30\n"
files = glob.glob(r"src\app\api\ai\**\route.ts", recursive=True)

for rel in files:
    p = os.path.join(os.getcwd(), rel)
    s = io.open(p, encoding="utf-8").read()
    if "maxDuration" in s:
        print("skip", rel)
        continue
    # 插在最后一个 import 之后，空一行
    lines = s.split("\n")
    last_import = max(i for i, l in enumerate(lines) if l.startswith("import "))
    lines.insert(last_import + 1, "\n" + marker.rstrip("\n"))
    io.open(p, "w", encoding="utf-8", newline="\n").write("\n".join(lines))
    print("ok", rel)
