/**
 * Geometry for worms that glide at any angle. Positions are in cells: a point at (x, y) is drawn
 * centered on cell (x, y), so the field runs from -0.5 to cols - 0.5 across.
 */

/** Whether a point is on the field, at least `margin` cells in from the walls. */
export function isInside(world, x, y, margin = 0) {
    return x >= -0.5 + margin && y >= -0.5 + margin && x <= world.cols - 0.5 - margin && y <= world.rows - 0.5 - margin;
}

/** An angle brought into -π…π, so differences between angles take the short way round. */
export function wrapAngle(angle) {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
}

const BUCKET = 2;
const bucketOf = (value) => Math.floor(value / BUCKET);
const keyOf = (bx, by) => (bx + 64) * 8192 + (by + 64);

/**
 * Every body point of every living worm, sorted into small squares of the field, so "is anything
 * near here?" only looks at the few points close by instead of every worm.
 */
export function indexBodies(world) {
    const buckets = new Map();
    for (const snake of world.snakes) {
        if (!snake.alive) {
            continue;
        }
        snake.body.forEach((point, index) => {
            const key = keyOf(bucketOf(point.x), bucketOf(point.y));
            if (!buckets.has(key)) {
                buckets.set(key, []);
            }
            buckets.get(key).push({ snake, index, x: point.x, y: point.y });
        });
    }

    return {
        /**
         * Call `visit(entry)` for each body point within `radius` of (x, y), where an entry is
         * { snake, index, x, y } and index 0 is a head. Stops early, returning true, when `visit` does.
         */
        near(x, y, radius, visit) {
            for (let bx = bucketOf(x - radius); bx <= bucketOf(x + radius); bx++) {
                for (let by = bucketOf(y - radius); by <= bucketOf(y + radius); by++) {
                    for (const entry of buckets.get(keyOf(bx, by)) ?? []) {
                        if (Math.hypot(entry.x - x, entry.y - y) < radius && visit(entry)) {
                            return true;
                        }
                    }
                }
            }
            return false;
        },
    };
}
