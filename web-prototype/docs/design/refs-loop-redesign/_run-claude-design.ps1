Set-Location -LiteralPath 'C:\Users\John\Documents\models\web-prototype'
$promptFile = Join-Path (Get-Location) 'docs\design\refs-loop-redesign\_FULL_PROMPT.txt'
$outFile = Join-Path (Get-Location) 'docs\design\refs-loop-redesign\_claude-design-out.txt'
$errFile = Join-Path (Get-Location) 'docs\design\refs-loop-redesign\_claude-design-err.txt'
$prompt = [System.IO.File]::ReadAllText($promptFile)
# Pass prompt via stdin-ish: write to temp and use --print with explicit arg array
$args = @('-p', $prompt, '--output-format', 'text', '--dangerously-skip-permissions')
try {
  $p = Start-Process -FilePath 'claude' -ArgumentList $args -WorkingDirectory 'C:\Users\John\Documents\models\web-prototype' -NoNewWindow -PassThru -RedirectStandardOutput $outFile -RedirectStandardError $errFile
  Wait-Process -Id $p.Id -Timeout 1800
} catch {
  $_ | Out-File $errFile -Append
}
