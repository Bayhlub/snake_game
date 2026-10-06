/**
 * Touch steering is a joystick, like Worms Zone: the worm heads the way the stick points, at any angle.
 * Below this length (in cells) the stick counts as centered, and the worm keeps its heading.
 */
export const STICK_DEAD_ZONE = 1.2;

/** The joystick ring's radius, as a share of the board's shorter side. */
export const STICK_SIZE = 0.13;

/**
 * Where the joystick's ring should be now: it stays put while the finger is inside it, and slides
 * along behind the finger when it goes further, like Worms Zone. That way the worm turns as soon as
 * the finger moves another way, instead of after dragging all the way back across the ring.
 * `base` and `knob` are spots on a `cols` × `rows` board as fractions of its size.
 */
export function followStick(base, knob, cols, rows) {
    const radius = STICK_SIZE * Math.min(cols, rows);
    const dx = (knob.fx - base.fx) * cols;
    const dy = (knob.fy - base.fy) * rows;
    const distance = Math.hypot(dx, dy);
    if (distance <= radius) {
        return base;
    }
    const slide = (distance - radius) / distance;
    return { fx: base.fx + (dx * slide) / cols, fy: base.fy + (dy * slide) / rows };
}

/**
 * The direction a touch stick points, in cells, from where the finger went down (`base`) to where it
 * is now (`knob`), both given as fractions of a `cols` × `rows` board. Null while it's centered.
 */
export function stickVector(stick, cols, rows) {
    if (!stick) {
        return null;
    }
    const vector = { x: (stick.knob.fx - stick.base.fx) * cols, y: (stick.knob.fy - stick.base.fy) * rows };
    return Math.hypot(vector.x, vector.y) < STICK_DEAD_ZONE ? null : vector;
}
