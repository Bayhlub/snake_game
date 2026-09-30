import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../theme';

const BUTTON_VARIANTS = {
    primary: { background: colors.emerald, pressed: colors.emeraldLight, text: colors.emeraldDark },
    gold: { background: colors.amber, pressed: colors.amberLight, text: colors.amberDark },
    ghost: { background: 'rgba(255, 255, 255, 0.06)', pressed: 'rgba(255, 255, 255, 0.14)', text: colors.text },
};

export function Button({ label, onPress, variant = 'primary', size = 'medium', disabled = false, style }) {
    const theme = BUTTON_VARIANTS[variant];
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            hitSlop={6}
            style={({ pressed }) => [
                styles.button,
                size === 'large' && styles.buttonLarge,
                size === 'small' && styles.buttonSmall,
                variant === 'ghost' && styles.ghost,
                { backgroundColor: pressed ? theme.pressed : theme.background, opacity: disabled ? 0.5 : 1 },
                style,
            ]}
        >
            <Text style={[styles.buttonText, size === 'large' && styles.buttonTextLarge, size === 'small' && styles.buttonTextSmall, { color: theme.text }]}>
                {label}
            </Text>
        </Pressable>
    );
}

/**
 * A two-way pill (EN | ລາວ) for picking the language; the chosen side is filled.
 */
export function LanguageSwitch({ languages, value, onChange, label }) {
    return (
        <View style={styles.switch} accessibilityRole="radiogroup" accessibilityLabel={label}>
            {languages.map((language) => {
                const selected = language.code === value;
                return (
                    <Pressable
                        key={language.code}
                        onPress={() => onChange(language.code)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        accessibilityLabel={language.name}
                        hitSlop={4}
                        style={[styles.switchOption, selected && styles.switchSelected]}
                    >
                        <Text style={[styles.switchText, selected && styles.switchTextSelected]}>{language.label}</Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

export function Panel({ children, style }) {
    return <View style={[styles.panel, style]}>{children}</View>;
}

const styles = StyleSheet.create({
    button: {
        borderRadius: 999,
        paddingHorizontal: 22,
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonLarge: { paddingHorizontal: 30, paddingVertical: 12 },
    buttonSmall: { paddingHorizontal: 14, paddingVertical: 7 },
    ghost: { borderWidth: 1, borderColor: colors.ring },
    buttonText: { fontFamily: fonts.bold, fontSize: 16 },
    buttonTextLarge: { fontSize: 18 },
    buttonTextSmall: { fontFamily: fonts.medium, fontSize: 13 },
    switch: {
        flexDirection: 'row',
        padding: 3,
        borderRadius: 999,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        borderWidth: 1,
        borderColor: colors.ring,
    },
    switchOption: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
    switchSelected: { backgroundColor: colors.emerald },
    switchText: { fontFamily: fonts.semibold, fontSize: 13, color: 'rgba(209, 250, 229, 0.8)' },
    switchTextSelected: { color: colors.emeraldDark },
    panel: {
        borderRadius: 16,
        backgroundColor: colors.panel,
        borderWidth: 1,
        borderColor: colors.ring,
    },
});
