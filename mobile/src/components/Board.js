import { Canvas, Picture } from '@shopify/react-native-skia';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { followStick } from '../game/shared';
import { colors, fonts } from '../theme';

/** Each +/− press zooms by this much. */
const ZOOM_STEP = 1.25;

/**
 * The game board. It redraws every animation frame and, while `steerable` (a game is running), works
 * as a joystick like Worms Zone: put a finger down anywhere and drag the way the worm should go.
 * Two fingers zoom the camera in and out, as do the
 * + and − buttons shown while `zoomable`; `onZoom(zoom)` reports the new zoom so it can be remembered.
 *
 * It only claims touches that start on the board itself. Claiming on move as well would steal a
 * slightly wobbly tap from the Start / Resume / Play again buttons on top of it and cancel the press.
 * It also always lets go when another control asks: if a finger's "lift" ever went missing
 * (the snake dying mid-drag), refusing would leave every button on screen dead.
 */
export function Board({ game, width, cols, rows, label, steerable, zoomable, zoomLabels, onZoom, children }) {
    const height = (width * rows) / cols;
    const [picture, setPicture] = useState(null);
    /** While two fingers are down: how far apart they started and the zoom then. */
    const pinch = useRef(null);
    /** While one finger steers: where it went down, on the board and on the screen. */
    const stick = useRef(null);

    useEffect(() => {
        let frameId;
        const loop = () => {
            setPicture(game.frame(performance.now(), width, height));
            frameId = requestAnimationFrame(loop);
        };
        frameId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(frameId);
    }, [game, width, height]);

    const stopStick = () => {
        stick.current = null;
        game.steerStick(null);
    };
    const touch = (event) => {
        if (!steerable) {
            return;
        }
        const touches = event.nativeEvent.touches ?? [];
        if (touches.length >= 2) {
            const spread = Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY) || 1;
            if (!pinch.current) {
                pinch.current = { spread, zoom: game.zoom };
            } else {
                game.setZoom(pinch.current.zoom * (spread / pinch.current.spread));
            }
            stopStick();
            return;
        }
        // After a pinch, wait for every finger to lift before steering again.
        if (pinch.current) {
            return;
        }
        const { locationX, locationY, pageX, pageY } = event.nativeEvent;
        if (!stick.current) {
            const at = { fx: Math.min(1, Math.max(0, locationX / width)), fy: Math.min(1, Math.max(0, locationY / height)) };
            stick.current = { base: at, origin: { ...at, pageX, pageY } };
        }
        // Measured from where the finger went down, so it can wander past the board's edge.
        const { origin } = stick.current;
        const knob = { fx: origin.fx + (pageX - origin.pageX) / width, fy: origin.fy + (pageY - origin.pageY) / height };
        stick.current.base = followStick(stick.current.base, knob, cols, rows);
        game.steerStick({ base: stick.current.base, knob });
    };
    const release = () => {
        if (pinch.current) {
            pinch.current = null;
            onZoom?.(game.zoom);
        }
        stopStick();
    };
    const zoomBy = (factor) => {
        game.setZoom(game.zoom * factor);
        onZoom?.(game.zoom);
    };

    // Stop steering as soon as the game stops, even if the finger is still down.
    useEffect(() => {
        if (!steerable) {
            stick.current = null;
            game.steerStick(null);
        }
    }, [game, steerable]);

    return (
        <View style={styles.frame}>
            <View
                style={[styles.board, { width, height }]}
                onStartShouldSetResponder={() => steerable}
                onResponderTerminationRequest={() => true}
                onResponderGrant={touch}
                onResponderMove={touch}
                onResponderRelease={release}
                onResponderTerminate={release}
                accessibilityLabel={label}
            >
                <View style={[StyleSheet.absoluteFill, styles.passThrough]}>
                    {picture && (
                        <Canvas style={{ width, height }}>
                            <Picture picture={picture} />
                        </Canvas>
                    )}
                </View>
                {children}
                {zoomable && (
                    <View style={styles.zoom}>
                        <ZoomButton label="+" accessibilityLabel={zoomLabels.zoomIn} onPress={() => zoomBy(ZOOM_STEP)} />
                        <ZoomButton label="−" accessibilityLabel={zoomLabels.zoomOut} onPress={() => zoomBy(1 / ZOOM_STEP)} />
                    </View>
                )}
            </View>
        </View>
    );
}

function ZoomButton({ label, accessibilityLabel, onPress }) {
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            hitSlop={4}
            style={({ pressed }) => [styles.zoomButton, pressed && styles.zoomPressed]}
        >
            <Text style={styles.zoomText}>{label}</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    frame: {
        alignSelf: 'center',
        padding: 3,
        borderRadius: 18,
        backgroundColor: 'rgba(110, 231, 183, 0.55)',
        boxShadow: `0 0 28px ${colors.emerald}80`,
    },
    passThrough: { pointerEvents: 'none' },
    zoom: { position: 'absolute', top: 8, right: 8, gap: 6 },
    zoomButton: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.25)',
    },
    zoomPressed: { backgroundColor: 'rgba(0, 0, 0, 0.8)' },
    zoomText: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 22, color: '#ffffff' },
    board: {
        borderRadius: 15,
        overflow: 'hidden',
        backgroundColor: '#07070b',
    },
});
