[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$root = $PSScriptRoot

function Test-PortListening($Port) {
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Get-FreePort($StartPort) {
    $port = [int]$StartPort
    while (Test-PortListening $port) {
        $port++
    }
    return $port
}

$projectName = Split-Path $root -Leaf
Write-Host "`n====== $projectName ======`n" -ForegroundColor Green

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

# 2. 仅在有新建 .env 时才提示用户修改
if ($envCopied) {
    Write-Host ""
    Write-Host "请检查并修改 .env 文件，按任意键继续..." -ForegroundColor Yellow
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    Write-Host ""
}

# 3. 安装前端依赖
if (-not (Test-Path "$root/frontend/node_modules")) {
    Write-Host "安装前端依赖..." -ForegroundColor Cyan
    Push-Location "$root/frontend"
    pnpm install
    Pop-Location
}

# 4. 初始化 Python 虚拟环境
if (-not (Test-Path "$root/backend/.venv")) {
    Write-Host "初始化 Python 虚拟环境..." -ForegroundColor Cyan
    Push-Location "$root/backend"
    python -m venv .venv
    & ".venv/Scripts/pip" install -r requirements.txt
    Pop-Location
}

# 5. 启动服务
# 先把 frontend/.env 中的变量注入当前进程，避免再走 dotenv + powershell -Command
Get-Content "$root/frontend/.env" | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$') {
        [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
    }
}

$apiPort = [int]([System.Environment]::GetEnvironmentVariable("API_PORT", "Process") ?? "8000")
if (Test-PortListening $apiPort) {
    $newApiPort = Get-FreePort ($apiPort + 1)
    Write-Host "检测到 API 端口 $apiPort 已被占用，自动切换到 $newApiPort" -ForegroundColor Yellow
    [System.Environment]::SetEnvironmentVariable("API_PORT", "$newApiPort", "Process")
}

$vitePort = [int]([System.Environment]::GetEnvironmentVariable("VITE_PORT", "Process") ?? "5173")
if (Test-PortListening $vitePort) {
    $newVitePort = Get-FreePort ($vitePort + 1)
    Write-Host "检测到前端端口 $vitePort 已被占用，自动切换到 $newVitePort" -ForegroundColor Yellow
    [System.Environment]::SetEnvironmentVariable("VITE_PORT", "$newVitePort", "Process")
}

Write-Host "启动端口: frontend=$([System.Environment]::GetEnvironmentVariable('VITE_PORT', 'Process')) backend=$([System.Environment]::GetEnvironmentVariable('API_PORT', 'Process'))" -ForegroundColor DarkCyan

$backendCmd = 'cd /d ..\backend && set PYTHONUNBUFFERED=1 && set PYTHONIOENCODING=utf-8 && .venv\Scripts\python.exe -m uvicorn main:app --reload --port %API_PORT% --host 0.0.0.0'
$frontendCmd = '.\node_modules\.bin\vite.cmd --host 0.0.0.0'

try {
    Push-Location "$root/frontend"
    & ".\node_modules\.bin\concurrently.cmd" -n "backend,frontend" -c "blue,green" $backendCmd $frontendCmd 2>&1 | ForEach-Object {
        $_ `
            -replace '\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)', '' `
            -replace '\x1b\[[0-9;?]*[ -/]*[@-~]', ''
    } | Tee-Object -FilePath "$root/all.log"
} finally {
    Pop-Location
}
