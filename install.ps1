[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$root = $PSScriptRoot

# 1. 复制 .env 文件
$envCopied = $false
if (-not (Test-Path "$root/frontend/.env")) {
    Copy-Item "$root/frontend/.env.example" "$root/frontend/.env"
    Write-Host "已创建 frontend/.env"
    $envCopied = $true
}
if (-not (Test-Path "$root/backend/.env")) {
    Copy-Item "$root/backend/.env.example" "$root/backend/.env"
    Write-Host "已创建 backend/.env"
    $envCopied = $true
}

if ($envCopied) {
    Write-Host ""
    Write-Host "请检查并修改 .env 文件，按任意键继续..." -ForegroundColor Yellow
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    Write-Host ""
}

# 2. 安装前端依赖
Write-Host "安装前端依赖..." -ForegroundColor Cyan
Push-Location "$root/frontend"
pnpm install
Pop-Location

# 3. 初始化 Python 虚拟环境
Write-Host "初始化 Python 虚拟环境..." -ForegroundColor Cyan
Push-Location "$root/backend"
if (-not (Test-Path ".venv")) {
    python -m venv .venv
}
.venv\Scripts\pip install -r requirements.txt
Pop-Location

Write-Host ""
Write-Host "安装完成！运行 deploy.ps1 启动服务。" -ForegroundColor Green
