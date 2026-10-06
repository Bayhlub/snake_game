import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { after, before, test } from 'node:test';

import { WebSocket } from 'ws';

import { COLS, ROWS, START_LENGTH } from '../../resources/js/snake/config.js';
import { createRemoteWorld, packEvent } from '../../resources/js/snake/net.js';

const PORT = 18787;
let server;

before(async () => {
    server = spawn(process.execPath, ['multiplayer/server.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise((resolve) => server.stdout.on('data', (chunk) => chunk.toString().includes('running') && resolve()));
});

after(() => server.kill());

/** Connect, join as `name` (wearing `skin`, if given), and collect what the server sends. */
async function join(name, skin) {
    const socket = new WebSocket(`ws://localhost:${PORT}`);
    const client = { socket, messages: [], world: createRemoteWorld() };
    socket.on('message', (raw) => {
        const message = JSON.parse(raw.toString());
        client.messages.push(message);
        if (message.type === 'welcome') {
            client.world.meId = message.id;
        } else if (message.type === 'state') {
            client.world.update(message.state);
        }
    });
    await new Promise((resolve) => socket.on('open', resolve));
    socket.send(JSON.stringify({ type: 'join', name, ...(skin ? { skin } : {}) }));
    return client;
}

const until = async (check, ms = 3000) => {
    const start = Date.now();
    while (!check()) {
        if (Date.now() - start > ms) {
            throw new Error('timed out');
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
};

test('two players join the same board and each sees both snakes move', async () => {
    const bai = await join('Bai');
    const noy = await join('Noy');

    await until(() => bai.world.meId !== null && noy.world.meId !== null);
    assert.notEqual(bai.world.meId, noy.world.meId);

    const bothOnBoard = (client) => ['Bai', 'Noy'].every((name) => client.world.snakes.some((snake) => snake.isPlayer && snake.name === name));
    await until(() => bothOnBoard(bai) && bothOnBoard(noy));
    // The online arena stands upright, like solo play on a phone held upright.
    assert.deepEqual([bai.world.cols, bai.world.rows], [ROWS, COLS]);

    const before = bai.world.time;
    await until(() => bai.world.time > before + 400);
    const me = bai.world.me();
    assert.ok(me && me.alive && me.body.length === START_LENGTH);
    assert.ok(me.previousBody, 'snakes keep their previous position so they can glide');

    // Steer the opposite way: the worm turns around, a little each move.
    const heading = me.angle;
    bai.socket.send(JSON.stringify({ type: 'steer', angle: heading + Math.PI }));
    await until(() => Math.abs(Math.atan2(Math.sin(bai.world.me().angle - heading), Math.cos(bai.world.me().angle - heading))) > 2);

    noy.socket.close();
    await until(() => !bai.world.snakes.some((snake) => snake.name === 'Noy'));
    bai.socket.close();
});

test('names are trimmed and shortened', async () => {
    const long = await join('   A name that is much too long for the tag   ');
    await until(() => long.world.me());
    assert.equal(long.world.me().name, 'A name that is much ');
    long.socket.close();
});

test('players wear the skin they picked, and an app that picks none gets one nobody wears', async () => {
    const lin = await join('Lin', 'galaxy');
    const old = await join('Old app');
    const sneaky = await join('Sneaky', 'not-a-skin');
    await until(() => lin.world.me() && old.world.me() && sneaky.world.me());

    assert.equal(lin.world.me().skin, 'galaxy');
    assert.equal(lin.world.me().color, '#7c3aed');
    assert.ok(old.world.me().skin && old.world.me().skin !== 'galaxy');
    assert.ok(!['galaxy', old.world.me().skin].includes(sneaky.world.me().skin));
    for (const client of [lin, old, sneaky]) {
        client.socket.close();
    }
});

test('a power-up someone picks up arrives with its look, so devices can draw it being eaten', () => {
    const shield = { type: 'shield', emoji: '🛡️', color: '#38bdf8', durationMs: 12000 };
    const packed = packEvent({ type: 'powerUp', snake: { id: 3 }, food: { kind: 'power', x: 4, y: 5, points: 0, powerUp: shield }, powerUp: shield, at: { x: 4, y: 5 } });
    const event = createRemoteWorld().unpackEvent(JSON.parse(JSON.stringify(packed)));

    assert.equal(event.food.kind, 'power');
    assert.equal(event.food.powerUp.type, 'shield');
    assert.equal(event.food.powerUp.color, '#38bdf8');
});

test('online worms glide on from where they are drawn, even when updates arrive early', () => {
    const world = createRemoteWorld();
    const state = (x) => ({ time: 0, tickMs: 50, cols: 40, rows: 56, foods: [], snakes: [{ id: 1, name: 'Bai', color: '#4ade80', isPlayer: true, alive: true, angle: 0, body: [x, 10, x - 1, 10] }] });

    world.update(state(10), 0);
    world.update(state(11), 50);
    assert.equal(world.progress(50), 0);
    assert.ok(world.progress(75) > 0.3 && world.progress(75) < 0.7, 'halfway through the glide');
    assert.ok(world.progress(85) > 0.6, 'and further on');
    assert.ok(world.progress(110) > 1 && world.progress(1000) <= 1.6, 'a late update: the worms keep gliding on, but not forever');

    // The next update comes early, a quarter of the way into the glide: the worm carries on from
    // where it is drawn instead of jumping.
    world.update(state(12), 62.5);
    const snake = world.snakes[0];
    assert.ok(snake.previousBody[0].x > 10 && snake.previousBody[0].x < 11, 'it starts from partway along');
    assert.equal(snake.body[0].x, 12);
});

test('online food stays the same piece from one update to the next, so it is not redrawn popping in', () => {
    const world = createRemoteWorld();
    const state = (foods) => ({ time: 0, tickMs: 50, cols: 40, rows: 56, snakes: [], foods });
    const donut = { kind: 'fruit', x: 5, y: 6, emoji: '🍩', points: 5, expiresAt: 9000 };

    world.update(state([donut, { kind: 'food', x: 9, y: 9, points: 1 }]), 0);
    const [first] = world.foods;
    world.update(state([donut, { kind: 'food', x: 8.5, y: 9, from: { x: 9, y: 9 }, points: 1 }]), 50);

    assert.equal(world.foods[0], first, 'the donut is the same piece');
    assert.equal(world.foods[0].emoji, '🍩');
    assert.equal(world.foods[1].x, 8.5, 'food pulled by a magnet moves');
    world.update(state([donut]), 100);
    assert.equal(world.foods.length, 1, 'eaten food goes away');
    assert.equal(world.foods[0], first);
});
