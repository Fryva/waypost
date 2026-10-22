const $ = id => document.getElementById(id);
const controls = $('controls');
let token = '', selected = null, saved = { title: '', body: '' }, busy = false, pending = null, searchSequence = 0;
const fragment = new URLSearchParams(location.hash.slice(1));
const incoming = fragment.get('token');
try {
  if (incoming !== null) {
    token = incoming;
    if (/^[a-fA-F0-9]{64}$/.test(token)) sessionStorage.setItem('local-notes-token', token);
    else sessionStorage.removeItem('local-notes-token');
  } else token = sessionStorage.getItem('local-notes-token') || '';
} catch { token = incoming || ''; }
if (location.hash) history.replaceState(null, '', location.pathname + location.search);
function message(text) { $('status').textContent = text; $('error').textContent = ''; }
function report(error) { $('error').textContent = error.message || 'Something went wrong. Please try again.'; $('status').textContent = ''; }
function dirty() { return $('title').value !== saved.title || $('body').value !== saved.body; }
async function api(route, options = {}) {
  const response = await fetch(route, { ...options, cache: 'no-store', headers: { 'X-Local-Token': token, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  let data;
  try { data = await response.json(); } catch { throw new Error('The server returned an unreadable response.'); }
  if (!response.ok) throw new Error(response.status === 401 ? 'Access denied: open the full URL printed by the server, including its token. Restarting the server creates a new token.' : data.error || 'Request failed.');
  return data;
}
async function work(action) {
  if (busy) return;
  busy = true; controls.disabled = true;
  $('error').textContent = '';
  try { await action(); } catch (error) { report(error); }
  finally { busy = false; controls.disabled = false; $('delete').disabled = selected === null; }
}
function clearConfirmation() { pending = null; $('confirmation').hidden = true; }
function confirm(label, text, action) {
  pending = action; $('confirmation-message').textContent = text; $('confirm').textContent = label;
  $('confirmation').hidden = false; $('confirm').focus();
}
function guarded(action) {
  if (dirty()) confirm('Discard changes', 'You have unsaved edits. Discard them and continue?', action);
  else { clearConfirmation(); action(); }
}
function show(note = null) {
  selected = note?.id || null;
  saved = { title: note?.title || '', body: note?.body || '' };
  $('title').value = saved.title; $('body').value = saved.body;
  $('editor-heading').textContent = note ? 'Edit note' : 'New note';
  $('delete').disabled = !note;
  clearConfirmation();
  for (const button of $('notes').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.id === selected));
}
async function refresh() {
  const sequence = ++searchSequence;
  const query = $('search').value;
  const data = await api('/api/notes?q=' + encodeURIComponent(query));
  if (sequence !== searchSequence) return;
  $('notes').replaceChildren();
  $('empty').textContent = data.notes.length ? '' : query ? 'No notes match your search.' : 'No notes yet. Create your first note.';
  for (const note of data.notes) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = note.title; button.dataset.id = note.id;
    button.setAttribute('aria-pressed', String(note.id === selected));
    button.addEventListener('click', () => guarded(() => work(async () => {
      const result = await api('/api/notes/' + note.id);
      show(result.note); message('Note opened.'); $('title').focus();
    })));
    li.append(button); $('notes').append(li);
  }
}
$('new').addEventListener('click', () => guarded(() => { show(); message('Write a new note, then save.'); $('title').focus(); }));
$('cancel').addEventListener('click', () => { clearConfirmation(); message('Cancelled.'); });
$('confirm').addEventListener('click', () => { const action = pending; clearConfirmation(); if (action) action(); });
$('editor').addEventListener('submit', event => {
  event.preventDefault();
  clearConfirmation();
  work(async () => {
    const title = $('title').value, body = $('body').value;
    if (!title.trim()) throw new Error('Enter a title.');
    const data = await api(selected ? '/api/notes/' + selected : '/api/notes', { method: selected ? 'PATCH' : 'POST', body: JSON.stringify({ title, body }) });
    show(data.note); message('Note saved.'); await refresh();
  });
});
$('delete').addEventListener('click', () => {
  if (!selected) return;
  const id = selected;
  confirm('Confirm delete', 'Permanently delete this note and its unsaved edits?', () => work(async () => {
    await api('/api/notes/' + id, { method: 'DELETE' }); show(); await refresh(); message('Note deleted.');
  }));
});
$('export').addEventListener('click', () => work(async () => {
  const data = await api('/api/export'); $('backup').value = JSON.stringify(data, null, 2);
  message('Backup ready. Copy Backup JSON to a safe location. Unsaved edits are not included.');
}));
$('import').addEventListener('click', () => {
  const source = $('backup').value;
  confirm('Confirm import', 'Replace every saved note and discard unsaved edits with this backup? This cannot be undone.', () => work(async () => {
    let data;
    try { data = JSON.parse(source); } catch { throw new Error('Backup JSON is not valid JSON.'); }
    const result = await api('/api/import', { method: 'POST', body: JSON.stringify(data) });
    show(); $('search').value = ''; await refresh(); message(`Imported ${result.imported} notes.`);
  }));
});
let searchTimer;
$('search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { refresh().catch(report); }, 180);
});
window.addEventListener('beforeunload', event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
if (!/^[a-fA-F0-9]{64}$/.test(token)) {
  controls.disabled = true;
  report(new Error('A local access token is missing or invalid. Open the complete URL printed by npm start, including #token=….'));
} else {
  work(async () => { await refresh(); message('Ready. Select a note or create one.'); });
}
