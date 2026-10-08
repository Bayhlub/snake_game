import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM, clampZoom, createCamera, fitView, pointAt, updateCamera, viewRect, zoomForLength } from '../../resources/js/snake/camera.js';
import { BOTS, CELL, PLAYER } from '../../resources/js/snake/config.js';
import { translator } from '../../resources/js/snake/i18n.js';
import { bodyBeads, floorChips, foodColor, foodEmoji, FOOD_COLORS } from '../../resources/js/snake/look.js';
import { FOOD_EMOJIS } from '../../resources/js/snake/config.js';
import { DEFAULT_SKIN, SKINS, isSkin, skinById, skinOf, stripeColor } from '../../resources/js/snake/skins.js';
import { createWorld } from '../../resources/js/snake/world.js';

const COLS = 40;
const ROWS = 30;
const WIDTH = COLS * CELL;
const HEIGHT = ROWS * CELL;

/** Let the camera settle on its target. */
function settle(camera, focus, zoom) {
    for (let i = 0; i < 200; i++) {
        updateCamera(camera, { width: WIDTH, height: HEIGHT, focus, zoom, elapsedMs: 16 });
    }
    return camera;
}

describe('camera', () => {
    test('without a worm to follow it shows the whole field', () => {
        const camera = settle(createCamera(), null, 3);
        assert.deepEqual(viewRect(camera), { left: 0, top: 0, width: WIDTH, height: HEIGHT });
        assert.deepEqual(pointAt(camera, 0, 0), { x: -0.5, y: -0.5 });
        assert.deepEqual(pointAt(camera, 1, 1), { x: COLS - 0.5, y: ROWS - 0.5 });
    });

    test('it follows the worm, zoomed in, and the middle of the screen is where the head is', () => {
        const head = { x: 20 * CELL + CELL / 2, y: 15 * CELL + CELL / 2 };
        const camera = settle(createCamera(), head, 2);
        const view = viewRect(camera);
        assert.ok(Math.abs(camera.zoom - 2) < 1e-6);
        assert.ok(Math.abs(view.width - WIDTH / 2) < 1e-6);
        const middle = pointAt(camera, 0.5, 0.5);
        assert.ok(Math.abs(middle.x - 20) < 1e-6 && Math.abs(middle.y - 15) < 1e-6);
        // A spot on the right edge of the screen is to the right of the worm.
        assert.ok(pointAt(camera, 1, 0.5).x > 20);
    });

    test('near a wall it stops a few cells past the edge instead of following into the void', () => {
        const corner = { x: CELL / 2, y: CELL / 2 };
        const view = viewRect(settle(createCamera(), corner, 3));
        assert.ok(view.left >= -3 * CELL - 1e-6 && view.left < 0);
        assert.ok(view.top >= -3 * CELL - 1e-6 && view.top < 0);
    });

    test('a wide field on a tall screen fits whole when zoomed out, and fills the screen when following', () => {
        // An online field (wide) on a phone held upright: the board keeps the phone's shape.
        const fit = fitView(WIDTH, HEIGHT, 360, 504);
        assert.ok(Math.abs(fit.viewWidth - WIDTH) < 1e-9, 'the field is as wide as the screen');
        assert.ok(fit.viewHeight > HEIGHT, 'with room above and below it');

        const zoomedOut = createCamera();
        updateCamera(zoomedOut, { width: WIDTH, height: HEIGHT, viewWidth: fit.viewWidth, viewHeight: fit.viewHeight, focus: null, zoom: 2, elapsedMs: 16 });
        const whole = viewRect(zoomedOut);
        assert.ok(whole.left <= 0 && whole.top <= 0 && whole.left + whole.width >= WIDTH && whole.top + whole.height >= HEIGHT);

        const head = { x: WIDTH / 2, y: HEIGHT / 2 };
        const following = createCamera();
        for (let i = 0; i < 200; i++) {
            updateCamera(following, { width: WIDTH, height: HEIGHT, viewWidth: fit.viewWidth, viewHeight: fit.viewHeight, focus: head, zoom: 2.4, elapsedMs: 16 });
        }
        const view = viewRect(following);
        assert.ok(view.height / view.width > 1.3, 'the view keeps the tall screen shape');
        assert.ok(view.top >= -3 * CELL - 1e-6 && view.top + view.height <= HEIGHT + 3 * CELL + 1e-6, 'and stays near the field');
    });

    test('it eases toward a new zoom instead of jumping', () => {
        const head = { x: WIDTH / 2, y: HEIGHT / 2 };
        const camera = settle(createCamera(), head, 1.5);
        updateCamera(camera, { width: WIDTH, height: HEIGHT, focus: head, zoom: 3, elapsedMs: 16 });
        assert.ok(camera.zoom > 1.5 && camera.zoom < 3);
    });

    test('the camera pulls back further the longer your worm grows, but not without end', () => {
        assert.equal(zoomForLength(6), 1);
        assert.ok(zoomForLength(30) < 1);
        assert.ok(zoomForLength(80) < zoomForLength(30));
        assert.equal(zoomForLength(1000), 0.5);
    });

    test('zoom stays between the limits', () => {
        assert.equal(clampZoom(0.2), MIN_ZOOM);
        assert.equal(clampZoom(99), MAX_ZOOM);
        assert.equal(clampZoom(Number.NaN), DEFAULT_ZOOM);
    });
});

