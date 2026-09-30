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
 * Save a finished game. Resolves to { rank, leaderboard }, or { error } holding a translation key.
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
        return { error: 'noServer' };
    }

    if (response.status === 429) {
        return { error: 'tooManySaves' };
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        return { error: data.errors?.player_name ? 'nameInvalid' : 'saveFailed' };
    }
    return { rank: data.rank, leaderboard: data.leaderboard };
}
