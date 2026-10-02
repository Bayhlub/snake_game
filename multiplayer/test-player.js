import { WebSocket } from 'ws';

import { MULTIPLAYER_PORT } from '../resources/js/snake/config.js';
import { createRemoteWorld, directionName } from '../resources/js/snake/net.js';

/**
 * A pretend friend for trying online play alone: joins as a player, heads for the nearest food,
 * and jumps back in after crashing. Run `npm run multiplayer:friend -- Noy` next to the server.
 */
const name = process.argv[2] ?? 'Friend';
const url = process.argv[3] ?? `ws://localhost:${MULTIPLAYER_PORT}`;
const world = createRemoteWorld();
const socket = new WebSocket(url);
let respawnQueued = false;

socket.on('open', () => socket.send(JSON.stringify({ type: 'join', name })));
socket.on('error', () => {
    console.error(`Could not reach the game server at ${url}. Start it with npm run multiplayer.`);
    process.exit(1);
});
socket.on('close', () => process.exit(0));

socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.type === 'welcome') {
        world.meId = message.id;
        console.log(`${name} joined ${url}`);
    }
    if (message.type !== 'state') {
        return;
    }

    world.update(message.state);
    const me = world.me();
    if (!me) {
        return;
    }
    if (!me.alive) {
        if (!respawnQueued) {
            respawnQueued = true;
            setTimeout(() => {
                respawnQueued = false;
                socket.send(JSON.stringify({ type: 'respawn' }));
            }, 1500);
        }
        return;
    }

    const head = me.body[0];
    const distance = (food) => Math.abs(food.x - head.x) + Math.abs(food.y - head.y);
    const food = world.foods.filter((f) => f.kind !== 'power').sort((a, b) => distance(a) - distance(b))[0];
    if (!food) {
        return;
    }
    const dx = Math.sign(food.x - head.x);
    const dy = Math.sign(food.y - head.y);
    const wanted = dx !== 0 && me.dir.x !== -dx ? { x: dx, y: 0 } : dy !== 0 && me.dir.y !== -dy ? { x: 0, y: dy } : null;
    if (wanted && (wanted.x !== me.dir.x || wanted.y !== me.dir.y)) {
        socket.send(JSON.stringify({ type: 'turn', dir: directionName(wanted) }));
    }
});
