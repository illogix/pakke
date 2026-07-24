import Phaser from 'phaser';

const PLAYER_SPEED = 320;

export default class GameScene extends Phaser.Scene {
    constructor() {
        super('Game');
    }

    create() {
        const { width, height } = this.scale;

        this.player = this.add.rectangle(width / 2, height / 2, 40, 40, 0x5ad1c8);
        this.physics.add.existing(this.player);
        this.player.body.setCollideWorldBounds(true);

        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys('W,A,S,D');

        this.add
            .text(width / 2, height - 32, 'Arrow keys or WASD to move', {
                fontFamily: 'monospace',
                fontSize: '16px',
                color: '#8a8aa3'
            })
            .setOrigin(0.5);
    }

    update() {
        const left = this.cursors.left.isDown || this.wasd.A.isDown;
        const right = this.cursors.right.isDown || this.wasd.D.isDown;
        const up = this.cursors.up.isDown || this.wasd.W.isDown;
        const down = this.cursors.down.isDown || this.wasd.S.isDown;

        const velocity = new Phaser.Math.Vector2(
            (right ? 1 : 0) - (left ? 1 : 0),
            (down ? 1 : 0) - (up ? 1 : 0)
        );

        // Normalize so diagonals are not faster than the cardinals.
        velocity.normalize().scale(PLAYER_SPEED);

        this.player.body.setVelocity(velocity.x, velocity.y);
    }
}
