import { createHash } from 'node:crypto';

import { neon } from '@neondatabase/serverless';

import { MAX_SAVES_PER_MINUTE, createScoreStore, validateScore } from '../lib/scores.js';

/**
 * GET  /api/scores → { leaderboard }
 * POST /api/scores { player_name, points, length } → 201 { rank, leaderboard }, 422 { errors }, or 429
 *
 * The same API as the Laravel app's /api/scores, so the web game and the phone app work with either.
 * The database is Neon Postgres: Vercel's Neon integration sets DATABASE_URL.
 */
let store = null;

function scores() {
    const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
    if (!url) {
        return null;
    }
    if (!store) {
        const sql = neon(url);
        store = createScoreStore((text, params) => sql.query(text, params));
    }
    return store;
}

/** Saves are limited per address; only a hash of it is stored. */
function addressHash(request) {
    const forwarded = String(request.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    const address = forwarded || request.socket?.remoteAddress || 'unknown';
    return createHash('sha256').update(`snake-scores:${address}`).digest('hex');
}

function readBody(request) {
    if (typeof request.body === 'string') {
        try {
            return JSON.parse(request.body);
        } catch {
            return null;
        }
    }
    return request.body ?? null;
}

export default function handler(request, response) {
    return handleScores(scores(), request, response);
}

/**
 * The request handling, given a score store (Neon in production, an in-memory Postgres in tests).
 */
export async function handleScores(store, request, response) {
    // The phone app and any other site may call this API.
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    response.setHeader('Cache-Control', 'no-store');

    if (request.method === 'OPTIONS') {
        return response.status(204).end();
    }
    if (request.method !== 'GET' && request.method !== 'POST') {
        response.setHeader('Allow', 'GET, POST, OPTIONS');
        return response.status(405).json({ message: 'Method not allowed.' });
    }

    if (!store) {
        return response.status(500).json({ message: 'The database is not set up (DATABASE_URL is missing).' });
    }

    try {
        await store.ready();

        if (request.method === 'GET') {
            return response.status(200).json({ leaderboard: await store.leaderboard() });
        }

        const { data, errors } = validateScore(readBody(request));
        if (errors) {
            return response.status(422).json({ message: Object.values(errors)[0][0], errors });
        }

        const ipHash = addressHash(request);
        if ((await store.recentSaves(ipHash)) >= MAX_SAVES_PER_MINUTE) {
            response.setHeader('Retry-After', '60');
            return response.status(429).json({ message: 'Too many saves. Wait a minute and try again.' });
        }

        const rank = await store.save(data, ipHash);
        return response.status(201).json({ rank, leaderboard: await store.leaderboard() });
    } catch (error) {
        console.error(error);
        return response.status(500).json({ message: 'Something went wrong saving or loading scores.' });
    }
}
