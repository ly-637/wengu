# D0 勘察脚本 —— 用来判断 DeepTutor 的掌握度数据能否被外部读到
# 用法：
#   1) 先起 DeepTutor 并打开 http://127.0.0.1:3782
#   2) 在 UI 里建 1 个 Mastery Path，学完至少 1 个知识点、过 1 次 mastery gate
#   3) pwsh -File .\scripts\d0-probe.ps1
# 产物：d0-report.txt（直接把这个文件内容贴回来）

param(
    [string]$Base  = "http://127.0.0.1:3782",
    [string]$Name  = "deeptutor",
    # PyPI / 源码本地安装时指到 data 目录，可跳过 Docker 分支
    [string]$DataDir = "",
    [string]$OutFile = (Join-Path (Split-Path -Parent $PSScriptRoot) "d0-report.txt")
)

$ErrorActionPreference = "Continue"
$lines = New-Object System.Collections.Generic.List[string]

function W([string]$s) {
    $lines.Add($s)
    Write-Host $s
}

function Section([string]$t) {
    W ""
    W ("=" * 70)
    W $t
    W ("=" * 70)
}

W "D0 probe  run=$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  base=$Base"

# ---------------------------------------------------------------- 1. 服务状态
Section "1. 服务可达性"
try {
    $st = Invoke-RestMethod -Uri "$Base/api/system/status" -TimeoutSec 8
    W ($st | ConvertTo-Json -Depth 4)
} catch {
    W "FAILED: $($_.Exception.Message)"
    W ">>> 服务没起来，先确认 DeepTutor 在 $Base 可访问"
}

# ------------------------------------------------------- 2. OpenAPI 关键路径
Section "2. OpenAPI 里与掌握度相关的路径"
$allPaths = @()
try {
    $spec  = Invoke-RestMethod -Uri "$Base/openapi.json" -TimeoutSec 30
    $allPaths = @($spec.paths.PSObject.Properties.Name)
    W "总路径数: $($allPaths.Count)"

    $hits = $allPaths | Where-Object { $_ -match 'master|waypoint|knowledge-point|outline|progress' }
    if ($hits.Count -gt 0) {
        W ""
        W ">>> 命中 $($hits.Count) 条："
        $hits | Sort-Object | ForEach-Object { W "  $_" }
    } else {
        W ""
        W ">>> 无命中。意味着掌握度不通过 REST 暴露，要走 WS /ws/mastery-paths 或直接读数据文件。"
    }
} catch {
    W "FAILED: $($_.Exception.Message)"
}

# ------------------------------------------------- 3. 全部路径（人工挑用）
Section "3. 全部 REST 路径"
if ($allPaths.Count -gt 0) {
    $allPaths | Sort-Object | ForEach-Object { W $_ }
} else {
    W "(拿不到 openapi.json)"
}

# ------------------------------------------------------------ 4. 数据落盘
Section "4. 数据目录文件树"
$useLocal = $false
$root = $null
if ($DataDir) {
    if (Test-Path -LiteralPath $DataDir) {
        $useLocal = $true
        $root = (Resolve-Path -LiteralPath $DataDir).Path
    } else {
        W "指定的 -DataDir 不存在: $DataDir"
    }
}

if ($useLocal) {
    W "本地模式（PyPI / 源码安装）: $root"
    W ""
    Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue |
        Sort-Object FullName | Select-Object -First 120 | ForEach-Object {
            $rel = $_.FullName.Substring($root.Length)
            W ("{0,10}  {1}" -f $_.Length, $rel)
        }
} else {
    $dockerOk = $true
    try {
        $tree = docker exec $Name sh -c "ls -R /app/data 2>/dev/null | head -120" 2>&1
        if ($LASTEXITCODE -ne 0) { $dockerOk = $false }
        W ($tree -join "`n")
    } catch {
        $dockerOk = $false
        W "FAILED: $($_.Exception.Message)"
    }
    if (-not $dockerOk) {
        W ">>> 拿不到容器内文件树。本机没有 Docker 的话，改用本地安装并用 -DataDir 指过去："
        W ">>>   -DataDir C:\Users\刘屹\Downloads\ds学习agent\dt\data"
        W ">>> 用 Docker 的话先跑：docker ps --format '{{.Names}}'  然后 -Name <容器名> 重跑"
    }
}

