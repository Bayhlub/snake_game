import { createCamera, fitView, pointAt, updateCamera, viewRect, zoomForLength } from './camera.js';
import { CELL } from './config.js';
import {
    DEAD_SKIN,
    FLOOR_COLOR,
    FLOOR_TILE,
    VOID_COLOR,
    bodyBeads,
    bodyRadius,
    decorationSpots,
    floorChips,
    foodColor,
    foodEmoji,
    STEER_COLOR,
    STEER_OUTLINE,
    aimArrow,
    gearCorners,
    headAngle,
    headRadius,
    shade,
    starCorners,
    treatLook,
    stickShape,
} from './look.js';
import { skinOf, stripeColor } from './skins.js';
import { isEffectActive } from './world.js';

const SHIELD_COLOR = '#38bdf8';
const MAGNET_COLOR = '#f472b6';
const SLOW_TINT = '#8b5cf6';
const EMOJI_FONT = `${Math.round(CELL * 1.05)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
const ORB_EMOJI_FONT = `${Math.round(CELL * 0.62)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
const POPUP_FONT = `700 ${Math.round(CELL * 0.8)}px Fredoka, "Noto Sans Lao", "Leelawadee UI", "Lao Sangam MN", ui-sans-serif, system-ui, sans-serif`;
const YOU_COLOR = '#4ade80';
const TAG_FONT = `700 ${Math.round(CELL * 0.95)}px Fredoka, "Noto Sans Lao", "Leelawadee UI", "Lao Sangam MN", ui-sans-serif, system-ui, sans-serif`;
/** How long the rings around the player's head pulse at the start of a game. */
const INTRO_MS = 3500;
/** The floor tile is drawn sharp enough for this much zoom. */
const FLOOR_SHARPNESS = 2.5;

/**
 * Draws the world onto a canvas. The canvas keeps a fixed pixel size and CSS scales it to fit.
 * Snakes glide between cells: `progress` (0–1) says how far the current move has gone.
 * `label(powerUp)` gives a power-up's name in the player's language, `youLabel()` the player's name tag.
 *
 * A camera follows your worm while you play (`follow`), zoomed in by `zoom`; otherwise it shows the
 * whole field. `pointAt(fx, fy)` turns a spot on the canvas (as fractions of its size) into a spot on the field.
 * While you steer, `aim` (which way, in cells) puts an arrow in front of your worm and `stick` draws
 * the touch joystick. `target` is a cell your worm's eyes look at.
 */
export function createRenderer(canvas, cols, rows, { label = (powerUp) => powerUp.label, youLabel = () => 'YOU' } = {}) {
    const ctx = canvas.getContext('2d');
    const width = cols * CELL;
    const height = rows * CELL;
    const scale = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = width * scale;
    canvas.height = height * scale;

    const floor = ctx.createPattern(drawFloorTile(scale * FLOOR_SHARPNESS), 'repeat');
    floor.setTransform(new DOMMatrix().scaleSelf(1 / (scale * FLOOR_SHARPNESS)));
    const vignette = drawVignette(width, height, scale);
    // See-through worms (ghost, blinking) are drawn here first, then copied over at once, so the
    // overlapping body beads don't show through each other.
    const layer = document.createElement('canvas');
    layer.width = canvas.width;
    layer.height = canvas.height;
    const layerCtx = layer.getContext('2d');

    const camera = createCamera();
    let shownShape = { cols, rows };
    const foodBornAt = new WeakMap();
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
     * A worm, drawn see-through when `opacity` is below 1.
     */
    function drawWormAt(target, snake, points, options) {
        if (options.opacity >= 1) {
            drawWorm(target, snake, points, options);
            return;
        }
        layerCtx.setTransform(1, 0, 0, 1, 0, 0);
        layerCtx.clearRect(0, 0, layer.width, layer.height);
        layerCtx.setTransform(target.getTransform());
        drawWorm(layerCtx, snake, points, options);
        target.save();
        target.setTransform(1, 0, 0, 1, 0, 0);
        target.globalAlpha = options.opacity;
        target.drawImage(layer, 0, 0);
        target.restore();
    }

    /**
     * The player, plus whichever power-ups are running: see-through as a ghost (or blinking
     * just after a shield broke), a bubble for the shield, and pulses for the magnet.
     */
    function drawPlayer(world, player, points, now, lookAt, isMe) {
        if (!points.length) {
            return;
        }
        const alive = player.alive;
        const head = points[0];

        if (alive && isEffectActive(world, 'magnet', player)) {
            for (let i = 0; i < 2; i++) {
                const t = (now / 900 + i / 2) % 1;
                ctx.globalAlpha = (1 - t) * 0.45;
                ctx.strokeStyle = MAGNET_COLOR;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(head.x, head.y, CELL * (2.4 - t * 1.8), 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }

        let opacity = 1;
        if (alive && isEffectActive(world, 'ghost', player)) {
            opacity = 0.42 + Math.sin(now / 160) * 0.08;
        } else if (alive && isEffectActive(world, 'grace', player)) {
            opacity = Math.floor(now / 90) % 2 ? 0.35 : 0.9;
        }

        drawWormAt(ctx, player, points, { now, lookAt, opacity, dead: !alive, glow: isMe && alive });

        if (alive && isEffectActive(world, 'shield', player)) {
            const pulse = 1 + Math.sin(now / 220) * 0.06;
            const radius = CELL * 1.05 * pulse;
            const bubble = ctx.createRadialGradient(head.x - radius * 0.3, head.y - radius * 0.3, 1, head.x, head.y, radius);
            bubble.addColorStop(0, 'rgba(186, 230, 253, 0.05)');
            bubble.addColorStop(0.75, 'rgba(56, 189, 248, 0.12)');
            bubble.addColorStop(1, 'rgba(56, 189, 248, 0.35)');
            ctx.fillStyle = bubble;
            ctx.beginPath();
            ctx.arc(head.x, head.y, radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = SHIELD_COLOR;
            ctx.lineWidth = 1.6;
            ctx.globalAlpha = 0.9;
            ctx.stroke();
            const spin = now / 500;
            ctx.strokeStyle = '#e0f2fe';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(head.x, head.y, radius - 2, spin, spin + 0.9);
            ctx.stroke();
            ctx.globalAlpha = 1;
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

        /** The spot on the field under a spot on the canvas, given as fractions (0–1) of its width and height. */
        pointAt(fx, fy) {
            return pointAt(camera, fx, fy);
        },

        draw(world, now, progress, target = null, { zoom = 1, follow = false, aim = null, stick = null } = {}) {
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

            // The canvas keeps its shape; a field of another shape (the tall online arena) fits inside it.
            const fieldWidth = world.cols * CELL;
            const fieldHeight = world.rows * CELL;
            if (world.cols !== shownShape.cols || world.rows !== shownShape.rows) {
                shownShape = { cols: world.cols, rows: world.rows };
                camera.x = null;
            }
            const fit = fitView(fieldWidth, fieldHeight, width, height);
            const focus = follow && me?.alive ? points.get(me)[0] : null;
            // The camera pulls back as your worm grows.
            const followZoom = zoom * zoomForLength(me?.body.length ?? 0);
            updateCamera(camera, { width: fieldWidth, height: fieldHeight, viewWidth: fit.viewWidth, viewHeight: fit.viewHeight, focus, zoom: followZoom, elapsedMs });
            const view = viewRect(camera);
            const isVisible = (x, y, margin = CELL * 2) =>
                x > view.left - margin && x < view.left + view.width + margin && y > view.top - margin && y < view.top + view.height + margin;

            ctx.setTransform(scale, 0, 0, scale, 0, 0);
            ctx.fillStyle = VOID_COLOR;
            ctx.fillRect(0, 0, width, height);
            ctx.save();
            if (now < shake.until) {
                const strength = shake.magnitude * ((shake.until - now) / shake.duration);
                ctx.translate((Math.random() * 2 - 1) * strength, (Math.random() * 2 - 1) * strength);
            }
            ctx.scale(fit.scale * camera.zoom, fit.scale * camera.zoom);
            ctx.translate(-view.left, -view.top);

            ctx.fillStyle = floor;
            ctx.fillRect(0, 0, fieldWidth, fieldHeight);
            drawWall(ctx, fieldWidth, fieldHeight);

            for (const food of [...world.foods, ...soonEaten]) {
                if (!foodBornAt.has(food)) {
                    foodBornAt.set(food, now);
                }
                if (isVisible(food.x * CELL, food.y * CELL)) {
                    drawFood(ctx, food, world, now, now - foodBornAt.get(food), progress);
                }
            }

            const lookAt = (snake) => nearestFood(world, snake, snake === me ? target : null);
            const shown = world.snakes.filter((snake) => points.get(snake).some((point) => isVisible(point.x, point.y)));
            for (const snake of shown) {
                drawShadow(ctx, points.get(snake));
            }
            for (const snake of shown) {
                if (!snake.isPlayer) {
                    drawWorm(ctx, snake, points.get(snake), { now, lookAt: lookAt(snake), opacity: 1, dead: false, glow: false });
                }
            }
            // Everyone else first, so your own worm and tag are always on top.
            for (const player of [...players.filter((snake) => snake !== me), ...(me ? [me] : [])]) {
                const playerPoints = points.get(player);
                const isMe = player === me;
                drawPlayer(world, player, playerPoints, now, lookAt(player), isMe);
                if (player.alive && playerPoints.length) {
                    // While you steer upward, your tag moves below your worm so it doesn't hide the arrow.
                    drawNameTag(ctx, world, player, playerPoints[0], isMe ? youLabel() : player.name, now, isMe, isMe && aim !== null && aim.y < 0);
                }
            }
            if (aim && me?.alive) {
                drawAim(ctx, aimArrow(points.get(me)[0], aim, me.body.length));
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
                ctx.globalAlpha = particle.life;
                circle(ctx, particle.x, particle.y, particle.size * particle.life, particle.color);
                return true;
            });
            ctx.globalAlpha = 1;

            rings = rings.filter((ring) => {
                const t = (now - ring.born) / ring.duration;
                if (t >= 1) {
                    return false;
                }
                ctx.globalAlpha = (1 - t) * 0.8;
                ctx.strokeStyle = ring.color;
                ctx.lineWidth = 3 * (1 - t) + 0.5;
                ctx.beginPath();
                ctx.arc(ring.x, ring.y, ring.radius * easeOutCubic(t), 0, Math.PI * 2);
                ctx.stroke();
                return true;
            });
            ctx.globalAlpha = 1;

            ctx.font = POPUP_FONT;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            popups = popups.filter((popup) => {
                popup.life -= elapsed * 1.2;
                popup.y -= elapsed * 28;
                if (popup.life <= 0) {
                    return false;
                }
                ctx.globalAlpha = Math.min(1, popup.life * 2);
                ctx.lineWidth = 3;
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
                ctx.strokeText(popup.text, popup.x, popup.y);
                ctx.fillStyle = popup.color;
                ctx.fillText(popup.text, popup.x, popup.y);
                return true;
            });
            ctx.globalAlpha = 1;
            ctx.restore();

            if (players.some((player) => isEffectActive(world, 'slow', player))) {
                ctx.globalAlpha = 0.12 + Math.sin(now / 400) * 0.03;
                ctx.fillStyle = SLOW_TINT;
                ctx.fillRect(0, 0, width, height);
                ctx.globalAlpha = 1;
            }
            ctx.drawImage(vignette, 0, 0, width, height);

            const mapOpacity = Math.min(1, (camera.zoom - 1) * 3);
            if (mapOpacity > 0.02) {
                drawMinimap(ctx, world, points, me, view, fieldWidth, fieldHeight, mapOpacity, width, height);
            }

            if (stick) {
                drawStick(ctx, stickShape(stick, width, height));
            }

            if (now < flash.until) {
                ctx.globalAlpha = flash.strength * ((flash.until - now) / flash.duration);
                ctx.fillStyle = flash.color;
                ctx.fillRect(0, 0, width, height);
                ctx.globalAlpha = 1;
            }
        },
    };
}

/**
 * A little picture of a skin for the skin picker: a short wavy worm looking to the right.
 */
export function drawSkinPreview(canvas, skin) {
    const width = 132;
    const height = 44;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    const points = Array.from({ length: 8 }, (_, i) => ({ x: 112 - i * 13, y: 22 + Math.sin(i * 0.95) * 5 }));
    drawWorm(ctx, { id: 1, skin: skin.id, color: skin.color, dir: { x: 1, y: 0 } }, points, { now: 0, lookAt: null, dead: false, glow: false });
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
 * Where a snake's eyes look: the finger or mouse for the player, otherwise the closest food.
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

function drawShadow(ctx, points) {
    if (points.length < 2) {
        return;
    }
    ctx.save();
    ctx.translate(2.5, 4.5);
    ctx.globalAlpha = 0.32;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = bodyRadius(points.length) * 2;
    ctx.strokeStyle = '#000000';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) {
        ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
    ctx.restore();
}

/**
 * A Worms Zone style worm: round beads in the skin's stripes, each with a soft rim and shine,
 * the skin's little decorations along the back, and a big round head with googly eyes.
 */
function drawWorm(ctx, snake, points, { now, lookAt, dead, glow }) {
    if (!points.length) {
        return;
    }
    const skin = dead ? DEAD_SKIN : skinOf(snake);

    // A dark rim around the whole body first, then the striped beads, then a shine along the top.
    // A long worm is hundreds of beads, so each layer is drawn as a few shapes rather than bead by bead:
    // the rim in one, the stripes one run of a color at a time (tail to head), and the shine in one.
    const beads = bodyBeads(points);
    fillCircles(ctx, beads.map((bead) => [bead.x, bead.y, bead.r + 1.6]), shade(skin.color, 0.55));
    let run = [];
    let runColor = null;
    for (const bead of beads) {
        const color = stripeColor(skin, bead.segment);
        if (color !== runColor && run.length) {
            fillCircles(ctx, run, runColor);
            run = [];
        }
        runColor = color;
        run.push([bead.x, bead.y, bead.r]);
    }
    fillCircles(ctx, run, runColor);
    fillCircles(ctx, beads.map((bead) => [bead.x - bead.r * 0.25, bead.y - bead.r * 0.3, bead.r * 0.42]), '#ffffff', 0.22);

    if (skin.decoration) {
        const size = bodyRadius(points.length) * 0.62;
        for (const spot of decorationSpots(points)) {
            drawDecoration(ctx, skin, spot.x, spot.y, size, spot.angle, stripeColor(skin, spot.segment));
        }
    }

    drawHead(ctx, snake, skin, points, now, lookAt, dead, glow);
}

/**
 * The little shapes some skins wear along their back: gears, stars, dots or hearts.
 */
function drawDecoration(ctx, skin, x, y, size, angle, under) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = skin.accent;
    if (skin.decoration === 'gear') {
        // Gears turn as the worm moves along.
        ctx.rotate((x + y) * 0.05);
        polygon(ctx, gearCorners(size));
        circle(ctx, 0, 0, size * 0.32, under);
    } else if (skin.decoration === 'star') {
        polygon(ctx, starCorners(size));
    } else if (skin.decoration === 'heart') {
        const s = size * 0.9;
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, s * 0.75);
        ctx.bezierCurveTo(-s * 1.1, 0, -s * 0.55, -s * 0.85, 0, -s * 0.3);
        ctx.bezierCurveTo(s * 0.55, -s * 0.85, s * 1.1, 0, 0, s * 0.75);
        ctx.fill();
    } else {
        circle(ctx, 0, 0, size * 0.5, skin.accent);
    }
    ctx.restore();
}

/**
 * A big round head in the first stripe's color, with two googly eyes that look where the worm is
 * looking (and blink now and then), rosy cheeks and a smile.
 */
function drawHead(ctx, snake, skin, points, now, lookAt, dead, glow) {
    const head = points[0];
    const radius = headRadius(points.length);
    const angle = points.angle ?? Math.atan2(snake.dir.y, snake.dir.x);
    const color = stripeColor(skin, 0);

    if (glow) {
        ctx.shadowColor = skin.color;
        ctx.shadowBlur = 16;
    }
    circle(ctx, head.x, head.y, radius + 1.6, shade(skin.color, 0.55));
    ctx.shadowBlur = 0;
    circle(ctx, head.x, head.y, radius, color);
    ctx.globalAlpha = 0.3;
    circle(ctx, head.x - radius * 0.3, head.y - radius * 0.35, radius * 0.45, '#ffffff');
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.rotate(angle);

    // A smile at the front.
    ctx.strokeStyle = shade(color, 0.65);
    ctx.lineWidth = radius * 0.13;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(radius * 0.42, 0, radius * 0.38, -0.9, 0.9);
    ctx.stroke();

    ctx.globalAlpha = 0.4;
    circle(ctx, radius * 0.45, -radius * 0.68, radius * 0.17, '#fb7185');
    circle(ctx, radius * 0.45, radius * 0.68, radius * 0.17, '#fb7185');
    ctx.globalAlpha = 1;

    const look = lookDirection(head, lookAt, angle);
    const isBlinking = (now / 1000 + snake.id * 1.37) % 4.2 < 0.13;
    for (const side of [-1, 1]) {
        const ex = radius * 0.05;
        const ey = side * radius * 0.42;
        const eyeRadius = radius * 0.46;

        circle(ctx, ex, ey, eyeRadius + 1, shade(color, 0.5));
        if (dead) {
            circle(ctx, ex, ey, eyeRadius, '#f3f4f6');
            ctx.strokeStyle = '#111827';
            ctx.lineWidth = 1.8;
            const arm = eyeRadius * 0.5;
            ctx.beginPath();
            ctx.moveTo(ex - arm, ey - arm);
            ctx.lineTo(ex + arm, ey + arm);
            ctx.moveTo(ex + arm, ey - arm);
            ctx.lineTo(ex - arm, ey + arm);
            ctx.stroke();
            continue;
        }
        if (isBlinking) {
            circle(ctx, ex, ey, eyeRadius, color);
            ctx.strokeStyle = shade(color, 0.6);
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(ex - eyeRadius * 0.7, ey);
            ctx.lineTo(ex + eyeRadius * 0.7, ey);
            ctx.stroke();
            continue;
        }
        circle(ctx, ex, ey, eyeRadius, '#ffffff');
        const px = ex + look.x * eyeRadius * 0.42;
        const py = ey + look.y * eyeRadius * 0.42;
        circle(ctx, px, py, eyeRadius * 0.52, '#111827');
        circle(ctx, px - eyeRadius * 0.18, py - eyeRadius * 0.2, eyeRadius * 0.17, '#ffffff');
    }
    ctx.restore();
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
 * A name tag pointing at a player's head (below it when the head is near the top wall): "YOU" on
 * your own snake, the player's name on others; below the head when `putBelow`. Yours also pulses rings for a few seconds after it appears.
 */
function drawNameTag(ctx, world, snake, head, text, now, isMe, putBelow = false) {
    const intro = isMe ? Math.max(0, 1 - (world.time - (snake.spawnedAt ?? 0)) / INTRO_MS) : 0;
    const tagColor = isMe && !world.multiplayer ? YOU_COLOR : skinOf(snake).color;
    const width = world.cols * CELL;

    for (let i = 0; intro > 0 && i < 2; i++) {
        const t = (now / 750 + i / 2) % 1;
        ctx.globalAlpha = intro * (1 - t) * 0.85;
        ctx.strokeStyle = tagColor;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(head.x, head.y, CELL * (0.9 + t * 2.4), 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.font = TAG_FONT;
    const tagWidth = ctx.measureText(text).width + CELL;
    const tagHeight = CELL * 1.3;
    const below = putBelow || head.y < CELL * 2.6;
    const bounce = Math.sin(now / 160) * 2.5 * intro;
    const cy = head.y + (below ? CELL * 1.7 : -CELL * 1.7) + bounce * (below ? 1 : -1);
    const cx = Math.min(Math.max(head.x, tagWidth / 2 + 2), width - tagWidth / 2 - 2);
    const tipY = cy + (below ? -tagHeight / 2 - 4 : tagHeight / 2 + 4);

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = '#111118';
    ctx.strokeStyle = tagColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(cx - tagWidth / 2, cy - tagHeight / 2, tagWidth, tagHeight, tagHeight / 2);
    ctx.moveTo(head.x - 4, below ? cy - tagHeight / 2 : cy + tagHeight / 2);
    ctx.lineTo(head.x, tipY);
    ctx.lineTo(head.x + 4, below ? cy - tagHeight / 2 : cy + tagHeight / 2);
    ctx.fill();
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy + 0.5);
}

function drawFood(ctx, food, world, now, age, progress) {
    const from = food.from ?? food;
    const moved = Math.min(progress, 1);
    const cx = (from.x + (food.x - from.x) * moved) * CELL + CELL / 2;
    const cy = (from.y + (food.y - from.y) * moved) * CELL + CELL / 2;
    const pop = Math.min(1, age / 250);
    const grow = pop < 1 ? Math.max(easeOutBack(pop), 0.01) : 1;

    if (food.kind === 'power') {
        drawPowerUp(ctx, food, world, now, cx, cy, grow);
        return;
    }

    // Food, treats and a crashed worm's leftovers: little meals bobbing and swaying, fading away at the end.
    const emoji = foodEmoji(food);
    const { scale, opacity } = treatLook(food, world.time);
    const size = grow * scale;
    const bob = Math.sin(now / 260 + food.x) * 2;

    ctx.globalAlpha = 0.3 * opacity;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(cx, cy + CELL * 0.42 * size, CELL * 0.32 * size, CELL * 0.1 * size, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = opacity;
    ctx.save();
    ctx.translate(cx, cy - 1 + bob);
    ctx.rotate(Math.sin(now / 420 + food.x * 1.7) * 0.18);
    ctx.scale(size, size);
    ctx.font = EMOJI_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 0, 1);
    ctx.restore();
    ctx.globalAlpha = 1;
}

/**
 * A power-up: a dark glass orb with its icon, a colored glow, and two rings spinning around it.
 */
function drawPowerUp(ctx, food, world, now, cx, cy, grow) {
    // Without its look (an unknown power-up from a newer server), there's nothing to draw.
    if (!food.powerUp || (food.expiresAt - world.time < 2500 && Math.floor(now / 140) % 2 === 0)) {
        return;
    }
    const { color, emoji } = food.powerUp;
    const bob = Math.sin(now / 300 + food.x) * 1.5;
    const pulse = 1 + Math.sin(now / 240) * 0.1;
    const y = cy + bob;

    ctx.globalAlpha = 0.28;
    circle(ctx, cx, y, CELL * 1.05 * pulse * grow, color);
    ctx.globalAlpha = 0.9;
    circle(ctx, cx, y, CELL * 0.5 * grow, '#111118');
    ctx.globalAlpha = 1;

    const spin = now / 380;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (const offset of [0, Math.PI]) {
        ctx.beginPath();
        ctx.arc(cx, y, CELL * 0.62 * grow, spin + offset, spin + offset + 1.6);
        ctx.stroke();
    }

    ctx.save();
    ctx.translate(cx, y);
    ctx.scale(grow, grow);
    ctx.font = ORB_EMOJI_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 0, 1);
    ctx.restore();
}

/**
 * The arrow in front of your worm, pointing the way you're steering.
 */
function drawAim(ctx, arrow) {
    ctx.save();
    ctx.translate(arrow.x, arrow.y);
    ctx.rotate(arrow.angle);
    ctx.beginPath();
    arrow.corners.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = STEER_COLOR;
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = STEER_OUTLINE;
    ctx.stroke();
    ctx.restore();
}

/**
 * The touch joystick: an orange ring where the finger went down, and a knob that follows the finger.
 */
function drawStick(ctx, shape) {
    ctx.globalAlpha = 0.12;
    circle(ctx, shape.x, shape.y, shape.radius, '#000000');
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = STEER_COLOR;
    ctx.lineWidth = shape.radius * 0.07;
    ctx.beginPath();
    ctx.arc(shape.x, shape.y, shape.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    circle(ctx, shape.knobX, shape.knobY, shape.knobRadius, STEER_COLOR);
}

/**
 * The arena's edge: a red glow warning you near the wall and a red-and-white candy stripe around it.
 */
function drawWall(ctx, width, height) {
    const band = CELL * 1.6;
    for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [
        [0, 0, 0, band, 0, 0, width, band],
        [0, height, 0, height - band, 0, height - band, width, band],
        [0, 0, band, 0, 0, 0, band, height],
        [width, 0, width - band, 0, width - band, 0, band, height],
    ]) {
        const glow = ctx.createLinearGradient(x0, y0, x1, y1);
        glow.addColorStop(0, 'rgba(239, 68, 68, 0.22)');
        glow.addColorStop(1, 'rgba(239, 68, 68, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(rx, ry, rw, rh);
    }

    const thickness = CELL * 0.6;
    const inset = -thickness / 2;
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'butt';
    ctx.lineWidth = thickness + 3;
    ctx.strokeStyle = '#3f0d12';
    ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
    ctx.lineWidth = thickness;
    ctx.strokeStyle = '#ef4444';
    ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
    ctx.setLineDash([CELL * 0.7, CELL * 0.7]);
    ctx.strokeStyle = '#fff1f2';
    ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
    ctx.setLineDash([]);
    ctx.lineJoin = 'round';
}

/**
 * A small map of the whole field in the corner while zoomed in: every worm's head, yours ringed
 * in white, and a frame around the part you're looking at.
 */
function drawMinimap(ctx, world, points, me, view, fieldWidth, fieldHeight, opacity, width, height) {
    // The map has the field's shape and sits in the bottom corner of the canvas.
    const mapHeight = Math.min(height * 0.3, (Math.min(width * 0.22, 190) * fieldHeight) / fieldWidth);
    const mapWidth = (mapHeight * fieldWidth) / fieldHeight;
    const x0 = width - mapWidth - 12;
    const y0 = height - mapHeight - 12;
    const s = mapWidth / fieldWidth;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = 'rgba(10, 10, 16, 0.72)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x0, y0, mapWidth, mapHeight, 8);
    ctx.fill();
    ctx.stroke();
    ctx.clip();

    for (const food of world.foods) {
        if (food.kind === 'fruit' || food.kind === 'power') {
            circle(ctx, x0 + (food.x + 0.5) * CELL * s, y0 + (food.y + 0.5) * CELL * s, 1.6, food.kind === 'power' ? food.powerUp.color : '#fde68a');
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
            circle(ctx, x0 + head.x * s, y0 + head.y * s, radius + 1.8, '#ffffff');
        }
        circle(ctx, x0 + head.x * s, y0 + head.y * s, radius, skinOf(snake).color);
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x0 + view.left * s, y0 + view.top * s, view.width * s, view.height * s);
    ctx.restore();
}

/**
 * One square of the speckled terrazzo floor, drawn once at `resolution` pixels per board pixel.
 * Chips near an edge are drawn again on the far side so the tile repeats without seams.
 */
function drawFloorTile(resolution) {
    const tile = document.createElement('canvas');
    tile.width = tile.height = Math.round(FLOOR_TILE * resolution);
    const ctx = tile.getContext('2d');
    ctx.scale(resolution, resolution);

    ctx.fillStyle = FLOOR_COLOR;
    ctx.fillRect(0, 0, FLOOR_TILE, FLOOR_TILE);
    for (const chip of floorChips()) {
        ctx.globalAlpha = chip.alpha;
        ctx.fillStyle = chip.color;
        for (const dx of [-FLOOR_TILE, 0, FLOOR_TILE]) {
            for (const dy of [-FLOOR_TILE, 0, FLOOR_TILE]) {
                ctx.beginPath();
                chip.corners.forEach(([x, y], i) => (i ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy)));
                ctx.closePath();
                ctx.fill();
            }
        }
    }
    return tile;
}

function drawVignette(width, height, scale) {
    const vignette = document.createElement('canvas');
    vignette.width = width * scale;
    vignette.height = height * scale;

    const ctx = vignette.getContext('2d');
    ctx.scale(scale, scale);
    const gradient = ctx.createRadialGradient(width / 2, height / 2, height * 0.5, width / 2, height / 2, width * 0.75);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.38)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    return vignette;
}

/** Fill a closed shape through the corners, in the current fill style. */
function polygon(ctx, corners) {
    ctx.beginPath();
    corners.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
}

/** Fill many circles ([x, y, radius] each) as one shape, in one color. */
function fillCircles(ctx, circles, color, alpha = 1) {
    if (!circles.length) {
        return;
    }
    const shape = new Path2D();
    for (const [x, y, radius] of circles) {
        shape.moveTo(x + radius, y);
        shape.arc(x, y, Math.max(radius, 0), 0, Math.PI * 2);
    }
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fill(shape);
    ctx.globalAlpha = 1;
}

function circle(ctx, x, y, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(radius, 0), 0, Math.PI * 2);
    ctx.fill();
}

function easeOutBack(t) {
    const overshoot = 1.7;
    return 1 + (overshoot + 1) * (t - 1) ** 3 + overshoot * (t - 1) ** 2;
}

function easeOutCubic(t) {
    return 1 - (1 - t) ** 3;
}
