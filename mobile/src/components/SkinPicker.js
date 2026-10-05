import { Canvas, Picture } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { skinPreview } from '../game/renderer';
import { SKINS } from '../game/shared';
import { colors } from '../theme';

const PREVIEW = { width: 54, height: 18 };

/**
 * The worm skins to choose from, each drawn as a little worm. The chosen one is outlined.
 */
export function SkinPicker({ t, value, onChange }) {
    const previews = useMemo(() => SKINS.map((skin) => skinPreview(skin, PREVIEW.width, PREVIEW.height)), []);

    return (
        <View style={styles.grid}>
            {SKINS.map((skin, i) => {
                const selected = skin.id === value;
                return (
                    <Pressable
                        key={skin.id}
                        onPress={() => onChange(skin.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={t(`skin.${skin.id}`)}
                        hitSlop={2}
                        style={({ pressed }) => [styles.option, selected && styles.selected, pressed && styles.pressed]}
                    >
                        <Canvas style={PREVIEW}>
                            <Picture picture={previews[i]} />
                        </Canvas>
                    </Pressable>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, maxWidth: 5 * (PREVIEW.width + 14) + 4 * 6 },
    option: {
        padding: 5,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
    },
    selected: { backgroundColor: 'rgba(255, 255, 255, 0.2)', borderWidth: 2, borderColor: colors.mint, padding: 4 },
    pressed: { opacity: 0.7 },
});
