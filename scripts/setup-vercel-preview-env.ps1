#Requires -Version 5.1
<#
.SYNOPSIS
  Interactively collect env vars and upload them to the Vercel Preview environment.

.DESCRIPTION
  Prefills from .env.local when present. Press Enter to keep a suggested value.
  Enter a blank value with no existing suggestion to skip that key.

  Usage (from repo root, already in PowerShell):
    .\scripts\setup-vercel-preview-env.ps1

  Or:
    powershell -ExecutionPolicy Bypass -File .\scripts\setup-vercel-preview-env.ps1

  Options:
    -DryRun     Print what would be uploaded; do not call vercel
    -EnvFile    Path to a KEY=VALUE file to prefill (default: .env.local)
    -SkipPrompt Upload existing file values only (no interactive prompts)
#>
param(
  [switch]$DryRun,
  [switch]$SkipPrompt,
  [string]$EnvFile = ".env.local",
  [ValidateSet("preview", "production", "development")]
  [string]$Target = "preview"
)

$ErrorActionPreference = "Continue"

$Keys = @(
  "NODE_ENV",
  "NEXT_PUBLIC_APP_URL",
  "ALLOW_MOCK_PROVIDERS",
  "DEMO_MODE",
  "CRON_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "BOOTSTRAP_ADMIN_EMAIL",
  "MARKET_DATA_PRIMARY",
  "MARKET_DATA_FALLBACK",
  "MARKET_DATA_LICENSE_SCOPE",
  "MARKET_DATA_LICENSE_ACKNOWLEDGED",
  "ALPACA_STOCK_FEED",
  "ALPACA_DATA_KEY_ID",
  "ALPACA_DATA_SECRET_KEY",
  "ALPHA_VANTAGE_API_KEY",
  "FINNHUB_API_KEY",
  "OPENAI_API_KEY",
  "AI_DEFAULT_PROVIDER",
  "OPENAI_MODEL",
  "FRED_API_KEY"
)

# Sensible Preview defaults when nothing is in .env.local
$Defaults = @{
  NODE_ENV                         = "production"
  NEXT_PUBLIC_APP_URL              = "https://REPLACE-AFTER-FIRST-DEPLOY.vercel.app"
  ALLOW_MOCK_PROVIDERS             = "false"
  DEMO_MODE                        = "false"
  MARKET_DATA_PRIMARY              = "alpaca"
  MARKET_DATA_FALLBACK             = "none"
  MARKET_DATA_LICENSE_SCOPE        = "single_user_development"
  MARKET_DATA_LICENSE_ACKNOWLEDGED = "false"
  ALPACA_STOCK_FEED                = "iex"
  AI_DEFAULT_PROVIDER              = "openai"
  OPENAI_MODEL                     = "gpt-4.1-mini"
}

$SecretHints = @("KEY", "SECRET", "TOKEN", "PASSWORD", "SERVICE_ROLE", "CRON")
$Dq = [char]34
$Sq = [char]39

function Test-IsSecret {
  param([string]$Key)
  if ($Key.StartsWith("NEXT_PUBLIC_")) { return $false }
  foreach ($h in $SecretHints) {
    if ($Key.ToUpperInvariant().Contains($h)) { return $true }
  }
  return $false
}

function Read-DotEnv {
  param([string]$Path)
  $map = @{}
  if (-not (Test-Path $Path)) { return $map }
  foreach ($line in Get-Content -Path $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
    $eq = $trimmed.IndexOf("=")
    if ($eq -le 0) { continue }
    $k = $trimmed.Substring(0, $eq).Trim()
    $v = $trimmed.Substring($eq + 1).Trim()
    if ($v.Length -ge 2) {
      $startsDq = $v.StartsWith([string]$Dq)
      $endsDq = $v.EndsWith([string]$Dq)
      $startsSq = $v.StartsWith([string]$Sq)
      $endsSq = $v.EndsWith([string]$Sq)
      if (($startsDq -and $endsDq) -or ($startsSq -and $endsSq)) {
        $v = $v.Substring(1, $v.Length - 2)
      }
    }
    $map[$k] = $v
  }
  return $map
}

function Get-MaskedValue {
  param([string]$Value)
  if ([string]::IsNullOrEmpty($Value)) { return "(empty)" }
  if ($Value.Length -le 6) { return ("*" * $Value.Length) }
  $stars = "*" * [Math]::Min(12, $Value.Length - 3)
  return ($Value.Substring(0, 3) + $stars)
}

Write-Host ""
Write-Host "=== Vercel Preview env setup ===" -ForegroundColor Cyan
Write-Host "Target environment: $Target"
Write-Host "Prefill file:       $EnvFile"
Write-Host ""

