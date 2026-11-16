# Q-Hub resource measurement (specs/090-app-resource-limits, contracts/usage-log.md, section 3).
# Samples every second the CPU time and private memory of all processes of the app and prints a summary.
# ASCII only on purpose: Windows PowerShell 5.1 reads a UTF-8 file without BOM as ANSI.
#
#   powershell -ExecutionPolicy Bypass -File desktop\scripts\measure.ps1 -Name electron -Minutes 10 -Label background
#
# -Name       process name without .exe: electron (run from code) or Q-Hub (installed)
# -PathMatch  optional part of the exe path, to skip other Electron apps (default for electron: Q-Hub.fun)
# -Label      idle | background | active | soak  - which budget to check
# Exit code:  0 - inside the budget, 1 - outside, 2 - no process found
#
# The average is total CPU time / total elapsed time, not a mean of per-second percentages.
# The runs of 2026-11-16 made before 22:30 used a version that rounded each per-process delta to whole
# seconds and read low (3.7 % where the real figure was 5.9 %): their CPU numbers are not valid.
param(
  [string]$Name = 'electron',
  [string]$PathMatch = '',
  [double]$Minutes = 10,
  [ValidateSet('idle', 'background', 'active', 'soak')][string]$Label = 'background',
  [string]$Out = 'specs\090-app-resource-limits\runs'
)
$ErrorActionPreference = 'Stop'
if (-not $PathMatch -and $Name -eq 'electron') { $PathMatch = 'Q-Hub.fun' }
$cores = [Environment]::ProcessorCount
$cpuLimit = @{ idle = 1; background = 5; active = 10; soak = 10 }[$Label]
$memLimit = 1500; $spikePct = 25; $spikeOver = 10; $spikeSec = 5

# the path filter is slow (it opens every process), so the list of our PIDs is refreshed once in 10 s;
# between refreshes only the known PIDs are read
function Get-AppIds {
  $ps = @(Get-Process -Name $Name -ErrorAction SilentlyContinue)
  if ($PathMatch) { $ps = @($ps | Where-Object { $_.Path -and $_.Path -like "*$PathMatch*" }) }
  return @($ps | ForEach-Object { $_.Id })
}

$ids = Get-AppIds
if (-not $ids.Count) { Write-Host "no process '$Name' (path like '$PathMatch') - start the app first"; exit 2 }
New-Item -ItemType Directory -Force $Out | Out-Null
$csv = Join-Path $Out ("{0}-{1}.csv" -f $Label, (Get-Date -Format 'yyyyMMdd-HHmmss'))
'time;cpu;mem;ws;procs' | Out-File $csv -Encoding ascii
$inv = [Globalization.CultureInfo]::InvariantCulture

$prev = @{}; $first = $true; $idsAt = 0.0
$n = 0; $cpuTotal = 0.0; $cpuMax = 0.0; $memMax = 0.0; $wsMax = 0.0; $over25 = 0
$aboveFor = 0.0; $aboveMax = 0.0; $elapsed = 0.0
$total = [int]($Minutes * 60)
$sw = [Diagnostics.Stopwatch]::StartNew(); $last = 0.0
Write-Host "$Label, $Minutes min, $cores threads -> $csv"
while ($sw.Elapsed.TotalSeconds -lt $total) {
  $wait = 1000 - ($sw.Elapsed.TotalSeconds - $last) * 1000
  if (-not $first -and $wait -gt 0) { Start-Sleep -Milliseconds $wait }
  if ($sw.Elapsed.TotalSeconds - $idsAt -ge 10) { $ids = Get-AppIds; $idsAt = $sw.Elapsed.TotalSeconds }
  $ps = @(Get-Process -Id $ids -ErrorAction SilentlyContinue)
  $cur = @{}; $delta = 0.0; $mem = 0.0; $ws = 0.0
  foreach ($p in $ps) {
    try { $t = $p.TotalProcessorTime.TotalSeconds } catch { continue }   # the process has just exited
    $cur[$p.Id] = $t
    # a process born after the first sample counts in full; one that existed before it has no baseline
    # 0.0, not 0: with an integer first argument PowerShell picks Max(int, int) and rounds the delta to whole seconds
    if ($prev.ContainsKey($p.Id)) { $delta += [math]::Max(0.0, [double]($t - $prev[$p.Id])) } elseif (-not $first) { $delta += $t }
    $mem += $p.PrivateMemorySize64; $ws += $p.WorkingSet64
  }
  $now = $sw.Elapsed.TotalSeconds   # right after the read: the interval the delta belongs to
  $prev = $cur
  if ($first) { $first = $false; $last = $now; continue }
  $dt = $now - $last; $last = $now
  if ($dt -le 0) { continue }
  $cpu = 100 * $delta / ($dt * $cores); $memMb = $mem / 1MB; $wsMb = $ws / 1MB
  $n++; $cpuTotal += $delta; $elapsed += $dt
  if ($cpu -gt $cpuMax) { $cpuMax = $cpu }
  if ($memMb -gt $memMax) { $memMax = $memMb }
  if ($wsMb -gt $wsMax) { $wsMax = $wsMb }
  if ($cpu -gt $spikeOver) { $aboveFor += $dt; if ($aboveFor -gt $aboveMax) { $aboveMax = $aboveFor } } else { $aboveFor = 0.0 }
  if ($cpu -gt $spikePct) { $over25++ }
  ('{0};{1};{2};{3};{4}' -f (Get-Date -Format 'HH:mm:ss'), $cpu.ToString('0.00', $inv), [int]$memMb, [int]$wsMb, $ps.Count) | Out-File $csv -Append -Encoding ascii
  if ($n % 60 -eq 0) { Write-Host ([string]::Format($inv, '  {0,4:0} min: cpu avg {1:0.0} %, mem {2:0} MB', ($elapsed / 60), (100 * $cpuTotal / ($elapsed * $cores)), $memMb)) }
}
if (-not $n) { Write-Host 'no samples'; exit 2 }
$avg = 100 * $cpuTotal / ($elapsed * $cores)
Write-Host ([string]::Format($inv, '{0} {1} min: cpu avg {2:0.0} % max {3:0.0} %; longest above {4} %: {5:0} s; samples above {6} %: {7}; mem max {8:0} MB (working set {9:0} MB)',
  $Label, $Minutes, $avg, $cpuMax, $spikeOver, $aboveMax, $spikePct, $over25, $memMax, $wsMax))
$bad = @()
if ($avg -gt $cpuLimit) { $bad += "cpu avg above $cpuLimit %" }
if ($memMax -gt $memLimit) { $bad += "memory above $memLimit MB" }
if ($Label -eq 'active' -and $aboveMax -gt $spikeSec) { $bad += "above $spikeOver % longer than $spikeSec s" }
if ($Label -eq 'active' -and $over25 -gt 0) { $bad += "samples above $spikePct %" }
if ($bad.Count) { Write-Host ('OUTSIDE the budget: ' + ($bad -join '; ')); exit 1 }
Write-Host 'inside the budget'; exit 0
