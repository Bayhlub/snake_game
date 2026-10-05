/**
 * Touch steering is a joystick, like Worms Zone: the worm heads the way the stick points, at any angle.
 * Below this length (in cells) the stick counts as centered, and the worm keeps its heading.
 */
export const STICK_DEAD_ZONE = 1.2;

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
