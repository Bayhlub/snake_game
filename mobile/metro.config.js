const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// The game rules (world, bots, steering, config) are shared with the web game in the Laravel app.
config.watchFolders = [path.resolve(__dirname, '../resources/js/snake')];

module.exports = config;
