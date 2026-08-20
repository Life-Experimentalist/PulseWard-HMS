// Re-export of the `node:sqlite` builtin for the Jest test runner.
//
// jest-resolve@30 mishandles the `node:sqlite` builtin (a prefix-only builtin,
// Node 22.5+) under ESM: it strips the `node:` prefix, then can't re-identify
// bare `sqlite` as core, and tries to load it as a missing npm file. jest.config
// maps `node:sqlite` to this shim instead.
//
// We must NOT `require('node:sqlite')` here — under the mapping that would
// resolve straight back to this shim and recurse. `process.getBuiltinModule`
// (Node 22.3+) returns the builtin directly through a C++ binding that jest's
// module system cannot intercept, so there is no recursion.
//
// Named exports are assigned explicitly so cjs-module-lexer detects them when
// this file is consumed from ESM (`import { DatabaseSync } from 'node:sqlite'`).
const sqlite = process.getBuiltinModule('node:sqlite');

module.exports = sqlite;
module.exports.DatabaseSync = sqlite.DatabaseSync;
module.exports.StatementSync = sqlite.StatementSync;
module.exports.constants = sqlite.constants;
