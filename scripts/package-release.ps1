param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$releasePath = [System.IO.Path]::GetFullPath($OutputPath)
$projectPrefix = $projectRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if ($releasePath.StartsWith($projectPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Release archive must be written outside the project directory."
}
if (Test-Path -LiteralPath $releasePath) { throw "Release archive already exists; choose a new output path." }

npm run build
if ($LASTEXITCODE -ne 0) { throw "Frontend build failed." }

$stageRoot = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $stageRoot | Out-Null
try {
  foreach ($path in @("server", "shared", "dist", "public\icons")) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $path) -Destination $stageRoot -Recurse
  }
  foreach ($file in @("package.json", "package-lock.json", "ecosystem.config.cjs", ".env.example", "DEPLOYMENT.md")) {
    $source = Join-Path $projectRoot $file
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $stageRoot }
  }

  $releaseDirectory = Split-Path -Parent $releasePath
  New-Item -ItemType Directory -Force -Path $releaseDirectory | Out-Null
  Compress-Archive -Path (Join-Path $stageRoot "*") -DestinationPath $releasePath -CompressionLevel Optimal
} finally {
  $tempPrefix = [System.IO.Path]::GetTempPath().TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  if ($stageRoot.StartsWith($tempPrefix, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $stageRoot)) {
    Remove-Item -LiteralPath $stageRoot -Recurse -Force
  }
}

Write-Output "Release archive created at $releasePath"
