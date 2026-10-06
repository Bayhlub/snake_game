import { BlurStyle, ClipOp, FilterMode, MipmapMode, PaintStyle, Skia, StrokeCap, StrokeJoin, TextAlign, TileMode } from '@shopify/react-native-skia';

import {
    CELL,
    DEAD_SKIN,
    FLOOR_COLOR,
    FLOOR_TILE,
    VOID_COLOR,
    bodyBeads,
    bodyRadius,
    createCamera,
    fitView,
    decorationSpots,
    floorChips,
    foodColor,
    foodRadius,
    STEER_COLOR,
    STEER_OUTLINE,
    aimArrow,
    gearCorners,
    headAngle,
    headRadius,
    isEffectActive,
    pointAt,
    shade,
    skinOf,
    starCorners,
    stickShape,
    stripeColor,
    treatLook,
    updateCamera,
    viewRect,
} from './shared';

// A Skia port of resources/js/snake/renderer.js. Drawing happens in board units (CELL px per cell)
// and is scaled to whatever size the board has on screen. The field can be wide or upright.
const SHIELD_COLOR = '#38bdf8';
const MAGNET_COLOR = '#f472b6';
const SLOW_TINT = '#8b5cf6';
const YOU_COLOR = '#4ade80';
/** How long the rings around the player's head pulse at the start of a game. */
const INTRO_MS = 3500;
/** The floor tile is rasterized once at this many pixels per board pixel: sharp enough when zoomed in. */
const FLOOR_SHARPNESS = 3;

const fill = Skia.Paint();
fill.setAntiAlias(true);
const stroke = Skia.Paint();
stroke.setAntiAlias(true);
stroke.setStyle(PaintStyle.Stroke);
stroke.setStrokeCap(StrokeCap.Round);
stroke.setStrokeJoin(StrokeJoin.Round);

function paint(base, color, alpha = 1) {
    base.setShader(null);
    base.setMaskFilter(null);
    base.setPathEffect(null);
    base.setColor(Skia.Color(color));
    base.setAlphaf(Math.max(0, Math.min(1, alpha)));
    return base;
}

function line(color, width, alpha = 1) {
    const linePaint = paint(stroke, color, alpha);
    linePaint.setStrokeWidth(width);
    return linePaint;
}

function circle(canvas, x, y, radius, color, alpha = 1) {
    canvas.drawCircle(x, y, Math.max(radius, 0), paint(fill, color, alpha));
}

function oval(canvas, cx, cy, rx, ry, drawPaint) {
    canvas.drawOval(Skia.XYWHRect(cx - rx, cy - ry, rx * 2, ry * 2), drawPaint);
}

function ring(canvas, x, y, radius, drawPaint) {
    canvas.drawCircle(x, y, Math.max(radius, 0), drawPaint);
}

/** An arc of a circle, in radians like the web canvas version. */
function arc(canvas, x, y, radius, start, end, drawPaint) {
    const degrees = 180 / Math.PI;
    canvas.drawArc(Skia.XYWHRect(x - radius, y - radius, radius * 2, radius * 2), start * degrees, (end - start) * degrees, false, drawPaint);
}

function radial(x0, y0, r0, x1, y1, r1, colors, positions = null) {
    return Skia.Shader.MakeTwoPointConicalGradient(
        { x: x0, y: y0 },
        r0,
        { x: x1, y: y1 },
        r1,
        colors.map((color) => Skia.Color(color)),
        positions,
        TileMode.Clamp,
    );
}

function polygonPath(corners, dx = 0, dy = 0) {
    const path = Skia.PathBuilder.Make();
    corners.forEach(([x, y], i) => (i ? path.lineTo(x + dx, y + dy) : path.moveTo(x + dx, y + dy)));
    path.close();
    return path.build();
}

/**
 * `label(powerUp)` gives a power-up's name in the player's language.
 *
 * A camera follows your worm while you play (`follow`), zoomed in by `zoom`; otherwise it shows the
 * whole field. `pointAt(fx, fy)` turns a spot on the board (as fractions of its size) into a spot on the field.
 * While you steer, `aim` (which way, in cells) puts an arrow in front of your worm and `stick` draws
 * the touch joystick. `target` is a cell your worm's eyes look at.
 */
