// The game rules are the same files the web game uses; only drawing, sound and input are app-specific.
export * from '../../../resources/js/snake/config.js';
export { createWorld, getPlayer, isReverse, step, tickDuration } from '../../../resources/js/snake/world.js';
export { directionToward } from '../../../resources/js/snake/steering.js';
