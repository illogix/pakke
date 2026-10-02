import { describe, expect, it } from 'vitest';

import { deriveField, slack } from '../core/puzzle.js';
import { validatePuzzle, validateSet } from '../core/validate.js';
import { bundledPacks, nextPuzzle, puzzleById, puzzles } from './index.js';

// The sweep that actually keeps a broken puzzle from shipping. Everything the
// editor would warn about at authoring time is checked here at build time.

describe('the bundled set', () => {
    it('is not empty', () => {
        expect(puzzles.length).toBeGreaterThan(0);
    });

    it('has no duplicate ids', () => {
        expect(validateSet(puzzles).errors).toEqual([]);
    });

    it('uses explicit pack order and never advances into another pack', () => {
        expect(bundledPacks[0].puzzles.map(d => d.id)).toEqual(['first-fit', 'little-turn', 'other-side', 'demo01']);
        expect(nextPuzzle('other-side', 'first-steps').id).toBe('demo01');
        expect(nextPuzzle('demo01', 'first-steps')).toBeNull();
        expect(nextPuzzle('pent01', 'classics')).toBeNull();
    });

    it.each(puzzles.map((def) => [def.id, def]))('%s validates cleanly', (_id, def) => {
        expect(validatePuzzle(def).errors).toEqual([]);
    });

    it.each(puzzles.map((def) => [def.id, def]))('%s stores the field it derives', (_id, def) => {
        expect(def.field).toEqual(deriveField(def));
    });

    it.each(puzzles.map((def) => [def.id, def]))('%s has room for all its pieces', (_id, def) => {
        expect(slack(def)).toBeGreaterThanOrEqual(0);
    });
});

describe('pent01', () => {
    const def = puzzleById('pent01');

    it('is an exact fit: twelve pentominoes in sixty cells', () => {
        expect(def.pieces).toHaveLength(12);
        expect(slack(def)).toBe(0);
        expect(def.pieces.every((piece) => piece.cells.length === 5)).toBe(true);
    });

    it('allows flipping, since six of the pentominoes are chiral', () => {
        expect(def.rules.allowFlip).toBe(true);
    });
});

describe('demo01', () => {
    const def = puzzleById('demo01');

    it('has a locked piece to exercise that rendering', () => {
        expect(def.pieces.filter((piece) => piece.locked)).toHaveLength(1);
    });

    it('leaves spare room, so it is not an exact fit', () => {
        expect(slack(def)).toBe(4);
    });

    it('disallows flipping, so the flip control should stay hidden', () => {
        expect(def.rules.allowFlip).toBe(false);
    });
});
