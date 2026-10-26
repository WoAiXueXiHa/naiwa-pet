param(
    [string]$PetExecutable = '',
    [ValidateRange(1, 60)][int]$PollSeconds = 3,
    [switch]$CheckOnce
)

$ErrorActionPreference = 'Stop'
if (-not $PetExecutable) {
    $projectRoot = Split-Path -Parent $PSScriptRoot
    $package = Get-Content (Join-Path $projectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $PetExecutable = Join-Path $projectRoot ('release\win-unpacked\' + $package.build.productName + '.exe')
}
if (-not (Test-Path -LiteralPath $PetExecutable -PathType Leaf)) {
    throw 'Pet executable not found. Run npm run pack first, or supply -PetExecutable.'
}
$PetExecutable = (Resolve-Path -LiteralPath $PetExecutable).Path
function Get-CodexDesktopSession {
    # Store distribution uses ChatGPT.exe; bin/codex.exe is only its backend.
    $desktop = Get-Process -Name ChatGPT, Codex -ErrorAction SilentlyContinue | Where-Object {
        $_.Path -like '*\WindowsApps\OpenAI.Codex_*\app\ChatGPT.exe' -or
        $_.Path -like '*\OpenAI\Codex\app\ChatGPT.exe' -or
        ($_.Path -like '*\Codex\Codex.exe' -and $_.Path -notlike '*\bin\*')
    } | Sort-Object StartTime | Select-Object -First 1
    if ($desktop) { return [string]$desktop.Id + ':' + $desktop.StartTime.Ticks }
    return ''
}
if ($CheckOnce) {
    [pscustomobject]@{DesktopDetected = [bool](Get-CodexDesktopSession); PetExecutableExists = $true}
    return
}
$mutex = New-Object System.Threading.Mutex($false, 'Local\NaiwaCodexStartupWatcher')
$acquired = $false
try {
    try { $acquired = $mutex.WaitOne(0) }
    catch [System.Threading.AbandonedMutexException] { $acquired = $true }
    if (-not $acquired) { return }
    $lastSession = ''
    while ($true) {
        $session = Get-CodexDesktopSession
        if ($session -and $session -ne $lastSession) {
            $existing = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $PetExecutable }
            if (-not $existing) {
                try {
                    Start-Process -FilePath $PetExecutable -WorkingDirectory (Split-Path -Parent $PetExecutable) -WindowStyle Hidden
                } catch {
                    # Retry while Codex remains open, without logging personal paths.
                    Start-Sleep -Seconds $PollSeconds
                    continue
                }
            }
        }
        $lastSession = $session
        Start-Sleep -Seconds $PollSeconds
    }
} finally {
    if ($acquired) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
