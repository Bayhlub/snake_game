// The game rules and texts are the same files the web game uses; only drawing, sound and input are app-specific.
export * from '../../../resources/js/snake/config.js';
export { LANGUAGES, describeBotCrash, describePlayerCrash, pickLanguage, translator } from '../../../resources/js/snake/i18n.js';
export { directionName } from '../../../resources/js/snake/net.js';
export { connectOnline } from '../../../resources/js/snake/online.js';
export { activePowerUps, createWorld, getPlayer, isEffectActive, isReverse, step, tickDuration } from '../../../resources/js/snake/world.js';
export { directionToward } from '../../../resources/js/snake/steering.js';