export function createRenderer({ label = (powerUp) => powerUp.label, youLabel = () => 'YOU' } = {}) {
    const floor = makeFloorShader();
    const camera = createCamera();
    let shownShape = { cols: 1, rows: 1 };
    const foodBornAt = new WeakMap();
    const paragraphs = new Map();
    let pending = [];
    let particles = [];
    let rings = [];
    let popups = [];
    let shake = { until: 0, duration: 1, magnitude: 0 };
    let flash = { until: 0, duration: 1, color: '#ffffff', strength: 0 };
    let lastNow = performance.now();

    function burst(x, y, color, count, speed) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const velocity = speed * (0.4 + Math.random() * 0.6);
            particles.push({
                x,
                y,
                vx: Math.cos(angle) * velocity,
                vy: Math.sin(angle) * velocity,
                life: 1,
                decay: 1.4 + Math.random() * 1.2,
                size: 1.5 + Math.random() * 2.5,
                color,
            });
        }
    }

    function startShake(now, magnitude, duration) {
        if (magnitude >= shake.magnitude * Math.max(0, (shake.until - now) / shake.duration)) {
            shake = { until: now + duration, duration, magnitude };
        }
    }

    function startFlash(now, color, strength, duration) {
        flash = { until: now + duration, duration, color, strength };
    }

    function runEffect(event, now) {
        const x = (event.at?.x ?? event.food.x) * CELL + CELL / 2;
        const y = (event.at?.y ?? event.food.y) * CELL + CELL / 2;

        if (event.type === 'eat') {
            burst(x, y, foodColor(event.food), event.snake.isPlayer ? 10 : 5, 60);
            if (event.snake.isPlayer) {
                popups.push({ x, y, text: `+${event.food.points}`, color: '#fef08a', life: 1 });
            }
        } else if (event.type === 'fruit') {
            burst(x, y, '#fb7185', 16, 90);
            burst(x, y, '#fde68a', 10, 70);
            if (event.snake.isPlayer) {
                popups.push({ x, y, text: `+${event.food.points}`, color: '#fda4af', life: 1 });
            }
        } else if (event.type === 'powerUp') {
            burst(x, y, event.powerUp.color, 24, 110);
            rings.push({ x, y, color: event.powerUp.color, born: now, duration: 600, radius: CELL * 3.5 });
            popups.push({ x, y, text: `${label(event.powerUp)}!`, color: event.powerUp.color, life: 1.3 });
            startFlash(now, event.powerUp.color, 0.18, 350);
        } else if (event.type === 'shieldBroke') {
            burst(x, y, SHIELD_COLOR, 30, 140);
            burst(x, y, '#ffffff', 10, 90);
            rings.push({ x, y, color: SHIELD_COLOR, born: now, duration: 500, radius: CELL * 2.5 });
            startShake(now, 5, 320);
            startFlash(now, SHIELD_COLOR, 0.25, 300);
        } else {
            const skin = skinOf(event.snake);
            for (const color of new Set(skin.stripes)) {
                burst(x, y, color, Math.ceil(28 / skin.stripes.length), 130);
            }
            burst(x, y, '#ffffff', 8, 80);
            if (event.type === 'playerDied') {
                startShake(now, 8, 480);
                startFlash(now, '#f43f5e', 0.35, 420);
            } else if (event.cause.other?.isPlayer) {
                startShake(now, 3, 220);
            }
        }
    }

    /**
     * Text (fruit and power-up emoji, "+5" popups) is laid out once per string and reused every frame.
     * Phones use their system fonts; where none are available (the web preview) text is skipped.
     */
    function paragraph(text, fontSize, color) {
        const key = `${text}|${fontSize}|${color}`;
        if (!paragraphs.has(key)) {
            paragraphs.set(key, buildParagraph(text, fontSize, color));
        }
        return paragraphs.get(key);
    }

    function buildParagraph(text, fontSize, color) {
        try {
            const built = Skia.ParagraphBuilder.Make({ textAlign: TextAlign.Center })
                .pushStyle({
                    color: Skia.Color(color),
                    fontSize,
                    fontStyle: { weight: 700 },
                    shadows: [{ color: Skia.Color('rgba(0, 0, 0, 0.7)'), blurRadius: 2, offset: { x: 0, y: 1 } }],
                })
                .addText(text)
                .pop()
                .build();
            built.layout(CELL * 6);
            return built;
        } catch {
            return null;
        }
    }

    /**
     * Returns false when the text could not be drawn.
     */
    function drawCenteredText(canvas, text, fontSize, color, x, y, alpha = 1) {
        const para = paragraph(text, fontSize, color);
        if (!para) {
            return false;
        }
        if (alpha < 1) {
            canvas.saveLayer(paint(fill, '#000000', alpha));
        }
        para.paint(canvas, x - CELL * 3, y - para.getHeight() / 2);
        if (alpha < 1) {
            canvas.restore();
        }
        return true;
    }

    function drawFood(canvas, food, world, now, age, progress) {
        const from = food.from ?? food;
        const cx = (from.x + (food.x - from.x) * progress) * CELL + CELL / 2;
        const cy = (from.y + (food.y - from.y) * progress) * CELL + CELL / 2;
        const pop = Math.min(1, age / 250);
        const grow = pop < 1 ? Math.max(easeOutBack(pop), 0.01) : 1;

        if (food.kind === 'power') {
            drawPowerUp(canvas, food, world, now, cx, cy, grow);
            return;
        }

        // Treats (and a crashed worm's leftovers): big, bobbing and swaying, fading away at the end.
        if (food.emoji && (food.kind === 'fruit' || food.kind === 'drop')) {
            const { scale, opacity } = treatLook(food, world.time);
            const size = grow * scale;
            const bob = Math.sin(now / 260 + food.x) * 2;
            if (opacity < 1) {
                canvas.saveLayer(paint(fill, '#000000', opacity));
            }

            oval(canvas, cx, cy + CELL * 0.42 * size, CELL * 0.32 * size, CELL * 0.1 * size, paint(fill, '#000000', 0.3));

            canvas.save();
            canvas.translate(cx, cy - 1 + bob);
            canvas.rotate(Math.sin(now / 420 + food.x * 1.7) * 0.18 * (180 / Math.PI), 0, 0);
            canvas.scale(size, size);
            if (!drawCenteredText(canvas, food.emoji, CELL * 0.95, '#ffffff', 0, 1)) {
                circle(canvas, 0, 1, CELL * 0.38, food.color ?? '#fb7185');
                circle(canvas, -CELL * 0.12, -CELL * 0.1, CELL * 0.1, '#ffffff', 0.6);
            }
            canvas.restore();
            if (opacity < 1) {
                canvas.restore();
            }
            return;
        }

        // A glowing candy dot: a soft halo, a bright ball and a little shine.
        const color = foodColor(food);
        const size = foodRadius(food) * grow;
        const pulse = 1 + Math.sin(now / 250 + food.x * 3 + food.y) * 0.18;

        circle(canvas, cx, cy, size * 2.8 * pulse, color, 0.16);
        circle(canvas, cx, cy, size * 1.7 * pulse, color, 0.3);
        circle(canvas, cx, cy, size, color);
        circle(canvas, cx - size * 0.3, cy - size * 0.3, size * 0.38, '#ffffff', 0.75);
    }

    /**
     * A power-up: a dark glass orb with its icon, a colored glow, and two rings spinning around it.
     */
    function drawPowerUp(canvas, food, world, now, cx, cy, grow) {
        // Without its look (an unknown power-up from a newer server), there's nothing to draw.
        if (!food.powerUp || (food.expiresAt - world.time < 2500 && Math.floor(now / 140) % 2 === 0)) {
            return;
        }
        const { color, emoji } = food.powerUp;
        const bob = Math.sin(now / 300 + food.x) * 1.5;
        const pulse = 1 + Math.sin(now / 240) * 0.1;
        const y = cy + bob;

        circle(canvas, cx, y, CELL * 1.05 * pulse * grow, color, 0.28);
        circle(canvas, cx, y, CELL * 0.5 * grow, '#111118', 0.9);

        const spin = now / 380;
        for (const offset of [0, Math.PI]) {
            arc(canvas, cx, y, CELL * 0.62 * grow, spin + offset, spin + offset + 1.6, line(color, 2));
        }

        canvas.save();
        canvas.translate(cx, y);
        canvas.scale(grow, grow);
        if (!drawCenteredText(canvas, emoji, CELL * 0.6, '#ffffff', 0, 0)) {
            circle(canvas, 0, 0, CELL * 0.22, color);
        }
        canvas.restore();
    }

    /**
     * A name tag pointing at a player's head (below it when the head is near the top wall): "YOU" on
     * your own snake, the player's name on others; below the head when `putBelow`. Yours also pulses rings for a few seconds after it appears.
     */
    function drawNameTag(canvas, world, snake, head, text, now, isMe, putBelow = false) {
        const intro = isMe ? Math.max(0, 1 - (world.time - (snake.spawnedAt ?? 0)) / INTRO_MS) : 0;
        const tagColor = isMe && !world.multiplayer ? YOU_COLOR : skinOf(snake).color;
        const width = world.cols * CELL;

        for (let i = 0; intro > 0 && i < 2; i++) {
            const t = (now / 750 + i / 2) % 1;
            ring(canvas, head.x, head.y, CELL * (0.9 + t * 2.4), line(tagColor, 2.5, intro * (1 - t) * 0.85));
        }

        const para = paragraph(text, CELL * 0.95, '#ffffff');
        const tagWidth = (para ? para.getMaxIntrinsicWidth() : CELL * 1.5) + CELL;
        const tagHeight = CELL * 1.3;
        const below = putBelow || head.y < CELL * 2.6;
        const bounce = Math.sin(now / 160) * 2.5 * intro;
        const cy = head.y + (below ? CELL * 1.7 : -CELL * 1.7) + bounce * (below ? 1 : -1);
        const cx = Math.min(Math.max(head.x, tagWidth / 2 + 2), width - tagWidth / 2 - 2);
        const edgeY = below ? cy - tagHeight / 2 : cy + tagHeight / 2;
        const tipY = below ? edgeY - 4 : edgeY + 4;

        const shape = Skia.PathBuilder.Make();
        shape.addRRect(Skia.RRectXY(Skia.XYWHRect(cx - tagWidth / 2, cy - tagHeight / 2, tagWidth, tagHeight), tagHeight / 2, tagHeight / 2));
        shape.moveTo(head.x - 4, edgeY);
        shape.lineTo(head.x, tipY);
        shape.lineTo(head.x + 4, edgeY);
        const outline = shape.build();
        canvas.drawPath(outline, paint(fill, '#111118', 0.92));
        canvas.drawPath(outline, line(tagColor, 1.5));

        if (para) {
            para.paint(canvas, cx - CELL * 3, cy - para.getHeight() / 2);
        }
    }

    /**
     * The player, plus whichever power-ups are running: see-through as a ghost (or blinking
     * just after a shield broke), a bubble for the shield, and pulses for the magnet.
     */
    function drawPlayer(canvas, world, player, points, now, lookAt, isMe) {
        if (!points.length) {
            return;
        }
        const alive = player.alive;
        const head = points[0];

        if (alive && isEffectActive(world, 'magnet', player)) {
            for (let i = 0; i < 2; i++) {
                const t = (now / 900 + i / 2) % 1;
                ring(canvas, head.x, head.y, CELL * (2.4 - t * 1.8), line(MAGNET_COLOR, 1.5, (1 - t) * 0.45));
            }
        }

        let opacity = 1;
        if (alive && isEffectActive(world, 'ghost', player)) {
            opacity = 0.42 + Math.sin(now / 160) * 0.08;
        } else if (alive && isEffectActive(world, 'grace', player)) {
            opacity = Math.floor(now / 90) % 2 ? 0.35 : 0.9;
        }

        // See-through worms go through a layer, so the overlapping beads don't show through each other.
        if (opacity < 1) {
            canvas.saveLayer(paint(fill, '#000000', opacity));
        }
        drawWorm(canvas, player, points, { now, lookAt, dead: !alive, glow: isMe && alive });
        if (opacity < 1) {
            canvas.restore();
        }

        if (alive && isEffectActive(world, 'shield', player)) {
            const radius = CELL * 1.05 * (1 + Math.sin(now / 220) * 0.06);
            const bubble = paint(fill, '#ffffff');
            bubble.setShader(
                radial(head.x - radius * 0.3, head.y - radius * 0.3, 1, head.x, head.y, radius, [
                    'rgba(186, 230, 253, 0.05)',
                    'rgba(56, 189, 248, 0.12)',
                    'rgba(56, 189, 248, 0.35)',
                ], [0, 0.75, 1]),
            );
            canvas.drawCircle(head.x, head.y, radius, bubble);
            ring(canvas, head.x, head.y, radius, line(SHIELD_COLOR, 1.6, 0.9));
            const spin = now / 500;
            arc(canvas, head.x, head.y, radius - 2, spin, spin + 0.9, line('#e0f2fe', 2, 0.9));
        }
    }

    return {
        /**
         * Show an effect once the gliding snake visually reaches the spot where it happened.
         */
        showEvent(event, delayMs) {
            if (event.type === 'powerUpEnded') {
                return;
            }
            const isInstant = event.type === 'playerDied' || event.type === 'shieldBroke';
            pending.push({ event, runAt: performance.now() + (isInstant ? 0 : delayMs) });
        },

        /** The spot on the field under a spot on the board, given as fractions (0–1) of its width and height. */
        pointAt(fx, fy) {
            return pointAt(camera, fx, fy);
        },

        /**
         * Record one frame as a Skia picture sized to the board on screen.
         */
        draw(world, now, progress, target, width, height, { zoom = 1, follow = false, aim = null, stick = null } = {}) {
            const elapsedMs = Math.min(now - lastNow, 100);
            const elapsed = elapsedMs / 1000;
            lastNow = now;

            pending = pending.filter((effect) => {
                if (now < effect.runAt) {
                    return true;
                }
                runEffect(effect.event, now);
                return false;
            });
            const soonEaten = pending.map((effect) => effect.event.food).filter(Boolean);
            // Solo there is one player; online, `meId` says which of the players is on this device.
            const players = world.snakes.filter((snake) => snake.isPlayer);
            const me = world.meId != null ? players.find((snake) => snake.id === world.meId) : players[0];
            const points = new Map(world.snakes.map((snake) => [snake, snakePoints(snake, progress)]));

            const WIDTH = world.cols * CELL;
            const HEIGHT = world.rows * CELL;
            if (world.cols !== shownShape.cols || world.rows !== shownShape.rows) {
                // A new field shape (the phone turned): start the camera over.
                shownShape = { cols: world.cols, rows: world.rows };
                camera.x = null;
            }
            const focus = follow && me?.alive ? points.get(me)[0] : null;
            // The board on screen keeps the phone's shape; online the field can be another shape (wide), so
            // it fits inside, and the camera shows as much of it as the board has room for.
            const fit = fitView(WIDTH, HEIGHT, width, height);
            const SCREEN_W = fit.viewWidth;
            const SCREEN_H = fit.viewHeight;
            updateCamera(camera, { width: WIDTH, height: HEIGHT, viewWidth: SCREEN_W, viewHeight: SCREEN_H, focus, zoom, elapsedMs });
            const view = viewRect(camera);
            const isVisible = (x, y, margin = CELL * 2) =>
                x > view.left - margin && x < view.left + view.width + margin && y > view.top - margin && y < view.top + view.height + margin;

            const recorder = Skia.PictureRecorder();
            const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));
            canvas.scale(fit.scale, fit.scale);
            canvas.drawRect(Skia.XYWHRect(0, 0, SCREEN_W, SCREEN_H), paint(fill, VOID_COLOR));

            canvas.save();
            if (now < shake.until) {
                const strength = shake.magnitude * ((shake.until - now) / shake.duration);
                canvas.translate((Math.random() * 2 - 1) * strength, (Math.random() * 2 - 1) * strength);
            }
            canvas.scale(camera.zoom, camera.zoom);
            canvas.translate(-view.left, -view.top);

            const floorPaint = paint(fill, FLOOR_COLOR);
            floorPaint.setShader(floor);
            canvas.drawRect(Skia.XYWHRect(0, 0, WIDTH, HEIGHT), floorPaint);
            drawWall(canvas, WIDTH, HEIGHT);

            for (const food of [...world.foods, ...soonEaten]) {
                if (!foodBornAt.has(food)) {
                    foodBornAt.set(food, now);
                }
                if (isVisible(food.x * CELL, food.y * CELL)) {
                    drawFood(canvas, food, world, now, now - foodBornAt.get(food), progress);
                }
            }

            const lookAt = (snake) => nearestFood(world, snake, snake === me ? target : null);
            const shown = world.snakes.filter((snake) => points.get(snake).some((point) => isVisible(point.x, point.y)));
            for (const snake of shown) {
                drawShadow(canvas, points.get(snake));
            }
            for (const snake of shown) {
                if (!snake.isPlayer) {
                    drawWorm(canvas, snake, points.get(snake), { now, lookAt: lookAt(snake), dead: false, glow: false });
                }
            }
            // Everyone else first, so your own worm and tag are always on top.
            for (const player of [...players.filter((snake) => snake !== me), ...(me ? [me] : [])]) {
                const playerPoints = points.get(player);
                const isMe = player === me;
                drawPlayer(canvas, world, player, playerPoints, now, lookAt(player), isMe);
                if (player.alive && playerPoints.length) {
                    // While you steer upward, your tag moves below your worm so it doesn't hide the arrow.
                    drawNameTag(canvas, world, player, playerPoints[0], isMe ? youLabel() : player.name, now, isMe, isMe && aim !== null && aim.y < 0);
                }
            }
            if (aim && me?.alive) {
                drawAim(canvas, aimArrow(points.get(me)[0], aim, me.body.length));
            }

            particles = particles.filter((particle) => {
                particle.life -= particle.decay * elapsed;
                particle.x += particle.vx * elapsed;
                particle.y += particle.vy * elapsed;
                particle.vx *= 0.92;
                particle.vy *= 0.92;
                if (particle.life <= 0) {
                    return false;
                }
                circle(canvas, particle.x, particle.y, particle.size * particle.life, particle.color, particle.life);
                return true;
            });

            rings = rings.filter((effect) => {
                const t = (now - effect.born) / effect.duration;
                if (t >= 1) {
                    return false;
                }
                ring(canvas, effect.x, effect.y, effect.radius * easeOutCubic(t), line(effect.color, 3 * (1 - t) + 0.5, (1 - t) * 0.8));
                return true;
            });

            popups = popups.filter((popup) => {
                popup.life -= elapsed * 1.2;
                popup.y -= elapsed * 28;
                if (popup.life <= 0) {
                    return false;
                }
                drawCenteredText(canvas, popup.text, CELL * 0.8, popup.color, popup.x, popup.y, Math.min(1, popup.life * 2));
                return true;
            });
            canvas.restore();

            if (players.some((player) => isEffectActive(world, 'slow', player))) {
                canvas.drawRect(Skia.XYWHRect(0, 0, SCREEN_W, SCREEN_H), paint(fill, SLOW_TINT, 0.12 + Math.sin(now / 400) * 0.03));
            }
            drawVignette(canvas, SCREEN_W, SCREEN_H);

            const mapOpacity = Math.min(1, (camera.zoom - 1) * 3);
            if (mapOpacity > 0.02) {
                drawMinimap(canvas, world, points, me, view, WIDTH, HEIGHT, mapOpacity, SCREEN_W, SCREEN_H);
            }

            if (stick) {
                drawStick(canvas, stickShape(stick, SCREEN_W, SCREEN_H));
            }

            if (now < flash.until) {
                canvas.drawRect(Skia.XYWHRect(0, 0, SCREEN_W, SCREEN_H), paint(fill, flash.color, flash.strength * ((flash.until - now) / flash.duration)));
            }

            return recorder.finishRecordingAsPicture();
        },
    };
}

