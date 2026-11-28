/**
 * REVEAL, finger only: pick a square, an entry, the wrong squares or the
 * whole puzzle; confirm; read the answer here; write it in yourself. The
 * plugin never writes or erases ink. Revealed squares get a grey triangle
 * once this screen closes.
 */
import React, {useEffect, useMemo, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {recordReveal, revealSquares} from '../app/mini';
import type {ProbeContext} from '../probes/context';
import {cellKey, whiteCells, type GridPuzzle} from '../model/grid';
import {PUZZLES} from '../puzzles/sample';
import {runProbe} from '../probes/runner';
import {setRoute} from './route';

type Pick =
  | {kind: 'square'; key: string}
  | {kind: 'entry'; id: string}
  | {kind: 'wrong'}
  | {kind: 'all'};

/** Squares a pick covers, in reading order. */
export function keysFor(p: GridPuzzle, pick: Pick, wrong: string[]): string[] {
  switch (pick.kind) {
    case 'square':
      return [pick.key];
    case 'entry':
      return (p.entries.find(e => e.id === pick.id)?.cells ?? []).map(cellKey);
    case 'wrong':
      return wrong;
    case 'all':
      return whiteCells(p).map(cellKey);
  }
}

export function describePick(p: GridPuzzle, pick: Pick): string {
  switch (pick.kind) {
    case 'square': {
      const [r, c] = pick.key.split('-').map(Number);
      return `the square in row ${r + 1}, column ${c + 1}`;
    }
    case 'entry': {
      const e = p.entries.find(x => x.id === pick.id);
      return e
        ? `${e.number} ${e.direction === 'across' ? 'Across' : 'Down'}`
        : pick.id;
    }
    case 'wrong':
      return 'the wrong squares from the last CHECK';
    case 'all':
      return 'the whole puzzle';
  }
}

/** The answer text shown after revealing. */
export function answerText(p: GridPuzzle, pick: Pick, keys: string[]): string {
  const letter = (k: string) => {
    const [r, c] = k.split('-').map(Number);
    return p.solution[r][c];
  };
  switch (pick.kind) {
    case 'entry': {
      const e = p.entries.find(x => x.id === pick.id);
      return e ? `${describePick(p, pick)}: ${e.answer}` : '';
    }
    case 'all':
      return p.solution
        .map(row => row.map(ch => ch || '■').join(' '))
        .join('\n');
    default:
      return keys
        .map(k => {
          const [r, c] = k.split('-').map(Number);
          return `Row ${r + 1}, column ${c + 1}: ${letter(k)}`;
        })
        .join('\n');
  }
}

interface Props {
  ctx: ProbeContext | null;
  puzzleId: string;
  notePath: string;
}

export function RevealScreen({
  ctx,
  puzzleId,
  notePath,
}: Props): React.JSX.Element {
  const puzzle = PUZZLES[puzzleId];
  const [wrong, setWrong] = useState<string[]>([]);
  const [pick, setPick] = useState<Pick | null>(null);
  const [shown, setShown] = useState<string | null>(null);

  useEffect(() => {
    if (!ctx || !puzzle) {
      return;
    }
    ctx.store
      .load(puzzleId, notePath)
      .then(s =>
        setWrong(
          Object.entries(s.lastCheck?.cells ?? {})
            .filter(([, v]) => v.status === 'wrong')
            .map(([k]) => k),
        ),
      )
      .catch(() => undefined);
  }, [ctx, puzzle, puzzleId, notePath]);

  const across = useMemo(
    () => puzzle?.entries.filter(e => e.direction === 'across') ?? [],
    [puzzle],
  );
  const down = useMemo(
    () => puzzle?.entries.filter(e => e.direction === 'down') ?? [],
    [puzzle],
  );

  const close = async (drawMarks: boolean) => {
    if (!ctx) {
      setRoute({screen: 'menu'});
      return;
    }
    // Close first, then switch the route, so the menu doesn't flash on e-ink.
    await ctx.sdk.closePluginView();
    setRoute({screen: 'menu'});
    if (drawMarks) {
      // Draw the grey triangles on the page now the view is closed.
      const r = await runProbe(ctx, 'Mini REVEAL marks', [], () =>
        revealSquares(ctx, []),
      );
      if (!r.ok) {
        ctx.log.warn('reveal', `marks not drawn: ${r.summary}`);
      }
    }
  };

  const reveal = async (p: Pick) => {
    const keys = keysFor(puzzle!, p, wrong);
    try {
      if (ctx) {
        await recordReveal(ctx, puzzleId, notePath, keys);
      }
    } catch (e) {
      ctx?.log.warn('reveal', `couldn't record the reveal: ${String(e)}`);
    }
    setShown(answerText(puzzle!, p, keys));
  };

  if (!puzzle) {
    return (
      <View style={styles.root}>
        <Text style={styles.body}>Unknown puzzle.</Text>
        <Button label="Close" onPress={() => close(false)} />
      </View>
    );
  }

  if (shown !== null) {
    return (
      <View style={styles.root}>
        <Text style={styles.title}>Revealed</Text>
        <Text style={styles.answer}>{shown}</Text>
        <Text style={styles.body}>
          Write it in on the page. Revealed squares get a small grey triangle.
        </Text>
        <Button label="Done" onPress={() => close(true)} />
      </View>
    );
  }

  if (pick) {
    return (
      <View style={styles.root}>
        <Text style={styles.title}>Reveal {describePick(puzzle, pick)}?</Text>
        <Text style={styles.body}>
          This shows the answer. It can't be hidden again.
        </Text>
        <View style={styles.row}>
          <Button label="Back" onPress={() => setPick(null)} />
          <Button label="Reveal" strong onPress={() => reveal(pick)} />
        </View>
      </View>
    );
  }

  const cell = 96;
  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Reveal · {puzzle.title}</Text>
        <Button label="Close" onPress={() => close(false)} />
      </View>
      <Text style={styles.warning}>
        Use your finger here: pen strokes on this screen land in the puzzle
        underneath.
      </Text>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.section}>A square</Text>
        <View style={{width: cell * puzzle.width}}>
          {puzzle.blocks.map((row, r) => (
            <View key={r} style={styles.gridRow}>
              {row.map((block, c) => (
                <Pressable
                  key={c}
                  disabled={block}
                  accessibilityRole="button"
                  onPress={() =>
                    setPick({kind: 'square', key: cellKey({row: r, col: c})})
                  }
                  style={[
                    styles.cell,
                    {width: cell, height: cell},
                    block ? styles.block : null,
                  ]}>
                  {!block && puzzle.numbers[r][c] > 0 ? (
                    <Text style={styles.cellNumber}>
                      {puzzle.numbers[r][c]}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          ))}
        </View>
        <Text style={styles.section}>An entry</Text>
        <View style={styles.row}>
          {across.map(e => (
            <Button
              key={e.id}
              label={`${e.number} Across`}
              onPress={() => setPick({kind: 'entry', id: e.id})}
            />
          ))}
        </View>
        <View style={styles.row}>
          {down.map(e => (
            <Button
              key={e.id}
              label={`${e.number} Down`}
              onPress={() => setPick({kind: 'entry', id: e.id})}
            />
          ))}
        </View>
        <Text style={styles.section}>More</Text>
        <View style={styles.row}>
          {wrong.length > 0 ? (
            <Button
              label={`Wrong squares (${wrong.length})`}
              onPress={() => setPick({kind: 'wrong'})}
            />
          ) : null}
          <Button label="Whole puzzle" onPress={() => setPick({kind: 'all'})} />
        </View>
      </ScrollView>
    </View>
  );
}

function Button({
  label,
  onPress,
  strong,
}: {
  label: string;
  onPress: () => void;
  strong?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.button, strong ? styles.buttonStrong : null]}>
      <Text
        style={[styles.buttonText, strong ? styles.buttonTextStrong : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 32,
    paddingTop: 24,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {fontSize: 30, fontWeight: '700', color: '#000000', marginBottom: 12},
  warning: {fontSize: 16, color: '#000000', marginBottom: 8},
  body: {fontSize: 20, color: '#000000', marginVertical: 16, lineHeight: 28},
  answer: {
    fontSize: 48,
    fontWeight: '700',
    color: '#000000',
    marginVertical: 24,
    fontFamily: 'monospace',
  },
  section: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000000',
    marginTop: 24,
    marginBottom: 10,
  },
  scroll: {paddingBottom: 48},
  row: {flexDirection: 'row', flexWrap: 'wrap'},
  gridRow: {flexDirection: 'row'},
  cell: {borderWidth: 2, borderColor: '#000000', backgroundColor: '#ffffff'},
  block: {backgroundColor: '#000000'},
  cellNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
    marginLeft: 4,
  },
  button: {
    borderWidth: 2,
    borderColor: '#000000',
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginRight: 12,
    marginBottom: 12,
    minWidth: 160,
    backgroundColor: '#ffffff',
  },
  buttonStrong: {backgroundColor: '#000000'},
  buttonText: {fontSize: 20, color: '#000000', textAlign: 'center'},
  buttonTextStrong: {color: '#ffffff'},
});
