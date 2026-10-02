/**
 * The Top 10, matching the Laravel app (app/Http/Requests/StoreScoreRequest.php, app/Models/Score.php):
 * the same rules for a score, the same ranking (higher points first, a tie ranks below the earlier
 * score), and the same limit of 10 saves a minute from one address.
 *
 * `query(text, params)` runs SQL and resolves to the rows, so this works with Neon on Vercel
 * and with an in-memory Postgres in the tests.
 */
export const LEADERBOARD_SIZE = 10;
export const MAX_SAVES_PER_MINUTE = 10;
const RULES = {
    player_name: { max: 20 },
    points: { min: 0, max: 100000 },
    length: { min: 1, max: 5000 },
};

/**
 * Check a score sent by the game. Returns { data } with the cleaned-up values, or { errors } keyed
 * by field (in Laravel's shape, so the game shows the same messages).
 */
export function validateScore(body) {
    const input = body && typeof body === 'object' ? body : {};
    const errors = {};
    const name = typeof input.player_name === 'string' ? input.player_name.trim() : '';

    if (name === '') {
        errors.player_name = ['The player name field is required.'];
    } else if ([...name].length > RULES.player_name.max) {
        errors.player_name = [`The player name field must not be greater than ${RULES.player_name.max} characters.`];
    }

    const numbers = {};
    for (const field of ['points', 'length']) {
        const label = field === 'points' ? 'points' : 'length';
        const value = input[field];
        const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
        const { min, max } = RULES[field];
        if (value === undefined || value === null || value === '') {
            errors[field] = [`The ${label} field is required.`];
        } else if (typeof number !== 'number' || !Number.isInteger(number)) {
            errors[field] = [`The ${label} field must be an integer.`];
        } else if (number < min) {
            errors[field] = [`The ${label} field must be at least ${min}.`];
        } else if (number > max) {
            errors[field] = [`The ${label} field must not be greater than ${max}.`];
        } else {
            numbers[field] = number;
        }
    }

    if (Object.keys(errors).length > 0) {
        return { errors };
    }
    return { data: { player_name: name, points: numbers.points, length: numbers.length } };
}

export function createScoreStore(query) {
    let ready = null;

    return {
        /** Create the table the first time it's needed (safe to run again). */
        ready() {
            ready ??= (async () => {
                await query(`
                    CREATE TABLE IF NOT EXISTS scores (
                        id BIGSERIAL PRIMARY KEY,
                        player_name VARCHAR(20) NOT NULL,
                        points INTEGER NOT NULL CHECK (points >= 0),
                        length INTEGER NOT NULL CHECK (length >= 1),
                        ip_hash CHAR(64),
                        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                    )`);
                await query('CREATE INDEX IF NOT EXISTS scores_leaderboard_index ON scores (points DESC, id ASC)');
                await query('CREATE INDEX IF NOT EXISTS scores_recent_saves_index ON scores (ip_hash, created_at)');
            })().catch((error) => {
                ready = null;
                throw error;
            });
            return ready;
        },

        async leaderboard() {
            const rows = await query('SELECT player_name, points, length FROM scores ORDER BY points DESC, id ASC LIMIT $1', [
                LEADERBOARD_SIZE,
            ]);
            return rows.map((row) => ({ player_name: row.player_name, points: Number(row.points), length: Number(row.length) }));
        },

        /** How many scores this address saved in the last minute. */
        async recentSaves(ipHash) {
            const [row] = await query("SELECT count(*) AS saves FROM scores WHERE ip_hash = $1 AND created_at > now() - interval '1 minute'", [
                ipHash,
            ]);
            return Number(row.saves);
        },

        /** Save a score and return its rank among all scores. */
        async save({ player_name, points, length }, ipHash) {
            const [saved] = await query('INSERT INTO scores (player_name, points, length, ip_hash) VALUES ($1, $2, $3, $4) RETURNING id', [
                player_name,
                points,
                length,
                ipHash,
            ]);
            const [above] = await query('SELECT count(*) AS above FROM scores WHERE points > $1 OR (points = $1 AND id < $2)', [
                points,
                saved.id,
            ]);
            return Number(above.above) + 1;
        },
    };
}
