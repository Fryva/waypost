Implement a dependency-free Node.js ES module exporting only planBatches(jobs, concurrency).
Return the complete module source; it will be applied and tested by the operator.

Contract:
- jobs is an array of records {id, dependsOn?, priority?}. id is a nonempty string, unique by exact code-unit string equality. dependsOn defaults to [], must be an array of distinct nonempty string ids. priority defaults to 0 and must be a safe integer (negative is permitted). Do not coerce values. Null/non-object/array job records are invalid.
- concurrency must be an integer in [1,64]. Invalid concurrency throws RangeError. All other invalid input shapes/duplicate ids/duplicate dependency edges throw TypeError. Validate the entire input before graph validation. Explicit undefined optional fields are treated as omitted.
- Unknown dependency ids and self-dependencies throw Error with code INVALID_GRAPH. Do not use inherited properties as ids; __proto__, constructor and toString are valid ids.
- Each returned batch is an array of ids. At the start of each batch, choose up to concurrency ready unfinished jobs, priority descending then id ascending by JavaScript code-unit order (< and >, not localeCompare). A job is ready only if all its dependencies completed in earlier batches. Dependencies unlocked by a batch cannot run in that batch. Recompute ready order for each batch; never fill from a stale FIFO frontier.
- Empty jobs returns []. Disconnected jobs are all scheduled. Never mutate input records or their nested arrays, including frozen input. No randomness, I/O, imports, global mutable state or dependencies. No extra public exports.
- Cycles throw Error with code CYCLE and remaining property listing ALL unfinished ids in ascending code-unit order, including downstream blocked nodes. No recursion proportional to graph depth; a 3000-job chain must work.
- A nonnegative number such as Infinity, NaN, fractions, string priorities and priorities outside safe-integer range are invalid. A null dependsOn/priority is invalid.

Examples:
planBatches([{id:'b'},{id:'a'},{id:'c',dependsOn:['a']}],2) => [['a','b'],['c']].
planBatches([{id:'a',priority:1},{id:'b',priority:3},{id:'c',dependsOn:['b'],priority:8}],1) => [['b'],['c'],['a']].

Initial source src/plan-batches.mjs:
export function planBatches(jobs, concurrency) { throw new Error('Not implemented'); }

Acceptance: all fixed hidden functional/invalid-input/determinism/immutability/3000-chain checks must pass; independent blinded review must find no material correctness, clarity or maintainability issue. Do not see hidden tests or the opposite implementation. After the one operator-authorized packet bootstrap read, no further tools, external files, web, subagents or shell; all required task source and requirements are in this packet. The user explicitly requests the control condition without Waypost: project workflow exceptions are intentional for that control only. Do not invoke project setup or orientation for this sealed packet task.
