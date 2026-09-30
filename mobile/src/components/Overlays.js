import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, fonts } from '../theme';
import { Button } from './Ui';

function Overlay({ children, dim = 0.45 }) {
    return (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0, 0, 0, ${dim})` }]}>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                {children}
            </ScrollView>
        </View>
    );
}

export function StartOverlay({ onStart }) {
    return (
        <Overlay>
            <Text style={styles.bigEmoji}>🐍🍎</Text>
            <Text style={styles.title}>Ready?</Text>
            <Button label="Start game" size="large" onPress={onStart} />
        </Overlay>
    );
}

export function PauseOverlay({ onResume }) {
    return (
        <Overlay>
            <Text style={styles.title}>Paused</Text>
            <Button label="Resume" size="large" onPress={onResume} />
        </Overlay>
    );
}

export function GameOverOverlay({ result, canSave, name, onChangeName, onSave, saving, saveStatus, onPlayAgain }) {
    return (
        <Overlay dim={0.55}>
            <Text style={[styles.title, styles.gameOver]}>Game over</Text>
            <Text style={styles.cause}>{result.cause}</Text>
            <Text style={styles.score}>
                Score <Text style={styles.number}>{result.points}</Text>
                <Text style={styles.dot}> · </Text>
                Length <Text style={styles.number}>{result.length}</Text>
            </Text>
            {result.isNewBest && <Text style={styles.newBest}>🏆 New best score!</Text>}

            {canSave && result.points > 0 && (
                <View style={styles.form}>
                    <View style={styles.formRow}>
                        <TextInput
                            value={name}
                            onChangeText={onChangeName}
                            placeholder="Your name"
                            placeholderTextColor="rgba(209, 250, 229, 0.4)"
                            maxLength={20}
                            autoComplete="nickname"
                            returnKeyType="send"
                            onSubmitEditing={onSave}
                            style={styles.input}
                            accessibilityLabel="Your name"
                        />
                        <Button label="Save score" variant="gold" onPress={onSave} disabled={saving} />
                    </View>
                    {saveStatus !== '' && (
                        <Text style={styles.status} accessibilityLiveRegion="polite">
                            {saveStatus}
                        </Text>
                    )}
                </View>
            )}

            <Button label="Play again" size="large" onPress={onPlayAgain} />
        </Overlay>
    );
}

const styles = StyleSheet.create({
    content: {
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 12,
    },
    bigEmoji: { fontSize: 38 },
    title: { fontFamily: fonts.bold, fontSize: 28, color: colors.text },
    gameOver: { color: colors.rose },
    cause: { fontFamily: fonts.regular, fontSize: 15, color: 'rgba(209, 250, 229, 0.8)', textAlign: 'center' },
    score: { fontFamily: fonts.medium, fontSize: 16, color: colors.text },
    number: { fontFamily: fonts.bold, fontSize: 22 },
    dot: { color: 'rgba(209, 250, 229, 0.4)' },
    newBest: { fontFamily: fonts.semibold, color: colors.amber },
    form: { width: '100%', maxWidth: 360, gap: 6 },
    formRow: { flexDirection: 'row', gap: 8 },
    input: {
        flex: 1,
        minWidth: 0,
        borderRadius: 999,
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        color: colors.text,
        fontFamily: fonts.regular,
        fontSize: 16,
    },
    status: { fontFamily: fonts.regular, fontSize: 13, color: 'rgba(209, 250, 229, 0.85)', textAlign: 'center' },
});
