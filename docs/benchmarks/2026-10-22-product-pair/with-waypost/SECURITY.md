# Local Notes security

Local Notes 1.0 is intended for one trusted OS account on a trusted local computer. Notes and backups are plaintext. This package does not provide encryption at rest, TLS, multi-user identity, remote hosting support or protection against a compromised operating system, account, browser extension or another process with access to the user's files or token. It has not undergone a production security audit.

## Threat model and boundaries

Untrusted note text and imported JSON are treated as data. The application uses textContent and form values rather than executing supplied markup. Strict, exact-key validation rejects unknown fields, invalid types, IDs, timestamps, duplicate IDs and invalid schemas. Token and UUID validation checks exact lengths as well as hexadecimal syntax, including rejecting trailing line terminators. Title/body lengths, total note count, serialized UTF-8 storage size and streamed request size are bounded. UTF-8 decoding is fatal on malformed input. Import validates the whole replacement before committing it.

Other websites and local clients without the secret must not access notes. The server binds only to 127.0.0.1 and additionally requires a cryptographically generated 32-byte token on every API request. Loopback binding alone is not treated as authentication. Tokens must arrive in X-Local-Token; query strings, cookies and JSON properties cannot authenticate. Well-formed equal-length tokens are compared using timingSafeEqual. A supplied token must contain exactly 64 hexadecimal characters, and its exact string is the credential.

Every request must use the exact bound 127.0.0.1 Host including port. This rejects external Host values and DNS rebinding through alternate names. Any API Origin must exactly match the local origin; POST, PATCH and DELETE require it. No permissive CORS headers are emitted. These controls protect browser-origin boundaries; non-browser clients can forge Host and Origin and must still possess the secret.

Only the three fixed public assets are served; URL paths never become filesystem paths. Content-Type headers, nosniff, no-referrer and a restrictive CSP limit script injection and framing. The CSP permits same-origin external scripts/styles and API connections, rejects inline execution, and blocks objects, framing and base-URI injection. API responses use JSON and no-store. Errors omit stack traces, internal paths, tokens and note contents.

## Token handling

Treat the entire printed access URL as a password. Terminal scrollback, screenshots, clipboard history, browser history synchronization or anyone to whom you give the URL can disclose it. The token is printed only during CLI startup, never embedded in HTML or API responses. It enters the UI through a URL fragment, which is not sent in HTTP requests. The UI promptly removes that fragment and retains only the token in same-origin sessionStorage for same-tab reloads. Note data is not placed in browser storage. Restarting the CLI rotates the token. Close unneeded tabs and protect your OS session.

Requests necessarily carry the token in their authentication header. A debugger or compromised local environment able to inspect process/browser memory or local traffic is outside this protection boundary. HTTP is unencrypted even on loopback; do not expose this service through a proxy or port forwarding.

## Storage and failure behavior

New data directories use mode 0700 and newly created files use 0600 on POSIX. Existing directory permissions are the owner's responsibility. Windows permissions follow the account and filesystem ACLs. A symlink data directory or notes.json is refused at startup. Writes recheck directory and destination types, including rejecting a notes.json symlink before replacement; the symlink target is not written. These checks are not a defense against a malicious trusted-account process racing filesystem changes.

Within one process, mutations are queued. A complete validated store is written into a uniquely owned, exclusively created temporary file and atomically renamed over notes.json. Only then is in-memory state published and success returned. A failed write or rename preserves the last committed in-memory state; owned temporary files are cleaned on handled failures. Crashes may leave orphan temporary files; startup does not delete files it cannot attribute to its own operation. Corrupt storage is refused without resetting user data.

This implements crash-atomic replacement: readers see the old or new complete file when the filesystem supports atomic same-directory rename. It does not fsync the file or directory, and does not promise durability through power loss, hardware faults or unusual network filesystems. Do not run multiple writers against one directory; the queue is process-local. A lost HTTP response can leave a successfully committed save whose acknowledgement did not reach the browser; inspect the library before retrying creation.

## Backups and recovery

Deletion and confirmed import are destructive. Visible confirmation and Cancel controls reduce accidental loss; they do not replace backups. Export contains all saved notes in plaintext. Store copies somewhere appropriately private, verify that they restore, and avoid sharing or pasting sensitive backups into unrelated services. Unsaved editor text is not part of an export. Copying notes.json manually is safest with the server stopped. The owner is responsible for backup retention, account permissions, storage health and recovery after device loss.
