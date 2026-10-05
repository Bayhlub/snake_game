import assert from 'node:assert/strict';
import { test } from 'node:test';

import { stickVector } from '../../resources/js/snake/steering.js';

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
