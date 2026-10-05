import { CELL } from './config.js';

/** Zoom 1 shows the whole field; bigger numbers zoom in on your worm. */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export const DEFAULT_ZOOM = 2.4;
/** How far past the walls the camera may look (in cells) once zoomed in, so you can see the edge coming. */
const EDGE_MARGIN = 3;
/** How quickly the camera catches up with the worm and with zoom changes (ms; smaller is snappier). */
const FOLLOW_MS = 110;
const ZOOM_MS = 160;

export function clampZoom(zoom) {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number.isFinite(zoom) ? zoom : DEFAULT_ZOOM));
}

/**
 * The camera looks at a `width` × `height` field (in board pixels). It is drawn into a view of the
 * same shape, so zoom 1 is the whole field and zoom 2 is a quarter of it.
 */
export function createCamera() {
    return { x: null, y: null, zoom: MIN_ZOOM };
}

/**
 * Move the camera toward `focus` (a point in board pixels, or null to show the whole field) at
 * `zoom`. It eases there over a few frames instead of jumping.
 */
export function updateCamera(camera, { width, height, focus, zoom, elapsedMs }) {
    const targetZoom = focus ? clampZoom(zoom) : MIN_ZOOM;
    const first = camera.x === null;
    camera.zoom = first ? targetZoom : ease(camera.zoom, targetZoom, elapsedMs, ZOOM_MS);

    const center = focus ? clampCenter(focus, camera.zoom, width, height) : { x: width / 2, y: height / 2 };
    camera.x = first ? center.x : ease(camera.x, center.x, elapsedMs, FOLLOW_MS);
    camera.y = first ? center.y : ease(camera.y, center.y, elapsedMs, FOLLOW_MS);
    // While zooming out the view grows, so keep it inside the allowed area every frame.
    const clamped = clampCenter({ x: camera.x, y: camera.y }, camera.zoom, width, height);
    camera.x = clamped.x;
    camera.y = clamped.y;
    return camera;
}

/** The part of the field the camera shows, in board pixels. */
export function viewRect(camera, width, height) {
    const viewWidth = width / camera.zoom;
    const viewHeight = height / camera.zoom;
    return { left: camera.x - viewWidth / 2, top: camera.y - viewHeight / 2, width: viewWidth, height: viewHeight };
}

/**
 * The spot on the field (in cells, like worm positions) under a point on screen, given as
 * fractions (0–1) of the view's width and height.
 */
export function pointAt(camera, cols, rows, fx, fy) {
    const view = viewRect(camera, cols * CELL, rows * CELL);
    return { x: (view.left + fx * view.width) / CELL - 0.5, y: (view.top + fy * view.height) / CELL - 0.5 };
}

function clampCenter(point, zoom, width, height) {
    // Fully zoomed out there's no room to look past the walls; the margin grows as you zoom in.
    const margin = EDGE_MARGIN * CELL * Math.min(1, Math.max(0, (zoom - 1) * 2));
    return {
        x: clampAxis(point.x, width / zoom / 2, width, margin),
        y: clampAxis(point.y, height / zoom / 2, height, margin),
    };
}

function clampAxis(value, half, size, margin) {
    const low = half - margin;
    const high = size - half + margin;
    return low > high ? size / 2 : Math.min(high, Math.max(low, value));
}

function ease(from, to, elapsedMs, timeMs) {
    return from + (to - from) * (1 - Math.exp(-elapsedMs / timeMs));
}
