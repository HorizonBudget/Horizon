const {sleep,ok,boot,setItems,finish}=require('./lib/h.js');
(async()=>{
  const w=boot(), d=w.document, $=id=>d.getElementById(id);
  const next=(m,every,unit)=>w.eval(`nextRepeatMonth(${JSON.stringify(m)},{every:${every},unit:'${unit}'})`);
  // ---- date math
  ok(next('Oct 2026',1,'month')==='Nov 2026','monthly Oct -> Nov');
  ok(next('Dec 2026',1,'month')==='Jan 2027','monthly Dec -> Jan (year rollover)');
  ok(next('Nov 2026',3,'month')==='Feb 2027','every 3 months Nov -> Feb next year');
  ok(next('Jan 2026',14,'month')==='Mar 2027','every 14 months crosses a year');
  ok(next('Jan 2026',99,'month')==='Apr 2034','every 99 months');
  ok(next('Dec 2026',1,'year')==='Dec 2027','yearly Dec -> Dec');
  ok(next('Feb 2026',2,'year')==='Feb 2028','every 2 years');
  ok(next('Oct 2026',1,'week')==='Nov 2026','weekly lands in the next month');
  ok(next('Dec 2026',1,'week')==='Jan 2027','weekly Dec -> Jan');
  ok(next('Oct 2026',2,'week')==='Nov 2026','every 2 weeks -> +1 month');
  ok(next('Oct 2026',4,'week')==='Nov 2026','every 4 weeks (round(.93)=1) -> +1');
  ok(next('Oct 2026',8,'week')==='Dec 2026','every 8 weeks (round(1.87)=2) -> +2');
  ok(next('Oct 2026',52,'week')==='Oct 2027','every 52 weeks (round(12.13)=12) -> +12');
  ok(next('No date yet',1,'month')==='No date yet' && next('No date yet',1,'year')==='No date yet' && next('No date yet',3,'week')==='No date yet','No date yet stays No date yet');
  ok(next('garbage',1,'month')==='No date yet','unreadable month -> No date yet');
  ok(w.eval(`nextRepeatMonth('Oct 2026',null)`)==='Oct 2026' && w.eval(`nextRepeatMonth('Oct 2026',{every:0,unit:'month'})`)==='Oct 2026','no/invalid repeat leaves month alone');
  ok(w.eval(`[1,2,3,4,5,6,7,8,9,10,11,12].map(m=>nextRepeatMonth(formatMonth(2026,m-1),{every:1,unit:'month'})).join()`)==='Feb 2026,Mar 2026,Apr 2026,May 2026,Jun 2026,Jul 2026,Aug 2026,Sep 2026,Oct 2026,Nov 2026,Dec 2026,Jan 2027','all 12 months roll correctly');
  ok(w.eval(`FUTURE_MONTHS.every(m=>formatMonth(parseMonth(m).y,parseMonth(m).m)===m)`) && w.eval(`FUTURE_MONTHS[0]`)===w.eval(`formatMonth(new Date().getFullYear(),new Date().getMonth())`),'FUTURE_MONTHS use the same format/parse');
  ok(w.eval(`repeatLabel({every:1,unit:'month'})`)==='Repeats monthly' && w.eval(`repeatLabel({every:1,unit:'week'})`)==='Repeats weekly' && w.eval(`repeatLabel({every:1,unit:'year'})`)==='Repeats yearly' && w.eval(`repeatLabel({every:3,unit:'month'})`)==='Repeats every 3 months' && w.eval(`repeatLabel({every:2,unit:'week'})`)==='Repeats every 2 weeks','labels');
  ok(w.eval(`normalizeRepeat({every:100,unit:'month'})`)===null && w.eval(`normalizeRepeat({every:2,unit:'day'})`)===null && w.eval(`normalizeRepeat({every:0,unit:'week'})`)===null && w.eval(`normalizeRepeat('x')`)===null && w.eval(`normalizeRepeat({every:3,unit:'year'}).every`)===3,'normalizeRepeat rejects bad data');

  // ---- completion creates the next item
  const M0=w.eval('FUTURE_MONTHS[0]'), M1=w.eval('FUTURE_MONTHS[1]');
  setItems(w,[
    {id:1,name:'Car wash plan',category:'Vehicle',subcategory:'Honda',owner:'Sam',cost:25.5,month:M0,link:'https://x.example.com/a',note:'Use coupon',repeat:{every:1,unit:'month'},saved:0},
    {id:2,name:'Legacy',month:M0,cost:10},
    {id:3,name:'Undated repeat',month:'No date yet',cost:5,repeat:{every:1,unit:'year'}},
    {id:4,name:'Decemberly',month:'Dec 2026',cost:5,repeat:{every:1,unit:'month'}},
    {id:5,name:'Far yearly',month:w.eval('FUTURE_MONTHS[20]'),cost:60,repeat:{every:2,unit:'year'}},
  ]);
  const item=id=>w.eval(`items.find(i=>i.id===${id})`);
  w.finishCompleting(1,{actualCost:20});
  let all=w.eval('items'); const copy=all.find(i=>i.id!==1&&i.name==='Car wash plan');
  ok(all.length===6 && !!copy,'one new item created');
  ok(copy.completed===false && !('actualCost' in copy) && !('deletedAt' in copy),'copy is active with no actualCost');
  ok(copy.id!==1 && typeof copy.id==='number' && all.filter(i=>i.id===copy.id).length===1,'fresh unique id');
  ok(copy.month===w.eval(`nextRepeatMonth(${JSON.stringify(M0)},{every:1,unit:'month'})`) && copy.month!==M0,'month advanced: '+M0+' -> '+copy.month);
  ok(['name','category','subcategory','cost','owner','link','note'].every(k=>copy[k]===item(1)[k]) && JSON.stringify(copy.repeat)===JSON.stringify(item(1).repeat),'name/category/subcategory/cost/owner/link/note/repeat copied');
  ok(copy.repeat!==item(1).repeat,'repeat object not shared');
  ok(item(1).completed===true && item(1).actualCost===20,'original completed with its actual price');
  const acts=w.eval('activity.map(a=>a.text)');
  ok(acts[0].includes('marked “Car wash plan” as complete') && acts[0].includes('paid $20') && acts[0].includes('next one added for '+copy.month),'activity mentions the next one: '+acts[0]);
  ok(/Next one added for /.test($('toast').textContent) && $('toast').textContent.includes(copy.month),'toast says Next one added for <month>: '+$('toast').textContent);
  // legacy item
  w.finishCompleting(2); ok(w.eval('items.length')===6 && item(2).completed && !/Next one/.test($('toast').textContent),'legacy item without repeat: no copy, no "Next one" toast');
  // no date
  w.finishCompleting(3); const c3=w.eval('items').find(i=>i.id!==3&&i.name==='Undated repeat');
  ok(c3&&c3.month==='No date yet'&&c3.completed===false,'No date yet stays No date yet'); 
  ok(/no date/i.test(w.eval('activity[0].text'))||/No date yet/.test(w.eval('activity[0].text')),'activity for undated copy: '+w.eval('activity[0].text'));
  // December
  w.finishCompleting(4); ok(w.eval('items').find(i=>i.id!==4&&i.name==='Decemberly').month==='Jan 2027','Dec 2026 monthly -> Jan 2027');
  // beyond FUTURE_MONTHS
  w.finishCompleting(5); const far=w.eval('items').find(i=>i.id!==5&&i.name==='Far yearly');
  ok(w.eval(`FUTURE_MONTHS.indexOf(${JSON.stringify(far.month)})`)===-1,'far copy is beyond the 24-month list: '+far.month);
  // displays + sorts + selectable
  w.eval(`activeTab='active';render()`);
  const names=[...d.querySelectorAll('#itemsList .month-group-btn .mg-name')].map(x=>x.textContent);
  ok(names.includes(far.month) && names[names.length-1]==='No date yet' && names.indexOf(far.month)===names.length-2,'far month displays as its own group before "No date yet": '+names);
  ok(names.indexOf(M1)<names.indexOf(far.month),'chronological ordering holds');
  const fid=far.id; w.editItem(fid);
  ok($('f_month').value===far.month && [...$('f_month').options].map(o=>o.value).includes(far.month),'editing keeps the far month selected (no silent reset)');
  ok(w.eval(`document.getElementById('f_month').value`)===far.month,'month select value'); w.saveItem();
  ok(w.eval(`items.find(i=>i.id===${fid}).month`)===far.month,'saving without touching month keeps it');
  // filters list the far month
  ok(!d.getElementById('monthFilter'),'no month filter pills (the month groups replace them)');
  // past month item can be edited without losing its month
  setItems(w,[{id:30,name:'Past',month:'Jan 2020',cost:3}]); w.editItem(30);
  ok($('f_month').value==='Jan 2020','past month stays selected when editing'); w.closeItemModal();

  // ---- badge
  setItems(w,[{id:1,name:'R1',month:M0,cost:1,repeat:{every:1,unit:'month'}},{id:2,name:'R2',month:M0,cost:1,repeat:{every:3,unit:'month'}},{id:3,name:'Plain',month:M0,cost:1},{id:4,name:'Bad',month:M0,cost:1,repeat:{every:500,unit:'month'}}]);
  const badge=n=>{ const c=[...d.querySelectorAll('#itemsList .item-card')].find(c=>c.querySelector('.item-name').textContent===n); return c.querySelector('.tag-repeat'); };
  ok(badge('R1').textContent==='🔁' && badge('R1').title==='Repeats monthly' && badge('R1').getAttribute('aria-label')==='Repeats monthly','badge with title "Repeats monthly"');
  ok(badge('R2').title==='Repeats every 3 months','custom title');
  ok(!badge('Plain') && !badge('Bad'),'no badge without a valid repeat');
  // badge on completed view
  w.eval(`items[0].completed=true;activeTab='completed';render()`);
  ok(!!d.querySelector('#itemsList .tag-repeat'),'badge also on completed cards'); w.eval(`activeTab='active';render()`);

  // ---- modal UI
  w.openItemModal();
  ok($('f_repeat').value==='' && $('repeatCustomRow').style.display==='none' && [...$('f_repeat').options].map(o=>o.textContent).join('|')==='Doesn’t repeat|Weekly|Monthly|Yearly|Custom…','default Doesn’t repeat, options listed');
  ok(/Repeat/.test(d.querySelector('label[for=f_repeat]').textContent),'labelled Repeat');
  const fill=(n,c)=>{ $('f_name').value=n; $('f_cost').value=c; };
  fill('Nothing',10); w.saveItem(); ok(!('repeat' in w.eval('items.find(i=>i.name==="Nothing")')),'default saves without a repeat key');
  w.openItemModal(); fill('Weekly one',10); $('f_repeat').value='week'; w.saveItem();
  ok(JSON.stringify(w.eval('items.find(i=>i.name==="Weekly one").repeat'))==='{"every":1,"unit":"week"}','Weekly -> {every:1,unit:week}');
  w.openItemModal(); fill('Monthly one',10); $('f_repeat').value='month'; w.saveItem(); ok(JSON.stringify(w.eval('items.find(i=>i.name==="Monthly one").repeat'))==='{"every":1,"unit":"month"}','Monthly');
  w.openItemModal(); fill('Yearly one',10); $('f_repeat').value='year'; w.saveItem(); ok(JSON.stringify(w.eval('items.find(i=>i.name==="Yearly one").repeat'))==='{"every":1,"unit":"year"}','Yearly');
  w.openItemModal(); fill('Custom one',10); $('f_repeat').value='custom'; $('f_repeat').dispatchEvent(new w.Event('change'));
  ok($('repeatCustomRow').style.display!=='none' && /Every/.test($('repeatCustomRow').textContent) && $('f_repeatEvery').min==='1' && $('f_repeatEvery').max==='99','Custom reveals Every [N] [unit]');
  ok([...$('f_repeatUnit').options].map(o=>o.value).join()==='week,month,year','units weeks/months/years');
  $('f_repeatEvery').value='3'; $('f_repeatEvery').dispatchEvent(new w.Event('input')); $('f_repeatUnit').value='month';
  ok([...$('f_repeatUnit').options].map(o=>o.textContent).join()==='weeks,months,years','plural unit labels for N=3');
  $('f_repeatEvery').value='1'; $('f_repeatEvery').dispatchEvent(new w.Event('input'));
  ok([...$('f_repeatUnit').options].map(o=>o.textContent).join()==='week,month,year','singular for N=1');
  ok(/a new one is added/.test($('repeatHint').textContent),'hint explains what happens (no date: '+$('repeatHint').textContent);
  $('f_repeatEvery').value='3'; $('f_repeatEvery').dispatchEvent(new w.Event('input'));
  w.saveItem(); ok(JSON.stringify(w.eval('items.find(i=>i.name==="Custom one").repeat'))==='{"every":3,"unit":"month"}','Custom saves {every:3,unit:month}');
  // validation
  for(const bad of ['0','100','-2','1.5','abc','']){
    w.openItemModal(); fill('Bad '+bad,10); $('f_repeat').value='custom'; w.onRepeatChange(); $('f_repeatEvery').value=bad; const n=w.eval('items.length'); w.saveItem();
    const dlg=$('confirmOverlay').style.display==='flex';
    ok(dlg && /1 to 99/.test($('confirmMsg').textContent) && w.eval('items.length')===n && $('itemOverlay').style.display==='flex','invalid every "'+bad+'" rejected in-app, modal stays open');
    $('confirmOk').click(); w.closeItemModal();
  }
  for(const good of ['1','99']){ w.openItemModal(); fill('Edge '+good,10); $('f_repeat').value='custom'; w.onRepeatChange(); $('f_repeatEvery').value=good; w.saveItem(); ok(w.eval(`items.find(i=>i.name==="Edge ${good}").repeat.every`)===Number(good),'every '+good+' accepted'); }
  // editing loads the repeat back
  const idOf=n=>w.eval(`items.find(i=>i.name===${JSON.stringify(n)}).id`);
  w.editItem(idOf('Monthly one')); ok($('f_repeat').value==='month' && $('repeatCustomRow').style.display==='none','edit loads Monthly');
  w.closeItemModal();
  w.editItem(idOf('Custom one')); ok($('f_repeat').value==='custom' && $('f_repeatEvery').value==='3' && $('f_repeatUnit').value==='month' && $('repeatCustomRow').style.display!=='none','edit loads Custom 3 months');
  $('f_repeat').value=''; w.saveItem(); ok(!('repeat' in w.eval(`items.find(i=>i.name==="Custom one")`)),'switching to Doesn’t repeat removes repeat');
  w.editItem(idOf('Nothing')); ok($('f_repeat').value==='' && $('repeatCustomRow').style.display==='none','edit of non-repeating item shows default'); w.closeItemModal();
  // custom 2 months item (not 1) loads as custom, but {every:2,unit:'year'} too
  setItems(w,[{id:50,name:'Two years',month:M0,cost:1,repeat:{every:2,unit:'year'}}]); w.editItem(50); ok($('f_repeat').value==='custom' && $('f_repeatUnit').value==='year' && $('f_repeatEvery').value==='2','every 2 years loads as custom'); w.closeItemModal();

  // ---- restoring a repeating item does not delete the next one
  setItems(w,[{id:60,name:'Rent fund',month:M0,cost:5,repeat:{every:1,unit:'month'}}]);
  w.finishCompleting(60); const before=w.eval('items.length');
  w.restoreItem(60);
  ok(w.eval('items.length')===before && w.eval('items.find(i=>i.id===60).completed')===false,'restore keeps the already-created next item (items: '+before+')');
  // snapshot sync: no new top-level fields
  ok(JSON.stringify(Object.keys(w.eval('snapshotState()')).sort())==='["activity","categories","householdName","items","people","subcategories"]','snapshot keys unchanged (rules allowlist)');
  finish();
})().catch(e=>{console.log('ERR',e);process.exit(2)});
