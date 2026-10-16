// shared harness for the 2.9.0 tests
const {JSDOM}=require('jsdom');
const fs=require('fs');
const html=require('./build-app').buildApp();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let fails=0,pass=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); c?pass++:fails++; };
function boot(opts){
  opts=opts||{};
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/',beforeParse(w){
    for(const k of ['alert','confirm','prompt']) w[k]=()=>{ throw new Error('window.'+k+' used'); };
    if(opts.noStorage){ Object.defineProperty(w,'localStorage',{get(){ throw new Error('storage blocked'); }}); }
    else if(opts.ls){ for(const k in opts.ls) w.localStorage.setItem(k,opts.ls[k]); }
    if(opts.cloud) w.__cloudAdapterFactory=opts.cloud;
    w.URL.createObjectURL=()=>'blob:x'; w.URL.revokeObjectURL=()=>{};
    if(opts.hook) opts.hook(w);
  }});
  const w=dom.window; w.document.getElementById('app').style.display='block';
  w.eval(`household={name:'Sam',code:'TEST-CODE-1234'}; people=[{id:1,name:'Sam',photo:null},{id:2,name:'Alex',photo:null}];`);
  return w;
}
const mk=(o)=>Object.assign({category:'Home',subcategory:'',cost:100,saved:0,owner:'',link:'',note:'',completed:false},o);
function setItems(w,arr){ w.eval(`items=${JSON.stringify(arr.map(mk))}; render();`); }
const finish=(code)=>{ console.log(`\n${pass} passed, ${fails} failed`); process.exit(fails?1:code||0); };
module.exports={JSDOM,html,sleep,ok,boot,mk,setItems,finish,counts:()=>({pass,fails})};
