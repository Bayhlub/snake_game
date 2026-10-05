import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { COLS, POWER_UPS, SLOW_MO_FACTOR } from '../../resources/js/snake/config.js';
import { activePowerUps, createWorld, getPlayer, isEffectActive, placeSnake, step, worldSpeed } from '../../resources/js/snake/world.js';

const powerUp = (type) => POWER_UPS.find((p) => p.type === type);
const RIGHT = 0;
const UP = -Math.PI / 2;

function seeded(seed = 1) {
    let value = seed;
    return () => {
        value = (value * 16807) % 2147483647;
        return (value - 1) / 2147483646;
    };
}

/**
 * A quiet world: the player's head at (x, y) heading `angle`, optional bots (each { x, y, angle,
 * length }), and only the food we place.
 */
function makeWorld({ x = 10, y = 10, angle = RIGHT, length = 4, bots = [] } = {}) {
    const world = createWorld(seeded());
    const player = getPlayer(world);
    placeSnake(player, { x, y }, angle, length);
    world.snakes = [
        player,
        ...bots.map((bot, i) => {
            const snake = world.snakes[i + 1];
            placeSnake(snake, { x: bot.x, y: bot.y }, bot.angle, bot.length ?? 5);
            return snake;
        }),
    ];
    world.foods = [];
    world.nextFruitAt = Infinity;
    world.nextPowerUpAt = Infinity;
    world.foodCount = 0;
    return world;
}

function placePowerUp(world, type, x, y) {
    world.foods.push({ kind: 'power', x, y, powerUp: powerUp(type), points: 0, grow: 0, expiresAt: world.time + 10000 });
}

/** Run the game for `ms`, the player steering at `angle` (null keeps the heading). */
function run(world, ms, angle = null) {
    const events = [];
    for (let t = 0; t < ms && !world.over; t += 50) {
        events.push(...step(world, angle, 50));
    }
    return events;
}

describe('power-ups', () => {
    test('the player picks one up, it runs for its duration, then ends with an event', () => {
        const world = makeWorld();
        placePowerUp(world, 'magnet', 11, 10);

        const events = run(world, 100);

        assert.equal(events.find((event) => event.type === 'powerUp')?.powerUp.type, 'magnet');
        assert.ok(isEffectActive(world, 'magnet'));
        assert.equal(activePowerUps(world)[0].type, 'magnet');
        assert.equal(world.foods.some((food) => food.kind === 'power'), false);
        assert.equal(world.points, 0);

        world.time += powerUp('magnet').durationMs;
        const later = run(world, 50);

        assert.equal(isEffectActive(world, 'magnet'), false);
        assert.ok(later.some((event) => event.type === 'powerUpEnded' && event.powerUp.type === 'magnet'));
    });

    test('bots cannot pick power-ups up', () => {
        const world = makeWorld({ bots: [{ x: 30, y: 6, angle: UP }] });
        placePowerUp(world, 'shield', 30, 5.6);

        run(world, 100);

        assert.equal(isEffectActive(world, 'shield'), false);
        assert.ok(world.foods.some((food) => food.kind === 'power'));
    });

    test('a power-up appears on its own after a while, one at a time', () => {
        const world = makeWorld();
        world.nextPowerUpAt = 0;

        run(world, 50);
        world.nextPowerUpAt = 0;
        run(world, 50);

        assert.equal(world.foods.filter((food) => food.kind === 'power').length, 1);
    });
});

describe('moving', () => {
    test('the worm glides forward and turns smoothly toward where it is steered, at any angle', () => {
        const world = makeWorld({ x: 20, y: 20 });
        const start = { ...getPlayer(world).body[0] };

        run(world, 200);
        const head = getPlayer(world).body[0];
        assert.ok(head.x > start.x + 0.5, 'it moved forward');
        assert.equal(head.y, start.y);

        // Steer up and to the right, at 45°: it turns a little each step, not all at once.
        const diagonal = -Math.PI / 4;
        step(world, diagonal, 50);
        assert.ok(getPlayer(world).angle < 0 && getPlayer(world).angle > diagonal);
        run(world, 500, diagonal);
        assert.ok(Math.abs(getPlayer(world).angle - diagonal) < 1e-9);
    });

    test('the body follows the path of the head, one segment per cell', () => {
        const world = makeWorld({ x: 20, y: 20, length: 6 });
        run(world, 1500, UP);
        const body = getPlayer(world).body;

        assert.equal(body.length, 6);
        for (let i = 1; i < body.length; i++) {
            const gap = Math.hypot(body[i].x - body[i - 1].x, body[i].y - body[i - 1].y);
            assert.ok(gap <= 1.0001 && gap > 0.8, `segment ${i} is ${gap} cells from the one before`);
        }
    });

    test('eating makes the worm grow as it moves on', () => {
        const world = makeWorld({ x: 20, y: 20, length: 4 });
        world.foods.push({ kind: 'food', x: 21, y: 20, points: 1, grow: 1 });

        run(world, 1500);

        assert.equal(world.points, 1);
        assert.equal(getPlayer(world).body.length, 5);
    });
});