/**
 * A little picture of a skin for the skin picker: a short wavy worm looking to the right,
 * `width` × `height` on screen.
 */
export function skinPreview(skin, width, height) {
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));
    canvas.scale(width / 132, height / 44);
    const points = Array.from({ length: 8 }, (_, i) => ({ x: 112 - i * 13, y: 22 + Math.sin(i * 0.95) * 5 }));
    drawWorm(canvas, { id: 1, skin: skin.id, color: skin.color, dir: { x: 1, y: 0 } }, points, { now: 0, lookAt: null, dead: false, glow: false });
    return recorder.finishRecordingAsPicture();
}

/**
 * Pixel centers of every body segment, each sliding from where it was at the last step to where it
 * is now. The list also carries `angle`: the way the head faces, turning smoothly in between.
 */
function snakePoints(snake, progress) {
    const previous = snake.previousBody;

    const points = snake.body.map((cell, i) => {
        const from = previous?.[i] ?? cell;
        return {
            x: (from.x + (cell.x - from.x) * progress) * CELL + CELL / 2,
            y: (from.y + (cell.y - from.y) * progress) * CELL + CELL / 2,
        };
    });
    points.angle = headAngle(snake, progress);
    return points;
}

/**
 * Where a snake's eyes look: the finger for the player, otherwise the closest food.
 */
