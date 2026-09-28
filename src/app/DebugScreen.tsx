/** Developer-only debug screen: live log of intents and errors. Hidden behind
 * a long-press so blind users never land here by accident. */
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { DebugEntry, getDebugEntries, subscribeDebug } from '@/state/debugLog';

export function DebugScreen(): React.JSX.Element {
  const [entries, setEntries] = useState<DebugEntry[]>(getDebugEntries());
  useEffect(() => subscribeDebug(setEntries), []);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>EyeSight — Debug Log</Text>
      {entries
        .slice()
        .reverse()
        .map((e, i) => (
          <View key={i} style={styles.row}>
            <Text style={[styles.kind, e.level === 'error' && styles.error]}>
              {new Date(e.t).toLocaleTimeString()} [{e.kind}]
            </Text>
            <Text style={styles.msg}>{e.message}</Text>
          </View>
        ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  content: { padding: 12 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  row: { marginBottom: 6 },
  kind: { color: '#8cf', fontSize: 12 },
  error: { color: '#f66' },
  msg: { color: '#ddd', fontSize: 13 },
});
