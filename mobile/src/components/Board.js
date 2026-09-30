import { Canvas, Picture } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { COLS, ROWS } from '../game/shared';
import { colors } from '../theme';

/**
 * The game board. It redraws every animation frame and steers the snake toward the finger
 * while it is touching the board.
 */
export function Board({ game, width, children }) {
    const height = (width * ROWS) / COLS;
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
        x: Math.min(COLS - 1, Math.max(0, Math.floor((event.nativeEvent.locationX / width) * COLS))),
        y: Math.min(ROWS - 1, Math.max(0, Math.floor((event.nativeEvent.locationY / height) * ROWS))),
    });
    const release = () => game.steerTo(null);

    return (
        <View style={styles.frame}>
            <View
                style={[styles.board, { width, height }]}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderTerminationRequest={() => false}
                onResponderGrant={(event) => game.steerTo(toCell(event))}
                onResponderMove={(event) => game.steerTo(toCell(event))}
                onResponderRelease={release}
                onResponderTerminate={release}
                accessibilityLabel="Snake game board. Touch and drag to steer."
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
