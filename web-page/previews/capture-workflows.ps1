param([int]$Width = 1280, [int]$Height = 740)

$ErrorActionPreference = 'Stop'
$previewDir = [IO.Path]::GetFullPath($PSScriptRoot)
$siteDir = [IO.Path]::GetFullPath((Join-Path $previewDir '..'))
$source = Join-Path $previewDir 'workflow-preview.html'
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$views = @('case-map','evidence-gap','case-strength','opposition','deadlines','legal-sources','specialist','audit-trail')

if (-not (Test-Path -LiteralPath $chrome)) { throw "Chrome not found: $chrome" }
if (-not (Test-Path -LiteralPath $source)) { throw "Preview source not found: $source" }

foreach ($view in $views) {
    $output = Join-Path $siteDir "assets/workflow-$view.png"
    $profile = Join-Path $previewDir ('.workflow-capture-' + [Guid]::NewGuid().ToString('N'))
    $previousWriteTime = if (Test-Path -LiteralPath $output) { (Get-Item -LiteralPath $output).LastWriteTimeUtc } else { [DateTime]::MinValue }
    $url = ([Uri]::new($source)).AbsoluteUri + '?view=' + $view
    try {
        $chromeArgs = @(
            '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
            '--no-first-run', '--disable-extensions', "--user-data-dir=$profile",
            "--window-size=$Width,$Height", '--force-device-scale-factor=2',
            '--virtual-time-budget=1500', "--screenshot=$output", $url
        )
        & $chrome @chromeArgs 2>$null
        $captured = $false
        for ($attempt = 0; $attempt -lt 40; $attempt++) {
            if ((Test-Path -LiteralPath $output) -and (Get-Item -LiteralPath $output).LastWriteTimeUtc -gt $previousWriteTime) {
                $captured = $true
                break
            }
            Start-Sleep -Milliseconds 250
        }
        if (-not $captured) { throw "The browser did not capture $view." }
        Write-Output "Captured $output"
    }
    finally {
        $resolvedProfile = [IO.Path]::GetFullPath($profile)
        if ($resolvedProfile.StartsWith($previewDir + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
            for ($attempt = 0; $attempt -lt 5 -and (Test-Path -LiteralPath $resolvedProfile); $attempt++) {
                try { Remove-Item -LiteralPath $resolvedProfile -Recurse -Force -ErrorAction Stop }
                catch { Start-Sleep -Milliseconds 500 }
            }
        }
    }
}
