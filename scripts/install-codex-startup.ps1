param([switch]$Uninstall)
$ErrorActionPreference = 'Stop'
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'Naiwa-Codex.lnk'
if ($Uninstall) {
    if (Test-Path -LiteralPath $shortcutPath) { Remove-Item -LiteralPath $shortcutPath }
    Write-Output 'Startup shortcut removed. The current watcher stops at sign-out.'
    return
}
$projectRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content (Join-Path $projectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$petExe = Join-Path $projectRoot ('release\win-unpacked\' + $package.build.productName + '.exe')
if (-not (Test-Path -LiteralPath $petExe -PathType Leaf)) { throw 'Run npm run pack before installing startup.' }
$watcher = Join-Path $PSScriptRoot 'watch-codex-pet.ps1'
$powershellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $watcher + '"'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powershellExe
$shortcut.Arguments = $arguments
$shortcut.WorkingDirectory = $projectRoot
$shortcut.WindowStyle = 7
$shortcut.Description = 'Start the desktop pet when Codex opens'
$shortcut.Save()
Start-Process -FilePath $powershellExe -ArgumentList $arguments -WindowStyle Hidden
Write-Output 'Codex-linked startup installed for the current Windows user.'
