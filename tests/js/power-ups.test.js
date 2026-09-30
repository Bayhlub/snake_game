import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { DIRECTIONS, POWER_UPS, SLOW_MO_FACTOR } from '../../resources/js/snake/config.js';
import { activePowerUps, createWorld, getPlayer, isEffectActive, step, tickDuration } from '../../resources/js/snake/world.js';

const powerUp = (type) => POWER_UPS.find((p) => p.type === type);

function seeded(seed = 1) {
    let value = seed;
    return () => {
        value = (value * 16807) % 2147483647;
        return (value - 1) / 2147483646;
    };
}

/**
 * A quiet world: the player at (x, y) facing `dir`, optional bots, and only the food we place.
 */
function makeWorld({ x = 10, y = 10, dir = 'right', length = 4, bots = [] } = {}) {
    const world = createWorld(seeded());
    const player = getPlayer(world);
    player.dir = DIRECTIONS[dir];
    player.body = Array.from({ length }, (_, i) => ({ x: x - player.dir.x * i, y: y - player.dir.y * i }));
    world.snakes = [player, ...bots.map((body, i) => ({ ...world.snakes[i + 1], body, dir: DIRECTIONS.up, alive: true, growth: 0 }))];
    world.foods = [];
    world.nextFruitAt = Infinity;
    world.nextPowerUpAt = Infinity;
    return world;
}

function placePowerUp(world, type, x, y) {
    world.foods.push({ kind: 'power', x, y, powerUp: powerUp(type), points: 0, grow: 0, expiresAt: world.time + 10000 });
}

describe('power-ups', () => {
    test('the player picks one up, it runs for its duration, then ends with an event', () => {
        const world = makeWorld();
        placePowerUp(world, 'magnet', 11, 10);

        const events = step(world, null, 200);

        assert.equal(events.find((event) => event.type === 'powerUp')?.powerUp.type, 'magnet');
        assert.ok(isEffectActive(world, 'magnet'));
        assert.equal(activePowerUps(world)[0].type, 'magnet');
        assert.equal(world.foods.some((food) => food.kind === 'power'), false);
        assert.equal(world.points, 0);

        world.time += powerUp('magnet').durationMs;
        const later = step(world, null, 200);

        assert.equal(isEffectActive(world, 'magnet'), false);
        assert.ok(later.some((event) => event.type === 'powerUpEnded' && event.powerUp.type === 'magnet'));
    });

    test('bots cannot pick power-ups up', () => {
        const world = makeWorld({ bots: [[{ x: 30, y: 5 }, { x: 30, y: 6 }, { x: 30, y: 7 }]] });
        world.snakes[1].dir = DIRECTIONS.up;
        placePowerUp(world, 'shield', 30, 4);
        world.snakes[1].body.unshift({ x: 30, y: 4 });

        step(world, null, 200);

        assert.equal(isEffectActive(world, 'shield'), false);
    });

    test('a power-up appears on its own after a while, one at a time', () => {
        const world = makeWorld();
        world.nextPowerUpAt = 0;

        step(world, null, 200);
        world.nextPowerUpAt = 0;
        step(world, null, 200);

        assert.equal(world.foods.filter((food) => food.kind === 'power').length, 1);
    });
});

describe('shield', () => {
    test('without it, hitting the wall ends the game', () => {
        const world = makeWorld({ x: 39, y: 10 });

        step(world, null, 200);

        assert.ok(world.over);
    });

    test('it takes a wall hit: the player bounces back, turns, and the shield is used up', () => {
        const world = makeWorld({ x: 39, y: 10 });
        world.effects.shield = 10000;

        const events = step(world, null, 200);
        const player = getPlayer(world);

        assert.equal(world.over, false);
        assert.ok(events.some((event) => event.type === 'shieldBroke'));
        assert.deepEqual(player.body[0], { x: 39, y: 10 });
        assert.ok(player.dir === DIRECTIONS.up || player.dir === DIRECTIONS.down);
        assert.equal(isEffectActive(world, 'shield'), false);

        step(world, null, 200);
        assert.equal(world.over, false);
    });

    test('it takes a hit from running into a snake, then lets the player slip through it', () => {
        const bot = [{ x: 12, y: 8 }, { x: 12, y: 9 }, { x: 12, y: 10 }, { x: 12, y: 11 }, { x: 12, y: 12 }];
        const world = makeWorld({ bots: [bot] });
        world.snakes[1].dir = DIRECTIONS.up;
        world.effects.shield = 10000;

        step(world, null, 200);
        step(world, null, 200);

        assert.equal(world.over, false);
        assert.ok(world.snakes[1].alive);
    });
});

describe('ghost', () => {
    test('the player passes through other snakes, and they pass through the player', () => {
        const bot = [{ x: 12, y: 8 }, { x: 12, y: 9 }, { x: 12, y: 10 }, { x: 12, y: 11 }, { x: 12, y: 12 }];
        const world = makeWorld({ bots: [bot] });
        world.snakes[1].dir = DIRECTIONS.up;
        world.effects.ghost = 10000;

        step(world, null, 200);
        step(world, null, 200);

        assert.equal(world.over, false);
        assert.ok(world.snakes[1].alive);
    });
});

describe('magnet', () => {
    test('nearby food slides toward the head and is collected when it arrives', () => {
        const world = makeWorld({ x: 10, y: 10, dir: 'right' });
        world.effects.magnet = 10000;
        const food = { kind: 'food', x: 15, y: 12, points: 1, grow: 1 };
        world.foods.push(food);

        step(world, null, 200);
        assert.deepEqual([food.x, food.y], [14, 12]);
        assert.deepEqual(food.from, { x: 15, y: 12 });
        assert.equal(world.points, 0);

        step(world, null, 200);
        const events = step(world, null, 200);

        assert.ok(events.some((event) => event.type === 'eat'));
        assert.equal(world.points, 1);
        assert.equal(world.foods.includes(food), false);
    });

    test('food outside the radius stays put', () => {
        const world = makeWorld({ x: 10, y: 10, dir: 'down' });
        world.effects.magnet = 10000;
        const food = { kind: 'food', x: 30, y: 20, points: 1, grow: 1 };
        world.foods.push(food);

        step(world, null, 200);

        assert.deepEqual([food.x, food.y], [30, 20]);
    });
});

describe('slow-mo', () => {
    test('it stretches every move', () => {
        const world = makeWorld();
        const normal = tickDuration(world);
        world.effects.slow = 10000;

        assert.equal(tickDuration(world), normal * SLOW_MO_FACTOR);
    });
});
