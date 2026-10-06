import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../theme';

export function Hud({ t, points, length, best, bots }) {
    const stats = [
        [t('score'), '⭐', points, colors.amberLight],
        [t('length'), '📏', length, colors.mint],
        [t('best'), '🏆', best, colors.roseLight],
        [t('snakes'), '🐍', bots, colors.sky],
    ];
    return (
        <View style={styles.hud}>
            {stats.map(([label, icon, value, color]) => (
                <View key={label} style={styles.stat} accessible accessibilityLabel={`${label} ${value}`}>
                    <Text style={styles.statLabel}>
                        {icon} {label.toUpperCase()}
                    </Text>
                    <Text style={[styles.statValue, { color }]}>{value}</Text>
                </View>
            ))}
        </View>
    );
}

/**
 * One chip per running power-up, in the board's corner, with a bar showing the time left.
 */
export function PowerUpChips({ t, powerUps }) {
    if (!powerUps.length) {
        return null;
    }
    return (
        <View style={styles.chips} accessibilityLabel={powerUps.map((p) => t(`powerUp.${p.type}`)).join(', ')}>
            {powerUps.map((powerUp) => (
                <View key={powerUp.type} style={styles.chip}>
                    <Text style={styles.chipEmoji}>{powerUp.emoji}</Text>
                    <Text style={styles.chipLabel}>{t(`powerUp.${powerUp.type}`)}</Text>
                    <View style={styles.chipTrack}>
                        <View
                            style={[
                                styles.chipBar,
                                { width: `${Math.max(0, (powerUp.remainingMs / powerUp.durationMs) * 100)}%`, backgroundColor: powerUp.color },
                            ]}
                        />
                    </View>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    chips: { position: 'absolute', left: 6, bottom: 6, flexDirection: 'row', flexWrap: 'wrap', gap: 5, pointerEvents: 'none' },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderRadius: 999,
        paddingLeft: 5,
        paddingRight: 8,
        paddingVertical: 2,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
    },
    chipEmoji: { fontSize: 11 },
    chipLabel: { fontFamily: fonts.semibold, fontSize: 11, color: colors.text },
    chipTrack: { width: 26, height: 5, borderRadius: 999, overflow: 'hidden', backgroundColor: 'rgba(255, 255, 255, 0.15)' },
    chipBar: { height: '100%', borderRadius: 999 },
    hud: { flexDirection: 'row', gap: 8 },
    stat: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 6,
        borderRadius: 16,
        backgroundColor: colors.panel,
        borderWidth: 1,
        borderColor: colors.ring,
    },
    statLabel: { fontFamily: fonts.medium, fontSize: 10, letterSpacing: 0.4, color: 'rgba(209, 250, 229, 0.6)' },
    statValue: { fontFamily: fonts.bold, fontSize: 20, fontVariant: ['tabular-nums'] },
});
