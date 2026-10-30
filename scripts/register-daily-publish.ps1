# Înregistrează în Windows Task Scheduler publicarea zilnică pe GitHub Pages (ora implicită 07:30).
# Rulezi o singură dată, din PowerShell, în folderul proiectului:
#     powershell -ExecutionPolicy Bypass -File scripts\register-daily-publish.ps1
# Oprire:   Unregister-ScheduledTask -TaskName "Pretoscop - publicare zilnica" -Confirm:$false
# Jurnal:   logs\publish.log
param([string]$At = "07:30")

$root = Split-Path -Parent $PSScriptRoot
$bash = "C:\Program Files\Git\bin\bash.exe"
if (-not (Test-Path $bash)) { throw "Nu găsesc Git Bash la $bash" }

$action = New-ScheduledTaskAction -Execute $bash -Argument "-lc `"bash '$($root -replace '\','/')/scripts/publish-daily.sh'`""
$trigger = New-ScheduledTaskTrigger -Daily -At $At
# dacă la ora fixată calculatorul era oprit, rulează când pornește
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName "Pretoscop - publicare zilnica" -Action $action -Trigger $trigger -Settings $settings `
  -Description "Exportă datele reale și publică site-ul static pe GitHub Pages" -Force | Out-Null
Write-Host "Gata: publicare zilnică la $At. Jurnal: $root\logs\publish.log"
