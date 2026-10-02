// Seeded pseudo-random numbers (mulberry32). A generated puzzle is reproducible
// from its seed, which is what makes generator tests deterministic and lets the
// seed double as the puzzle's identity.

export function createRandom(seed = 0) {
    let state = seed >>> 0;

    function next() {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;

        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    return {
        next,
        /** Integer in [0, n). */
        int(n) {
            return Math.floor(next() * n);
        },
        pick(array) {
            return array[Math.floor(next() * array.length)];
        },
        /** A shuffled copy; the input is left alone. */
        shuffle(array) {
            const out = [...array];

            for (let i = out.length - 1; i > 0; i--) {
                const j = Math.floor(next() * (i + 1));

                [out[i], out[j]] = [out[j], out[i]];
            }

            return out;
        }
    };
}
