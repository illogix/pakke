import Phaser from 'phaser';

import GameScene from './scenes/GameScene.js';

const config = {
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#1b1b25',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 960,
        height: 540
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: [GameScene]
};

export default new Phaser.Game(config);
