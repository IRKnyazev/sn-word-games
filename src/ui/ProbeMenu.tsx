/**
 * Full-screen Probes menu. Finger only: never write in this view with the
 * pen (pen strokes here land in the note underneath). Black on white, large
 * targets, no animation, for e-ink.
 */
import React, {useCallback, useMemo, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import type {ProbeContext} from '../probes/context';
import {menuActions, runAction, type MenuAction} from '../probes/actions';
import {ensureLogFile} from '../probes/runner';
import {BUSY_STALE_MS} from '../probes/state';
import {logFile} from '../sdk/paths';

interface Props {
  ctx: ProbeContext | null;
  sdkVersion: string;
  header: string;
}

export function ProbeMenu({ctx, sdkVersion, header}: Props): React.JSX.Element {
  const actions = useMemo(() => menuActions(sdkVersion), [sdkVersion]);
  // The id and start time of the run in progress. A run older than
  // BUSY_STALE_MS no longer blocks the menu (a hung SDK call can't lock it).
  const [running, setRunning] = useState<{id: string; since: number} | null>(
    null,
  );
  const [result, setResult] = useState<string>(
    'Pick a probe. Results also go to the log file.',
  );
  const [showLog, setShowLog] = useState(false);

  const onRun = useCallback(
    async (a: MenuAction) => {
      if (!ctx) {
        return;
      }
      if (running && Date.now() - running.since < BUSY_STALE_MS) {
        setResult(`Still running ${running.id}…`);
        return;
      }
      setRunning({id: a.id, since: Date.now()});
      setResult(`Running: ${a.section} · ${a.label}…`);
      try {
        const r = await runAction(ctx, a);
        setResult(`${r.ok ? '' : 'Problem: '}${r.summary}`);
      } finally {
        setRunning(null);
      }
    },
    [ctx, running],
  );

  const writeLog = useCallback(async () => {
    if (!ctx) {
      return;
    }
    const granted = await ensureLogFile(ctx);
    const ok = granted && (await ctx.log.flush());
    setResult(
      ok
        ? `Log written to ${logFile(ctx.files.externalRoot)}`
        : granted
        ? 'Could not write the log file. Use Show log and take a photo.'
        : 'File permission refused, so no log file. Use Show log and take a photo.',
    );
  }, [ctx]);

  const close = useCallback(() => {
    ctx?.sdk.closePluginView();
  }, [ctx]);

  const sections: [string, MenuAction[]][] = [];
  for (const a of actions) {
    const last = sections[sections.length - 1];
    if (last && last[0] === a.section) {
      last[1].push(a);
    } else {
      sections.push([a.section, [a]]);
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Puzzles · Probes</Text>
        <Pressable
          style={styles.closeButton}
          onPress={close}
          accessibilityRole="button">
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>
      <Text style={styles.header}>{header}</Text>
      <Text style={styles.warning}>
        Use your finger here. Pen strokes on this screen land in the note
        underneath.
      </Text>
      {!ctx ? (
        <Text style={styles.result}>
          Plugin context not ready. Close and open again.
        </Text>
      ) : null}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}>
        {sections.map(([section, items]) => (
          <View key={section} style={styles.section}>
            <Text style={styles.sectionTitle}>{section}</Text>
            <View style={styles.row}>
              {items.map(a => (
                <Pressable
                  key={a.id}
                  accessibilityRole="button"
                  onPress={() => onRun(a)}
                  style={[
                    styles.button,
                    running?.id === a.id ? styles.buttonActive : null,
                  ]}>
                  <Text
                    style={[
                      styles.buttonText,
                      running?.id === a.id ? styles.buttonTextActive : null,
                    ]}>
                    {a.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Result</Text>
          <Text style={styles.result}>{result}</Text>
        </View>
        <View style={styles.section}>
          <View style={styles.row}>
            <Pressable
              style={styles.button}
              onPress={() => setShowLog(s => !s)}
              accessibilityRole="button">
              <Text style={styles.buttonText}>
                {showLog ? 'Hide log' : 'Show log'}
              </Text>
            </Pressable>
            <Pressable
              style={styles.button}
              accessibilityRole="button"
              onPress={writeLog}>
              <Text style={styles.buttonText}>Write log now</Text>
            </Pressable>
          </View>
          {showLog ? (
            <Text style={styles.log}>{ctx?.log.tail(80).join('\n')}</Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
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
  title: {fontSize: 30, fontWeight: '700', color: '#000000'},
  closeButton: {
    borderWidth: 2,
    borderColor: '#000000',
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  closeText: {fontSize: 22, color: '#000000'},
  header: {fontSize: 14, color: '#333333', marginTop: 8},
  warning: {fontSize: 16, color: '#000000', marginTop: 8},
  scroll: {flex: 1, marginTop: 12},
  scrollContent: {paddingBottom: 48},
  section: {marginTop: 18},
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 8,
  },
  row: {flexDirection: 'row', flexWrap: 'wrap'},
  button: {
    borderWidth: 2,
    borderColor: '#000000',
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginRight: 12,
    marginBottom: 12,
    minWidth: 180,
    backgroundColor: '#ffffff',
  },
  buttonActive: {backgroundColor: '#000000'},
  buttonText: {fontSize: 20, color: '#000000', textAlign: 'center'},
  buttonTextActive: {color: '#ffffff'},
  result: {fontSize: 18, color: '#000000', lineHeight: 26},
  log: {fontSize: 12, color: '#000000', fontFamily: 'monospace', marginTop: 8},
});
