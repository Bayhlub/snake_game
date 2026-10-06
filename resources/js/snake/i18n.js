/**
 * Every piece of text in the game, in English and Lao. Shared by the web game and the mobile app.
 * `{name}` placeholders are filled in by the translate function.
 */
export const LANGUAGES = [
    { code: 'en', label: 'EN', name: 'English' },
    { code: 'lo', label: 'ລາວ', name: 'ພາສາລາວ' },
];

const MESSAGES = {
    en: {
        title: 'Snake',
        tagline: "Eat food and treats, grow long, and don't crash into the other snakes.",
        language: 'Language',
        soundOn: '🔊 Sound on',
        soundOff: '🔇 Sound off',
        installApp: '📲 Install app',
        pause: '⏸ Pause',

        score: 'Score',
        length: 'Length',
        best: 'Best',
        snakes: 'Snakes',

        ready: 'Ready?',
        startGame: 'Start game',
        orPress: 'or press',
        orArrowKey: 'or an arrow key',
        paused: 'Paused',
        resume: 'Resume',
        gameOver: 'Game over',
        newBest: '🏆 New best score!',
        yourName: 'Your name',
        saveScore: 'Save score',
        playAgain: 'Play again',

        saving: 'Saving…',
        saved: 'Saved! You are #{rank} on the leaderboard.',
        typeName: 'Please type your name first.',
        tooManySaves: 'Too many saves. Wait a minute and try again.',
        noServer: 'Could not reach the server. Try again.',
        saveFailed: 'Could not save your score.',
        nameInvalid: 'Please use a name of up to 20 characters.',

        hitWall: 'You hit the wall.',
        headOnWith: 'Head-on crash with {name}!',
        ranInto: 'You ran into {name}.',
        botHitWall: '{bot} hit the wall',
        botHeadOn: '{bot} crashed head-on with {other}',
        botRanInto: '{bot} ran into {other}',
        you: 'you',
        youExclaim: 'you!',
        youTag: 'YOU',

        powerUpGot: '{emoji} {label}!',
        shieldSaved: '🛡️ Your shield saved you!',
        powerUpEnded: '{label} wore off',

        steerMouse: '🖱️ Move your mouse over the board to steer, or use',
        pauseKey: 'pause',
        soundKey: 'sound',
        steerTouch: '👆 Put a finger anywhere on the board and drag the way you want to go, like a joystick.',

        playOnline: '🌐 Play online',
        joinTitle: 'Play online',
        joinHint: 'Everyone who joins plays on one board, with the computer snakes.',
        join: 'Join',
        back: 'Back',
        leave: 'Leave',
        mode: 'Game mode',
        offline: 'Offline',
        online: 'Online',
        connecting: 'Connecting…',
        wakingUp: 'Waking up the game server… this can take up to a minute.',
        serverOffline: 'Could not reach the game server. Is it running?',
        serverFull: 'The game is full. Try again later.',
        disconnected: 'Lost connection to the online game.',
        onlineNow: '🌐 Playing now',
        serverAddress: 'Server address',

        topTen: '🏆 Top 10',
        noScores: 'No scores yet. Be the first!',
        onThisPhone: 'Scores saved on this phone.',
        loading: 'Loading…',
        leaderboardFailed: 'Could not load the leaderboard.',
        tryAgain: 'Try again',

        howToPlay: 'How to play',
        food: 'Food',
        fruitFades: 'Treats disappear after a few seconds.',
        crashRule: 'Hit a wall or another snake: game over.',
        crossRule: 'Crossing your own body is safe.',
        botRule: 'If another snake runs into you, it crashes and turns into a trail of treats (+2 each).',
        powerUps: 'Power-ups',
        powerUpsFade: 'They glow, spin and vanish if you wait too long.',

        'powerUp.shield': 'Shield',
        'powerUp.magnet': 'Magnet',
        'powerUp.slow': 'Slow-mo',
        'powerUp.ghost': 'Ghost',
        'powerUpHelp.shield': 'survive one crash.',
        'powerUpHelp.magnet': 'pulls nearby food to you.',
        'powerUpHelp.slow': 'slows the whole game down.',
        'powerUpHelp.ghost': 'pass through other snakes.',

        'name.Mango': 'Mango',
        'name.Grape': 'Grape',
        'name.Sky': 'Sky',
        'name.Rose': 'Rose',
        'name.Berry': 'Berry',
        'name.Coco': 'Coco',

        boardLabel: 'Snake game board. Touch and drag to steer.',

        pickWorm: 'Pick your worm',
        zoomIn: 'Zoom in',
        zoomOut: 'Zoom out',
        zoomHint: 'Scroll, pinch or use + and − to zoom.',
        zoomHintTouch: 'Pinch with two fingers or tap + and − to zoom.',
        'skin.mint': 'Mint',
        'skin.gears': 'Gears',
        'skin.candy': 'Candy',
        'skin.bee': 'Bee',
        'skin.galaxy': 'Galaxy',
        'skin.ocean': 'Ocean',
        'skin.bubblegum': 'Bubblegum',
        'skin.rainbow': 'Rainbow',
        'skin.lava': 'Lava',
        'skin.zebra': 'Zebra',
    },

    lo: {
        title: 'ເກມງູ',
        tagline: 'ກິນອາຫານ ແລະ ຂອງແຊບ ໃຫ້ໂຕຍາວຂຶ້ນ ແລະ ຢ່າຕຳງູໂຕອື່ນ.',
        language: 'ພາສາ',
        soundOn: '🔊 ເປີດສຽງ',
        soundOff: '🔇 ປິດສຽງ',
        installApp: '📲 ຕິດຕັ້ງແອັບ',
        pause: '⏸ ຢຸດ',

        score: 'ຄະແນນ',
        length: 'ຄວາມຍາວ',
        best: 'ສູງສຸດ',
        snakes: 'ງູ',

        ready: 'ພ້ອມແລ້ວບໍ?',
        startGame: 'ເລີ່ມເກມ',
        orPress: 'ຫຼື ກົດ',
        orArrowKey: 'ຫຼື ປຸ່ມລູກສອນ',
        paused: 'ຢຸດຊົ່ວຄາວ',
        resume: 'ຫຼິ້ນຕໍ່',
        gameOver: 'ເກມຈົບແລ້ວ',
        newBest: '🏆 ຄະແນນສູງສຸດໃໝ່!',
        yourName: 'ຊື່ຂອງທ່ານ',
        saveScore: 'ບັນທຶກຄະແນນ',
        playAgain: 'ຫຼິ້ນອີກຄັ້ງ',

        saving: 'ກຳລັງບັນທຶກ…',
        saved: 'ບັນທຶກແລ້ວ! ທ່ານຢູ່ອັນດັບທີ {rank} ໃນຕາຕະລາງຄະແນນ.',
        typeName: 'ກະລຸນາພິມຊື່ຂອງທ່ານກ່ອນ.',
        tooManySaves: 'ບັນທຶກຫຼາຍເກີນໄປ. ກະລຸນາລໍຖ້າໜຶ່ງນາທີ ແລ້ວລອງໃໝ່.',
        noServer: 'ເຊື່ອມຕໍ່ເຊີບເວີບໍ່ໄດ້. ກະລຸນາລອງໃໝ່.',
        saveFailed: 'ບັນທຶກຄະແນນບໍ່ໄດ້.',
        nameInvalid: 'ກະລຸນາໃຊ້ຊື່ທີ່ຍາວບໍ່ເກີນ 20 ຕົວອັກສອນ.',

        hitWall: 'ທ່ານຕຳກຳແພງ.',
        headOnWith: 'ຕຳຫົວກັບ {name}!',
        ranInto: 'ທ່ານແລ່ນຕຳ {name}.',
        botHitWall: '{bot} ຕຳກຳແພງ',
        botHeadOn: '{bot} ຕຳຫົວກັບ {other}',
        botRanInto: '{bot} ແລ່ນຕຳ {other}',
        you: 'ທ່ານ',
        youExclaim: 'ທ່ານ!',
        youTag: 'ທ່ານ',

        powerUpGot: '{emoji} {label}!',
        shieldSaved: '🛡️ ໂລ່ປ້ອງກັນຊ່ວຍທ່ານໄວ້!',
        powerUpEnded: '{label} ໝົດເວລາແລ້ວ',

        steerMouse: '🖱️ ເລື່ອນເມົ້າເທິງກະດານເພື່ອບັງຄັບ, ຫຼື ໃຊ້',
        pauseKey: 'ຢຸດ',
        soundKey: 'ສຽງ',
        steerTouch: '👆 ແຕະບ່ອນໃດກໍໄດ້ເທິງກະດານ ແລ້ວລາກໄປທາງທີ່ຢາກໄປ ຄືກັບຈອຍສະຕິກ.',

        playOnline: '🌐 ຫຼິ້ນອອນລາຍ',
        joinTitle: 'ຫຼິ້ນອອນລາຍ',
        joinHint: 'ທຸກຄົນທີ່ເຂົ້າຮ່ວມ ຫຼິ້ນຢູ່ກະດານດຽວກັນ ພ້ອມກັບງູຄອມພິວເຕີ.',
        join: 'ເຂົ້າຮ່ວມ',
        back: 'ກັບຄືນ',
        leave: 'ອອກ',
        mode: 'ໂໝດເກມ',
        offline: 'ອອບລາຍ',
        online: 'ອອນລາຍ',
        connecting: 'ກຳລັງເຊື່ອມຕໍ່…',
        wakingUp: 'ກຳລັງປຸກເຊີບເວີເກມ… ອາດໃຊ້ເວລາເຖິງໜຶ່ງນາທີ.',
        serverOffline: 'ເຊື່ອມຕໍ່ເຊີບເວີເກມບໍ່ໄດ້. ເປີດເຊີບເວີແລ້ວບໍ?',
        serverFull: 'ເກມເຕັມແລ້ວ. ກະລຸນາລອງໃໝ່ພາຍຫຼັງ.',
        disconnected: 'ການເຊື່ອມຕໍ່ເກມອອນລາຍຂາດ.',
        onlineNow: '🌐 ກຳລັງຫຼິ້ນ',
        serverAddress: 'ທີ່ຢູ່ເຊີບເວີ',

        topTen: '🏆 10 ອັນດັບສູງສຸດ',
        noScores: 'ຍັງບໍ່ມີຄະແນນ. ມາເປັນຄົນທຳອິດເລີຍ!',
        onThisPhone: 'ຄະແນນທີ່ບັນທຶກໄວ້ໃນໂທລະສັບນີ້.',
        loading: 'ກຳລັງໂຫຼດ…',
        leaderboardFailed: 'ໂຫຼດຕາຕະລາງຄະແນນບໍ່ໄດ້.',
        tryAgain: 'ລອງໃໝ່',

        howToPlay: 'ວິທີຫຼິ້ນ',
        food: 'ອາຫານ',
        fruitFades: 'ຂອງແຊບຈະຫາຍໄປພາຍໃນສອງສາມວິນາທີ.',
        crashRule: 'ຕຳກຳແພງ ຫຼື ງູໂຕອື່ນ: ເກມຈົບ.',
        crossRule: 'ຂ້າມຕົວເອງໄດ້ ບໍ່ເປັນຫຍັງ.',
        botRule: 'ຖ້າງູໂຕອື່ນແລ່ນມາຕຳທ່ານ, ມັນຈະຕາຍ ແລະ ກາຍເປັນຂອງແຊບ (+2 ແຕ່ລະອັນ).',
        powerUps: 'ພະລັງພິເສດ',
        powerUpsFade: 'ພວກມັນຈະເຫຼື້ອມ, ໝູນ ແລະ ຫາຍໄປ ຖ້າລໍຖ້າດົນເກີນໄປ.',

        'powerUp.shield': 'ໂລ່ປ້ອງກັນ',
        'powerUp.magnet': 'ແມ່ເຫຼັກ',
        'powerUp.slow': 'ຊ້າລົງ',
        'powerUp.ghost': 'ຜີ',
        'powerUpHelp.shield': 'ລອດຈາກການຕຳໄດ້ໜຶ່ງຄັ້ງ.',
        'powerUpHelp.magnet': 'ດຶງອາຫານທີ່ຢູ່ໃກ້ມາຫາທ່ານ.',
        'powerUpHelp.slow': 'ເຮັດໃຫ້ເກມທັງໝົດຊ້າລົງ.',
        'powerUpHelp.ghost': 'ຜ່ານງູໂຕອື່ນໄດ້.',

        'name.Mango': 'ໝາກມ່ວງ',
        'name.Grape': 'ອະງຸ່ນ',
        'name.Sky': 'ຟ້າ',
        'name.Rose': 'ກຸຫຼາບ',
        'name.Berry': 'ເບີຣີ',
        'name.Coco': 'ໝາກພ້າວ',

        boardLabel: 'ກະດານເກມງູ. ແຕະແລ້ວລາກເພື່ອບັງຄັບ.',

        pickWorm: 'ເລືອກໜອນຂອງທ່ານ',
        zoomIn: 'ຊູມເຂົ້າ',
        zoomOut: 'ຊູມອອກ',
        zoomHint: 'ເລື່ອນ, ບີບນິ້ວ ຫຼື ກົດ + ແລະ − ເພື່ອຊູມ.',
        zoomHintTouch: 'ບີບສອງນິ້ວ ຫຼື ແຕະ + ແລະ − ເພື່ອຊູມ.',
        'skin.mint': 'ມິ້ນ',
        'skin.gears': 'ເຟືອງ',
        'skin.candy': 'ເຂົ້າໜົມຫວານ',
        'skin.bee': 'ເຜິ້ງ',
        'skin.galaxy': 'ກາແລັກຊີ',
        'skin.ocean': 'ມະຫາສະໝຸດ',
        'skin.bubblegum': 'ສີບົວ',
        'skin.rainbow': 'ຮຸ້ງ',
        'skin.lava': 'ລາວາ',
        'skin.zebra': 'ມ້າລາຍ',
    },
};

