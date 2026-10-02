import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { PGlite } from '@electric-sql/pglite';

import { handleScores } from '../api/scores.js';
import { createScoreStore, validateScore } from '../lib/scores.js';

// The same cases as the Laravel app's tests/Feature/ScoreTest.php, against a real (in-memory) Postgres.
let db;
let store;

beforeEach(async () => {
    db = new PGlite();
    store = createScoreStore(async (text, params) => (await db.query(text, params)).rows);
    await store.ready();
});

/** Call the API like Vercel would and return { status, body, headers }. */
async function call(method, body, ip = '203.0.113.7') {
    const result = { status: 200, headers: {}, body: undefined };
    const response = {
        setHeader: (name, value) => {
            result.headers[name.toLowerCase()] = value;
        },
        status(code) {
            result.status = code;
            return response;
        },
        json(data) {
            result.body = data;
            return response;
        },
        end() {
            return response;
        },
    };
    await handleScores(store, { method, body, headers: { 'x-forwarded-for': ip } }, response);
    return result;
}

const seed = (rows) => Promise.all(rows.map(([name, points]) => db.query('INSERT INTO scores (player_name, points, length) VALUES ($1, $2, 5)', [name, points])));

describe('Top 10 API', () => {
    test('a score is saved and its rank returned', async () => {
        await seed([['A', 50], ['B', 10]]);

        const saved = await call('POST', { player_name: '  Bai  ', points: 30, length: 18 });

        assert.equal(saved.status, 201);
        assert.equal(saved.body.rank, 2);
        assert.equal(saved.body.leaderboard[1].player_name, 'Bai');
        assert.deepEqual(saved.body.leaderboard[1], { player_name: 'Bai', points: 30, length: 18 });
    });

    test('a tied score ranks below the earlier one', async () => {
        await seed([['Early', 30]]);
        assert.equal((await call('POST', { player_name: 'Late', points: 30, length: 10 })).body.rank, 2);
    });

    test('the leaderboard lists the top ten, best first', async () => {
        await seed(Array.from({ length: 12 }, (_, i) => [`P${i}`, i * 5]));

        const { status, body } = await call('GET');

        assert.equal(status, 200);
        assert.deepEqual(
            body.leaderboard.map((score) => score.points),
            [55, 50, 45, 40, 35, 30, 25, 20, 15, 10],
        );
    });

    for (const [label, overrides, field] of [
        ['blank name', { player_name: '   ' }, 'player_name'],
        ['name too long', { player_name: 'a'.repeat(21) }, 'player_name'],
        ['negative points', { points: -1 }, 'points'],
        ['impossible points', { points: 100001 }, 'points'],
        ['zero length', { length: 0 }, 'length'],
        ['points that are not a whole number', { points: 2.5 }, 'points'],
    ]) {
        test(`invalid scores are rejected: ${label}`, async () => {
            const { status, body } = await call('POST', { player_name: 'Bai', points: 10, length: 8, ...overrides });

            assert.equal(status, 422);
            assert.ok(body.errors[field], `expected an error for ${field}`);
            assert.equal((await db.query('SELECT count(*)::int AS n FROM scores')).rows[0].n, 0);
        });
    }

    test('saving is limited to 10 a minute from one address', async () => {
        for (let i = 0; i < 10; i++) {
            assert.equal((await call('POST', { player_name: 'Bai', points: i, length: 5 })).status, 201);
        }

        const blocked = await call('POST', { player_name: 'Bai', points: 99, length: 5 });
        assert.equal(blocked.status, 429);

        const someoneElse = await call('POST', { player_name: 'Noy', points: 99, length: 5 }, '198.51.100.4');
        assert.equal(someoneElse.status, 201);
    });

    test('the phone app and other sites may call it (CORS), and other methods are refused', async () => {
        const preflight = await call('OPTIONS');
        assert.equal(preflight.status, 204);
        assert.equal(preflight.headers['access-control-allow-origin'], '*');
        assert.equal((await call('DELETE')).status, 405);
    });

    test('without a database it says so instead of crashing', async () => {
        const result = { status: 0, body: null };
        const response = { setHeader() {}, status: (code) => ((result.status = code), response), json: (data) => ((result.body = data), response), end: () => response };
        await handleScores(null, { method: 'GET', headers: {} }, response);
        assert.equal(result.status, 500);
        assert.match(result.body.message, /DATABASE_URL/);
    });
});

describe('score rules', () => {
    test('names are trimmed and numbers may arrive as text', () => {
        assert.deepEqual(validateScore({ player_name: ' Bai ', points: '12', length: '5' }).data, { player_name: 'Bai', points: 12, length: 5 });
    });

    test('a missing body is a validation error, not a crash', () => {
        assert.deepEqual(Object.keys(validateScore(null).errors).sort(), ['length', 'player_name', 'points']);
    });
});
