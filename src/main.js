import Phaser from 'phaser';

import PlayScene from './scenes/PlayScene.js';
import { puzzleById, puzzles } from './puzzles/index.js';
import { theme } from './ui/theme.js';

// There is no menu yet, so `?puzzle=<id>` picks one and the first in id order is
// the default. A menu replaces this later, but the param is worth keeping as a
// way to link straight to a puzzle.
const requested = new URLSearchParams(window.location.search).get('puzzle');
const def = puzzleById(requested) ?? puzzles[0];

const config = {
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: theme.page,
    // The ScaleManager maps canvas to window and nothing else. Fitting a
    // puzzle's field inside that canvas is per-puzzle, so the scene owns it.
    scale: {
        mode: Phaser.Scale.RESIZE,
        width: '100%',
        height: '100%'
    },
    scene: []
};

const game = new Phaser.Game(config);

// Added rather than listed in `scene`, because the array form auto-starts the
// first scene with no data. The menu will hand over a definition the same way.
game.scene.add('Play', PlayScene, true, { def });

export default game;
