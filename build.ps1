# 《雨爱》钢笔淡彩短片 —— 一键构建（渲染 → 合入原曲 → 海报 → 字幕）
# 用法（PowerShell）：
#   powershell -ExecutionPolicy Bypass -File build.ps1            # 整片渲染
#   powershell -ExecutionPolicy Bypass -File build.ps1 -Seconds 20  # 只渲前 20 秒（调试）
param([int]$Seconds = 0, [int]$Workers = 4)
$ErrorActionPreference = 'Stop'
. "C:\Users\sl\.dsh\skills\lemo-opuscar\scripts\env.ps1"
$HERE = (Get-Location).Path
if (-not (Test-Path (Join-Path $HERE 'index.html'))) { $HERE = $PSScriptRoot; Set-Location $HERE }
Set-Location $env:LIB

$q = if ($Seconds -gt 0) { "dur=$Seconds" } else { "" }
$outVideo = Join-Path $HERE 'out\video.mp4'
Write-Host "== render =="
node core/render/video.mjs "$HERE" --fps 24 --workers $Workers --out $outVideo --q $q
if ($LASTEXITCODE -ne 0) { throw "video render failed" }

Write-Host "== audio + mux (original song, stream copy) =="
$outMp4 = Join-Path $HERE 'yuai-sketch.mp4'
$audio = Join-Path $HERE 'assets\song.m4a'
ffmpeg -y -loglevel error -i $outVideo -i $audio -map 0:v:0 -map 1:a:0 -c:v copy -c:a copy -shortest -movflags +faststart $outMp4
if ($LASTEXITCODE -ne 0) { throw "mux failed" }

Write-Host "== poster =="
ffmpeg -y -loglevel error -ss 226.5 -i $outMp4 -frames:v 1 -q:v 2 (Join-Path $HERE 'poster.jpg')

Write-Host "== subtitles =="
& $env:LEMO_PY (Join-Path $HERE 'tools\make_srt.py')

Write-Host "== done =="
Get-Item $outMp4 | Select-Object FullName, Length