describe('shield', () => {
    test('without it, hitting the wall ends the game', () => {
        const world = makeWorld({ x: COLS - 0.6, y: 10 });

        run(world, 50);

        assert.ok(world.over);
        assert.equal(world.deathCause.type, 'wall');
    });

    test('it takes a wall hit: the player stays put, turns toward the middle, and the shield is used up', () => {
        const world = makeWorld({ x: COLS - 0.6, y: 10 });
        world.effects.shield = 10000;

        const events = run(world, 50);
        const player = getPlayer(world);

        assert.equal(world.over, false);
        assert.ok(events.some((event) => event.type === 'shieldBroke'));
        assert.ok(player.body[0].x <= COLS - 0.5);
        assert.ok(Math.cos(player.angle) < 0, 'it now faces back into the field');
        assert.equal(isEffectActive(world, 'shield'), false);

        run(world, 300);
        assert.equal(world.over, false);
    });

    test('it takes a hit from running into a snake, then lets the player slip through it', () => {
        // A bot heading down, its body across the player's path at x = 12.
        const world = makeWorld({ bots: [{ x: 12, y: 12, angle: Math.PI / 2, length: 6 }] });
        world.effects.shield = 10000;

        const events = run(world, 1000);

        assert.equal(world.over, false);
        assert.ok(events.some((event) => event.type === 'shieldBroke'));
        assert.ok(world.snakes[1].alive);
    });
});

describe('ghost', () => {
    test('the player passes through other snakes, and they pass through the player', () => {
        // A bot heading down, its body across the player's path at x = 12.
        const world = makeWorld({ bots: [{ x: 12, y: 12, angle: Math.PI / 2, length: 6 }] });
        world.effects.ghost = 10000;

        run(world, 1000);

        assert.equal(world.over, false);
        assert.ok(world.snakes[1].alive);
    });

    test('without it, running into a snake ends the game', () => {
        // A bot heading down, its body across the player's path at x = 12.
        const world = makeWorld({ bots: [{ x: 12, y: 12, angle: Math.PI / 2, length: 6 }] });

        run(world, 1000);

        assert.ok(world.over);
        assert.equal(world.deathCause.type, 'hit');
        assert.equal(world.deathCause.other, world.snakes[1]);
    });
});

describe('magnet', () => {
    test('nearby food drifts toward the head and is collected when it arrives', () => {
        const world = makeWorld({ x: 10, y: 10 });
        world.effects.magnet = 10000;
        const food = { kind: 'food', x: 14, y: 13, points: 1, grow: 1 };
        world.foods.push(food);

        run(world, 50);
        assert.ok(Math.hypot(food.x - 14, food.y - 13) > 0.2, 'it moved');
        assert.deepEqual(food.from, { x: 14, y: 13 });
        assert.equal(world.points, 0);

        const events = run(world, 1000);

        assert.ok(events.some((event) => event.type === 'eat'));
        assert.equal(world.points, 1);
        assert.equal(world.foods.includes(food), false);
    });

    test('food outside the radius stays put', () => {
        const world = makeWorld({ x: 10, y: 10 });
        world.effects.magnet = 10000;
        const food = { kind: 'food', x: 30, y: 20, points: 1, grow: 1 };
        world.foods.push(food);

        run(world, 200);

        assert.deepEqual([food.x, food.y], [30, 20]);
    });
});

describe('slow-mo', () => {
    test('it slows every worm down', () => {
        const world = makeWorld();
        const normal = worldSpeed(world);
        world.effects.slow = 10000;

        assert.equal(worldSpeed(world), normal / SLOW_MO_FACTOR);
    });
});
