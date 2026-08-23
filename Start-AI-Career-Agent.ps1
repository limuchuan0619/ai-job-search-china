[CmdletBinding()]
param(
    [switch]$SmokeTest
)

$ErrorActionPreference = 'Stop'
$projectCandidate = if ($env:AI_CAREER_HOME) {
    $env:AI_CAREER_HOME
}
elseif ($PSScriptRoot) {
    $PSScriptRoot
}
else {
    'H:\codex\ai-career-agent'
}
$projectPath = (Resolve-Path -LiteralPath $projectCandidate).Path.TrimEnd('\')
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $projectPath '.playwright-browsers'
$env:npm_config_cache = Join-Path $projectPath '.npm-cache'
$env:CAREER_OPS_CLI = 'codex'

function Wait-ForUser {
    Write-Host ''
    [void](Read-Host '按回车返回主菜单')
}

function Invoke-AgentTool {
    param(
        [Parameter(Mandatory)]
        [string[]]$Arguments
    )

    & node @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "命令执行失败，退出代码：$LASTEXITCODE"
    }
}

function Copy-FullSearchPrompt {
    $promptLines = & node 'integration\unified-career.mjs' 'search' 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "生成完整搜索提示失败，退出代码：$LASTEXITCODE"
    }
    $prompt = ($promptLines | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine
    $outputDir = Join-Path $projectPath 'output'
    $outputPath = Join-Path $outputDir 'full-search-prompt.txt'
    [IO.Directory]::CreateDirectory($outputDir) | Out-Null
    [IO.File]::WriteAllText($outputPath, $prompt, [Text.UTF8Encoding]::new($false))

    try {
        Set-Clipboard -Value $prompt -ErrorAction Stop
        Write-Host '完整多来源搜索提示已复制到剪贴板。' -ForegroundColor Green
    }
    catch {
        Write-Host '当前终端无法访问剪贴板，已改为保存提示文件。' -ForegroundColor Yellow
    }
    Write-Host "提示文件：$outputPath"
    Write-Host ''
    Write-Host '把提示粘贴到当前 Codex 任务中即可执行完整搜索；不会自动投递。'
}

if (-not (Test-Path -LiteralPath (Join-Path $projectPath 'AGENTS.md') -PathType Leaf)) {
    throw "找不到 AI Career Agent：$projectPath"
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw '找不到 Node.js，请先确认 Node.js 已安装。'
}

$Host.UI.RawUI.WindowTitle = 'AI Career Agent - 安全实验菜单'
Push-Location -LiteralPath $projectPath

try {
    Invoke-AgentTool -Arguments @('integration\install-pointers.mjs', '--quiet')

    if ($SmokeTest) {
        Write-Output 'AI_CAREER_LAUNCHER_SMOKE_TEST_OK'
        return
    }

    while ($true) {
        Clear-Host
        Write-Host '==================================================' -ForegroundColor Cyan
        Write-Host '             AI Career Agent 安全实验' -ForegroundColor Cyan
        Write-Host '==================================================' -ForegroundColor Cyan
        Write-Host ''
        Write-Host "项目：$projectPath"
        Write-Host ''
        Write-Host ' 1. 检查环境和初始化状态'
        Write-Host ' 2. 快速预览 3 家官网（最近 1 天，不保存）'
        Write-Host ' 3. 扫描 3 家官网并保存到 Lead 审核队列'
        Write-Host ' 4. 复制完整多来源搜索提示（官网 + 公开网页）'
        Write-Host ' 5. 查看 Lead 审核队列和统计'
        Write-Host ' 6. 生成并打开本地申请看板'
        Write-Host ' 7. 查看全部命令说明'
        Write-Host ' 0. 退出'
        Write-Host ''

        $choice = Read-Host '请输入数字后按回车'
        if ($choice -eq '0') {
            break
        }

        Clear-Host
        try {
            switch ($choice) {
                '1' {
                    Write-Host '[环境检查]' -ForegroundColor Cyan
                    Write-Host ''
                    Invoke-AgentTool -Arguments @('integration\unified-career.mjs', 'doctor')
                }
                '2' {
                    Write-Host '[3 家官网快速预览]' -ForegroundColor Cyan
                    Write-Host '当前精选 Provider 是腾讯、美团、阿里巴巴。此操作只预览，不保存、不投递。'
                    Write-Host ''
                    Invoke-AgentTool -Arguments @(
                        'integration\unified-career.mjs',
                        'search-local',
                        '--dry-run',
                        '--since',
                        '1'
                    )
                }
                '3' {
                    Write-Host '[3 家官网扫描 → Lead]' -ForegroundColor Cyan
                    Write-Host '结果只保存到待审核线索，不进入投递流程。'
                    Write-Host ''
                    Invoke-AgentTool -Arguments @(
                        'integration\unified-career.mjs',
                        'search-local',
                        '--since',
                        '7'
                    )
                }
                '4' {
                    Write-Host '[完整多来源搜索]' -ForegroundColor Cyan
                    Write-Host ''
                    Copy-FullSearchPrompt
                }
                '5' {
                    Write-Host '[Lead 审核队列]' -ForegroundColor Cyan
                    Write-Host ''
                    Invoke-AgentTool -Arguments @('integration\unified-career.mjs', 'lead')
                    Write-Host ''
                    Invoke-AgentTool -Arguments @('integration\unified-career.mjs', 'lead', 'stats')
                }
                '6' {
                    Write-Host '[本地申请看板]' -ForegroundColor Cyan
                    Write-Host ''
                    Invoke-AgentTool -Arguments @('integration\unified-career.mjs', 'dashboard')
                    $dashboardPath = Join-Path $projectPath 'output\application-dashboard.html'
                    if (Test-Path -LiteralPath $dashboardPath -PathType Leaf) {
                        Start-Process -FilePath $dashboardPath
                        Write-Host ''
                        Write-Host '看板已经交给默认浏览器打开。' -ForegroundColor Green
                    }
                }
                '7' {
                    Invoke-AgentTool -Arguments @('integration\unified-career.mjs', 'help')
                }
                default {
                    Write-Host '请输入 0 到 7。' -ForegroundColor Yellow
                }
            }
        }
        catch {
            Write-Host ''
            Write-Host "[错误] $($_.Exception.Message)" -ForegroundColor Red
            Write-Host '请保留上面的信息，方便继续排查。' -ForegroundColor Yellow
        }

        Wait-ForUser
    }
}
finally {
    Pop-Location
}