# --------------------------------------------- 5. 数据文件里谁含 mastery
Section "5. 数据目录中含 'mastery' 的文件（关键判定）"
$exts = @('.json', '.yaml', '.yml', '.md', '.txt', '.jsonl', '.csv', '.db', '.sqlite', '.sqlite3', '.log')

if ($useLocal) {
    $cand = Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { ($exts -contains $_.Extension.ToLower()) -and ($_.Length -lt 20MB) }
    W ("扫描 {0} 个候选文件…" -f @($cand).Count)
    $hits = New-Object System.Collections.Generic.List[string]
    foreach ($f in $cand) {
        try {
            $txt = Get-Content -LiteralPath $f.FullName -Raw -Encoding UTF8 -ErrorAction Stop
            if ($txt -and $txt -match 'mastery') { $hits.Add($f.FullName.Substring($root.Length)) }
        } catch { }
    }
    if ($hits.Count -gt 0) {
        W ($hits -join "`n")
        W ""
        W ">>> 找到了。下一步：挑其中最大的那个，把一条完整的知识点记录贴回来（脱敏无所谓）。"
    } else {
        W "(没有匹配) —— 掌握度可能存在 SQLite/向量库里，看下面的 *.db"
    }
    W ""
    W "--- 顺便列出数据库与 json ---"
    Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Extension.ToLower() -in @('.db', '.sqlite', '.sqlite3', '.json') } |
        Sort-Object Length -Descending | Select-Object -First 40 | ForEach-Object {
            W ("{0,10}  {1}" -f $_.Length, $_.FullName.Substring($root.Length))
        }
} else {
    $dockerOk = $true
    try {
        $g = docker exec $Name sh -c "grep -rl -i 'mastery' /app/data 2>/dev/null | head -30" 2>&1
        if ($LASTEXITCODE -ne 0) { $dockerOk = $false }
        if (($g -join "").Trim().Length -gt 0) {
            W ($g -join "`n")
            W ""
            W ">>> 找到了。下一步：对其中最大的那个文件跑 head -c 3000 看结构，"
            W ">>> 把一条完整的知识点记录贴回来（脱敏无所谓）。"
        } elseif ($dockerOk) {
            W "(没有匹配) —— 掌握度可能存在 SQLite/向量库里，看下面的 *.db"
        }
        if ($dockerOk) {
            W ""
            W "--- 顺便找数据库文件 ---"
            $db = docker exec $Name sh -c "find /app/data -maxdepth 4 -type f \( -name '*.db' -o -name '*.sqlite*' -o -name '*.json' \) 2>/dev/null | head -40" 2>&1
            W ($db -join "`n")
        }
    } catch {
        W "FAILED: $($_.Exception.Message)"
    }
}

# ------------------------------------------------ 6. 若 REST 有，试着拉一把
Section "6. 尝试调用命中的 GET 接口"
$probable = @(
    "/api/mastery-paths",
    "/api/mastery/paths",
    "/api/mastery-paths/list",
    "/api/learning/mastery-paths"
)
foreach ($p in $probable) {
    try {
        $r = Invoke-RestMethod -Uri "$Base$p" -TimeoutSec 10
        W "OK   $p"
        $j = ($r | ConvertTo-Json -Depth 6 -Compress)
        if ([string]::IsNullOrEmpty($j)) { $j = "(empty response)" }
        if ($j.Length -gt 1500) { $j = $j.Substring(0, 1500) + " ...(truncated)" }
        W $j
        W ""
    } catch {
        $code = $null
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        W "MISS $p  (status=$code)"
    }
}

# ------------------------------------------------------------------ 收尾
Section "完成"
W "报告已写入: $OutFile"
$lines -join "`r`n" | Set-Content -Path $OutFile -Encoding UTF8
Write-Host ""
Write-Host ">>> 请把 $OutFile 的全文贴回对话" -ForegroundColor Green
