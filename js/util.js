// Small helpers used by almost every file. Moved here from later in the old single file in 3.0.0
// so that top-level code in any file can call them (a script file can only use what loaded before it).

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function lsGet(k){ try { return localStorage.getItem(k); } catch(e) { return null; } }
function lsSet(k, v){ try { localStorage.setItem(k, v); } catch(e) {} }
function lsDel(k){ try { localStorage.removeItem(k); } catch(e) {} }