function nearestFood(world, snake, target) {
    const head = snake.body[0];
    if (!head) {
        return null;
    }
    if (target) {
        return target;
    }
    let best = null;
    let bestDistance = Infinity;
    for (const food of world.foods) {
        const distance = Math.abs(food.x - head.x) + Math.abs(food.y - head.y);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = food;
        }
    }
    return best;
}

function drawShadow(canvas, points) {
    if (points.length < 2) {
        return;
    }
    const path = Skia.PathBuilder.Make();
    path.moveTo(points[0].x + 2.5, points[0].y + 4.5);
    for (const point of points.slice(1)) {
        path.lineTo(point.x + 2.5, point.y + 4.5);
    }
    canvas.drawPath(path.build(), line('#000000', bodyRadius(points.length) * 2, 0.32));
}

/**
 * A Worms Zone style worm: round beads in the skin's stripes, with one dark rim around the body and
 * a shine along the top, the skin's little decorations along the back, and a big round head with googly eyes.
 */
function drawWorm(canvas, snake, points, { now, lookAt, dead, glow }) {
    if (!points.length) {
        return;
    }
    const skin = dead ? DEAD_SKIN : skinOf(snake);

    const beads = bodyBeads(points);
    const rim = shade(skin.color, 0.55);
    for (const bead of beads) {
        circle(canvas, bead.x, bead.y, bead.r + 1.6, rim);
    }
    for (const bead of beads) {
        circle(canvas, bead.x, bead.y, bead.r, stripeColor(skin, bead.segment));
    }
    for (const bead of beads) {
        circle(canvas, bead.x - bead.r * 0.25, bead.y - bead.r * 0.3, bead.r * 0.42, '#ffffff', 0.22);
    }

    if (skin.decoration) {
        const size = bodyRadius(points.length) * 0.62;
        for (const spot of decorationSpots(points)) {
            drawDecoration(canvas, skin, spot.x, spot.y, size, spot.angle, stripeColor(skin, spot.segment));
        }
    }

    drawHead(canvas, snake, skin, points, now, lookAt, dead, glow);
}

