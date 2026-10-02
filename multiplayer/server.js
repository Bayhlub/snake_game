import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';

import { WebSocketServer } from 'ws';

import { DIRECTIONS, MAX_PLAYERS, MULTIPLAYER_PORT, PLAYER_COLORS } from '../resources/js/snake/config.js';
import { packEvent, packWorld } from '../resources/js/snake/net.js';
import { addPlayer, createWorld, isReverse, removePlayer, respawnPlayer, step, tickDuration } from '../resources/js/snake/world.js';

/**
 * The online game: one shared board with the bots, which everyone who connects plays on.
 * It runs the same rules as solo play (resources/js/snake/world.js) and sends the whole
 * board to every player after each move. Start it with `npm run multiplayer`.
 */
const port = Number(process.env.PORT) || MULTIPLAYER_PORT;
const MAX_QUEUED_TURNS = 2;
const MAX_NAME_LENGTH = 20;

const world = createWorld(Math.random, { multiplayer: true });
/** socket => { snake, turns } for everyone who has joined. */
const players = new Map();

const http = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    response.end(`Snake multiplayer server: ${players.size} playing\n`);
});
const sockets = new WebSocketServer({ server: http });

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
        const snake = addPlayer(world, { name, color: nextColor() });
        players.set(socket, { snake, turns: [] });
        send(socket, { type: 'welcome', id: snake.id });
        log(`${name} joined (${players.size} playing)`);
    } else if (message.type === 'turn' && player && DIRECTIONS[message.dir]) {
        const direction = DIRECTIONS[message.dir];
        const previous = player.turns.at(-1) ?? player.snake.dir;
        if (direction !== previous && !isReverse(direction, previous) && player.turns.length < MAX_QUEUED_TURNS) {
            player.turns.push(direction);
        }
    } else if (message.type === 'respawn' && player && !player.snake.alive) {
        player.turns = [];
        respawnPlayer(world, player.snake);
    }
}

/** The first player color nobody is using yet. */
function nextColor() {
    const used = new Set([...players.values()].map((player) => player.snake.color));
    return PLAYER_COLORS.find((color) => !used.has(color)) ?? PLAYER_COLORS[players.size % PLAYER_COLORS.length];
}

function send(socket, message) {
    if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(message));
    }
}

/**
 * One move for everyone, then the new board to every player. The next move is scheduled
 * after this one's duration, which slow-mo can stretch.
 */
function tick() {
    const duration = tickDuration(world);
    const turns = {};
    for (const player of players.values()) {
        const turn = player.turns.shift();
        if (turn) {
            turns[player.snake.id] = turn;
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
