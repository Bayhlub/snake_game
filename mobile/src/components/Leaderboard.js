import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../theme';
import { Button, Panel } from './Ui';

/**
 * Top 10 from the server. `state` is 'offline' (no server set), 'loading', 'error' or 'ready'.
 */
export function Leaderboard({ scores, state, onRetry }) {
    return (
        <Panel style={styles.panel}>
            <Text style={styles.heading}>🏆 Top 10</Text>
            {state === 'offline' && <Text style={styles.note}>Online leaderboard is off. Set EXPO_PUBLIC_API_URL to turn it on.</Text>}
            {state === 'loading' && <Text style={styles.note}>Loading…</Text>}
            {state === 'error' && (
                <View style={styles.error}>
                    <Text style={styles.note}>Could not load the leaderboard.</Text>
                    <Button label="Try again" variant="ghost" size="small" onPress={onRetry} />
                </View>
            )}
            {state === 'ready' && scores.length === 0 && <Text style={styles.note}>No scores yet. Be the first!</Text>}
            {state === 'ready' &&
                scores.map((score, i) => (
                    <View key={`${i}-${score.player_name}`} style={[styles.row, i % 2 === 0 && styles.rowShaded]}>
                        <Text style={styles.rank}>{i + 1}</Text>
                        <Text style={styles.name} numberOfLines={1}>
                            {score.player_name}
                        </Text>
                        <Text style={styles.points}>{score.points}</Text>
                    </View>
                ))}
        </Panel>
    );
}

const styles = StyleSheet.create({
    panel: { padding: 14, gap: 4 },
    heading: { fontFamily: fonts.bold, fontSize: 18, color: colors.text, marginBottom: 6 },
    note: { fontFamily: fonts.regular, fontSize: 14, color: colors.faint },
    error: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    rowShaded: { backgroundColor: 'rgba(255, 255, 255, 0.05)' },
    rank: { width: 22, textAlign: 'right', fontFamily: fonts.bold, color: 'rgba(110, 231, 183, 0.8)', fontVariant: ['tabular-nums'] },
    name: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: colors.text },
    points: { fontFamily: fonts.bold, fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'] },
});
