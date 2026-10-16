// Settings -> Advanced -> Version history: only the current version by default, older ones behind a button.
const {ok,boot,finish}=require('./lib/h.js');
(async()=>{
  const w=boot(), d=w.document, $=id=>d.getElementById(id);
  const total=w.eval('CHANGELOG.length');
  const btn=()=>$('changelogToggle');
  const visibleEntries=()=>[...d.querySelectorAll('#changelogList details')].filter(x=>!x.closest('[hidden]'));

  ok(total>=3,'CHANGELOG has several entries to test with ('+total+')');
  w.eval('openSettingsModal("advanced")');

  // ---- default: only the current version ----
  ok(d.querySelectorAll('#changelogList details').length===total,'every version is still rendered as a <details> ('+total+')');
  ok(visibleEntries().length===1,'by default exactly one version is listed');
  const cur=visibleEntries()[0];
  ok(cur.open&&/\(current\)/.test(cur.querySelector('summary').textContent),'the listed version is the current one and is open');
  ok(cur.querySelector('summary').textContent.includes(w.eval('CHANGELOG[0].v'))&&cur.querySelector('.cl-date').textContent===w.eval('CHANGELOG[0].date'),'it shows the newest version number and its date');
  ok(cur.querySelectorAll('li').length===w.eval('CHANGELOG[0].items.length'),'its bullet lines are all there');
  const olderBox=$('changelogOlder');
  ok(olderBox&&olderBox.hidden&&olderBox.querySelectorAll('details').length===total-1,'older versions sit in a hidden group ('+(total-1)+')');
  ok([...olderBox.querySelectorAll('details')].every(x=>!x.open),'older versions stay collapsed <details>');
  ok(!olderBox.querySelector('details[open]'),'no older version is open');

  // ---- the button ----
  ok(btn().tagName==='BUTTON'&&btn().type==='button','toggle is a real <button type="button">');
  ok(!btn().hidden,'button is shown when there are older versions');
  ok(btn().textContent.trim()==='Show all versions','button says "Show all versions"');
  ok(btn().getAttribute('aria-expanded')==='false','aria-expanded is false when collapsed');
  ok(btn().getAttribute('aria-controls')==='changelogOlder'&&!!$(btn().getAttribute('aria-controls')),'aria-controls points at the older-versions group');
  ok(!!btn().closest('#settingsPane-advanced'),'button lives in Settings -> Advanced, under the list');

  // ---- reveal (a real click, focus stays) ----
  btn().focus(); btn().click();
  ok(!$('changelogOlder').hidden,'pressing reveals the older versions');
  ok(visibleEntries().length===total,'all '+total+' versions are listed');
  ok(btn().textContent.trim()==='Hide older versions','button now says "Hide older versions"');
  ok(btn().getAttribute('aria-expanded')==='true','aria-expanded is true when expanded');
  ok(d.activeElement===btn(),'focus stays on the button');
  ok([...$('changelogOlder').querySelectorAll('details')].every(x=>!x.open),'revealed older versions are still collapsed');
  ok(d.querySelectorAll('#changelogList > details').length===1&&d.querySelector('#changelogList > details').open,'current version is still open');

  // ---- hide again ----
  btn().click();
  ok($('changelogOlder').hidden&&visibleEntries().length===1,'pressing again hides the older versions');
  ok(btn().textContent.trim()==='Show all versions'&&btn().getAttribute('aria-expanded')==='false','button and aria-expanded go back');
  ok(d.activeElement===btn(),'focus is still on the button');

  // ---- a button is keyboard operable by nature; no key handlers needed. It must not be inside a <summary> or <a>. ----
  ok(!btn().closest('summary,a,label'),'button is not nested in another interactive element');

  // ---- reset on reopen ----
  btn().click();
  d.querySelector('#changelogOlder details').open=true;
  ok(visibleEntries().length===total,'(setup) expanded before closing');
  w.eval('closeSettingsModal()');
  w.eval('openSettingsModal("advanced")');
  ok($('changelogOlder').hidden&&visibleEntries().length===1,'reopening Settings starts collapsed again');
  ok(btn().textContent.trim()==='Show all versions'&&btn().getAttribute('aria-expanded')==='false','button is reset on reopen');
  ok(![...$('changelogOlder').querySelectorAll('details')].some(x=>x.open),'older versions are collapsed again after reopening');
  btn().click(); w.eval('openSettingsModal("general")');
  ok($('changelogOlder').hidden,'reopening on another tab also resets it');

  // ---- calling render directly while expanded also collapses (no stale state) ----
  btn().click(); w.eval('renderChangelog()');
  ok($('changelogOlder').hidden&&btn().getAttribute('aria-expanded')==='false','renderChangelog() always leaves it collapsed');

  // ---- the CHANGELOG text is still escaped ----
  w.eval("CHANGELOG[1].items=['<b>bold</b> & more']; renderChangelog()");
  ok(!d.querySelector('#changelogOlder b')&&/<b>bold<\/b> & more/.test($('changelogOlder').textContent),'entry text is still HTML-escaped');

  // ---- single entry: no button, no group ----
  w.eval('CHANGELOG.splice(1); renderChangelog()');
  ok(d.querySelectorAll('#changelogList details').length===1,'single entry: one version listed');
  ok(btn().hidden,'single entry: no button is shown');
  ok(!$('changelogOlder'),'single entry: no older-versions group');
  w.eval('openSettingsModal("advanced")');
  ok(btn().hidden&&visibleEntries().length===1,'single entry still fine after reopening Settings');
  btn().removeAttribute('hidden');
  // toggling with nothing to reveal must not throw
  let threw=false; try{ w.eval('toggleOlderVersions()'); }catch(e){ threw=true; }
  ok(!threw,'toggling with nothing to reveal does not throw');

  // ---- CSS: touch target and no sideways overflow rules ----
  const css=require('fs').readFileSync(require('path').join(__dirname,'..','styles.css'),'utf8');
  const sec=css.slice(css.indexOf('SECTION: version-history'));
  const rule=(sec.match(/\.cl-toggle\{([^}]*)\}/)||[])[1]||'';
  ok(/min-height:\s*44px/.test(rule),'.cl-toggle has a 44px minimum height');
  ok(/max-width:\s*100%/.test(rule)&&/box-sizing:\s*border-box/.test(rule),'.cl-toggle cannot be wider than its box');
  ok(/#changelogOlder\[hidden\]\{display:none/.test(sec),'hidden older group is really hidden');

  finish();
})();
