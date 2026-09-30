import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { BOTS, POWER_UPS } from '../../resources/js/snake/config.js';
import { describeBotCrash, describePlayerCrash, pickLanguage, translator } from '../../resources/js/snake/i18n.js';

const en = translator('en');
const lo = translator('lo');

describe('translations', () => {
    test('every English text has a Lao translation with the same placeholders', async () => {
        const source = await import('node:fs').then((fs) => fs.readFileSync(new URL('../../resources/js/snake/i18n.js', import.meta.url), 'utf8'));
        const keys = [...source.matchAll(/^ {8}'?([\w.]+)'?: /gm)].map((match) => match[1]);
        const englishKeys = new Set(keys.slice(0, keys.length / 2));

        for (const key of englishKeys) {
            const english = en(key);
            const lao = lo(key);
            assert.notEqual(lao, key, `Lao is missing "${key}"`);
            const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
            assert.deepEqual(placeholders(lao), placeholders(english), `placeholders differ for "${key}"`);
        }
    });

    test('every power-up and computer snake has a name in both languages', () => {
        for (const t of [en, lo]) {
            for (const powerUp of POWER_UPS) {
                assert.doesNotMatch(t(`powerUp.${powerUp.type}`), /^powerUp\./);
                assert.doesNotMatch(t(`powerUpHelp.${powerUp.type}`), /^powerUpHelp\./);
            }
            for (const bot of BOTS) {
                assert.doesNotMatch(t(`name.${bot.name}`), /^name\./);
            }
        }
    });

    test('placeholders are filled in', () => {
        assert.equal(en('saved', { rank: 3 }), 'Saved! You are #3 on the leaderboard.');
        assert.match(lo('saved', { rank: 3 }), /3/);
    });

    test('crash messages use translated snake names', () => {
        const mango = { name: 'Mango', isPlayer: false };
        const player = { name: 'You', isPlayer: true };

        assert.equal(describePlayerCrash(en, { type: 'headOn', other: mango }), 'Head-on crash with Mango!');
        assert.equal(describePlayerCrash(lo, { type: 'hit', other: mango }), 'ທ່ານແລ່ນຕຳ ໝາກມ່ວງ.');
        assert.equal(describeBotCrash(en, mango, { type: 'hit', other: player }), 'Mango ran into you!');
        assert.equal(describeBotCrash(lo, mango, { type: 'wall' }), 'ໝາກມ່ວງ ຕຳກຳແພງ');
    });

    test('the saved choice wins; otherwise Lao devices get Lao', () => {
        assert.equal(pickLanguage('en', ['lo-LA']), 'en');
        assert.equal(pickLanguage(null, ['lo-LA', 'en-US']), 'lo');
        assert.equal(pickLanguage(null, ['th-TH', 'en-US']), 'en');
        assert.equal(pickLanguage('xx', []), 'en');
    });
});
