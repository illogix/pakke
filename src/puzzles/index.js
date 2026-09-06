// Every puzzle in this directory, collected at build time and sorted by id.
// Vite inlines them into the bundle, so nothing is fetched at runtime — a
// "file" here is an authoring convenience, not something the game loads.
//
// Sorting on id means ids double as play order, so zero-pad them (coffin01,
// not coffin1) or a set orders 1, 10, 2, 3.

const modules = import.meta.glob('./*.json', { eager: true, import: 'default' });

export const puzzles = Object.values(modules).sort((a, b) => a.id.localeCompare(b.id));

export function puzzleById(id) {
    return puzzles.find((def) => def.id === id);
}

export function nextPuzzle(id) {
    const index = puzzles.findIndex((def) => def.id === id);

    return index >= 0 && index < puzzles.length - 1 ? puzzles[index + 1] : null;
}