if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
  Write-Error "Vercel CLI not found. Install with: npm i -g vercel"
}

$who = (& vercel whoami 2>$null | Select-Object -Last 1)
if (-not $who -or $who -match "Error|not logged") {
  Write-Host "Not logged in. Running vercel login..." -ForegroundColor Yellow
  vercel login
}

if (-not (Test-Path ".vercel\project.json")) {
  Write-Host "Project not linked. Running vercel link..." -ForegroundColor Yellow
  vercel link
}

$existing = Read-DotEnv -Path $EnvFile
$collected = [ordered]@{}

Write-Host "For each key: Enter = keep suggestion, or type a new value." -ForegroundColor DarkGray
Write-Host "Type SKIP to omit a key from upload." -ForegroundColor DarkGray
Write-Host ""

foreach ($key in $Keys) {
  $suggested = $null
  if ($existing.ContainsKey($key) -and -not [string]::IsNullOrWhiteSpace($existing[$key])) {
    $suggested = $existing[$key]
  } elseif ($Defaults.ContainsKey($key)) {
    $suggested = $Defaults[$key]
  }

  if ($SkipPrompt) {
    if ($null -ne $suggested -and $suggested -ne "") {
      $collected[$key] = $suggested
      $masked = Get-MaskedValue -Value $suggested
      Write-Host ("  {0,-40} {1}" -f $key, $masked)
    } else {
      Write-Host ("  {0,-40} SKIPPED (no value)" -f $key) -ForegroundColor DarkYellow
    }
    continue
  }

  if ($null -ne $suggested) {
    $hint = Get-MaskedValue -Value $suggested
  } else {
    $hint = "(none)"
  }
  $prompt = "{0} [{1}]: " -f $key, $hint
  $userValue = Read-Host $prompt

  if ($userValue -eq "SKIP" -or $userValue -eq "skip") {
    Write-Host "  skipped" -ForegroundColor DarkYellow
    continue
  }

  if ([string]::IsNullOrWhiteSpace($userValue)) {
    if ($null -ne $suggested -and $suggested -ne "") {
      $collected[$key] = $suggested
    } else {
      Write-Host "  skipped (empty)" -ForegroundColor DarkYellow
    }
    continue
  }

  $collected[$key] = $userValue
}

if ($collected.Count -eq 0) {
  Write-Host "Nothing to upload." -ForegroundColor Yellow
  exit 0
}

Write-Host ""
Write-Host "Will upload $($collected.Count) vars to Vercel ($Target):" -ForegroundColor Cyan
foreach ($k in $collected.Keys) {
  $masked = Get-MaskedValue -Value ([string]$collected[$k])
  Write-Host ("  {0,-40} {1}" -f $k, $masked)
}
Write-Host ""

if (-not $DryRun) {
  $confirm = Read-Host "Upload now? [Y/n]"
  if ($confirm -match "^[Nn]") {
    Write-Host "Aborted."
    exit 0
  }
}

$ok = 0
$fail = 0
foreach ($key in $collected.Keys) {
  $value = [string]$collected[$key]
  $sensitive = Test-IsSecret -Key $key

  if ($DryRun) {
    $sensFlag = ""
    if ($sensitive) { $sensFlag = " --sensitive" }
    Write-Host ("[dry-run] vercel env add {0} {1}{2}" -f $key, $Target, $sensFlag)
    $ok++
    continue
  }

  # Remove existing so re-runs are idempotent (ignore errors if missing)
  vercel env rm $key $Target --yes 2>$null | Out-Null

  $vercelArgs = @("env", "add", $key, $Target)
  if ($sensitive) { $vercelArgs += "--sensitive" }

  try {
    $value | & vercel @vercelArgs
    if ($LASTEXITCODE -ne 0) { throw "vercel exited $LASTEXITCODE" }
    Write-Host "  OK  $key" -ForegroundColor Green
    $ok++
  } catch {
    Write-Host ("  FAIL {0} - {1}" -f $key, $_) -ForegroundColor Red
    $fail++
  }
}

Write-Host ""
Write-Host "Done. Uploaded=$ok Failed=$fail" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next:"
Write-Host "  1. vercel deploy"
Write-Host "  2. Copy the preview URL"
Write-Host "  3. Re-run this script (or vercel env add) to set NEXT_PUBLIC_APP_URL to that URL"
Write-Host "  4. Redeploy: vercel deploy"
Write-Host ""
Write-Host "Note: NODE_ENV is usually set by Vercel automatically; keeping production for Preview builds is fine."
Write-Host "After changing env vars, redeploy so the new values are baked into the build."
