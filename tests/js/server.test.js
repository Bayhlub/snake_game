import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { after, before, test } from 'node:test';

import { WebSocket } from 'ws';

import { createRemoteWorld } from '../../resources/js/snake/net.js';

const PORT = 18787;
let server;

before(async () => {
    server = spawn(process.execPath, ['multiplayer/server.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise((resolve) => server.stdout.on('data', (chunk) => chunk.toString().includes('running') && resolve()));
});

after(() => server.kill());

/** Connect, join as `name`, and collect what the server sends. */
async function join(name) {
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
    socket.send(JSON.stringify({ type: 'join', name }));
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
    assert.ok(me && me.alive && me.body.length === 4);
    assert.ok(me.previousBody, 'snakes keep their previous position so they can glide');

    const heading = me.dir;
    const turn = heading.x === 0 ? 'left' : 'up';
    bai.socket.send(JSON.stringify({ type: 'turn', dir: turn }));
    await until(() => bai.world.me().dir.x !== heading.x || bai.world.me().dir.y !== heading.y);

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
