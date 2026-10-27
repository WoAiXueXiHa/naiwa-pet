param([switch]$Uninstall)
$ErrorActionPreference = 'Stop'
$taskName = 'Naiwa-Codex-Startup'
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'Naiwa-Codex.lnk'
if ($Uninstall) {
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
        Stop-ScheduledTask -TaskName $taskName
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }
    if (Test-Path -LiteralPath $shortcutPath) { Remove-Item -LiteralPath $shortcutPath }
    Write-Output 'Codex-linked scheduled task and startup shortcut removed.'
    return
}
$projectRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content (Join-Path $projectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$petExe = Join-Path $projectRoot ('release\win-unpacked\' + $package.build.productName + '.exe')
if (-not (Test-Path -LiteralPath $petExe -PathType Leaf)) { throw 'Run npm run pack before installing startup.' }
$watcher = Join-Path $PSScriptRoot 'watch-codex-pet.ps1'
$powershellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $watcher + '"'
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $powershellExe -Argument $arguments -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
# A logon trigger alone cannot recover a watcher terminated after logon.
# IgnoreNew keeps this recovery trigger from creating duplicate watchers.
$recoveryTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(5) -RepetitionInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -Hidden -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($trigger,$recoveryTrigger) -Principal $principal -Settings $settings -Force | Out-Null
if (Test-Path -LiteralPath $shortcutPath) { Remove-Item -LiteralPath $shortcutPath }
Start-ScheduledTask -TaskName $taskName
Write-Output 'Codex-linked scheduled task installed and started for the current Windows user.'
return
