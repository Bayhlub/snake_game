import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../theme';

const PAD = [
    { direction: 'up', label: '▲', row: 0, col: 1 },
    { direction: 'left', label: '◀', row: 1, col: 0 },
    { direction: 'down', label: '▼', row: 1, col: 1 },
    { direction: 'right', label: '▶', row: 1, col: 2 },
];

/**
 * Arrow buttons for players who prefer tapping to dragging.
 */
export function DirectionPad({ t, onTurn, size = 56 }) {
    const gap = 8;
    return (
        <View style={{ width: size * 3 + gap * 2, height: size * 2 + gap, alignSelf: 'center' }}>
            {PAD.map(({ direction, label, row, col }) => (
                <PadKey
                    key={direction}
                    label={label}
                    name={t(direction)}
                    onDown={() => onTurn(direction)}
                    style={{ width: size, height: size, left: col * (size + gap), top: row * (size + gap) }}
                />
            ))}
        </View>
    );
}

/**
 * Turns the moment a finger lands. Pressable waits briefly before "press in" (and skips it on a
 * quick web tap), which makes steering feel laggy, so the key claims the touch itself.
 */
function PadKey({ label, name, onDown, style }) {
    const [pressed, setPressed] = useState(false);
    return (
        <View
            accessible
            accessibilityRole="button"
            accessibilityLabel={name}
            onAccessibilityTap={onDown}
            onStartShouldSetResponder={() => true}
            onResponderGrant={() => {
                setPressed(true);
                onDown();
            }}
            onResponderRelease={() => setPressed(false)}
            onResponderTerminate={() => setPressed(false)}
            style={[styles.key, style, pressed && styles.pressed]}
        >
            <Text style={[styles.label, pressed && styles.labelPressed]}>{label}</Text>
        </View>
    );
}

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
    key: {
        position: 'absolute',
        borderRadius: 14,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    pressed: { backgroundColor: colors.emerald },
    label: { fontSize: 20, color: colors.text },
    labelPressed: { color: colors.emeraldDark },
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
