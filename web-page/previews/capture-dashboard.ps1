param(
    [int]$Width = 1280,
    [int]$Height = 740
)

$ErrorActionPreference = 'Stop'
$previewDir = [IO.Path]::GetFullPath($PSScriptRoot)
$siteDir = [IO.Path]::GetFullPath((Join-Path $previewDir '..'))
$source = Join-Path $previewDir 'dashboard-preview.html'
$output = Join-Path $siteDir 'assets/casebridge-dashboard-preview.png'
$profile = Join-Path $previewDir ('.browser-capture-' + [Guid]::NewGuid().ToString('N'))
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'

if (-not (Test-Path -LiteralPath $chrome)) {
    throw "Chrome not found: $chrome"
}
if (-not (Test-Path -LiteralPath $source)) {
    throw "Preview source not found: $source"
}

$url = ([Uri]::new($source)).AbsoluteUri
try {
    $previousWriteTime = if (Test-Path -LiteralPath $output) {
        (Get-Item -LiteralPath $output).LastWriteTimeUtc
    } else {
        [DateTime]::MinValue
    }
    $chromeArgs = @(
        '--headless=new'
        '--disable-gpu'
        '--no-sandbox'
        '--hide-scrollbars'
        '--no-first-run'
        '--disable-extensions'
        "--user-data-dir=$profile"
        "--window-size=$Width,$Height"
        '--force-device-scale-factor=2'
        '--virtual-time-budget=1500'
        "--screenshot=$output"
        $url
    )
    & $chrome @chromeArgs
    $captured = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if ((Test-Path -LiteralPath $output) -and
            (Get-Item -LiteralPath $output).LastWriteTimeUtc -gt $previousWriteTime) {
            $captured = $true
            break
        }
        Start-Sleep -Milliseconds 250
    }
    if (-not $captured) {
        throw 'The browser did not capture the dashboard preview.'
    }
    Write-Output "Captured $output"
}
finally {
    $resolvedProfile = [IO.Path]::GetFullPath($profile)
    if ($resolvedProfile.StartsWith($previewDir + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        for ($attempt = 0; $attempt -lt 5 -and (Test-Path -LiteralPath $resolvedProfile); $attempt++) {
            try {
                Remove-Item -LiteralPath $resolvedProfile -Recurse -Force -ErrorAction Stop
            }
            catch {
                Start-Sleep -Milliseconds 500
            }
        }
        if (Test-Path -LiteralPath $resolvedProfile) {
            Write-Warning "Temporary browser profile is still in use: $resolvedProfile"
        }
    }
}
