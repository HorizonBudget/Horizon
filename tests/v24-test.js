const {JSDOM}=require('jsdom');const fs=require('fs');
const html=require('./lib/build-app').buildApp();
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+m)};
function mk(ls){return new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/',beforeParse(w){if(ls)w.localStorage.setItem('ledgerSettings',ls);}}).window;}
(async()=>{
 const w=mk(); const d=w.document;
 d.getElementById('householdCode').value='FAMILY-2026';d.getElementById('yourName').value='Sam';
 await w.enterApp();
 w.eval(`items.push({id:21,name:'Tires',category:'Vehicle',subcategory:'',cost:600,month:FUTURE_MONTHS[0],saved:0,owner:'',link:'',completed:false},{id:22,name:'Dentist',category:'Health',subcategory:'',cost:100,month:FUTURE_MONTHS[1],saved:0,owner:'',link:'',completed:false});render();`);
 ok(/^\d+\.\d+\.\d+$/.test(w.eval('APP_VERSION')),'version');
 ok(w.eval('CHANGELOG[0].v')===w.eval('APP_VERSION')&&w.eval('CHANGELOG.length')>=16,'changelog');
 ok(!/\(\d+\)/.test(d.querySelector('.view-tabs').textContent),'no (n) after Completed');
 // themes
 w.openSettingsModal('themes');
 ok(d.getElementById('savedThemesSection').style.display==='none','my themes hidden when none');
 w.setCustomAccent('#A85A3A'); w.setCustomMode(true);
 d.getElementById('ct_name').value='  Evening <b>x</b> with a very long name here  ';
 w.saveCurrentTheme();
 let st=JSON.parse(w.localStorage.getItem('ledgerSettings'));
 ok(st.savedThemes.length===1&&st.savedThemes[0].name.length<=24,'saved, name trimmed to 24: '+st.savedThemes[0].name);
 ok(/^Saved “/.test(d.getElementById('ct_msg').textContent),'feedback: '+d.getElementById('ct_msg').textContent);
 ok(d.getElementById('savedThemesSection').style.display==='','section shown');
 ok(d.querySelectorAll('#savedThemes .saved-opt').length===1&&d.querySelector('#savedThemes b')===null,'chip rendered, name escaped');
 ok(d.querySelector('#savedThemes .saved-opt').classList.contains('active'),'matching highlighted');
 d.getElementById('ct_name').value='Warm'; w.setCustomAccent('#2F6E9E'); w.saveCurrentTheme();
 ok(!d.querySelector('#savedThemes .saved-opt.active').textContent.includes('Evening'),'highlight follows current colors');
 d.getElementById('ct_name').value='warm'; w.setCustomAccent('#5F8F3E'); w.saveCurrentTheme();
 st=JSON.parse(w.localStorage.getItem('ledgerSettings'));
 ok(st.savedThemes.length===2&&st.savedThemes.find(t=>t.name==='warm').accent==='#5F8F3E','duplicate name replaces');
 // apply
 w.setTheme('light');
 const id=st.savedThemes[0].id;
 d.querySelector(`[data-saved-id="${id}"] .saved-apply`).click();
 ok(w.eval('theme')==='custom'&&w.eval('customTheme.accent')==='#A85A3A'&&w.eval('customTheme.dark')===true,'apply sets custom');
 ok(d.documentElement.style.getPropertyValue('--teal')==='#A85A3A','css var applied');
 // persistence
 const w2=mk(w.localStorage.getItem('ledgerSettings'));
 ok(w2.eval('savedThemes.length')===2&&w2.eval('theme')==='custom','persist across reload');
 // bad data
 const w3=mk(JSON.stringify({savedThemes:[{id:'a',name:'ok',paper:'#111111',accent:'#222222',dark:true},{name:'bad',paper:'red',accent:'#222222'},{name:'ok',paper:'#111111',accent:'#222222'},null,5]}));
 ok(w3.eval('savedThemes.length')===2&&new Set(w3.eval('savedThemes.map(t=>t.id)')).size===2,'validation on load');
 // max 12
 for(let i=0;i<14;i++){d.getElementById('ct_name').value='T'+i;w.saveCurrentTheme();}
 ok(w.eval('savedThemes.length')===12,'max 12');
 // delete
 const before=w.eval('savedThemes.length');
 d.querySelector('#savedThemes .saved-del').click();
 ok(w.eval('savedThemes.length')===before-1&&JSON.parse(w.localStorage.getItem('ledgerSettings')).savedThemes.length===before-1,'delete persists');
 w.eval('savedThemes=[]');w.renderSavedThemes();
 ok(d.getElementById('savedThemesSection').style.display==='none','hidden after deleting all');
 w.closeSettingsModal();
 // filters
 const btn=d.getElementById('filtersBtn'),panel=d.getElementById('filterPanel');
 ok(btn.textContent.trim().startsWith('Filters')&&!/·/.test(btn.textContent),'Filters label, none');
 ok(!panel.classList.contains('open'),'collapsed by default');
 ok(d.getElementById('filterSummary').style.display==='none','no summary when no filters');
 btn.click(); ok(panel.classList.contains('open')&&btn.getAttribute('aria-expanded')==='true','opens');
 ok(!d.getElementById('monthFilter')&&[...d.querySelectorAll('#filterPanel .month-pill')].every(p=>!/^(All months|[A-Z][a-z]{2} \d{4})/.test(p.textContent.trim())),'no month pills in the filter panel (2.11.0)');
 [...d.querySelectorAll('#categoryFilter .month-pill')].find(p=>/Vehicle/.test(p.textContent)).click();
 ok(/Filters · 1/.test(btn.textContent)&&btn.classList.contains('active'),'count 1 active (category only)');
 ok(d.getElementById('filterNote').textContent==='Showing Vehicle','summary: '+d.getElementById('filterNote').textContent);
 ok(panel.classList.contains('open'),'panel stays open after pick');
 ok(d.getElementById('statCount').textContent==='1','stats follow filters');
 d.getElementById('filterClear').click();
 ok(d.getElementById('filtersBtnLabel').textContent==='Filters'&&!btn.classList.contains('active')&&w.eval('typeof activeMonthFilter')==='undefined'&&w.eval('activeCategoryFilter')==='All'&&w.eval('sortMode')==='month','clear resets');
 btn.click(); ok(!panel.classList.contains('open'),'collapses');
 btn.click();
 w.switchTab('completed');
 ok(btn.style.display==='none'&&!panel.classList.contains('open'),'completed hides filters');
 ok(!/\(\d+\)/.test(d.querySelector('.view-tabs').textContent),'no (0) on completed');
 w.switchTab('active'); ok(panel.classList.contains('open')&&btn.style.display==='','filters state restored on Active');
 // activity
 const ab=d.getElementById('activityToggle'),ap=d.getElementById('activityPanel');
 ok(!ap.classList.contains('open'),'activity closed');
 ok(d.querySelector('.view-tabs').contains(ab),'activity in tab row');
 ab.click(); ok(ap.classList.contains('open')&&ab.getAttribute('aria-expanded')==='true','activity opens');
 d.body.click(); ok(!ap.classList.contains('open'),'outside click closes');
 ab.click(); d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true})); ok(!ap.classList.contains('open'),'Escape closes');
 ok(d.getElementById('activityCount').textContent===String(w.eval('activity.length')),'count shown');
 ok(!d.getElementById('completedCount'),'completedCount gone');
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
