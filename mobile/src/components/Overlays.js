import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { describePlayerCrash } from '../game/shared';
import { colors, fonts } from '../theme';
import { SkinPicker } from './SkinPicker';
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

export function StartOverlay({ t, skin, onChangeSkin, onStart, onPlayOnline }) {
    return (
        <Overlay>
            <Text style={styles.bigEmoji}>🪱🍬</Text>
            <Text style={styles.title}>{t('ready')}</Text>
            <Text style={styles.cause}>{t('pickWorm')}</Text>
            <SkinPicker t={t} value={skin} onChange={onChangeSkin} />
            <Button label={t('startGame')} size="large" onPress={onStart} />
            <Button label={t('playOnline')} variant="ghost" onPress={onPlayOnline} />
        </Overlay>
    );
}

/**
 * Online: pick a name, then join. The address box only shows when the app has no game server of
 * its own (`server` is null when it does), for a server on your Wi-Fi such as ws://192.168.0.168:8787.
 */
export function JoinOverlay({ t, name, onChangeName, server, onChangeServer, onJoin, joining, status, onBack }) {
    return (
        <Overlay dim={0.6}>
            <Text style={styles.title}>{t('joinTitle')}</Text>
            <Text style={styles.cause}>{t('joinHint')}</Text>
            <View style={styles.form}>
                <TextInput
                    value={name}
                    onChangeText={onChangeName}
                    placeholder={t('yourName')}
                    placeholderTextColor="rgba(209, 250, 229, 0.4)"
                    maxLength={20}
                    autoComplete="nickname"
                    returnKeyType={server === null ? 'go' : 'next'}
                    onSubmitEditing={server === null ? onJoin : undefined}
                    style={styles.input}
                    accessibilityLabel={t('yourName')}
                />
                {server !== null && (
                    <TextInput
                        value={server}
                        onChangeText={onChangeServer}
                        placeholder="ws://192.168.0.10:8787"
                        placeholderTextColor="rgba(209, 250, 229, 0.4)"
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="url"
                        returnKeyType="go"
                        onSubmitEditing={onJoin}
                        style={styles.input}
                        accessibilityLabel={t('serverAddress')}
                    />
                )}
                <Button label={t('join')} onPress={onJoin} disabled={joining} />
                {status !== '' && (
                    <Text style={styles.status} accessibilityLiveRegion="polite">
                        {status}
                    </Text>
                )}
            </View>
            <Button label={t('back')} variant="ghost" size="small" onPress={onBack} />
        </Overlay>
    );
}

export function PauseOverlay({ t, onResume }) {
    return (
        <Overlay>
            <Text style={styles.title}>{t('paused')}</Text>
            <Button label={t('resume')} size="large" onPress={onResume} />
        </Overlay>
    );
}

export function GameOverOverlay({ t, result, name, onChangeName, onSave, saving, saveStatus, onPlayAgain }) {
    return (
        <Overlay dim={0.55}>
            <Text style={[styles.title, styles.gameOver]}>{t('gameOver')}</Text>
            <Text style={styles.cause}>{describePlayerCrash(t, result.cause)}</Text>
            <Text style={styles.score}>
                {t('score')} <Text style={styles.number}>{result.points}</Text>
                <Text style={styles.dot}> · </Text>
                {t('length')} <Text style={styles.number}>{result.length}</Text>
            </Text>
            {result.isNewBest && <Text style={styles.newBest}>{t('newBest')}</Text>}

            {result.points > 0 && (
                <View style={styles.form}>
                    <View style={styles.formRow}>
                        <TextInput
                            value={name}
                            onChangeText={onChangeName}
                            placeholder={t('yourName')}
                            placeholderTextColor="rgba(209, 250, 229, 0.4)"
                            maxLength={20}
                            autoComplete="nickname"
                            returnKeyType="send"
                            onSubmitEditing={onSave}
                            style={styles.input}
                            accessibilityLabel={t('yourName')}
                        />
                        <Button label={t('saveScore')} variant="gold" onPress={onSave} disabled={saving} />
                    </View>
                    {saveStatus !== '' && (
                        <Text style={styles.status} accessibilityLiveRegion="polite">
                            {saveStatus}
                        </Text>
                    )}
                </View>
            )}

            <Button label={t('playAgain')} size="large" onPress={onPlayAgain} />
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