/**
 * The little shapes some skins wear along their back: gears, stars, dots or hearts.
 */
function drawDecoration(canvas, skin, x, y, size, angle, under) {
    const degrees = 180 / Math.PI;
    canvas.save();
    canvas.translate(x, y);
    canvas.rotate(angle * degrees, 0, 0);
    const accent = paint(fill, skin.accent);
    if (skin.decoration === 'gear') {
        // Gears turn as the worm moves along.
        canvas.rotate((x + y) * 0.05 * degrees, 0, 0);
        canvas.drawPath(polygonPath(gearCorners(size)), accent);
        circle(canvas, 0, 0, size * 0.32, under);
    } else if (skin.decoration === 'star') {
        canvas.drawPath(polygonPath(starCorners(size)), accent);
    } else if (skin.decoration === 'heart') {
        const s = size * 0.9;
        canvas.rotate(90, 0, 0);
        const heart = Skia.PathBuilder.Make();
        heart.moveTo(0, s * 0.75);
        heart.cubicTo(-s * 1.1, 0, -s * 0.55, -s * 0.85, 0, -s * 0.3);
        heart.cubicTo(s * 0.55, -s * 0.85, s * 1.1, 0, 0, s * 0.75);
        canvas.drawPath(heart.build(), accent);
    } else {
        circle(canvas, 0, 0, size * 0.5, skin.accent);
    }
    canvas.restore();
}

