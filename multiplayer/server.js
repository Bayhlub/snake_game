import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';

import { WebSocketServer } from 'ws';

import { DIRECTION_ANGLES, MAX_PLAYERS, MULTIPLAYER_PORT } from '../resources/js/snake/config.js';
import { packEvent, packWorld } from '../resources/js/snake/net.js';
import { SKINS, isSkin, skinById } from '../resources/js/snake/skins.js';
import { addPlayer, createWorld, removePlayer, respawnPlayer, step, tickDuration } from '../resources/js/snake/world.js';

/**
 * The online game: one shared board with the bots, which everyone who connects plays on.
 * It runs the same rules as solo play (resources/js/snake/world.js) and sends the whole
 * board to every player after each move. Start it with `npm run multiplayer`.
 */
const port = Number(process.env.PORT) || MULTIPLAYER_PORT;
const MAX_NAME_LENGTH = 20;

const world = createWorld(Math.random, { multiplayer: true });
/** socket => { snake, angle } for everyone who has joined; `angle` is where they last steered. */
const players = new Map();

const http = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    response.end(`Snake multiplayer server: ${players.size} playing\n`);
});
// Board updates go out 20 times a second; compressing them makes them several times smaller.
const sockets = new WebSocketServer({ server: http, perMessageDeflate: { threshold: 1024 } });

sockets.on('connection', (socket) => {
    socket.on('message', (raw) => {
        let message;
        try {
            message = JSON.parse(raw.toString());
        } catch {
            return;
        }
        handle(socket, message);
    });
    socket.on('close', () => {
        const player = players.get(socket);
        if (player) {
            removePlayer(world, player.snake.id);
            players.delete(socket);
            log(`${player.snake.name} left (${players.size} playing)`);
        }
    });
});

function handle(socket, message) {
    const player = players.get(socket);

    if (message.type === 'join' && !player) {
        if (players.size >= MAX_PLAYERS) {
            send(socket, { type: 'full' });
            return;
        }
        const name = String(message.name ?? '').trim().slice(0, MAX_NAME_LENGTH) || 'Player';
        const skin = skinById(isSkin(message.skin) ? message.skin : unusedSkin());
        const snake = addPlayer(world, { name, color: skin.color, skin: skin.id });
        players.set(socket, { snake, angle: null });
        send(socket, { type: 'welcome', id: snake.id });
        log(`${name} joined (${players.size} playing)`);
    } else if (message.type === 'steer' && player && Number.isFinite(message.angle)) {
        player.angle = message.angle;
    } else if (message.type === 'turn' && player && Object.hasOwn(DIRECTION_ANGLES, message.dir)) {
        // Apps from before worms could glide at any angle steer up, down, left or right.
        player.angle = DIRECTION_ANGLES[message.dir];
    } else if (message.type === 'respawn' && player && !player.snake.alive) {
        player.angle = null;
        respawnPlayer(world, player.snake);
    }
}

/** For a game that didn't pick a skin (an older app): the first one no player is wearing yet. */
function unusedSkin() {
    const used = new Set([...players.values()].map((player) => player.snake.skin));
    return (SKINS.find((skin) => !used.has(skin.id)) ?? SKINS[players.size % SKINS.length]).id;
}

function send(socket, message) {
    if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(message));
    }
}

/**
 * One step for everyone, steering each player where they last pointed, then the new board to
 * every player.
 */
function tick() {
    const duration = tickDuration(world);
    const turns = {};
    for (const player of players.values()) {
        if (player.angle !== null) {
            turns[player.snake.id] = player.angle;
        }
    }

    const events = players.size > 0 ? step(world, turns, duration) : [];
    if (players.size > 0) {
        const message = JSON.stringify({ type: 'state', state: packWorld(world, tickDuration(world)), events: events.map(packEvent) });
        for (const socket of players.keys()) {
            if (socket.readyState === socket.OPEN) {
                socket.send(message);
            }
        }
    }
    setTimeout(tick, duration);
}

function log(text) {
    console.log(`[${new Date().toLocaleTimeString()}] ${text}`);
}

http.listen(port, '0.0.0.0', () => {
    const addresses = Object.values(networkInterfaces())
        .flat()
        .filter((address) => address?.family === 'IPv4' && !address.internal)
        .map((address) => `ws://${address.address}:${port}`);
    log(`Snake multiplayer server is running.`);
    log(`On this computer: ws://localhost:${port}`);
    for (const address of addresses) {
        log(`On your Wi-Fi:    ${address}`);
    }
    tick();
});
