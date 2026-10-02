import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BOTS, COLS, DIRECTIONS, ROWS } from '../../resources/js/snake/config.js';
import { createWorld, getPlayer, step } from '../../resources/js/snake/world.js';

function seeded(seed = 3) {
    let value = seed;
    return () => {
        value = (value * 16807) % 2147483647;
        return (value - 1) / 2147483646;
    };
}

const foodOnBoard = (world) => world.foods.filter((food) => food.kind === 'food').length;
const isInside = (world, cell) => cell.x >= 0 && cell.y >= 0 && cell.x < world.cols && cell.y < world.rows;

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
        assert.ok(snake.body.every((cell) => isInside(world, cell)), `${snake.name} starts outside`);
    }
    assert.ok(world.foods.every((food) => isInside(world, food)));

    // The player heads down the tall field; it should get further than a landscape field allows.
    getPlayer(world).dir = DIRECTIONS.down;
    for (let i = 0; i < 25 && !world.over; i++) {
        step(world, DIRECTIONS.down, 200);
    }
    assert.ok(getPlayer(world).body[0].y > ROWS / 2 + 20 || world.over);
    assert.ok(world.foods.every((food) => isInside(world, food)));
});