/**
 * A big round head in the first stripe's color, with two googly eyes that look where the worm is
 * looking (and blink now and then), rosy cheeks and a smile.
 */
function drawHead(canvas, snake, skin, points, now, lookAt, dead, glow) {
    const head = points[0];
    const radius = headRadius(points.length);
    const radians = points.angle ?? Math.atan2(snake.dir.y, snake.dir.x);
    const color = stripeColor(skin, 0);

    if (glow) {
        const halo = paint(fill, skin.color, 0.85);
        halo.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 7, true));
        canvas.drawCircle(head.x, head.y, radius + 1.6, halo);
    }
    circle(canvas, head.x, head.y, radius + 1.6, shade(skin.color, 0.55));
    circle(canvas, head.x, head.y, radius, color);
    circle(canvas, head.x - radius * 0.3, head.y - radius * 0.35, radius * 0.45, '#ffffff', 0.3);

    canvas.save();
    canvas.translate(head.x, head.y);
    canvas.rotate((radians * 180) / Math.PI, 0, 0);

    // A smile at the front.
    arc(canvas, radius * 0.42, 0, radius * 0.38, -0.9, 0.9, line(shade(color, 0.65), radius * 0.13));

    circle(canvas, radius * 0.45, -radius * 0.68, radius * 0.17, '#fb7185', 0.4);
    circle(canvas, radius * 0.45, radius * 0.68, radius * 0.17, '#fb7185', 0.4);

    const look = lookDirection(head, lookAt, radians);
    const isBlinking = (now / 1000 + snake.id * 1.37) % 4.2 < 0.13;
    for (const side of [-1, 1]) {
        const ex = radius * 0.05;
        const ey = side * radius * 0.42;
        const eyeRadius = radius * 0.46;

        circle(canvas, ex, ey, eyeRadius + 1, shade(color, 0.5));
        if (dead) {
            circle(canvas, ex, ey, eyeRadius, '#f3f4f6');
            const arm = eyeRadius * 0.5;
            const cross = line('#111827', 1.8);
            canvas.drawLine(ex - arm, ey - arm, ex + arm, ey + arm, cross);
            canvas.drawLine(ex + arm, ey - arm, ex - arm, ey + arm, cross);
            continue;
        }
        if (isBlinking) {
            circle(canvas, ex, ey, eyeRadius, color);
            canvas.drawLine(ex - eyeRadius * 0.7, ey, ex + eyeRadius * 0.7, ey, line(shade(color, 0.6), 1.6));
            continue;
        }
        circle(canvas, ex, ey, eyeRadius, '#ffffff');
        const px = ex + look.x * eyeRadius * 0.42;
        const py = ey + look.y * eyeRadius * 0.42;
        circle(canvas, px, py, eyeRadius * 0.52, '#111827');
        circle(canvas, px - eyeRadius * 0.18, py - eyeRadius * 0.2, eyeRadius * 0.17, '#ffffff');
    }

    canvas.restore();
}

