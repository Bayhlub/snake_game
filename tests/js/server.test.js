import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { after, before, test } from 'node:test';

import { WebSocket } from 'ws';

import { START_LENGTH } from '../../resources/js/snake/config.js';
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
