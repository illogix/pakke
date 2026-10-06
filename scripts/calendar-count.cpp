// Exact-cover counter used only by the calendar design study. No game runtime
// dependency. Each input row names a piece and the board cells it occupies.
// Board cells and piece identities are columns; covering every column once
// counts a tiling once, without identifying board rotations or reflections.
#include <algorithm>
#include <chrono>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <unordered_map>
#include <vector>

struct Placement { int piece; uint64_t cells; };

struct Hash {
    size_t operator()(uint64_t value) const {
        // Mix high bits too: late search states share most low board bits.
        value += 0x9e3779b97f4a7c15ULL;
        value = (value ^ (value >> 30)) * 0xbf58476d1ce4e5b9ULL;
        value = (value ^ (value >> 27)) * 0x94d049bb133111ebULL;
        return value ^ (value >> 31);
    }
};

class Counter {
    std::vector<int> left, right, up, down, column, size, row, chosen;
    std::vector<uint64_t> masks;
    std::unordered_map<uint64_t, uint64_t, Hash> memo;
    uint64_t limit;

    void cover(int col) {
        right[left[col]] = right[col];
        left[right[col]] = left[col];
        for (int i = down[col]; i != col; i = down[i]) {
            for (int j = right[i]; j != i; j = right[j]) {
                down[up[j]] = down[j];
                up[down[j]] = up[j];
                size[column[j]]--;
            }
        }
    }

    void uncover(int col) {
        for (int i = up[col]; i != col; i = up[i]) {
            for (int j = left[i]; j != i; j = left[j]) {
                size[column[j]]++;
                down[up[j]] = j;
                up[down[j]] = j;
            }
        }
        right[left[col]] = col;
        left[right[col]] = col;
    }

    bool add(uint64_t amount) {
        if (amount >= limit - count) {
            count = limit;
            return true;
        }
        count += amount;
        return false;
    }

public:
    uint64_t count = 0, nodes = 0;
    std::vector<int> witness;

    Counter(int cells, int pieces, const std::vector<Placement>& rows, uint64_t holes, uint64_t cap)
        : limit(cap) {
        if (cells < 1 || pieces < 1 || cells + pieces > 63 || cap == 0)
            throw std::runtime_error("Invalid dimensions or count limit");
        if (holes >> cells) throw std::runtime_error("Holes outside the board");
        const int cols = cells + pieces;
        int capacity = cols + 1;
        for (const auto& placement : rows) {
            if (placement.piece < 0 || placement.piece >= pieces || !placement.cells || placement.cells >> cells)
                throw std::runtime_error("Invalid placement");
            masks.push_back(placement.cells | (1ULL << (cells + placement.piece)));
            capacity += __builtin_popcountll(placement.cells) + 1;
        }
        left.resize(capacity); right.resize(capacity);
        up.resize(capacity); down.resize(capacity);
        column.resize(capacity); row.resize(capacity); size.resize(cols + 1);
        memo.reserve(cells >= 40 ? 262144 : 1024);
        for (int i = 0; i <= cols; i++) {
            left[i] = i - 1; right[i] = i + 1;
            up[i] = down[i] = column[i] = i;
        }
        left[0] = cols; right[cols] = 0;
        for (int i = 0; i < cells; i++) {
            if (!(holes & (1ULL << i))) continue;
            right[left[i + 1]] = right[i + 1];
            left[right[i + 1]] = left[i + 1];
        }
        int next = cols + 1;
        for (int i = 0; i < static_cast<int>(rows.size()); i++) {
            if (rows[i].cells & holes) continue;
            int first = -1;
            uint64_t mask = masks[i];
            while (mask) {
                int col = __builtin_ctzll(mask) + 1;
                mask &= mask - 1;
                int j = next++;
                column[j] = col; row[j] = i;
                up[j] = up[col]; down[j] = col;
                down[up[col]] = j; up[col] = j; size[col]++;
                if (first < 0) {
                    first = j; left[j] = right[j] = j;
                } else {
                    left[j] = left[first]; right[j] = first;
                    right[left[first]] = j; left[first] = j;
                }
            }
        }
    }

    // Each state consists of occupied board cells and used piece identities.
    // Its remaining subproblem is independent of the route used to reach it.
    // Cache fully searched suffixes; never cache a search stopped at the cap.
    bool search(uint64_t state = 0, int depth = 0) {
        nodes++;
        const uint64_t before = count;
        if (depth >= 5) {
            auto cached = memo.find(state);
            if (cached != memo.end()) return add(cached->second);
        }
        if (right[0] == 0) {
            if (witness.empty()) witness = chosen;
            return add(1);
        }
        int col = right[0];
        for (int j = right[col]; j != 0; j = right[j]) {
            if (size[j] < size[col]) col = j;
        }
        if (size[col] == 0) return false;
        cover(col);
        for (int i = down[col]; i != col; i = down[i]) {
            chosen.push_back(row[i]);
            for (int j = right[i]; j != i; j = right[j]) cover(column[j]);
            const bool stop = search(state | masks[row[i]], depth + 1);
            for (int j = left[i]; j != i; j = left[j]) uncover(column[j]);
            chosen.pop_back();
            if (stop) { uncover(col); return true; }
        }
        uncover(col);
        if (depth >= 5) memo.emplace(state, count - before);
        return false;
    }
};

int main(int argc, char** argv) {
    try {
        if (argc != 2) throw std::runtime_error("Usage: calendar-count INPUT");
        std::ifstream input(argv[1]);
        input.exceptions(std::ios::failbit | std::ios::badbit);
        int cells, pieces, rowCount;
        input >> cells >> pieces >> rowCount;
        if (rowCount < 0) throw std::runtime_error("Invalid row count");
        std::vector<Placement> rows(rowCount);
        for (auto& placement : rows) input >> placement.piece >> placement.cells;
        int jobs;
        input >> jobs;
        for (int job = 0; job < jobs; job++) {
            int key;
            uint64_t holes, cap;
            input >> key >> holes >> cap;
            const auto start = std::chrono::steady_clock::now();
            Counter counter(cells, pieces, rows, holes, cap);
            const bool stopped = counter.search(holes);
            std::cout << "{\"key\":" << key << ",\"count\":" << counter.count
                << ",\"exhausted\":" << (stopped ? "false" : "true")
                << ",\"nodes\":" << counter.nodes << ",\"ms\":"
                << std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - start).count()
                << ",\"witness\":[";
            for (int i = 0; i < static_cast<int>(counter.witness.size()); i++) {
                if (i) std::cout << ',';
                std::cout << counter.witness[i];
            }
            std::cout << "]}" << std::endl;
        }
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
