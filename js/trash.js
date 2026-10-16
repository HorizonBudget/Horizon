// ---- Deleted items (Settings → Deleted items) ----
function daysAgoText(ms, now){
  const d = Math.floor((now - ms) / DAY_MS);
  return d <= 0 ? 'today' : d === 1 ? '1 day ago' : d + ' days ago';
}
function daysLeftText(ms, now){
  const left = Math.max(0, Math.ceil((ms + TRASH_DAYS * DAY_MS - now) / DAY_MS));
  return left === 1 ? '1 day left' : left + ' days left';
}
function renderTrashList(){
  const dels = deletedItems(), now = Date.now();
  const list = document.getElementById('trashList');
  if(!dels.length){
    list.innerHTML = '<div class="empty">Nothing deleted. Items you remove will wait here for 30 days.</div>';
  } else {
    list.innerHTML = dels.map(it => `
      <div class="trash-item" data-trash-id="${escAttr(it.id)}">
        <div class="trash-item-top">
          <span class="trash-item-name">${escapeHtml(it.name)}</span>
          <span class="trash-item-cost">$${(Number(it.cost) || 0).toLocaleString()}</span>
        </div>
        <div class="trash-item-meta">Deleted ${daysAgoText(Number(it.deletedAt), now)} · ${daysLeftText(Number(it.deletedAt), now)}</div>
        <div class="trash-item-actions">
          <button type="button" class="btn btn-ghost" data-act="restore">Restore</button>
          <button type="button" class="btn btn-danger" data-act="forever">Delete forever</button>
        </div>
      </div>`).join('');
    list.querySelectorAll('.trash-item').forEach((row, i) => {
      const id = dels[i].id;
      row.querySelector('[data-act="restore"]').onclick = () => restoreDeletedItem(id);
      row.querySelector('[data-act="forever"]').onclick = () => deleteItemForever(id);
    });
  }
  document.getElementById('trashEmptyBtn').style.display = dels.length ? '' : 'none';
}
// keeps the Settings row count and an open Deleted items window in step with the data
function refreshTrashUi(){
  const n = items.filter(isDeleted).length;
  const t = document.getElementById('trashRowTitle');
  if(t) t.textContent = `Deleted items (${n})`;
  const o = document.getElementById('trashOverlay');
  if(o && o.style.display === 'flex') renderTrashList();
}
function openTrashModal(){
  closeSettingsModal();
  renderTrashList();
  document.getElementById('trashOverlay').style.display = 'flex';
}
function closeTrashModal(){
  document.getElementById('trashOverlay').style.display = 'none';
  openSettingsModal('general');
}
function restoreDeletedItem(id){
  const it = items.find(i => i.id === id && isDeleted(i));
  if(!it) return;
  delete it.deletedAt;   // completed state is left as it was
  logActivity(`${household.name} restored “${it.name}” from Deleted items`);
  render();
}
function deleteItemForever(id){
  const it = items.find(i => i.id === id && isDeleted(i));
  if(!it) return Promise.resolve(false);
  return askConfirm({
    title: 'Delete forever?',
    message: `Delete “${it.name}” forever? This can’t be undone.`,
    confirmLabel: 'Delete forever', danger: true
  }).then(ok => {
    if(!ok) return false;
    const before = items.length;
    items = items.filter(i => !(i.id === id && isDeleted(i)));
    if(items.length !== before) logActivity(`${household.name} deleted “${it.name}” forever`);
    render();
    return true;
  });
}
function emptyTrash(){
  const n = items.filter(isDeleted).length;
  if(!n) return Promise.resolve(false);
  return askConfirm({
    title: 'Empty Deleted items?',
    message: `Delete ${n === 1 ? 'the 1 item' : 'all ' + n + ' items'} in Deleted items forever? This can’t be undone.`,
    confirmLabel: 'Empty all', danger: true
  }).then(ok => {
    if(!ok) return false;
    items = items.filter(i => !isDeleted(i));
    logActivity(`${household.name} emptied Deleted items (${n})`);
    render();
    return true;
  });
}
// once an hour (and on load / when a sync arrives) erase anything deleted over 30 days ago
setInterval(() => { if(purgeTrash()) render(); }, 60 * 60 * 1000);
