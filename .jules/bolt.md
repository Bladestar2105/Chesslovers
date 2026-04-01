## 2024-05-18 - React Performance & Mutable Objects (chess.js)

**Learning:** When trying to optimize re-renders using `useMemo` in React, relying on a mutated object instance (like `new Chess()` from `chess.js`) as a dependency is an anti-pattern. Since the object reference doesn't change when a move is made, the `useMemo` hook won't trigger a recalculation, leading to stale state bugs.

**Action:** Always use a primitive value that accurately represents the current state as the dependency. For `chess.js`, use the `fen` string (which changes on every board modification) instead of the `chess` object itself in dependency arrays.