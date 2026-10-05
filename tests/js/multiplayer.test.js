import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BOTS, SPAWN_GRACE_MS } from '../../resources/js/snake/config.js';
import { addPlayer, createWorld, isEffectActive, placeSnake, removePlayer, respawnPlayer, step } from '../../resources/js/snake/world.js';

const RIGHT = 0;
const LEFT = Math.PI;
const UP = -Math.PI / 2;
const DOWN = Math.PI / 2;

function seeded(seed = 5) {
    let value = seed;
    return () => {
        value = (value * 16807) % 2147483647;
        return (value - 1) / 2147483646;
    };
}

/** An online world with just the given players (no bots), each placed where the test says. */
function onlineWorld(...players) {
    const world = createWorld(seeded(), { multiplayer: true });
    world.snakes = [];
    world.foods = [];
    world.nextFruitAt = Infinity;
    world.nextPowerUpAt = Infinity;
    world.foodCount = 0;
    return {
        world,
        players: players.map(({ x, y, angle = RIGHT, name }) => {
            const snake = addPlayer(world, { name, color: '#ffffff' });
            placeSnake(snake, { x, y }, angle, 4);
            delete snake.effects.grace; // These tests place players on purpose; skip the newcomer protection.
            return snake;
        }),
    };
}

test('an online world starts with only bots, and players join with their own ids', () => {
    const world = createWorld(seeded(), { multiplayer: true });
    assert.equal(world.snakes.filter((snake) => snake.isPlayer).length, 0);
    assert.equal(world.snakes.length, BOTS.length);

    const bai = addPlayer(world, { name: 'Bai', color: '#4ade80' });
    const noy = addPlayer(world, { name: 'Noy', color: '#22d3ee' });

    assert.ok(bai.alive && noy.alive);
    assert.notEqual(bai.id, noy.id);
    assert.equal(new Set(world.snakes.map((snake) => snake.id)).size, world.snakes.length);
});

test('each player steers separately and scores their own points', () => {
    const { world, players: [bai, noy] } = onlineWorld({ x: 10, y: 10, name: 'Bai' }, { x: 10, y: 25, name: 'Noy' });
    world.foods.push({ kind: 'food', x: 10.6, y: 10, points: 1, grow: 1 });

    for (let i = 0; i < 10; i++) {
        step(world, { [bai.id]: UP, [noy.id]: DOWN }, 100);
    }

    assert.ok(bai.body[0].y < 9, 'Bai went up');
    assert.ok(noy.body[0].y > 26, 'Noy went down');
    assert.equal(bai.points, 1);
    assert.equal(noy.points, 0);
});

test('a crashed player turns into food and waits, while the game goes on for everyone else', () => {
    const { world, players: [bai, noy] } = onlineWorld({ x: fieldWidth() - 0.7, y: 10, name: 'Bai' }, { x: 10, y: 20, name: 'Noy' });

    const events = step(world, {}, 100);

    assert.ok(events.some((event) => event.type === 'playerDied' && event.snake === bai));
    assert.equal(bai.alive, false);
    assert.equal(bai.deathCause.type, 'wall');
    assert.equal(world.over, false);
    assert.ok(world.foods.some((food) => food.kind === 'drop'));
    assert.ok(noy.alive);

    bai.points = 7;
    respawnPlayer(world, bai);
    assert.ok(bai.alive);
    assert.equal(bai.points, 0);
    assert.equal(bai.deathCause, null);
});

test('power-ups belong to the player who picked them up', () => {
    const { world, players: [bai, noy] } = onlineWorld({ x: 10, y: 10, name: 'Bai' }, { x: 10, y: 20, name: 'Noy' });
    world.foods.push({ kind: 'power', x: 11, y: 10, powerUp: { type: 'shield', durationMs: 5000 }, points: 0, grow: 0, expiresAt: 99999 });

    step(world, {}, 100);

    assert.ok(isEffectActive(world, 'shield', bai));
    assert.equal(isEffectActive(world, 'shield', noy), false);
});

test('two players colliding head-on both crash', () => {
    const { world, players: [bai, noy] } = onlineWorld({ x: 10, y: 10, name: 'Bai' }, { x: 11.2, y: 10, angle: LEFT, name: 'Noy' });

    step(world, {}, 100);

    assert.equal(bai.alive, false);
    assert.equal(noy.alive, false);
    assert.equal(bai.deathCause.type, 'headOn');
    assert.equal(bai.deathCause.other, noy);
});

test('a player who just joined or came back cannot crash into snakes for a moment', () => {
    const { world, players: [bai, noy] } = onlineWorld({ x: 10, y: 10, name: 'Bai' }, { x: 11.2, y: 10, angle: LEFT, name: 'Noy' });
    bai.effects.grace = world.time + SPAWN_GRACE_MS;

    step(world, {}, 100);
    assert.ok(bai.alive, 'protected player survives the head-on crash');
    assert.ok(noy.alive, 'and the other player passes through too');

    const fresh = addPlayer(world, { name: 'Lin', color: '#ffffff' });
    assert.ok(isEffectActive(world, 'grace', fresh));
    world.time += SPAWN_GRACE_MS;
    assert.equal(isEffectActive(world, 'grace', fresh), false);

    fresh.alive = false;
    respawnPlayer(world, fresh);
    assert.ok(isEffectActive(world, 'grace', fresh));
});

test('a player who leaves frees their id for the next one', () => {
    const world = createWorld(seeded(), { multiplayer: true });
    const bai = addPlayer(world, { name: 'Bai', color: '#4ade80' });
    const freed = bai.id;

    removePlayer(world, bai.id);
    assert.equal(world.snakes.includes(bai), false);
    assert.equal(addPlayer(world, { name: 'Noy', color: '#22d3ee' }).id, freed);
});

function fieldWidth() {
    return createWorld(seeded(), { multiplayer: true }).cols;
}
