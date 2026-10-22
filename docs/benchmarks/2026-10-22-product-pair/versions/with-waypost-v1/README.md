# Local Notes 1.0

A dependency-free private notes application for one trusted user on one computer. It runs directly in Node.js and stores notes locally. There are no build steps, remote assets, analytics or external services.

## Run

Supported acceptance runtime: **Node.js 25.6.1**. No npm install is required.

```sh
npm start -- --data-dir ./data --port 3000
```

To let the operating system choose a free port:

```sh
npm start -- --data-dir ./data --port 0
```

Open the complete private URL printed in the terminal, for example `http://127.0.0.1:3000/#token=...`. Keep it private. The fragment supplies the access token; the application removes the fragment from the address bar and retains only the token in same-origin sessionStorage for reloads in that tab. Notes are never saved in browser storage. If sessionStorage is unavailable, the open page works, but you must reopen the printed link after reload.

The server listens only on 127.0.0.1. A server restart generates a new token: reopen the newly printed URL if the previous tab reports invalid access. Opening a plain URL without a stored valid token displays access instructions.

## Use

- Choose **New note**, enter **Title** and **Body**, and choose **Save**. Titles are trimmed and limited to 120 UTF-16 code units; bodies preserve their text and allow 4000 code units.
- Select a note using its title button. Edit and save it. Errors retain the editor contents. Switching notes or starting a new note with unsaved changes requires **Discard changes**, or **Cancel** to keep editing.
- Type into **Search** to find a case-insensitive substring in a title or body. Search does not discard the current editor. Results show the most recently updated notes first, with IDs breaking ties.
- Choose **Delete**, then **Confirm delete** to permanently remove the selected note. **Cancel** keeps it.
- Choose **Export** to populate **Backup JSON** with every saved note. Copy that JSON into a secure backup file. Unsaved edits are not exported.
- Paste a complete backup into **Backup JSON**, choose **Import**, then **Confirm import**. Import replaces the entire collection and clears the editor. Export first if you need to keep the previous collection. Invalid backups leave saved notes unchanged.

The collection supports at most 100 notes and 262144 bytes of minified serialized UTF-8 JSON. A collection can reach its byte limit before its note limit. JSON import request bodies have the same byte limit; a whitespace-heavy, pretty-printed backup may need to be minified before importing.

## Data and shutdown

Without flags, the data directory is `./data` relative to the process working directory, and the port is 3000. The directory contains `notes.json` with `{version:1,notes:[...]}`. Restart with the same directory to retain notes. On POSIX, newly created data directories use mode 0700 and new notes/temporary files use 0600. Existing directory permissions are not silently changed.

Use Ctrl+C or SIGTERM for safe shutdown. Mutations are serialized, written to an exclusively created temporary file and atomically renamed before success is reported. Failed saves retain the previous committed collection. Do not run multiple server processes against the same directory: serialization is within one process. Use Export or stop the server before manually copying or editing `notes.json`. Corrupt existing data and symlink storage paths are refused rather than reset. Restore a valid backup while stopped if startup reports damaged storage; preserve the damaged file for recovery.

## Test

```sh
npm test
```

The suite starts real ephemeral HTTP servers in temporary directories. It checks CRUD, search, strict schemas, auth, Host/Origin controls, malformed input, response headers, traversal rejection, streamed overflow, exact byte and count limits, import rollback, concurrent writes, controlled storage failures, symlink defenses on POSIX, restart persistence and cleanup. It requires no external network or dependencies and removes its own fixtures.

These are executable HTTP/storage checks, not a claim of an independent audit or browser automation. For release verification, also open the printed URL and exercise create/select/edit/search, literal HTML-like titles, reload, confirmation cancellation, backup restoration, rejected-save draft retention and the layout at 360px and desktop widths.

## Library

```js
import { startServer } from './server.mjs';
const app = await startServer({ dataDir: './data', port: 0, token: 'a'.repeat(64) });
console.log(app.url); // Exact origin, without a token or trailing slash.
await app.close();
```

Importing the module starts no listener. Library calls require a data directory. A supplied token must be exactly 64 hexadecimal characters; omitting it generates a cryptographic token, intended primarily for the CLI which prints the access link. The returned `close()` Promise stops owned connections and waits for queued mutations. API clients send `X-Local-Token`; POST/PATCH/DELETE also require `Origin` equal to the returned origin. See SECURITY.md for the security boundary and backup responsibilities.
