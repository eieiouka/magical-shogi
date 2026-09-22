# Magical Shogi port

`src/magical-shogi.ini` defines the 6x6 variant. C++ changes in `variant.h`,
`parser.cpp`, `position.h`, `position.cpp`, and `movegen.cpp` implement the
non-standard board mutations used by Nanoka, Hiro, and Margo.

Verified with an assertion-enabled native build:

- initial legal moves: 15
- perft depth 5: 817,644 positions
- Nanoka shot: shooter remains in place and victim enters the pocket
- Hiro swap: both friendly pieces exchange squares
- Margo assassination: jumper lands and the midpoint victim enters the pocket
- promotion, special checks, checkmate, and safe-try terminal detection

Run `bash tests/magical-shogi-smoke.sh` after building `src/stockfish`.