/**
 * The direction from the head to what it looks at, in the head's own rotated frame (unit length).
 */
function lookDirection(head, lookAt, angle) {
    if (!lookAt) {
        return { x: 1, y: 0 };
    }
    const dx = lookAt.x * CELL + CELL / 2 - head.x;
    const dy = lookAt.y * CELL + CELL / 2 - head.y;
    const length = Math.hypot(dx, dy) || 1;
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    return { x: (dx * cos - dy * sin) / length, y: (dx * sin + dy * cos) / length };
}

/**
 * The arrow in front of your worm, pointing the way you're steering.
 */
function drawAim(canvas, arrow) {
    canvas.save();
    canvas.translate(arrow.x, arrow.y);
    canvas.rotate((arrow.angle * 180) / Math.PI, 0, 0);
    const shape = polygonPath(arrow.corners);
    canvas.drawPath(shape, paint(fill, STEER_COLOR, 0.95));
    canvas.drawPath(shape, line(STEER_OUTLINE, 1.6, 0.95));
    canvas.restore();
}

/**
 * The touch joystick: an orange ring where the finger went down, and a knob that follows the finger.
 */
function drawStick(canvas, shape) {
    circle(canvas, shape.x, shape.y, shape.radius, '#000000', 0.12);
    ring(canvas, shape.x, shape.y, shape.radius, line(STEER_COLOR, shape.radius * 0.07, 0.9));
    circle(canvas, shape.knobX, shape.knobY, shape.knobRadius, STEER_COLOR);
}

/**
 * The arena's edge: a red glow warning you near the wall and a red-and-white candy stripe around it.
 */
function drawWall(canvas, WIDTH, HEIGHT) {
    const band = CELL * 1.6;
    for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [
        [0, 0, 0, band, 0, 0, WIDTH, band],
        [0, HEIGHT, 0, HEIGHT - band, 0, HEIGHT - band, WIDTH, band],
        [0, 0, band, 0, 0, 0, band, HEIGHT],
        [WIDTH, 0, WIDTH - band, 0, WIDTH - band, 0, band, HEIGHT],
    ]) {
        const glow = paint(fill, '#ffffff');
        glow.setShader(
            Skia.Shader.MakeLinearGradient(
                { x: x0, y: y0 },
                { x: x1, y: y1 },
                [Skia.Color('rgba(239, 68, 68, 0.22)'), Skia.Color('rgba(239, 68, 68, 0)')],
                null,
                TileMode.Clamp,
            ),
        );
        canvas.drawRect(Skia.XYWHRect(rx, ry, rw, rh), glow);
    }

    const thickness = CELL * 0.6;
    const inset = -thickness / 2;
    const frame = Skia.XYWHRect(inset, inset, WIDTH - inset * 2, HEIGHT - inset * 2);
    const edge = paint(stroke, '#3f0d12');
    edge.setStrokeCap(StrokeCap.Butt);
    edge.setStrokeJoin(StrokeJoin.Miter);
    edge.setStrokeWidth(thickness + 3);
    canvas.drawRect(frame, edge);
    edge.setColor(Skia.Color('#ef4444'));
    edge.setStrokeWidth(thickness);
    canvas.drawRect(frame, edge);
    edge.setColor(Skia.Color('#fff1f2'));
    edge.setPathEffect(Skia.PathEffect.MakeDash([CELL * 0.7, CELL * 0.7], 0));
    canvas.drawRect(frame, edge);
    edge.setPathEffect(null);
    edge.setStrokeCap(StrokeCap.Round);
    edge.setStrokeJoin(StrokeJoin.Round);
}

/**
 * A small map of the whole field in the corner while zoomed in: every worm's head, yours ringed
 * in white, and a frame around the part you're looking at.
 */
