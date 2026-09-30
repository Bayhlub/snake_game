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
export function DirectionPad({ onTurn, size = 56 }) {
    const gap = 8;
    return (
        <View style={{ width: size * 3 + gap * 2, height: size * 2 + gap, alignSelf: 'center' }}>
            {PAD.map(({ direction, label, row, col }) => (
                <PadKey
                    key={direction}
                    label={label}
                    name={direction[0].toUpperCase() + direction.slice(1)}
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

export function Hud({ points, length, best, bots }) {
    const stats = [
        ['Score', '⭐', points, colors.amberLight],
        ['Length', '📏', length, colors.mint],
        ['Best', '🏆', best, colors.roseLight],
        ['Snakes', '🐍', bots, colors.sky],
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

const styles = StyleSheet.create({
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
