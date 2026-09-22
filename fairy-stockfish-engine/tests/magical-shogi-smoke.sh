#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
engine="$repo_dir/src/stockfish"

if [[ ! -x "$engine" ]]; then
  echo "Build first: make -C fairy-stockfish-engine/src -j2 ARCH=x86-64 build" >&2
  exit 1
fi

output="$({
  echo "setoption name UCI_Variant value magicalshogi"
  echo "isready"
  echo "position startpos"
  echo "go perft 1"
  echo "quit"
} | "$engine")"

grep -q "magicalshogi" <<<"$output"
grep -q "Nodes searched: 15" <<<"$output"
printf '%s\n' "$output"
