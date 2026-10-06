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
 * How a `width` × `height` field (in board pixels) fits on a screen of another shape at zoom 1:
 * `scale` screen pixels per board pixel, and the board-pixel size of the whole screen, which is the
 * field plus empty space beside it when the shapes differ (a wide online field on an upright phone).
 */
export function fitView(width, height, screenWidth, screenHeight) {
    const scale = Math.min(screenWidth / width, screenHeight / height);
    return { scale, viewWidth: screenWidth / scale, viewHeight: screenHeight / scale };
}

/**
 * The camera looks at a field `width` × `height` (in board pixels) through a view that shows
 * `viewWidth` × `viewHeight` of it at zoom 1: the whole field, and some empty space beside it if
 * the view is another shape. Zoom 2 shows half as much each way.
 */
export function createCamera() {
    return { x: null, y: null, zoom: MIN_ZOOM, viewWidth: 1, viewHeight: 1 };
}

/**
 * Move the camera toward `focus` (a point in board pixels, or null to show the whole field) at
 * `zoom`. It eases there over a few frames instead of jumping.
 */
export function updateCamera(camera, { width, height, viewWidth = width, viewHeight = height, focus, zoom, elapsedMs }) {
    camera.viewWidth = viewWidth;
    camera.viewHeight = viewHeight;
    const targetZoom = focus ? clampZoom(zoom) : MIN_ZOOM;
    const first = camera.x === null;
    camera.zoom = first ? targetZoom : ease(camera.zoom, targetZoom, elapsedMs, ZOOM_MS);

    const center = focus ? clampCenter(camera, focus, width, height) : { x: width / 2, y: height / 2 };
    camera.x = first ? center.x : ease(camera.x, center.x, elapsedMs, FOLLOW_MS);
    camera.y = first ? center.y : ease(camera.y, center.y, elapsedMs, FOLLOW_MS);
    // While zooming out the view grows, so keep it inside the allowed area every frame.
    const clamped = clampCenter(camera, { x: camera.x, y: camera.y }, width, height);
    camera.x = clamped.x;
    camera.y = clamped.y;
    return camera;
}

/** The part of the field the camera shows, in board pixels. */
export function viewRect(camera) {
    const width = camera.viewWidth / camera.zoom;
    const height = camera.viewHeight / camera.zoom;
    return { left: camera.x - width / 2, top: camera.y - height / 2, width, height };
}

/**
 * The spot on the field (in cells, like worm positions) under a point on screen, given as
 * fractions (0–1) of the view's width and height.
 */
export function pointAt(camera, fx, fy) {
    const view = viewRect(camera);
    return { x: (view.left + fx * view.width) / CELL - 0.5, y: (view.top + fy * view.height) / CELL - 0.5 };
}

function clampCenter(camera, point, width, height) {
    // Fully zoomed out there's no room to look past the walls; the margin grows as you zoom in.
    const margin = EDGE_MARGIN * CELL * Math.min(1, Math.max(0, (camera.zoom - 1) * 2));
    return {
        x: clampAxis(point.x, camera.viewWidth / camera.zoom / 2, width, margin),
        y: clampAxis(point.y, camera.viewHeight / camera.zoom / 2, height, margin),
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
