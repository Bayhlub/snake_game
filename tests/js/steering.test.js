import assert from 'node:assert/strict';
import { test } from 'node:test';

import { headAngle } from '../../resources/js/snake/look.js';
import { STICK_SIZE, followStick, stickVector } from '../../resources/js/snake/steering.js';

const at = { fx: 0.5, fy: 0.5 };

test('the stick points from where the finger went down to where it is now, in cells', () => {
    assert.deepEqual(stickVector({ base: at, knob: { fx: 0.6, fy: 0.5 } }, 40, 56), { x: (0.6 - 0.5) * 40, y: 0 });
    const diagonal = stickVector({ base: at, knob: { fx: 0.4, fy: 0.6 } }, 40, 40);
    assert.ok(Math.abs(Math.atan2(diagonal.y, diagonal.x) - (3 * Math.PI) / 4) < 1e-9, 'down and to the left');
});

test('a stick barely moved from where the finger went down counts as centered', () => {
    assert.equal(stickVector({ base: at, knob: { fx: 0.505, fy: 0.5 } }, 40, 56), null);
    assert.equal(stickVector(null, 40, 56), null);
});

test('the joystick ring stays put while the finger is inside it, and slides along behind it further out', () => {
    const inside = { fx: 0.55, fy: 0.5 };
    assert.equal(followStick(at, inside, 40, 40), at);

    const far = { fx: 0.9, fy: 0.5 };
    const base = followStick(at, far, 40, 40);
    assert.ok(Math.abs((far.fx - base.fx) * 40 - STICK_SIZE * 40) < 1e-9, 'the finger is on the ring, on the far side');
    assert.equal(base.fy, 0.5);

    // Turning back the other way only needs a move across the ring, however far the finger went.
    assert.ok(stickVector({ base, knob: { fx: far.fx - 0.2, fy: 0.5 } }, 40, 40).x < 0);
});

test('the head turns smoothly between steps, the short way round', () => {
    const snake = { previousAngle: 3, dir: { x: Math.cos(-3), y: Math.sin(-3) } };
    const halfway = headAngle(snake, 0.5);
    assert.ok(Math.abs(Math.abs(halfway) - Math.PI) < 0.3, 'it passes through facing left, not right');
    assert.ok(Math.abs(headAngle(snake, 1) - (2 * Math.PI - 3)) < 1e-9 || Math.abs(headAngle(snake, 1) + 3) < 1e-9);
});
