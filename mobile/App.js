import { Fredoka_400Regular, Fredoka_500Medium, Fredoka_600SemiBold, Fredoka_700Bold, useFonts } from '@expo-google-fonts/fredoka';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchLeaderboard, hasServer, saveScore } from './src/api';
import { Board } from './src/components/Board';
import { DirectionPad, Hud } from './src/components/Controls';
import { Leaderboard } from './src/components/Leaderboard';
import { GameOverOverlay, PauseOverlay, StartOverlay } from './src/components/Overlays';
import { Button } from './src/components/Ui';
import { createGame } from './src/game/controller';
import { COLS, ROWS } from './src/game/shared';
import { createSound } from './src/game/sound';
import { colors, fonts } from './src/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const STORAGE_KEYS = { best: 'snake.best', muted: 'snake.muted', name: 'snake.name' };

export default function App() {
    const [fontsLoaded] = useFonts({ Fredoka_400Regular, Fredoka_500Medium, Fredoka_600SemiBold, Fredoka_700Bold });
    const [saved, setSaved] = useState(null);

    useEffect(() => {
        AsyncStorage.multiGet(Object.values(STORAGE_KEYS))
            .then((pairs) => Object.fromEntries(pairs))
            .catch(() => ({}))
            .then((values) =>
                setSaved({
                    best: Number(values[STORAGE_KEYS.best]) || 0,
                    muted: values[STORAGE_KEYS.muted] === '1',
                    name: values[STORAGE_KEYS.name] ?? '',
                }),
            );
    }, []);

    const ready = fontsLoaded && saved !== null;
    useEffect(() => {
        if (ready) {
            SplashScreen.hideAsync().catch(() => {});
        }
    }, [ready]);

    return (
        <SafeAreaProvider>
            <StatusBar style="light" />
            <View style={styles.screen}>{ready && <GameScreen saved={saved} />}</View>
        </SafeAreaProvider>
    );
}

