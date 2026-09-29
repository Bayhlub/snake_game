import { DIRECTIONS } from './config.js';
import { isReverse } from './world.js';

/** How much further off the other axis the target must be before the snake leaves a straight line. */
const TURN_BIAS = 2;

/**
 * Pick the direction that takes the snake toward a target cell (the mouse or finger).
 * The snake keeps going straight while that still gets it closer, so it moves in
 * clean lines instead of zig-zagging. Returns null when no turn is needed.
 */
export function directionToward(snake, target, world) {
    const head = snake.body[0];
    const dir = snake.dir;
    const dx = target.x - head.x;
    const dy = target.y - head.y;

    if (dx === 0 && dy === 0) {
        return null;
    }

    const horizontal = dx === 0 ? null : dx > 0 ? DIRECTIONS.right : DIRECTIONS.left;
    const vertical = dy === 0 ? null : dy > 0 ? DIRECTIONS.down : DIRECTIONS.up;
    const straightGap = dir.x !== 0 ? dx * dir.x : dy * dir.y;
    const sideGap = dir.x !== 0 ? Math.abs(dy) : Math.abs(dx);

    if (straightGap > 0 && sideGap <= straightGap * TURN_BIAS) {
        return null;
    }

    const [primary, secondary] = Math.abs(dx) >= Math.abs(dy) ? [horizontal, vertical] : [vertical, horizontal];
    for (const direction of [primary, secondary]) {
        if (direction && !isReverse(direction, dir)) {
            return direction;
        }
    }

    // The target is straight behind: turn toward the side with more room.
    if (dir.x !== 0) {
        return head.y < world.rows / 2 ? DIRECTIONS.down : DIRECTIONS.up;
    }
    return head.x < world.cols / 2 ? DIRECTIONS.right : DIRECTIONS.left;
}
