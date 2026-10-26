param(
    [string]$PetExecutable = '',
    [ValidateRange(1, 60)][int]$PollSeconds = 3
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
$mutex = New-Object System.Threading.Mutex($false, 'Local\NaiwaCodexStartupWatcher')
$acquired = $false
try {
    try { $acquired = $mutex.WaitOne(0) }
    catch [System.Threading.AbandonedMutexException] { $acquired = $true }
    if (-not $acquired) { return }
    $wasRunning = $false
    while ($true) {
        # Match the desktop app, not the separately installed CLI app-server.
        $running = [bool](Get-Process -Name codex -ErrorAction SilentlyContinue | Where-Object {
            $_.Path -like '*\OpenAI\Codex\bin\*\codex.exe'
        } | Select-Object -First 1)
        if ($running -and -not $wasRunning) {
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
        $wasRunning = $running
        Start-Sleep -Seconds $PollSeconds
    }
} finally {
    if ($acquired) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