function GameScreen({ saved }) {
    const insets = useSafeAreaInsets();
    const { width, height } = useWindowDimensions();
    const [hud, setHud] = useState(null);
    const [message, setMessage] = useState('');
    const [muted, setMuted] = useState(saved.muted);
    const [name, setName] = useState(saved.name);
    const [saveStatus, setSaveStatus] = useState('');
    const [saving, setSaving] = useState(false);
    const [scores, setScores] = useState([]);
    const [boardState, setBoardState] = useState(hasServer ? 'loading' : 'offline');
    const messageTimer = useRef(null);
    const gameRef = useRef(null);
    const soundRef = useRef(null);

    if (!gameRef.current) {
        soundRef.current = createSound(saved.muted);
        gameRef.current = createGame({
            sound: soundRef.current,
            best: saved.best,
            onChange: setHud,
            onMessage: (text) => {
                setMessage(text);
                clearTimeout(messageTimer.current);
                messageTimer.current = setTimeout(() => setMessage(''), 1500);
            },
            onNewBest: (best) => AsyncStorage.setItem(STORAGE_KEYS.best, String(best)).catch(() => {}),
        });
    }
    const game = gameRef.current;
    const state = hud ?? game.snapshot();

    const loadLeaderboard = useCallback(() => {
        if (!hasServer) {
            return;
        }
        setBoardState('loading');
        fetchLeaderboard()
            .then((leaderboard) => {
                setScores(leaderboard);
                setBoardState('ready');
            })
            .catch(() => setBoardState('error'));
    }, []);

    useEffect(() => {
        loadLeaderboard();
        const subscription = AppState.addEventListener('change', (next) => {
            if (next !== 'active') {
                game.pause();
            }
        });
        return () => {
            subscription.remove();
            clearTimeout(messageTimer.current);
            soundRef.current.release();
        };
    }, [game, loadLeaderboard]);

    const start = () => {
        setSaveStatus('');
        setSaving(false);
        game.start();
    };

    const toggleSound = () => {
        const nowMuted = soundRef.current.toggle();
        setMuted(nowMuted);
        AsyncStorage.setItem(STORAGE_KEYS.muted, nowMuted ? '1' : '0').catch(() => {});
    };

    const submitScore = async () => {
        const trimmed = name.trim();
        if (!trimmed) {
            setSaveStatus('Please type your name first.');
            return;
        }
        AsyncStorage.setItem(STORAGE_KEYS.name, trimmed).catch(() => {});
        setSaving(true);
        setSaveStatus('Saving…');
        const response = await saveScore({ name: trimmed, points: state.result.points, length: state.result.length });
        if (response.error) {
            setSaveStatus(response.error);
            setSaving(false);
            return;
        }
        setSaveStatus(`Saved! You are #${response.rank} on the leaderboard.`);
        setScores(response.leaderboard);
        setBoardState('ready');
    };

    const isLandscape = width > height;
    const gutter = 16;
    const boardWidth = isLandscape
        ? Math.min(width * 0.62, ((height - insets.top - insets.bottom - 96) * COLS) / ROWS)
        : width - insets.left - insets.right - gutter * 2;

    const board = (
        <View>
            <Board game={game} width={boardWidth}>
                {state.status === 'ready' && <StartOverlay onStart={start} />}
                {state.status === 'paused' && <PauseOverlay onResume={game.resume} />}
                {state.status === 'over' && (
                    <GameOverOverlay
                        result={state.result}
                        canSave={hasServer}
                        name={name}
                        onChangeName={setName}
                        onSave={submitScore}
                        saving={saving}
                        saveStatus={saveStatus}
                        onPlayAgain={start}
                    />
                )}
                {message !== '' && (
                    <View style={styles.messageWrap}>
                        <Text style={styles.message} accessibilityLiveRegion="polite">
                            {message}
                        </Text>
                    </View>
                )}
            </Board>
        </View>
    );

    const header = (
        <View style={styles.header}>
            <View style={styles.titleRow}>
                <Text style={styles.titleEmoji}>🐍</Text>
                <Text style={styles.title}>Snake</Text>
            </View>
            <View style={styles.headerButtons}>
                {state.status === 'playing' && <Button label="⏸ Pause" variant="ghost" size="small" onPress={game.pause} />}
                <Button label={muted ? '🔇 Sound off' : '🔊 Sound on'} variant="ghost" size="small" onPress={toggleSound} />
            </View>
        </View>
    );

    const hint = <Text style={styles.hint}>👆 Touch and drag on the board. The snake follows your finger. Or use the buttons.</Text>;
    const hudRow = <Hud points={state.points} length={state.length} best={state.best} bots={state.bots} />;
    const leaderboard = <Leaderboard scores={scores} state={boardState} onRetry={loadLeaderboard} />;
    const padding = {
        paddingTop: insets.top + 8,
        paddingBottom: insets.bottom + 8,
        paddingLeft: insets.left + gutter,
        paddingRight: insets.right + gutter,
    };

    return (
        <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {isLandscape ? (
                <View style={[styles.landscape, padding]}>
                    <View style={[styles.column, { width: boardWidth }]}>
                        {hudRow}
                        {board}
                    </View>
                    <ScrollView style={styles.side} contentContainerStyle={styles.column} keyboardShouldPersistTaps="handled">
                        {header}
                        <DirectionPad onTurn={game.queueTurn} size={48} />
                        {leaderboard}
                    </ScrollView>
                </View>
            ) : (
                <View style={[styles.portrait, padding]}>
                    {header}
                    {hudRow}
                    {board}
                    <DirectionPad onTurn={game.queueTurn} />
                    <ScrollView style={styles.side} contentContainerStyle={styles.column} keyboardShouldPersistTaps="handled">
                        {hint}
                        {leaderboard}
                    </ScrollView>
                </View>
            )}
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.night },
    portrait: { flex: 1, gap: 12 },
    landscape: { flex: 1, flexDirection: 'row', gap: 16 },
    column: { gap: 12 },
    side: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    titleEmoji: { fontSize: 28 },
    title: { fontFamily: fonts.bold, fontSize: 34, color: colors.mint },
    headerButtons: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6, flexShrink: 1 },
    hint: { fontFamily: fonts.regular, fontSize: 13, color: colors.faint, textAlign: 'center' },
    messageWrap: { position: 'absolute', top: 10, left: 0, right: 0, alignItems: 'center', pointerEvents: 'none' },
    message: {
        overflow: 'hidden',
        borderRadius: 999,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        paddingHorizontal: 14,
        paddingVertical: 4,
        fontFamily: fonts.semibold,
        fontSize: 13,
        color: colors.text,
    },
});
