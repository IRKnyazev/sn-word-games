# M1 plan — offline Mini, end to end

Approved by the owner on 2026-11-27 together with two decisions (batch
removal of marks; REVEAL behind a confirmation). Builds on the M0 results
(`docs/M0-RESULTS.md`).

## What you get on the device

1. Puzzles menu → **Start sample Mini** (with any note open). A note
   `Note/SupernotePuzzles/Mini - sample-1.note` opens: the 5×5 grid, the
   clues, and **CHECK** and **REVEAL** buttons printed on the page.
2. Write the answers with your pen, as on paper.
3. Tap **CHECK**: the plugin reads every across and down entry and draws
   - ✓ or ✗ in the small box in front of each clue (✓ = all right, ✗ = some
     square wrong; nothing while the entry is incomplete),
   - a slash across the top-right corner of each wrong square,
   - then a dialog: how many entries are right, what it read for each wrong
     entry, and any square it couldn't read.
4. Tap **REVEAL**: the Puzzles screen opens on the puzzle. Pick a square, an
   entry, the wrong squares or the whole puzzle with your finger, confirm,
   and the answer is shown on screen. Write it in yourself; revealed squares
   get a small grey triangle in the bottom-right corner. The plugin never
   writes or erases your ink.

## How CHECK reads

- Strokes are mapped to squares with the same layout that printed the page.
- Each entry is recognised in one call. If the number of letters read equals
  the number of filled squares, the letters go to those squares in order.
  Otherwise each square of that entry is read on its own.
- Every square has up to three readings (across, down, single). A reading
  that is the right letter, or a look-alike of it (0 for O, 2 for Z, ✗ for
  X, ✓ for V, ...), counts as right. Otherwise the first reading is what is
  shown.
- Old marks are replaced by new ones in one `batchUpdatePageElements` call
  (decision of 2026-11-27); only geometry inside our mark zones is touched.

## Recognition probe (P1, on your M0 probe note)

"Read this page" gains two extra scores, without rewriting anything:
- **mapped**: each Wordle row / crossword run read as one entry and split
  back into squares;
- **fineliner**: single squares recognised again with the strokes' pen type
  set to fineliner (10).

## Not in M1

NYT data (M2), timers, streaks, Wordle (M3), on-device template rendering.
