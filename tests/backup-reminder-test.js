const {sleep,ok,boot,setItems,finish}=require('./lib/h.js');
const DAY=86400000;
(async()=>{
  const banner=w=>w.document.getElementById('backupBanner');
  const withAge=(days,extra)=>boot({ls:Object.assign({lastBackupAt:String(Date.now()-days*DAY)},extra||{})});
  // ---- fresh device
  let w=boot();
  const seeded=Number(w.localStorage.getItem('lastBackupAt'));
  ok(Math.abs(seeded-Date.now())<5000,'fresh device: lastBackupAt set to now');
  w.render(); ok(banner(w).hidden,'fresh device: no banner');
  // ---- thresholds
  w=withAge(29); w.render(); ok(banner(w).hidden,'29 days: no banner');
  w=withAge(29.9); w.render(); ok(banner(w).hidden,'29 days 21h: no banner (still 29)');
  w=withAge(30.01); w.render(); ok(!banner(w).hidden && /It’s been 30 days since your last backup\./.test(banner(w).textContent),'30 days: banner ('+banner(w).querySelector('.backup-banner-text').textContent+')');
  w=withAge(31); w.render();
  ok(!banner(w).hidden && banner(w).querySelector('.backup-banner-text').textContent==='It’s been 31 days since your last backup.','31 days: exact text');
  ok(banner(w).getAttribute('role')==='region' && banner(w).previousElementSibling.tagName==='HEADER','banner is a labelled region right under the header');
  const btns=[...banner(w).querySelectorAll('button')].map(b=>b.textContent);
  ok(btns.join('|')==='Back up now|Remind me in 7 days','buttons: '+btns);
  // ---- on the board only (inside #app which is hidden at the gate)
  ok(w.document.getElementById('app').contains(banner(w)),'lives inside the board, not the sign-in screen');
  // ---- snooze
  w=withAge(45); w.render(); ok(!banner(w).hidden,'45 days: banner');
  w.document.getElementById('backupSnoozeBtn').click();
  const until=Number(w.localStorage.getItem('backupSnoozedUntil'));
  ok(banner(w).hidden && Math.abs(until-(Date.now()+7*DAY))<5000,'snooze hides + stores now+7 days');
  w.render(); ok(banner(w).hidden,'stays hidden on re-render');
  w=withAge(45,{backupSnoozedUntil:String(Date.now()+6*DAY)}); w.render(); ok(banner(w).hidden,'still snoozed with 6 days left');
  w=withAge(45,{backupSnoozedUntil:String(Date.now()-1000)}); w.render(); ok(!banner(w).hidden,'snooze expired: banner returns');
  w=withAge(45,{backupSnoozedUntil:'garbage'}); w.render(); ok(!banner(w).hidden,'garbage snooze value ignored');
  // ---- back up now
  w=withAge(60,{backupSnoozedUntil:String(Date.now()-5)}); let clicks=0, blobs=[];
  w.render();
  w.HTMLAnchorElement.prototype.click=function(){ clicks++; };
  const origBlob=w.Blob; w.Blob=function(parts,o){ blobs.push(parts.join('')); return new origBlob(parts,o); };
  setItems(w,[{id:1,name:'A',month:'No date yet'}]);
  w.document.getElementById('backupNowBtn').click();
  ok(clicks===1 && blobs.length===1 && JSON.parse(blobs[0]).items.length===1,'Back up now runs the export (download triggered)');
  ok(banner(w).hidden && Math.abs(Number(w.localStorage.getItem('lastBackupAt'))-Date.now())<5000,'banner cleared, lastBackupAt = now');
  ok(w.localStorage.getItem('backupSnoozedUntil')===null && w.localStorage.getItem('lastBackupSeeded')===null,'snooze + seed marker cleared');
  ok(!!w.document.getElementById('toast') && /Backup saved/.test(w.document.getElementById('toast').textContent) && !w.document.getElementById('toastUndo'),'confirmation toast, no Undo');
  // settings export button sets it too
  w=withAge(40); w.render(); ok(!banner(w).hidden,'(setup) banner');
  w.exportBackup(); ok(banner(w).hidden && Date.now()-Number(w.localStorage.getItem('lastBackupAt'))<5000,'Settings → Export backup also resets the clock + hides banner');
  // ---- Settings label
  w=withAge(3); w.openSettingsModal('advanced');
  const lab=w.document.getElementById('lastBackupLabel').textContent;
  const expect=new Date(Date.now()-3*DAY).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  ok(lab==='Last backup: '+expect,'Settings → Advanced shows "Last backup: <date>": '+lab);
  const pane=w.document.getElementById('settingsPane-advanced'); const kids=[...pane.children];
  const iBtn=kids.findIndex(k=>k.querySelector&&k.querySelector('button[onclick="exportBackup()"]')), iLab=kids.findIndex(k=>k.id==='lastBackupLabel');
  ok(iBtn>=0 && iLab===iBtn+1,'label sits right under the Export backup button');
  w=boot(); w.openSettingsModal('advanced');
  ok(/^Last backup: none yet/.test(w.document.getElementById('lastBackupLabel').textContent),'fresh device is honest: no backup has actually been made yet: '+w.document.getElementById('lastBackupLabel').textContent);
  w.exportBackup(); w.openSettingsModal('advanced');
  ok(/^Last backup: [A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(w.document.getElementById('lastBackupLabel').textContent),'after export shows a plain date');
  // ---- ISO stored values + corrupt values
  w=boot({ls:{lastBackupAt:new Date(Date.now()-40*DAY).toISOString()}}); w.render(); ok(!banner(w).hidden && /40 days/.test(banner(w).textContent),'ISO timestamp understood');
  w=boot({ls:{lastBackupAt:'not a date'}}); ok(Math.abs(Number(w.localStorage.getItem('lastBackupAt'))-Date.now())<5000,'corrupt value treated as first run');
  w=withAge(-5); w.render(); ok(banner(w).hidden,'timestamp in the future (clock change): no banner');
  // ---- storage unavailable
  let threw=null; try{ w=boot({noStorage:true}); setItems(w,[{id:1,name:'a',month:'No date yet'}]); w.openSettingsModal('advanced'); w.snoozeBackupReminder(); w.exportBackup(); }catch(e){ threw=e; }
  ok(!threw && banner(w).hidden,'blocked storage: no errors, no banner ('+(threw&&threw.message)+')');
  ok(/not recorded/.test(w.document.getElementById('lastBackupLabel').textContent),'label fallback without storage');
  // ---- shows on Completed tab too, and no other synced fields
  w=withAge(50); w.eval(`activeTab='completed'`); w.render(); ok(!banner(w).hidden,'banner shows on the Completed tab as well');
  ok(!JSON.stringify(w.eval('snapshotState()')).includes('lastBackup'),'reminder state is per device, not synced');
  finish();
})().catch(e=>{console.log('ERR',e);process.exit(2)});
