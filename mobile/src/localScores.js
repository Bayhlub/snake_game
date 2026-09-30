import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The Top 10 kept on this phone, used when no online leaderboard is set up (EXPO_PUBLIC_API_URL).
 * Ranks work like the server's: higher points first, and a tie ranks below the earlier score.
 */
const STORAGE_KEY = 'snake.localScores';
const KEEP = 10;

export async function loadLocalScores() {
    try {
        const scores = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? '[]');
        return Array.isArray(scores) ? scores : [];
    } catch {
        return [];
    }
}

/**
 * Add a finished game and save the list. Resolves to { rank, leaderboard } like the server does;
 * rank can be above 10 when the score didn't make the list.
 */
export async function saveLocalScore({ name, points, length }) {
    const scores = await loadLocalScores();
    const rank = scores.filter((score) => score.points >= points).length + 1;
    const leaderboard = [...scores.slice(0, rank - 1), { player_name: name, points, length }, ...scores.slice(rank - 1)].slice(0, KEEP);

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(leaderboard)).catch(() => {});
    return { rank, leaderboard };
}
