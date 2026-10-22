const $ = id => document.getElementById(id);
const ui = Object.fromEntries(['status', 'error', 'new', 'search', 'count', 'empty', 'notes', 'title', 'body', 'save', 'delete', 'editor-form', 'editor-heading', 'dirty', 'metadata', 'confirmation', 'confirmation-text', 'confirm', 'cancel', 'backup', 'export', 'import'].map(id => [id, $(id)]));
let token = '';
let selected = null;
let baseline = { title: '', body: '' };
let pending = false;
let confirmation = null;
let searchSequence = 0;
let searchTimer;

try {
  if (location.hash) {
    const fragment = new URLSearchParams(location.hash.slice(1));
    const candidate = fragment.get('token');
    token = fragment.getAll('token').length === 1 && /^[0-9a-fA-F]{64}$/.test(candidate || '') ? candidate : '';
    try {
      if (token) sessionStorage.setItem('local-notes-token', token);
      else sessionStorage.removeItem('local-notes-token');
    } catch { /* The current tab still works without browser storage. */ }
  } else {
    try { token = sessionStorage.getItem('local-notes-token') || ''; } catch { token = ''; }
    if (!/^[0-9a-fA-F]{64}$/.test(token)) token = '';
  }
} finally {
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}
function dirty() { return ui.title.value !== baseline.title || ui.body.value !== baseline.body; }
function message(text) { ui.status.textContent = text; }
function showError(error) {
  ui.error.textContent = error.message || 'The request could not be completed. Your draft is still here.';
  ui.error.hidden = false;
}
function clearError() { ui.error.hidden = true; ui.error.textContent = ''; }
function controls() {
  const blocked = pending || !token;
  for (const name of ['new', 'search', 'title', 'body', 'save', 'backup', 'export', 'import']) ui[name].disabled = blocked || Boolean(confirmation);
  ui.delete.disabled = blocked || Boolean(confirmation) || !selected;
  ui.confirm.disabled = blocked;
  ui.cancel.disabled = pending;
  for (const button of ui.notes.querySelectorAll('button')) button.disabled = blocked || Boolean(confirmation);
  ui.dirty.textContent = dirty() ? 'Unsaved changes' : 'All changes saved';
  ui['editor-form'].setAttribute('aria-busy', String(pending));
}
async function api(route, method = 'GET', value) {
  const headers = { 'X-Local-Token': token };
  if (value !== undefined) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(route, { method, headers, body: value === undefined ? undefined : JSON.stringify(value), credentials: 'omit', cache: 'no-store', mode: 'same-origin' });
  } catch { throw new Error('Cannot reach Local Notes. Check that the server is running, then try again. Your draft has been kept.'); }
  let result;
  try { result = await response.json(); } catch { throw new Error('The server returned an unreadable response. Your draft has been kept.'); }
  if (!response.ok) {
    if (response.status === 401) throw new Error('Missing or invalid access token. Open the private URL printed by the currently running server. A restart creates a new token.');
    throw new Error(result.error || 'The request failed. Your draft has been kept.');
  }
  return result;
}
async function perform(action) {
  if (pending || !token) return;
  pending = true;
  clearError();
  controls();
  try { await action(); } catch (error) { showError(error); } finally { pending = false; controls(); }
}
function setEditor(note) {
  selected = note;
  baseline = { title: note?.title || '', body: note?.body || '' };
  ui.title.value = baseline.title;
  ui.body.value = baseline.body;
  ui['editor-heading'].textContent = note ? 'Edit note' : 'New note';
  ui.metadata.textContent = note ? `Created ${new Date(note.createdAt).toLocaleString()} · Updated ${new Date(note.updatedAt).toLocaleString()}` : 'Up to 120 title characters and 4000 body characters.';
  for (const button of ui.notes.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.id === note?.id));
  controls();
}
function ask(label, text, action) {
  confirmation = action;
  ui.confirm.textContent = label;
  ui['confirmation-text'].textContent = text;
  ui.confirmation.hidden = false;
  controls();
  ui.confirm.focus();
}
function hideConfirmation() {
  confirmation = null;
  ui.confirmation.hidden = true;
  controls();
}
function abandon(action) {
  if (pending || confirmation) return;
  if (dirty()) ask('Discard changes', 'This draft has unsaved changes. Discard them and continue?', action);
  else action();
}
async function refresh() {
  const sequence = ++searchSequence;
  const query = ui.search.value;
  const result = await api(`/api/notes?q=${encodeURIComponent(query)}`);
  if (sequence !== searchSequence) return;
  ui.notes.replaceChildren();
  ui.count.textContent = `${result.total} ${result.total === 1 ? 'note' : 'notes'}${query ? ' found' : ' saved'}`;
  ui.empty.hidden = result.total > 0;
  ui.empty.textContent = query ? 'No notes match this search. Try a different word or clear Search.' : 'No notes yet. Choose New note to begin.';
  for (const note of result.notes) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = note.title;
    button.dataset.id = note.id;
    button.setAttribute('aria-pressed', String(selected?.id === note.id));
    button.addEventListener('click', () => {
      if (selected?.id === note.id) return;
      abandon(() => perform(async () => {
        const result = await api(`/api/notes/${note.id}`);
        setEditor(result.note);
        message('Note opened.');
      }));
    });
    item.append(button);
    ui.notes.append(item);
  }
  controls();
}
ui.title.addEventListener('input', controls);
ui.body.addEventListener('input', controls);
ui.new.addEventListener('click', () => abandon(() => { setEditor(null); clearError(); message('New note ready. Add a title and save.'); ui.title.focus(); }));
ui['editor-form'].addEventListener('submit', event => {
  event.preventDefault();
  if (confirmation) return;
  const draft = { title: ui.title.value, body: ui.body.value };
  if (!draft.title.trim()) { showError(new Error('Add a title before saving.')); ui.title.focus(); return; }
  perform(async () => {
    const result = await api(selected ? `/api/notes/${selected.id}` : '/api/notes', selected ? 'PATCH' : 'POST', draft);
    setEditor(result.note);
    message('Note saved.');
    await refresh();
  });
});
ui.delete.addEventListener('click', () => {
  if (!selected || pending) return;
  const id = selected.id;
  ask('Confirm delete', 'Permanently delete this note and its current draft? This cannot be undone without a backup.', () => perform(async () => {
    await api(`/api/notes/${id}`, 'DELETE');
    setEditor(null);
    message('Note deleted.');
    await refresh();
  }));
});
ui.confirm.addEventListener('click', () => {
  if (pending || !confirmation) return;
  const action = confirmation;
  hideConfirmation();
  action();
});
ui.cancel.addEventListener('click', () => { if (!pending) { hideConfirmation(); message('Cancelled. Your editor has been kept.'); ui.title.focus(); } });
ui.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  ++searchSequence;
  searchTimer = setTimeout(() => refresh().catch(showError), 180);
});
ui.export.addEventListener('click', () => perform(async () => {
  const backup = await api('/api/export');
  ui.backup.value = JSON.stringify(backup, null, 2);
  message('Backup exported below. Copy it to a safe location. Unsaved edits are not included.');
}));
ui.import.addEventListener('click', () => {
  if (pending) return;
  let backup;
  try { backup = JSON.parse(ui.backup.value); } catch { showError(new Error('Paste valid backup JSON before importing.')); return; }
  ask('Confirm import', 'Replace every saved note and the unsaved editor with this backup? Export first if you need to keep the current collection.', () => perform(async () => {
    const result = await api('/api/import', 'POST', backup);
    setEditor(null);
    ui.search.value = '';
    message(`Imported ${result.imported} notes. Select a note to edit.`);
    await refresh();
  }));
});
window.addEventListener('beforeunload', event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
controls();
if (!token) {
  message('Access link required.');
  showError(new Error('Missing or invalid access token. Open the complete private URL printed by the server, including its #token fragment.'));
} else {
  perform(async () => { await refresh(); message('Your local workspace is ready.'); });
}
