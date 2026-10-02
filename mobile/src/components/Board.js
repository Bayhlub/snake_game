import { Canvas, Picture } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '../theme';

/**
 * The game board. It redraws every animation frame and, while `steerable` (a game is running),
 * steers the snake toward the finger touching it.
 *
 * It only claims touches that start on the board itself. Claiming on move as well would steal a
 * slightly wobbly tap from the Start / Resume / Play again buttons on top of it and cancel the press.
 * It also always lets go when another control asks: if a finger's "lift" ever went missing
 * (the snake dying mid-drag), refusing would leave every button on screen dead.
 */
export function Board({ game, width, cols, rows, label, steerable, children }) {
    const height = (width * rows) / cols;
    const [picture, setPicture] = useState(null);

    useEffect(() => {
        let frameId;
        const loop = () => {
            setPicture(game.frame(performance.now(), width, height));
            frameId = requestAnimationFrame(loop);
        };
        frameId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(frameId);
    }, [game, width, height]);

    const toCell = (event) => ({
        x: Math.min(cols - 1, Math.max(0, Math.floor((event.nativeEvent.locationX / width) * cols))),
        y: Math.min(rows - 1, Math.max(0, Math.floor((event.nativeEvent.locationY / height) * rows))),
    });
    const release = () => game.steerTo(null);

    // Stop steering as soon as the game stops, even if the finger is still down.
    useEffect(() => {
        if (!steerable) {
            game.steerTo(null);
        }
    }, [game, steerable]);

    return (
        <View style={styles.frame}>
            <View
                style={[styles.board, { width, height }]}
                onStartShouldSetResponder={() => steerable}
                onResponderTerminationRequest={() => true}
                onResponderGrant={(event) => steerable && game.steerTo(toCell(event))}
                onResponderMove={(event) => steerable && game.steerTo(toCell(event))}
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
            </View>
        </View>
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
    board: {
        borderRadius: 15,
        overflow: 'hidden',
        backgroundColor: '#0d2016',
    },
});
