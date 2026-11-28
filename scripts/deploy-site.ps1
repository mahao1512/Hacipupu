# Deploy trang HACIPUPU lên Cloudflare Pages.
# Chỉ copy file của trang web vào thư mục dist/ rồi upload — KHÔNG kèm worker/ (có file chứa API key).
# Chạy (từ thư mục D:\DA):  powershell -ExecutionPolicy Bypass -File .\scripts\deploy-site.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$dist = Join-Path $root "dist"
$project = "hacipupu"   # tên project Pages -> https://hacipupu.pages.dev

if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory $dist | Out-Null

$items = @(
  "index.html", "about.html", "admin.html", "collection.html", "detail.html", "orders.html",
  "assets",
  "css", "js", "data", "img"
)
foreach ($i in $items) {
  Copy-Item (Join-Path $root $i) -Destination $dist -Recurse
}

# Chốt an toàn: dừng nếu lỡ có file chứa key trong dist
$leak = Get-ChildItem $dist -Recurse -File | Select-String -Pattern "sk-or-v1-" -List
if ($leak) { throw "Phát hiện API key trong: $($leak.Path -join ', ') — dừng deploy." }

Write-Host "Đã chuẩn bị $((Get-ChildItem $dist -Recurse -File).Count) file trong dist/. Đang upload..."
npx.cmd wrangler pages deploy $dist --project-name $project --commit-dirty=true
