// Faster first draw: cards are only built for what can be seen (collapsed months build theirs when opened, the hidden
// side waits until it is shown, a big board's first draw adds its far cards a moment later), and photos on cards use
// one short address per photo. Everything must look and work exactly as before.
const {sleep,ok,boot,mk,finish}=require('./lib/h.js');
(async()=>{
  const M=(w,i)=>w.eval(`FUTURE_MONTHS[${i}]`);
  const big=(w,n)=>{
    const arr=[];
    for(let i=0;i<n;i++) arr.push(mk({id:i+1,name:'Item '+i,category:['Home','Kids','Vehicle'][i%3],cost:10+i,month:i%10===9?'No date yet':M(w,i%6),owner:['Sam','Alex',''][i%3]}));
    return arr;
  };
  const cardIds=d=>[...d.querySelectorAll('#itemsList .item-card')].map(c=>c.dataset.itemId);
  const headCounts=d=>[...d.querySelectorAll('#itemsList .month-group')].map(s=>s.dataset.month+'='+s.querySelector('.mg-count').textContent+'/'+s.querySelector('.mg-total').textContent);

  // ---------- a big board's first draw ----------
  {
    const w=boot(), d=w.document, $=id=>d.getElementById(id);
    const arr=big(w,120);
    w.eval(`items=${JSON.stringify(arr)}; render();`);
    const first=cardIds(d).length;
    ok(first>0 && first<120,'first draw builds the top cards right away: '+first);
    ok($('statCount').textContent==='120' && $('statNeeded').textContent==='$'+arr.reduce((s,i)=>s+i.cost,0).toLocaleString(),'totals cover every item straight away');
    const heads=headCounts(d);
    ok(heads.length===7 && d.querySelectorAll('#itemsList .month-group-btn[aria-expanded="true"]').length===7,'every month header (count and total) is there straight away');
    for(let t=0;t<100 && cardIds(d).length<120;t++) await sleep(50);
    const ids=cardIds(d);
    ok(ids.length===120 && new Set(ids).size===120,'a moment later every card is there, once: '+ids.length);
    // same order as a full draw: month by month, items in list order inside each month
    w.render();
    ok(cardIds(d).join()===ids.join() && headCounts(d).join()===heads.join(),'the later cards land in the same order as a full draw');
    ok(cardIds(d).length===120,'later draws build everything at once');

    // collapsed months build their cards only when opened, and keep count + total in the header
    const m0=M(w,0), n0=arr.filter(i=>i.month===m0).length;
    w.toggleMonthGroup(m0);
    const sec=()=>d.querySelector(`#itemsList .month-group[data-month="${m0}"]`);
    ok(sec().classList.contains('collapsed') && sec().querySelectorAll('.item-card').length===0 && sec().querySelector('.mg-count').textContent===n0+' items','a collapsed month has no cards built but shows its count');
    sec().querySelector('.month-group-btn').click();
    ok(!sec().classList.contains('collapsed') && sec().querySelectorAll('.item-card').length===n0,'opening it shows its cards');
    w.setAllMonthsCollapsed(true);
    ok(d.querySelectorAll('#itemsList .item-card').length===0 && $('collapseAllBtn').textContent==='Expand all','Collapse all: no cards built');
    w.setAllMonthsCollapsed(false);
    ok(d.querySelectorAll('#itemsList .item-card').length===120 && $('collapseAllBtn').textContent==='Collapse all','Expand all: every card back');

    // a redraw while the later cards are still waiting replaces them (no doubles)
    const w2=boot(), d2=w2.document;
    w2.eval(`items=${JSON.stringify(arr)}; render();`);
    ok(cardIds(d2).length<120,'second window: first draw is partial');
    w2.eval(`items.find(i=>i.id===1).cost=999; render();`);
    ok(cardIds(d2).length===120,'a change during the first draw draws everything');
    await sleep(1000);
    ok(cardIds(d2).length===120 && new Set(cardIds(d2)).size===120,'no card is added twice afterwards');
    // a small board is drawn whole at once
    const w3=boot(), d3=w3.document;
    w3.eval(`items=${JSON.stringify(big(w3,12))}; render();`);
    ok(cardIds(d3).length===12,'a small board draws every card at once');
  }

  // ---------- the hidden side is built when it is shown ----------
  {
    const w=boot(), d=w.document, $=id=>d.getElementById(id);
    const arr=big(w,10);
    w.eval(`items=${JSON.stringify(arr)};
      items.push({id:501,kind:'todo',name:'Call the shop',completed:false,owner:'Sam',linkId:9,createdAt:1},
                 {id:502,kind:'todo',name:'Old job',completed:true,completedAt:5,owner:'',createdAt:2},
                 {id:503,kind:'todo',name:'Measure',completed:false,owner:'',due:todoDateStr(-2),createdAt:3});
      render();`);
    ok(d.querySelectorAll('#todoList .todo-row').length===0 && $('sideTodoCount').textContent==='2' && !$('sideTodoCount').hidden && $('sideTodoCount').classList.contains('has-overdue'),'Budget side: no to-do rows built, but the To-do count and overdue color are right');
    ok(d.querySelectorAll('#itemsList .item-card').length===10,'Budget side: cards built');
    const tag=d.querySelector('#itemsList [data-item-id="9"] .tag-todo');
    ok(!!tag && /0\/1 to-do/.test(tag.textContent),'linked to-do tag on the card');
    w.setSide('todo');
    ok(d.querySelectorAll('#todoList .todo-row').length===2 && d.querySelectorAll('#itemsList .item-card').length===0,'To-do side: rows built, budget cards not');
    ok($('todoCountNote').textContent==='2 to do · 1 overdue' && $('statCount').textContent==='10','both sides keep their counts');
    ok(!!d.querySelector('#todoDoneToggle') && /1/.test(d.querySelector('#todoDoneToggle .mg-count').textContent),'Done (1) is there');
    // collapsed to-do group: no rows until opened
    w.toggleTodoGroup('overdue');
    const og=()=>d.querySelector('#todoList .todo-group[data-group="overdue"]');
    ok(og().querySelectorAll('.todo-row').length===0 && og().querySelector('.mg-count').textContent==='1 to-do','collapsed to-do group: count, no rows');
    w.toggleTodoGroup('overdue');
    ok(og().querySelectorAll('.todo-row').length===1,'opened again: its row is back');
    // search covers both sides while neither board is showing
    w.openSearch(); $('searchInput').value='shop'; w.onSearchInput();
    ok(d.querySelectorAll('#searchTodos .todo-row').length===1 && d.querySelectorAll('#todoList .todo-row').length===0,'searching: results built, the hidden list is not');
    w.closeSearch();
    ok(d.querySelectorAll('#todoList .todo-row').length===2,'closing the search brings the rows back');
    // the 💵 chip jumps into a collapsed month and flashes the card
    const target=arr.find(i=>i.id===9), tm=target.month;
    w.eval(`collapsedMonths.add(${JSON.stringify(tm)}); saveCollapsedMonths();`);
    d.querySelector('#todoList [data-todo-id="501"] .todo-link-chip').click();
    const card=d.querySelector('#itemsList [data-item-id="9"]');
    ok(w.eval('uiSide')==='budget' && !!card && card.classList.contains('is-new') && !w.eval(`collapsedMonths.has(${JSON.stringify(tm)})`),'chip jump opens the collapsed month and flashes the card');
  }

  // ---------- chip jump when the board's first draw is still adding cards ----------
  {
    const w=boot({ls:{ledgerSettings:JSON.stringify({side:'todo'})}}), d=w.document;
    const arr=big(w,120);
    w.eval(`uiSide='todo'; items=${JSON.stringify(arr)}; items.push({id:601,kind:'todo',name:'Far one',completed:false,owner:'',linkId:118,createdAt:1}); render();`);
    ok(d.querySelectorAll('#itemsList .item-card').length===0 && w.eval('boardCardsDrawn')===false,'starting on the To-do side: no budget cards built');
    d.querySelector('#todoList [data-todo-id="601"] .todo-link-chip').click();
    const card=d.querySelector('#itemsList [data-item-id="118"]');
    ok(!!card && card.classList.contains('is-new'),'jumping to a far item on the first Budget draw still finds and flashes it');
    await sleep(1000);
    ok(cardIds(d).length===120 && new Set(cardIds(d)).size===120,'and the board ends up whole, without doubles');
  }

  // ---------- link lookups and photos ----------
  {
    const w=boot(), d=w.document;
    w.eval(`items=${JSON.stringify(big(w,6))};
      items.push({id:701,kind:'todo',name:'A',completed:false,linkId:'2',createdAt:1},{id:702,kind:'todo',name:'B',completed:true,linkId:2,createdAt:2},
                 {id:703,kind:'todo',name:'C gone',completed:false,linkId:2,deletedAt:Date.now(),createdAt:3}); render();`);
    ok(w.eval('linkedTodosFor(findLiveItem(2)).map(t=>t.name).join()')==='A,B','linkedTodosFor outside a draw');
    const tag=d.querySelector('#itemsList [data-item-id="2"] .tag-todo');
    ok(!!tag && /1\/2 to-dos/.test(tag.textContent),'card tag uses the same links during a draw: '+(tag&&tag.textContent));
    ok(w.eval('todoLinkedItem(findLiveTodo(701)).name')==='Item 1','todoLinkedItem outside a draw');
    w.eval(`items.find(i=>i.id===2).deletedAt=Date.now(); render();`);
    ok(w.eval('todoLinkedItem(findLiveTodo(701))')===null,'a deleted budget item is no longer linked');
    // photos: cards point at one short address per photo; other avatars are unchanged
    let made=0;
    w.URL.createObjectURL=()=>'blob:photo-'+(++made);
    w.eval(`people[0].photo='data:image/jpeg;base64,'+btoa('fake-jpeg-bytes'); items.find(i=>i.id===2).deletedAt=undefined; delete items.find(i=>i.id===2).deletedAt; render();`);
    const imgs=[...d.querySelectorAll('#itemsList .item-card img.avatar')];
    ok(imgs.length===2 && imgs.every(i=>i.getAttribute('src')==='blob:photo-1' && i.classList.contains('avatar-lg') && i.alt==='Sam'),'card photos share one short address: '+imgs.map(i=>i.getAttribute('src')).join());
    ok(made===1,'the photo is converted once');
    w.render();
    ok(made===1,'and not again on the next draw');
    ok(w.eval(`avatarHtml('Sam')`).includes('data:image/jpeg'),'avatarHtml() elsewhere still uses the photo as stored');
    w.eval(`people[0].photo=null; render();`);
    ok(d.querySelectorAll('#itemsList .item-card img.avatar').length===0 && d.querySelectorAll('#itemsList .item-card .avatar').length===4,'no photo: initials as before');
    ok(w.eval(`photoSrc('https://example.com/a.jpg')`)==='https://example.com/a.jpg','a non-data photo is used as it is');
    // changing a photo: cards show the new one and the old short address is let go
    const revoked=[];
    w.URL.revokeObjectURL=u=>revoked.push(u);
    w.eval(`people[0].photo='data:image/jpeg;base64,'+btoa('photo-one'); render();`);
    const one=d.querySelector('#itemsList .item-card img.avatar').getAttribute('src');
    w.eval(`people[0].photo='data:image/jpeg;base64,'+btoa('photo-two'); render();`);
    const two=[...d.querySelectorAll('#itemsList .item-card img.avatar')].map(i=>i.getAttribute('src'));
    ok(two.length===2 && two.every(s=>s!==one && /^blob:photo-/.test(s)),'after a photo change the cards show the new photo: '+one+' -> '+two.join());
    ok(revoked.includes(one) && !revoked.includes(two[0]),'the old photo address is revoked, the new one kept: '+revoked.join());
    w.eval(`people[0].photo=null; render();`);
    w.eval(`photoSrc('data:image/png;base64,'+btoa('x'))`);
    ok(revoked.includes(two[0]) && w.eval('photoUrlCache.size')===1,'a removed photo is let go the next time a photo is converted');
  }
  // ---------- after a reload while scrolled down: every card is built and the page goes back to its spot ----------
  {
    const w=boot(), d=w.document;
    const scrolls=[];
    w.scrollTo=(x,y)=>scrolls.push(y);
    let tall=0;
    Object.defineProperty(d.documentElement,'scrollHeight',{configurable:true,get:()=>tall});
    w.eval(`restoreLeftAtY=5000;`);
    w.eval(`render();`);
    ok(scrolls.length===0 && w.eval('restoreLeftAtY')===5000,'empty board (data still coming): waits');
    tall=20000;
    w.eval(`items=${JSON.stringify(big(w,120))}; render();`);
    ok(cardIds(d).length===120,'a reload that will restore the spot builds every card at once');
    ok(scrolls.join()==='5000' && w.eval('restoreLeftAtY')===0,'and scrolls back to where the page was, once: '+scrolls.join());
    w.render();
    ok(scrolls.length===1,'later draws do not scroll');
    // a scroll/tap first cancels it
    const reload=w=>{ w.performance.getEntriesByType=t=>t==='navigation'?[{type:'reload'}]:[]; w.sessionStorage.setItem('horizonLeftAtY','5000'); };
    const w3=boot({hook:reload});
    ok(w3.eval('restoreLeftAtY')===5000 && w3.history.scrollRestoration==='manual','a reload left at 5000px: remembered, browser restoring off');
    const w2=boot({hook:reload}), d2=w2.document, s2=[];
    w2.scrollTo=(x,y)=>s2.push(y);
    Object.defineProperty(d2.documentElement,'scrollHeight',{configurable:true,get:()=>20000});
    w2.dispatchEvent(new w2.Event('wheel'));
    w2.eval(`items=${JSON.stringify(big(w2,60))}; render();`);
    ok(s2.length===0,'someone scrolling first: no jump');
    ok(w.eval(`leftAtToRestore()`)===0,'a fresh open (not a reload) restores nothing');
  }
  finish();
})().catch(e=>{ console.error(e); process.exit(1); });
