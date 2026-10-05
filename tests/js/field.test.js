import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BOTS, COLS, ROWS } from '../../resources/js/snake/config.js';
import { isInside } from '../../resources/js/snake/space.js';
import { createWorld, getPlayer, step } from '../../resources/js/snake/world.js';

function seeded(seed = 3) {
    let value = seed;
    return () => {
        value = (value * 16807) % 2147483647;
        return (value - 1) / 2147483646;
    };
}

const foodOnBoard = (world) => world.foods.filter((food) => food.kind === 'food').length;

test('the default field is landscape, and a turned field is upright with the same food', () => {
    const wide = createWorld(seeded());
    const tall = createWorld(seeded(), { cols: ROWS, rows: COLS });

    assert.deepEqual([wide.cols, wide.rows], [COLS, ROWS]);
    assert.deepEqual([tall.cols, tall.rows], [ROWS, COLS]);
    assert.equal(tall.foodCount, wide.foodCount);
    assert.equal(foodOnBoard(tall), tall.foodCount);
});

test('bigger fields get more food, small ones keep a minimum', () => {
    assert.ok(createWorld(seeded(), { cols: 80, rows: 60 }).foodCount > createWorld(seeded()).foodCount);
    assert.equal(createWorld(seeded(), { cols: 10, rows: 10 }).foodCount, 4);
});

test('on an upright field every snake and food starts inside it, and play stays inside', () => {
    const world = createWorld(seeded(), { cols: ROWS, rows: COLS });

    assert.equal(world.snakes.length, BOTS.length + 1);
    for (const snake of world.snakes) {
        assert.ok(snake.body.every((point) => isInside(world, point.x, point.y)), `${snake.name} starts outside`);
    }
    assert.ok(world.foods.every((food) => isInside(world, food.x, food.y)));

    // The player heads down the tall field; it should get further than a landscape field allows.
    for (let i = 0; i < 160 && !world.over; i++) {
        step(world, Math.PI / 2, 50);
    }
    assert.ok(getPlayer(world).body[0].y > ROWS / 2 + 20 || world.over);
    assert.ok(world.foods.every((food) => isInside(world, food.x, food.y)));
});

test('the computer worms play on their own for a while without leaving the field', () => {
    const world = createWorld(seeded(7), { multiplayer: true });
    let eaten = 0;

    for (let i = 0; i < 600; i++) {
        eaten += step(world, {}, 100).filter((event) => event.type === 'eat' || event.type === 'fruit').length;
        for (const snake of world.snakes.filter((s) => s.alive)) {
            assert.ok(isInside(world, snake.body[0].x, snake.body[0].y), `${snake.name} left the field`);
        }
    }

    assert.ok(eaten > 20, `the bots only ate ${eaten} times in a minute`);
    assert.ok(world.snakes.filter((snake) => snake.alive).length >= BOTS.length - 2);
});
