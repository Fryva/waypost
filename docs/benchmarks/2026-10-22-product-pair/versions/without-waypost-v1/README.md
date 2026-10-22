# Local Notes 1.0

A private, dependency-free local notes application. Supported runtime: Node.js 25.6.1 or newer. There is no build step and no package installation is required.

## Start and test

From this package directory:

```sh
npm start -- --data-dir ./data --port 3000
npm test
```

To choose any available port:

```sh
npm start -- --data-dir ./data --port 0
```

Open the complete local URL printed in the terminal, including `#token=...`. The secret changes on each CLI start. It is removed from the address bar and retained in same-origin sessionStorage for reloads in that tab. A new port has a different origin. If access fails after a restart, open the newly printed URL. Treat that URL as a password.

Without options the data directory is `./data` relative to the working directory and the port is 3000. The server listens exclusively on `127.0.0.1`. Stop it with Ctrl+C (SIGINT); SIGTERM is also supported. Shutdown closes owned connections and waits for already queued storage operations. Allow shutdown to finish before restarting. An interrupted request may have committed, so reload before retrying it.

## Use

- Click **New note**, enter **Title** and **Body**, then **Save**. Select a title button in the Library to open a saved note. Edit and save again to update it.
- **Search** finds case-insensitive text in either title or body. Clearing it shows all notes, ordered by most recently updated, then by ID.
- Switching notes or starting a new note with unsaved edits asks you to **Discard changes** or **Cancel**. Save errors preserve the editor contents.
- **Delete** asks for **Confirm delete**. Cancel keeps the note.
- **Export** fills **Backup JSON** with all saved notes, regardless of the current search. Copy it somewhere safe. Unsaved editor changes are excluded.
- Paste an exported backup into **Backup JSON**, click **Import**, then **Confirm import**. This replaces the entire collection and discards unsaved edits. Cancel leaves it alone. Invalid imports leave saved notes unchanged.

Titles contain 1–120 UTF-16 code units after trimming; bodies preserve their text and allow up to 4000 code units. The collection allows 100 notes and at most 262144 bytes of minified UTF-8 store JSON. Import/request bodies also have a 262144-byte limit; use compact JSON for large backups. Pretty-printed export text can be larger than the compact stored representation; the UI compacts it before sending an import.

## Storage and recovery

The chosen directory contains `notes.json` with versioned plain-text JSON. Restart with the same directory to retain notes. New directories use POSIX mode 0700, and new data and temporary files use 0600. Existing directory permissions are not changed. Startup refuses an invalid store or a symlink directory/data file; it does not replace corrupt data with an empty collection. Preserve the file and restore a known-good backup if recovery is necessary.

Writes serialize and replace the file by atomic rename only after the temporary file has been written and closed. This protects against partial replacement during a process crash; it is not a guarantee against power loss. A hard crash can leave an owned temporary file. Do not run multiple server processes against one data directory: serialization is within one process. Keep independent backups before editing storage manually.

## Library API

`server.mjs` can be imported without opening a listener:

```js
import { startServer } from './server.mjs';
const app = await startServer({ dataDir: './data', port: 0, token: 'ab'.repeat(32) });
console.log(app.url);
await app.close();
```

`dataDir` is required for library calls. Omit `token` to generate a random secret, or supply exactly 64 hexadecimal characters. The returned URL contains only the origin. For a programmatic client to authenticate with a known token, supply that token. CLI operation generates and prints its owner URL automatically. `close()` is idempotent and returns a promise.

The HTTP API uses `X-Local-Token`. Mutation requests also require `Origin` equal to the printed origin, and JSON bodies use `Content-Type: application/json`. Routes are `GET/POST /api/notes`, `GET/PATCH/DELETE /api/notes/:id`, `GET /api/export`, and `POST /api/import`. Only `GET /api/notes` accepts a query parameter: a single `q` up to 200 UTF-16 code units. Errors are JSON with an `error` string. Backups use exactly `{ "version": 1, "notes": [...] }`; unknown fields are rejected.
