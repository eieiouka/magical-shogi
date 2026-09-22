param(
  [string]$Emsdk = $env:EMSDK
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Engine = Join-Path $Root "fairy-stockfish-engine\src"
$Wasm = Join-Path $Root "fairy-stockfish-wasm\src"
$Output = Join-Path $Root "public\fairy"

if ($Emsdk) {
  $EnvScript = Join-Path $Emsdk "emsdk_env.ps1"
  if (Test-Path $EnvScript) { . $EnvScript }
}

if (-not (Get-Command "em++" -ErrorAction SilentlyContinue)) {
  throw "em++ was not found. Activate the Emscripten SDK first."
}
$Make = Get-Command "make" -ErrorAction SilentlyContinue
if (-not $Make) { $Make = Get-Command "mingw32-make" -ErrorAction SilentlyContinue }
if (-not $Make) { throw "GNU make was not found. Add make or mingw32-make to PATH." }

foreach ($File in @("variant.h", "variant.cpp", "parser.h", "parser.cpp", "position.h", "position.cpp", "movegen.cpp")) {
  Copy-Item (Join-Path $Engine $File) (Join-Path $Wasm $File) -Force
}

New-Item -ItemType Directory -Force -Path $Output | Out-Null
& $Make.Source -C $Wasm emscripten_build ARCH=wasm embedded_nnue=no minify_js=no
if ($LASTEXITCODE -ne 0) { throw "Fairy-Stockfish WASM build failed. Exit code: $LASTEXITCODE" }

$Built = Join-Path $Wasm "emscripten\public"
foreach ($File in @("stockfish.js", "stockfish.wasm", "stockfish.worker.js", "AUTHORS", "Copying.txt")) {
  Copy-Item (Join-Path $Built $File) (Join-Path $Output $File) -Force
}
Write-Host "Fairy-Stockfish WASM was copied to public/fairy."