/**
 * A translate function for one language. Missing keys fall back to English, then to the key itself.
 */
export function translator(language) {
    const table = MESSAGES[language] ?? MESSAGES.en;
    return (key, params = {}) =>
        (table[key] ?? MESSAGES.en[key] ?? key).replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

/**
 * The saved choice if there is one, otherwise Lao for Lao-language devices and English for everyone else.
 */
export function pickLanguage(saved, deviceLanguages = []) {
    if (saved && saved in MESSAGES) {
        return saved;
    }
    return deviceLanguages.some((code) => String(code).toLowerCase().startsWith('lo')) ? 'lo' : 'en';
}

/**
 * A snake's name to show: players (online) by the name they typed, bots by their translated name.
 */
function snakeName(t, snake) {
    if (!snake) {
        return '?';
    }
    return snake.isPlayer ? snake.name : t(`name.${snake.name}`);
}

/**
 * The crash message shown on the game-over screen.
 */
export function describePlayerCrash(t, cause) {
    if (cause.type === 'wall') {
        return t('hitWall');
    }
    return t(cause.type === 'headOn' ? 'headOnWith' : 'ranInto', { name: snakeName(t, cause.other) });
}

/**
 * The short message when another snake crashes. `me` is the player on this device (solo: the player).
 */
export function describeBotCrash(t, snake, cause, me = null) {
    const name = snakeName(t, snake);
    const isMe = (other) => other && (me ? other === me : other.isPlayer);
    if (cause.type === 'wall') {
        return t('botHitWall', { bot: name });
    }
    if (cause.type === 'headOn') {
        return t('botHeadOn', { bot: name, other: isMe(cause.other) ? t('you') : snakeName(t, cause.other) });
    }
    return t('botRanInto', { bot: name, other: isMe(cause.other) ? t('youExclaim') : snakeName(t, cause.other) });
}
