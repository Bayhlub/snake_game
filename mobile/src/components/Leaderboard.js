import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../theme';
import { Button, Panel } from './Ui';

/**
 * The Top 10. `state` is 'local' (scores kept on this phone), 'loading', 'error' or 'ready' (from the server).
 */
export function Leaderboard({ t, scores, state, onRetry }) {
    const hasList = state === 'ready' || state === 'local';
    return (
        <Panel style={styles.panel}>
            <Text style={styles.heading}>{t('topTen')}</Text>
            {state === 'loading' && <Text style={styles.note}>{t('loading')}</Text>}
            {state === 'error' && (
                <View style={styles.error}>
                    <Text style={styles.note}>{t('leaderboardFailed')}</Text>
                    <Button label={t('tryAgain')} variant="ghost" size="small" onPress={onRetry} />
                </View>
            )}
            {hasList && scores.length === 0 && <Text style={styles.note}>{t('noScores')}</Text>}
            {hasList &&
                scores.map((score, i) => (
                    <View key={`${i}-${score.player_name}-${score.points}`} style={[styles.row, i % 2 === 0 && styles.rowShaded]}>
                        <Text style={styles.rank}>{i + 1}</Text>
                        <Text style={styles.name} numberOfLines={1}>
                            {score.player_name}
                        </Text>
                        <Text style={styles.points}>{score.points}</Text>
                    </View>
                ))}
            {state === 'local' && <Text style={styles.footnote}>{t('onThisPhone')}</Text>}
        </Panel>
    );
}

/**
 * Online: everyone in the game right now, best score first. A crashed player shows 💥 until they rejoin.
 */
export function OnlinePlayers({ t, players }) {
    return (
        <Panel style={[styles.panel, styles.onlinePanel]}>
            <Text style={styles.heading}>{t('onlineNow')}</Text>
            {players.map((player, i) => (
                <View key={player.id} style={[styles.row, i % 2 === 0 && styles.rowShaded]}>
                    <View style={[styles.dot, { backgroundColor: player.color }]} />
                    <Text style={styles.name} numberOfLines={1}>
                        {player.isMe ? `${player.name} (${t('you')})` : player.name}
                    </Text>
                    <Text style={styles.points}>{player.alive ? player.points : '💥'}</Text>
                </View>
            ))}
        </Panel>
    );
}

const styles = StyleSheet.create({
    onlinePanel: { borderColor: 'rgba(186, 230, 253, 0.25)' },
    dot: { width: 12, height: 12, borderRadius: 6 },
    panel: { padding: 14, gap: 4 },
    heading: { fontFamily: fonts.bold, fontSize: 18, color: colors.text, marginBottom: 6 },
    note: { fontFamily: fonts.regular, fontSize: 14, color: colors.faint },
    footnote: { marginTop: 6, fontFamily: fonts.regular, fontSize: 12, color: colors.faint },
    error: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    rowShaded: { backgroundColor: 'rgba(255, 255, 255, 0.05)' },
    rank: { width: 22, textAlign: 'right', fontFamily: fonts.bold, color: 'rgba(110, 231, 183, 0.8)', fontVariant: ['tabular-nums'] },
    name: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: colors.text },
    points: { fontFamily: fonts.bold, fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'] },
});
