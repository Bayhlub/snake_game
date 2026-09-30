/**
 * Talks to the Laravel app's leaderboard API (routes/api.php).
 * Set EXPO_PUBLIC_API_URL in mobile/.env.local to the site's address, e.g. https://snake.example.com
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '') ?? '';

export const hasServer = API_URL !== '';

export async function fetchLeaderboard() {
    const response = await fetch(`${API_URL}/api/scores`, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
        throw new Error(`Leaderboard request failed (${response.status})`);
    }
    return (await response.json()).leaderboard;
}

/**
 * Save a finished game. Resolves to { rank, leaderboard } or { error } with a message for the player.
 */
export async function saveScore({ name, points, length }) {
    let response;
    try {
        response = await fetch(`${API_URL}/api/scores`, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_name: name, points, length }),
        });
    } catch {
        return { error: 'Could not reach the server. Try again.' };
    }

    if (response.status === 429) {
        return { error: 'Too many saves. Wait a minute and try again.' };
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const firstError = data.errors ? Object.values(data.errors)[0][0] : null;
        return { error: firstError ?? 'Could not save your score.' };
    }
    return { rank: data.rank, leaderboard: data.leaderboard };
}
