$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Out = Join-Path $Root "src\game\wasm"
wasm-pack build (Join-Path $Root "wasm-engine") --target web --release --out-dir $Out --out-name magical_shogi_engine
Write-Host "WASM engine built: $Out"