function drawMinimap(canvas, world, points, me, view, WIDTH, HEIGHT, opacity, SCREEN_W, SCREEN_H) {
    // The map has the field's shape and sits in the bottom corner of the screen.
    const mapWidth = Math.min(SCREEN_W * (WIDTH > HEIGHT ? 0.3 : 0.26), 190);
    const mapHeight = (mapWidth * HEIGHT) / WIDTH;
    const x0 = SCREEN_W - mapWidth - 12;
    const y0 = SCREEN_H - mapHeight - 12;
    const s = mapWidth / WIDTH;
    const frame = Skia.RRectXY(Skia.XYWHRect(x0, y0, mapWidth, mapHeight), 8, 8);

    canvas.saveLayer(paint(fill, '#000000', opacity));
    canvas.drawRRect(frame, paint(fill, '#0a0a10', 0.72));
    canvas.drawRRect(frame, line('#ffffff', 1.5, 0.28));
    canvas.save();
    canvas.clipRRect(frame, ClipOp.Intersect, true);

    for (const food of world.foods) {
        if (food.kind === 'fruit' || food.kind === 'power') {
            circle(canvas, x0 + (food.x + 0.5) * CELL * s, y0 + (food.y + 0.5) * CELL * s, 1.6, food.kind === 'power' ? food.powerUp.color : '#fde68a');
        }
    }
    for (const snake of world.snakes) {
        const head = points.get(snake)[0];
        if (!snake.alive || !head) {
            continue;
        }
        const isMe = snake === me;
        const radius = isMe ? 4 : snake.isPlayer ? 3.2 : 2.4;
        if (isMe) {
            circle(canvas, x0 + head.x * s, y0 + head.y * s, radius + 1.8, '#ffffff');
        }
        circle(canvas, x0 + head.x * s, y0 + head.y * s, radius, skinOf(snake).color);
    }
    const viewFrame = line('#ffffff', 1.2, 0.7);
    viewFrame.setStrokeJoin(StrokeJoin.Miter);
    canvas.drawRect(Skia.XYWHRect(x0 + view.left * s, y0 + view.top * s, view.width * s, view.height * s), viewFrame);
    viewFrame.setStrokeJoin(StrokeJoin.Round);
    canvas.restore();
    canvas.restore();
}

/**
 * The speckled terrazzo floor as a repeating image: one tile is drawn once at FLOOR_SHARPNESS
 * pixels per board pixel, then repeated across the field.
 */
function makeFloorShader() {
    const size = Math.round(FLOOR_TILE * FLOOR_SHARPNESS);
    const surface = Skia.Surface.Make(size, size);
    const chips = floorChips();
    const drawTile = (canvas) => {
        canvas.drawRect(Skia.XYWHRect(0, 0, FLOOR_TILE, FLOOR_TILE), paint(fill, FLOOR_COLOR));
        for (const chip of chips) {
            const chipPaint = paint(fill, chip.color, chip.alpha);
            for (const dx of [-FLOOR_TILE, 0, FLOOR_TILE]) {
                for (const dy of [-FLOOR_TILE, 0, FLOOR_TILE]) {
                    canvas.drawPath(polygonPath(chip.corners, dx, dy), chipPaint);
                }
            }
        }
    };

    if (surface) {
        const canvas = surface.getCanvas();
        canvas.scale(FLOOR_SHARPNESS, FLOOR_SHARPNESS);
        drawTile(canvas);
        surface.flush();
        const image = surface.makeImageSnapshot();
        return image.makeShaderOptions(TileMode.Repeat, TileMode.Repeat, FilterMode.Linear, MipmapMode.Linear, Skia.Matrix().scale(1 / FLOOR_SHARPNESS, 1 / FLOOR_SHARPNESS));
    }
    // No offscreen surface (some web previews): repeat a recorded picture instead.
    const recorder = Skia.PictureRecorder();
    drawTile(recorder.beginRecording(Skia.XYWHRect(0, 0, FLOOR_TILE, FLOOR_TILE)));
    return recorder.finishRecordingAsPicture().makeShader(TileMode.Repeat, TileMode.Repeat, FilterMode.Linear, undefined, Skia.XYWHRect(0, 0, FLOOR_TILE, FLOOR_TILE));
}

function drawVignette(canvas, WIDTH, HEIGHT) {
    const dim = paint(fill, '#ffffff');
    dim.setShader(
        radial(WIDTH / 2, HEIGHT / 2, Math.min(WIDTH, HEIGHT) * 0.5, WIDTH / 2, HEIGHT / 2, Math.max(WIDTH, HEIGHT) * 0.75, [
            'rgba(0, 0, 0, 0)',
            'rgba(0, 0, 0, 0.38)',
        ]),
    );
    canvas.drawRect(Skia.XYWHRect(0, 0, WIDTH, HEIGHT), dim);
}

function easeOutBack(t) {
    const overshoot = 1.7;
    return 1 + (overshoot + 1) * (t - 1) ** 3 + overshoot * (t - 1) ** 2;
}

function easeOutCubic(t) {
    return 1 - (1 - t) ** 3;
}