describe('skins', () => {
    test('the player and every computer snake wear a real skin in its main color', () => {
        for (const snake of [PLAYER, ...BOTS]) {
            assert.ok(isSkin(snake.skin), `${snake.name} has no skin`);
            assert.equal(snake.color, skinById(snake.skin).color);
        }
        assert.ok(isSkin(DEFAULT_SKIN));
    });

    test('a new game puts the player in the chosen skin, or the default for an unknown one', () => {
        assert.equal(createWorld(Math.random, { skin: 'candy' }).snakes[0].skin, 'candy');
        assert.equal(createWorld(Math.random, { skin: 'nope' }).snakes[0].skin, DEFAULT_SKIN);
        assert.equal(createWorld(Math.random, { skin: 'bee' }).snakes[0].color, skinById('bee').color);
    });

    test('stripes repeat along the body', () => {
        const candy = skinById('candy');
        assert.deepEqual([0, 1, 2, 3, 4].map((i) => stripeColor(candy, i)), ['#ef4444', '#ef4444', '#fff7ed', '#fff7ed', '#ef4444']);
    });

    test('a snake from an older server without a skin is drawn in its own color', () => {
        assert.deepEqual(skinOf({ color: '#123456' }).stripes, ['#123456']);
    });

    test('every skin has a name in both languages', () => {
        for (const t of [translator('en'), translator('lo')]) {
            for (const skin of SKINS) {
                assert.doesNotMatch(t(`skin.${skin.id}`), /^skin\./);
            }
        }
    });
});

describe('look', () => {
    test('the body is round beads from the tail to the head, two per segment', () => {
        const points = [0, 1, 2, 3].map((i) => ({ x: (10 - i) * CELL, y: 0 }));
        const beads = bodyBeads(points);
        assert.equal(beads.length, 6);
        assert.equal(beads.at(-1).segment, 1);
        assert.ok(beads[0].r < beads.at(-1).r, 'the tail is thinner');
    });

    test('food keeps its color in one spot, and a crashed snake leaves food in its color', () => {
        assert.equal(foodColor({ kind: 'food', x: 4, y: 9 }), foodColor({ kind: 'food', x: 4, y: 9 }));
        assert.ok(FOOD_COLORS.includes(foodColor({ kind: 'food', x: 4, y: 9 })));
        assert.equal(foodColor({ kind: 'drop', x: 4, y: 9, color: '#abcdef' }), '#abcdef');
    });

    test('everyday food is a little meal: its own, or for older servers one that stays the same', () => {
        const world = createWorld(Math.random);
        const food = world.foods.filter((f) => f.kind === 'food');
        assert.ok(food.length > 0 && food.every((f) => FOOD_EMOJIS.includes(f.emoji)));

        const plain = { kind: 'food', x: 7, y: 3 };
        assert.ok(FOOD_EMOJIS.includes(foodEmoji(plain)));
        assert.equal(foodEmoji(plain), foodEmoji({ ...plain }));
    });

    test('the floor is the same every time', () => {
        assert.deepEqual(floorChips(), floorChips());
    });
});
