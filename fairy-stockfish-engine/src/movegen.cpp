/*
  Stockfish, a UCI chess playing engine derived from Glaurung 2.1
  Copyright (C) 2004-2022 The Stockfish developers (see AUTHORS file)

  Stockfish is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  Stockfish is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

#include <cassert>

#include "movegen.h"
#include "position.h"

namespace Stockfish {

namespace {

  template<MoveType T>
  ExtMove* make_move_and_gating(const Position& pos, ExtMove* moveList, Color us, Square from, Square to, PieceType pt = NO_PIECE_TYPE) {

    // Wall placing moves
    //if it's "wall or move", and they chose non-null move, skip even generating wall move
    if (pos.walling() && !(pos.wall_or_move() && (from!=to)))
    {
        Bitboard b = pos.board_bb() & ~((pos.pieces() ^ from) | to);
        if (T == CASTLING)
        {
            Square kto = make_square(to > from ? pos.castling_kingside_file() : pos.castling_queenside_file(), pos.castling_rank(us));
            Direction step = kto > from ? EAST : WEST;
            Square rto = kto - step;
            b ^= square_bb(to) ^ kto ^ rto;
        }
        if (T == EN_PASSANT)
            b ^= pos.capture_square(to);

        if (pos.walling_rule() == ARROW)
            b &= moves_bb(us, type_of(pos.piece_on(from)), to, pos.pieces() ^ from);

        //Any current or future wall variant must follow the walling region rule if set:
        b &= pos.walling_region(us);

        if (pos.walling_rule() == PAST)
            b &= square_bb(from);
        if (pos.walling_rule() == EDGE)
        {
            Bitboard wallsquares = pos.state()->wallSquares;

            b &= (FileABB | file_bb(pos.max_file()) | Rank1BB | rank_bb(pos.max_rank())) |
               ( shift<NORTH     >(wallsquares) | shift<SOUTH     >(wallsquares)
               | shift<EAST      >(wallsquares) | shift<WEST      >(wallsquares));
        }
        while (b)
            *moveList++ = make_gating<T>(from, to, pt, pop_lsb(b));
        return moveList;
    }

    *moveList++ = make<T>(from, to, pt);

    // Gating moves
    if (pos.seirawan_gating() && (pos.gates(us) & from))
        for (PieceSet ps = pos.piece_types(); ps;)
        {
            PieceType pt_gating = pop_lsb(ps);
            if (pos.can_drop(us, pt_gating) && (pos.drop_region(us, pt_gating) & from))
                *moveList++ = make_gating<T>(from, to, pt_gating, from);
        }
    if (pos.seirawan_gating() && T == CASTLING && (pos.gates(us) & to))
        for (PieceSet ps = pos.piece_types(); ps;)
        {
            PieceType pt_gating = pop_lsb(ps);
            if (pos.can_drop(us, pt_gating) && (pos.drop_region(us, pt_gating) & to))
                *moveList++ = make_gating<T>(from, to, pt_gating, to);
        }

    return moveList;
  }

  template<Color c, GenType Type, Direction D>
  ExtMove* make_promotions(const Position& pos, ExtMove* moveList, Square to) {

    if (Type == CAPTURES || Type == EVASIONS || Type == NON_EVASIONS)
    {
        for (PieceSet promotions = pos.promotion_piece_types(c); promotions;)
        {
            PieceType pt = pop_msb(promotions);
            if (!pos.promotion_limit(pt) || pos.promotion_limit(pt) > pos.count(c, pt))
                moveList = make_move_and_gating<PROMOTION>(pos, moveList, pos.side_to_move(), to - D, to, pt);
        }
        PieceType pt = pos.promoted_piece_type(PAWN);
        if (pt && !(pos.piece_promotion_on_capture() && pos.empty(to)))
            moveList = make_move_and_gating<PIECE_PROMOTION>(pos, moveList, pos.side_to_move(), to - D, to);
    }

    return moveList;
  }

  template<Color Us, GenType Type>
  ExtMove* generate_drops(const Position& pos, ExtMove* moveList, PieceType pt, Bitboard b) {
    assert(Type != CAPTURES);
    // Do not generate virtual drops for perft and at root
    if (pos.can_drop(Us, pt) || (Type != NON_EVASIONS && pos.two_boards() && pos.allow_virtual_drop(Us, pt)))
    {
        // Restrict to valid target
        b &= pos.drop_region(Us, pt);

        // Add to move list
        if (pos.drop_promoted() && pos.promoted_piece_type(pt))
        {
            Bitboard b2 = b;
            if (Type == QUIET_CHECKS)
                b2 &= pos.check_squares(pos.promoted_piece_type(pt));
            while (b2)
                *moveList++ = make_drop(pop_lsb(b2), pt, pos.promoted_piece_type(pt));
        }
        if (Type == QUIET_CHECKS || !pos.can_drop(Us, pt))
            b &= pos.check_squares(pt);
        while (b)
            *moveList++ = make_drop(pop_lsb(b), pt, pt);
    }

    return moveList;
  }

  template<Color Us, GenType Type>
  ExtMove* generate_pawn_moves(const Position& pos, ExtMove* moveList, Bitboard target) {

    if (!pos.pieces(Us, PAWN))
        return moveList;

    constexpr Color     Them     = ~Us;
    constexpr Direction Up       = pawn_push(Us);
    constexpr Direction UpRight  = (Us == WHITE ? NORTH_EAST : SOUTH_WEST);
    constexpr Direction UpLeft   = (Us == WHITE ? NORTH_WEST : SOUTH_EAST);

    const Bitboard promotionZone = pos.promotion_zone(Us);
    const Bitboard standardPromotionZone = pos.sittuyin_promotion() ? Bitboard(0) : promotionZone;
    const Bitboard doubleStepRegion = pos.double_step_region(Us);
    const Bitboard tripleStepRegion = pos.triple_step_region(Us);

    const Bitboard pawns      = pos.pieces(Us, PAWN);
    const Bitboard movable    = pos.board_bb(Us, PAWN) & ~pos.pieces();
    const Bitboard capturable = pos.board_bb(Us, PAWN) &  pos.pieces(Them);

    target = Type == EVASIONS ? target : AllSquares;

    // Define single and double push, left and right capture, as well as respective promotion moves
    Bitboard b1 = shift<Up>(pawns) & movable & target;
    Bitboard b2 = shift<Up>(shift<Up>(pawns & doubleStepRegion) & movable) & movable & target;
    Bitboard b3 = shift<Up>(shift<Up>(shift<Up>(pawns & tripleStepRegion) & movable) & movable) & movable & target;
    Bitboard brc = shift<UpRight>(pawns) & capturable & target;
    Bitboard blc = shift<UpLeft >(pawns) & capturable & target;

    Bitboard b1p = b1 & standardPromotionZone;
    Bitboard b2p = b2 & standardPromotionZone;
    Bitboard b3p = b3 & standardPromotionZone;
    Bitboard brcp = brc & standardPromotionZone;
    Bitboard blcp = blc & standardPromotionZone;

    // Restrict regions based on rules and move generation type
    if (pos.mandatory_pawn_promotion())
    {
        b1 &= ~standardPromotionZone;
        b2 &= ~standardPromotionZone;
        b3 &= ~standardPromotionZone;
        brc &= ~standardPromotionZone;
        blc &= ~standardPromotionZone;
    }

    if (Type == QUIET_CHECKS && pos.count<KING>(Them))
    {
        // To make a quiet check, you either make a direct check by pushing a pawn
        // or push a blocker pawn that is not on the same file as the enemy king.
        // Discovered check promotion has been already generated amongst the captures.
        Square ksq = pos.square<KING>(Them);
        Bitboard dcCandidatePawns = pos.blockers_for_king(Them) & ~file_bb(ksq);
        b1 &= pawn_attacks_bb(Them, ksq) | shift<   Up>(dcCandidatePawns);
        b2 &= pawn_attacks_bb(Them, ksq) | shift<Up+Up>(dcCandidatePawns);
    }

    // Single and double pawn pushes, no promotions
    if (Type != CAPTURES)
    {
        while (b1)
        {
            Square to = pop_lsb(b1);
            moveList = make_move_and_gating<NORMAL>(pos, moveList, Us, to - Up, to);
        }

        while (b2)
        {
            Square to = pop_lsb(b2);
            moveList = make_move_and_gating<NORMAL>(pos, moveList, Us, to - Up - Up, to);
        }

        while (b3)
        {
            Square to = pop_lsb(b3);
            moveList = make_move_and_gating<NORMAL>(pos, moveList, Us, to - Up - Up - Up, to);
        }
    }

    // Promotions and underpromotions
    while (brcp)
        moveList = make_promotions<Us, Type, UpRight>(pos, moveList, pop_lsb(brcp));

    while (blcp)
        moveList = make_promotions<Us, Type, UpLeft >(pos, moveList, pop_lsb(blcp));

    while (b1p)
        moveList = make_promotions<Us, Type, Up     >(pos, moveList, pop_lsb(b1p));

    while (b2p)
        moveList = make_promotions<Us, Type, Up+Up  >(pos, moveList, pop_lsb(b2p));

    while (b3p)
        moveList = make_promotions<Us, Type, Up+Up+Up>(pos, moveList, pop_lsb(b3p));

    // Sittuyin promotions
    if (pos.sittuyin_promotion() && (Type == CAPTURES || Type == EVASIONS || Type == NON_EVASIONS))
    {
        // Pawns need to be in promotion zone if there is more than one pawn
        Bitboard promotionPawns = pos.count<PAWN>(Us) > 1 ? pawns & promotionZone : pawns;
        while (promotionPawns)
        {
            Square from = pop_lsb(promotionPawns);
            for (PieceSet ps = pos.promotion_piece_types(Us); ps;)
            {
                PieceType pt = pop_msb(ps);
                if (pos.promotion_limit(pt) && pos.promotion_limit(pt) <= pos.count(Us, pt))
                    continue;
                Bitboard b = ((pos.attacks_from(Us, pt, from) & ~pos.pieces()) | from) & target;
                while (b)
                {
                    Square to = pop_lsb(b);
                    if (!(attacks_bb(Us, pt, to, pos.pieces() ^ from) & pos.pieces(Them)))
                        *moveList++ = make<PROMOTION>(from, to, pt);
                }
            }
        }
    }

    // Standard and en passant captures
    if (Type == CAPTURES || Type == EVASIONS || Type == NON_EVASIONS)
    {
        while (brc)
        {
            Square to = pop_lsb(brc);
            moveList = make_move_and_gating<NORMAL>(pos, moveList, Us, to - UpRight, to);
        }

        while (blc)
        {
            Square to = pop_lsb(blc);
            moveList = make_move_and_gating<NORMAL>(pos, moveList, Us, to - UpLeft, to);
        }

        for (Bitboard epSquares = pos.ep_squares() & ~pos.pieces(); epSquares; )
        {
            Square epSquare = pop_lsb(epSquares);

            // An en passant capture cannot resolve a discovered check (unless there non-sliding riders)
            if (Type == EVASIONS && (target & (epSquare + Up)) && !pos.non_sliding_riders())
                return moveList;

            Bitboard b = pawns & pawn_attacks_bb(Them, epSquare);

            // En passant square is already disabled for non-fairy variants if there is no attacker
            assert(b || !pos.fast_attacks());

            while (b)
                moveList = make_move_and_gating<EN_PASSANT>(pos, moveList, Us, pop_lsb(b), epSquare);
        }
    }

    return moveList;
  }


  template<Color Us, GenType Type>
  ExtMove* generate_moves(const Position& pos, ExtMove* moveList, PieceType Pt, Bitboard target) {

    assert(Pt != KING && Pt != PAWN);

    Bitboard bb = pos.pieces(Us, Pt);

    while (bb)
    {
        Square from = pop_lsb(bb);

        Bitboard attacks = pos.attacks_from(Us, Pt, from);
        Bitboard quiets = pos.moves_from(Us, Pt, from);
        Bitboard b = (  (attacks & pos.pieces())
                       | (quiets & ~pos.pieces()));
        // Nanoka's long capture is represented as SPECIAL so make/undo keeps
        // the shooter on its source square. Keep the capture rays in the
        // attack tables for check detection, but suppress their NORMAL form.
        if (pos.magical_shogi() && pos.magical_role(Pt) == 'n')
        {
            Bitboard shots = 0;
            for (Bitboard candidates = b & pos.pieces(~Us); candidates;)
            {
                Square sq = pop_lsb(candidates);
                int df = int(file_of(sq)) - int(file_of(from));
                int dr = int(rank_of(sq)) - int(rank_of(from));
                int forward = Us == WHITE ? 2 : -2;
                if (dr == forward && (df == 0 || std::abs(df) == 2))
                    shots |= sq;
            }
            b &= ~shots;
        }
        Bitboard b1 = b & target;
        Bitboard promotion_zone = pos.promotion_zone(Us);
        PieceType promPt = pos.promoted_piece_type(Pt);
        Bitboard b2 = promPt && (!pos.promotion_limit(promPt) || pos.promotion_limit(promPt) > pos.count(Us, promPt)) ? b1 : Bitboard(0);
        Bitboard b3 = pos.piece_demotion() && pos.is_promoted(from) ? b1 : Bitboard(0);
        Bitboard pawnPromotions = (pos.promotion_pawn_types(Us) & Pt) ? (b & (Type == EVASIONS ? target : ~pos.pieces(Us)) & promotion_zone) : Bitboard(0);
        Bitboard epSquares = (pos.en_passant_types(Us) & Pt) ? (attacks & ~quiets & pos.ep_squares() & ~pos.pieces()) : Bitboard(0);

        // target squares considering pawn promotions
        if (pawnPromotions && pos.mandatory_pawn_promotion())
            b1 &= ~pawnPromotions;

        // Restrict target squares considering promotion zone
        if (b2 | b3)
        {
            if (pos.mandatory_piece_promotion())
                b1 &= (promotion_zone & from ? Bitboard(0) : ~promotion_zone) | (pos.piece_promotion_on_capture() ? ~pos.pieces() : Bitboard(0));
            // Exclude quiet promotions/demotions
            if (pos.piece_promotion_on_capture())
            {
                b2 &= pos.pieces();
                b3 &= pos.pieces();
            }
            // Consider promotions/demotions into promotion zone
            if (!(promotion_zone & from))
            {
                b2 &= promotion_zone;
                b3 &= promotion_zone;
            }
        }

        if (Type == QUIET_CHECKS)
        {
            b1 &= pos.check_squares(Pt);
            if (b2)
                b2 &= pos.check_squares(pos.promoted_piece_type(Pt));
            if (b3)
                b3 &= pos.check_squares(type_of(pos.unpromoted_piece_on(from)));
        }

        while (b1)
            moveList = make_move_and_gating<NORMAL>(pos, moveList, Us, from, pop_lsb(b1));

        // Shogi-style piece promotions
        while (b2)
            *moveList++ = make<PIECE_PROMOTION>(from, pop_lsb(b2));

        // Piece demotions
        while (b3)
            *moveList++ = make<PIECE_DEMOTION>(from, pop_lsb(b3));

        // Pawn-style promotions
        if ((Type == CAPTURES || Type == EVASIONS || Type == NON_EVASIONS) && pawnPromotions)
            for (PieceSet ps = pos.promotion_piece_types(Us); ps;)
            {
                PieceType ptP = pop_msb(ps);
                if (!pos.promotion_limit(ptP) || pos.promotion_limit(ptP) > pos.count(Us, ptP))
                    for (Bitboard promotions = pawnPromotions; promotions; )
                        moveList = make_move_and_gating<PROMOTION>(pos, moveList, pos.side_to_move(), from, pop_lsb(promotions), ptP);
            }

        // En passant captures
        if (Type == CAPTURES || Type == EVASIONS || Type == NON_EVASIONS)
            while (epSquares)
                moveList = make_move_and_gating<EN_PASSANT>(pos, moveList, Us, from, pop_lsb(epSquares));
    }

    return moveList;
  }


  template<Color Us, GenType Type>
  ExtMove* generate_magical_moves(const Position& pos, ExtMove* moveList) {

    if (!pos.magical_shogi() || Type == QUIET_CHECKS)
        return moveList;

    constexpr Direction Up = Us == WHITE ? NORTH : SOUTH;
    const Color Them = ~Us;

    for (PieceSet ps = pos.piece_types(); ps;)
    {
        PieceType pt = pop_lsb(ps);
        char role = pos.magical_role(pt);
        if (role != 'n' && role != 'i' && role != 'm')
            continue;

        Bitboard bb = pos.pieces(Us, pt);
        while (bb)
        {
            Square from = pop_lsb(bb);
            int ff = int(file_of(from));
            int fr = int(rank_of(from));
            auto addSquare = [&](int tf, int tr, char expected) {
                if (tf < int(FILE_A) || tf > int(pos.max_file()) || tr < int(RANK_1) || tr > int(pos.max_rank()))
                    return;
                Square to = make_square(File(tf), Rank(tr));
                if (expected == 'e' && !(pos.pieces(Them) & to))
                    return;
                if (expected == 'f' && !(pos.pieces(Us) & to))
                    return;
                if (expected == '0' && !pos.empty(to))
                    return;
                *moveList++ = make<SPECIAL>(from, to);
            };

            if (role == 'n' && (Type == CAPTURES || Type == EVASIONS || Type == NON_EVASIONS))
            {
                int step = Up == NORTH ? 1 : -1;
                for (int df : {0, -2, 2})
                {
                    int tf = ff + df, tr = fr + 2 * step;
                    int mf = ff + df / 2, mr = fr + step;
                    if (mf < int(FILE_A) || mf > int(pos.max_file()) || mr < int(RANK_1) || mr > int(pos.max_rank()))
                        continue;
                    if (!pos.empty(make_square(File(mf), Rank(mr))))
                        continue;
                    addSquare(tf, tr, 'e');
                }
            }
            else if (role == 'i' && (Type == QUIETS || Type == EVASIONS || Type == NON_EVASIONS))
            {
                for (int dr = -1; dr <= 1; ++dr)
                    for (int df = -1; df <= 1; ++df)
                        if (df || dr)
                            addSquare(ff + df, fr + dr, 'f');
            }
            else if (role == 'm' && (Type == CAPTURES || Type == EVASIONS || Type == NON_EVASIONS))
            {
                int back = Up == NORTH ? -1 : 1;
                for (auto [df, dr] : {std::pair<int,int>{-1,0}, {1,0}, {-1,back}, {0,back}, {1,back}})
                {
                    int mf = ff + df, mr = fr + dr;
                    int tf = ff + 2 * df, tr = fr + 2 * dr;
                    if (mf < int(FILE_A) || mf > int(pos.max_file()) || mr < int(RANK_1) || mr > int(pos.max_rank()))
                        continue;
                    Square mid = make_square(File(mf), Rank(mr));
                    if (!(pos.pieces(Them) & mid))
                        continue;
                    addSquare(tf, tr, '0');
                }
            }
        }
    }
    return moveList;
  }

  template<Color Us, GenType Type>
  ExtMove* generate_all(const Position& pos, ExtMove* moveList) {

    static_assert(Type != LEGAL, "Unsupported type in generate_all()");

    constexpr bool Checks = Type == QUIET_CHECKS; // Reduce template instantiations
    const Square ksq = pos.count<KING>(Us) ? pos.square<KING>(Us) : SQ_NONE;
    Bitboard target;

    // Skip generating non-king moves when in double check
    if (Type != EVASIONS || !more_than_one(pos.checkers() & ~pos.non_sliding_riders()))
    {
        target = Type == EVASIONS     ?  between_bb(ksq, lsb(pos.checkers()))
               : Type == NON_EVASIONS ? ~pos.pieces( Us)
               : Type == CAPTURES     ?  pos.pieces(~Us)
                                      : ~pos.pieces(   ); // QUIETS || QUIET_CHECKS

        if (Type == EVASIONS)
        {
            if (pos.checkers() & pos.non_sliding_riders())
                target = ~pos.pieces(Us);
            // Leaper attacks can not be blocked
            Square checksq = lsb(pos.checkers());
            if (LeaperAttacks[~Us][type_of(pos.piece_on(checksq))][checksq] & pos.square<KING>(Us))
                target = pos.checkers();
            // A Nanoka shot is encoded as a leaper capture, but unlike an
            // ordinary leaper it can be stopped by occupying its midpoint.
            if (pos.magical_shogi() && pos.magical_role(type_of(pos.piece_on(checksq))) == 'n')
            {
                Square king = pos.square<KING>(Us);
                Square midpoint = make_square(File((int(file_of(checksq)) + int(file_of(king))) / 2),
                                              Rank((int(rank_of(checksq)) + int(rank_of(king))) / 2));
                target |= midpoint;
            }
        }

        // Remove inaccessible squares (outside board + wall squares)
        target &= pos.board_bb();

        moveList = generate_pawn_moves<Us, Type>(pos, moveList, target);
        for (PieceSet ps = pos.piece_types() & ~(piece_set(PAWN) | KING); ps;)
            moveList = generate_moves<Us, Type>(pos, moveList, pop_lsb(ps), target);
        // generate drops
        if (pos.piece_drops() && Type != CAPTURES && (pos.can_drop(Us, ALL_PIECES) || pos.two_boards()))
            for (PieceSet ps = pos.piece_types(); ps;)
                moveList = generate_drops<Us, Type>(pos, moveList, pop_lsb(ps), target & ~pos.pieces(~Us));

        // Castling with non-king piece
        if (!pos.count<KING>(Us) && Type != CAPTURES && pos.can_castle(Us & ANY_CASTLING))
        {
            Square from = pos.castling_king_square(Us);
            for(CastlingRights cr : { Us & KING_SIDE, Us & QUEEN_SIDE } )
                if (!pos.castling_impeded(cr) && pos.can_castle(cr))
                    moveList = make_move_and_gating<CASTLING>(pos, moveList, Us, from, pos.castling_rook_square(cr));
        }

        // Special moves
        if (pos.cambodian_moves() && pos.gates(Us) && Type != CAPTURES)
        {
            if (Type != EVASIONS && (pos.pieces(Us, KING) & pos.gates(Us)))
            {
                Square from = pos.square<KING>(Us);
                Bitboard b = PseudoAttacks[WHITE][KNIGHT][from] & rank_bb(rank_of(from + (Us == WHITE ? NORTH : SOUTH)))
                    & target & ~pos.pieces();
                while (b)
                    moveList = make_move_and_gating<SPECIAL>(pos, moveList, Us, from, pop_lsb(b));
            }

            Bitboard b = pos.pieces(Us, FERS) & pos.gates(Us);
            while (b)
            {
                Square from = pop_lsb(b);
                Square to = from + 2 * (Us == WHITE ? NORTH : SOUTH);
                if (is_ok(to) && (target & to & ~pos.pieces()))
                    moveList = make_move_and_gating<SPECIAL>(pos, moveList, Us, from, to);
            }
        }

        moveList = generate_magical_moves<Us, Type>(pos, moveList);

        // Workaround for passing: Execute a non-move with any piece
        if (pos.pass(Us) && !pos.count<KING>(Us) && pos.pieces(Us))
            *moveList++ = make<SPECIAL>(lsb(pos.pieces(Us)), lsb(pos.pieces(Us)));

        //if "wall or move", generate walling action with null move
        if (pos.wall_or_move())
        {
            moveList = make_move_and_gating<SPECIAL>(pos, moveList, Us, lsb(pos.pieces(Us)), lsb(pos.pieces(Us)));
        }
    }

    // King moves
    if (pos.count<KING>(Us) && (!Checks || pos.blockers_for_king(~Us) & ksq))
    {
        Bitboard b = (  (pos.attacks_from(Us, KING, ksq) & pos.pieces())
                      | (pos.moves_from(Us, KING, ksq) & ~pos.pieces())) & (Type == EVASIONS ? ~pos.pieces(Us) : target);
        while (b)
            moveList = make_move_and_gating<NORMAL>(pos, moveList, Us, ksq, pop_lsb(b));

        // Passing move by king
        if (pos.pass(Us))
            *moveList++ = make<SPECIAL>(ksq, ksq);

        if ((Type == QUIETS || Type == NON_EVASIONS) && pos.can_castle(Us & ANY_CASTLING))
            for (CastlingRights cr : { Us & KING_SIDE, Us & QUEEN_SIDE } )
                if (!pos.castling_impeded(cr) && pos.can_castle(cr))
                    moveList = make_move_and_gating<CASTLING>(pos, moveList, Us,ksq, pos.castling_rook_square(cr));
    }

    return moveList;
  }

} // namespace


/// <CAPTURES>     Generates all pseudo-legal captures plus queen promotions
/// <QUIETS>       Generates all pseudo-legal non-captures and underpromotions
/// <EVASIONS>     Generates all pseudo-legal check evasions when the side to move is in check
/// <QUIET_CHECKS> Generates all pseudo-legal non-captures giving check, except castling and promotions
/// <NON_EVASIONS> Generates all pseudo-legal captures and non-captures
///
/// Returns a pointer to the end of the move list.

template<GenType Type>
ExtMove* generate(const Position& pos, ExtMove* moveList) {

  static_assert(Type != LEGAL, "Unsupported type in generate()");
  assert((Type == EVASIONS) == (bool)pos.checkers());

  Color us = pos.side_to_move();

  return us == WHITE ? generate_all<WHITE, Type>(pos, moveList)
                     : generate_all<BLACK, Type>(pos, moveList);
}

// Explicit template instantiations
template ExtMove* generate<CAPTURES>(const Position&, ExtMove*);
template ExtMove* generate<QUIETS>(const Position&, ExtMove*);
template ExtMove* generate<EVASIONS>(const Position&, ExtMove*);
template ExtMove* generate<QUIET_CHECKS>(const Position&, ExtMove*);
template ExtMove* generate<NON_EVASIONS>(const Position&, ExtMove*);


/// generate<LEGAL> generates all the legal moves in the given position

template<>
ExtMove* generate<LEGAL>(const Position& pos, ExtMove* moveList) {

  if (pos.is_immediate_game_end())
      return moveList;

  ExtMove* cur = moveList;

  moveList = pos.checkers() ? generate<EVASIONS    >(pos, moveList)
                            : generate<NON_EVASIONS>(pos, moveList);
  while (cur != moveList)
      if (!pos.legal(*cur) || pos.virtual_drop(*cur))
          *cur = (--moveList)->move;
      else
          ++cur;

  return moveList;
}

} // namespace Stockfish
