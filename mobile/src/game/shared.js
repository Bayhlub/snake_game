// The game rules and texts are the same files the web game uses; only drawing, sound and input are app-specific.
export * from '../../../resources/js/snake/config.js';
export * from '../../../resources/js/snake/camera.js';
export * from '../../../resources/js/snake/look.js';
export * from '../../../resources/js/snake/skins.js';
export { LANGUAGES, describeBotCrash, describePlayerCrash, pickLanguage, translator } from '../../../resources/js/snake/i18n.js';
export { connectOnline } from '../../../resources/js/snake/online.js';
export { activePowerUps, createWorld, getPlayer, isEffectActive, step, tickDuration } from '../../../resources/js/snake/world.js';
export { followStick, stickVector } from '../../../resources/js/snake/steering.js';
export { wrapAngle } from '../../../resources/js/snake/space.js';
