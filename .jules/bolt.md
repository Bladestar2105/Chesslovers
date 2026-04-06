## 2024-05-18 - React Performance & Mutable Objects (chess.js)

**Learning:** When trying to optimize re-renders using `useMemo` in React, relying on a mutated object instance (like `new Chess()` from `chess.js`) as a dependency is an anti-pattern. Since the object reference doesn't change when a move is made, the `useMemo` hook won't trigger a recalculation, leading to stale state bugs.

**Action:** Always use a primitive value that accurately represents the current state as the dependency. For `chess.js`, use the `fen` string (which changes on every board modification) instead of the `chess` object itself in dependency arrays.

## 2024-05-18 - Matchmaking Queue Optimization

**Learning:** Using an `Array` for a matchmaking queue leads to O(N) deletion performance, which can become a bottleneck under high traffic. While `Array.from(map.values()).find()` is a functional equivalent for searching, it introduces O(N) space allocation on every call.

**Action:** Use a `Map` keyed by a unique identifier (like `socketId`) to achieve O(1) deletion. For searching by other criteria (like `timeControl`), iterate over the map values using a `for...of` loop to maintain O(N) time complexity while avoiding unnecessary memory allocations.