import Phaser from 'phaser';
import PlayScene from './scenes/PlayScene.js';
import { Shell } from './app/shell.js';
import { setThemePreference, theme } from './ui/theme.js';
import { storage } from './app/storage.js';
import './style.css';

// Apply the preference mirror before Phaser boots; the library later supplies
// its authoritative value (including after a backup restore).
setThemePreference(storage.read('theme'));
const shell = new Shell();
const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
const host = document.querySelector('#game');
const game = new Phaser.Game({
    type: Phaser.AUTO, parent: 'game', backgroundColor: theme.page,
    // Native Pointer Events provide capture/cancel ownership across mouse and touch.
    input: { mouse: false, touch: false, keyboard: false },
    // ResizeObserver measures the DOM viewport; render at up to 2x for crisp mobile edges.
    scale: { parent: 'game', expandParent: false, mode: Phaser.Scale.NONE,
        width: host.clientWidth * pixelRatio, height: host.clientHeight * pixelRatio, zoom: 1 / pixelRatio },
    render: { antialias: true, roundPixels: false },
    scene: [],
    callbacks: { preBoot(game) { game.registry.set('shell',shell); game.registry.set('pixelRatio',pixelRatio); } }
});
game.scene.add('Play',PlayScene,false);
shell.connect(game);
export default game;
