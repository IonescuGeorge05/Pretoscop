# Exit 0 while a `next build` runs on this Windows machine, 1 otherwise (Git Bash's pgrep cannot see
# native processes). Used by scripts/verify/M21.sh to run one production build at a time.
$p = @(Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'node.exe' -and ($_.CommandLine -match '[\\/]next[\\/]dist[\\/]bin[\\/]next"?\s+"?build' -or $_.CommandLine -match '\snext"?\s+"?build')
  })
if ($p.Count -gt 0) { exit 0 } else { exit 1 }
