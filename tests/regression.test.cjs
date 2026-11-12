const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=n=>fs.readFileSync(path.join(root,n),'utf8');
async function harness(route,html){
  const dom=new JSDOM(html,{url:'https://workspace.google.com/business/signup/'+route,runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;
  Object.defineProperty(w.HTMLElement.prototype,'innerText',{get(){return this.textContent;}});
  w.HTMLElement.prototype.getClientRects=function(){return this.hidden?[]:[{width:100,height:30}];};
  let job={id:'run1',tabId:1,domain:'example.co.jp',contact:{company:'test',last:'test',first:'test',email:'test@example.com'},started:Date.now(),status:'running',actions:{},submitted:false,domainSeen:null};
  let listener,alarm;
  const chrome={runtime:{getURL:n=>'chrome-extension://test/'+n,onMessage:{addListener:f=>listener=f}},storage:{session:{get:async()=>({job:structuredClone(job)}),set:async x=>{job=structuredClone(x.job);}}},action:{onClicked:{addListener(){}}},tabs:{onRemoved:{addListener(){}},create:async()=>({id:1}),update:async()=>{}},alarms:{create:async()=>{},clear:async()=>{},onAlarm:{addListener:f=>alarm=f}}};
  vm.runInNewContext(source('background.js'),{chrome,GG:require(path.join(root,'core.js')),importScripts(){},crypto:require('node:crypto'),Date});
  const send=(msg,sender={tab:{id:1},frameId:0,url:w.location.href})=>new Promise(resolve=>listener(msg,sender,resolve));
  let tick;
  w.setInterval=f=>{tick=f;};
  w.chrome={runtime:{sendMessage:send}};
  w.eval(source('core.js'));
  w.eval(source('content.js'));
  const settle=async()=>{for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r));};
  await settle();
  return {w,dom,send,job:()=>job,setJob:patch=>Object.assign(job,patch),alarm:async()=>{alarm({name:'timeout'});await settle();},tick:async()=>{await tick();await settle();},navigate:(r,h)=>{w.history.pushState({},'',r);w.document.body.innerHTML=h;},close:()=>w.close()};
}
const contact='<h2>ご連絡先をお知らせください。</h2><div><span>姓</span><input value="担当" placeholder="姓を入力"></div><div><span>名</span><input value="営業" placeholder="名を入力"></div><div><span>現在のメールアドレス</span><input type="email" value="sales@example.net" placeholder="name@example.com"></div><button>次へ</button>';
const bring='<h2>企業または組織のドメイン名をご入力ください</h2><div><span>ご利用のドメイン名</span><input placeholder="例: example.com"></div><button>次へ</button>';
const confirm=domain=>'<h2>このドメインを使ってアカウントを設定しますか？</h2><p>このアカウントでメールを設定するまで、'+domain+' 宛てのメールに影響はありません。</p><button>次へ</button>';
test('入力済み連絡先: label関連付けなしでも既存値を維持して次へ',async()=>{const h=await harness('contact',contact);assert.equal(h.job().actions.contactNext,true);assert.deepEqual([...h.w.document.querySelectorAll('input')].map(e=>e.value),['担当','営業','sales@example.net']);h.close();});
test('aria-labelとplaceholderが違っても空の連絡先を補完して送信',async()=>{const h=await harness('contact','<input aria-label="姓" placeholder="姓を入力"><input aria-label="名" placeholder="名を入力"><input aria-label="現在のメールアドレス" type="email" placeholder="例: name@example.com"><button>次へ</button>');await h.tick();assert.equal(h.job().actions.contactNext,true);assert.equal(h.w.document.querySelector('[type=email]').value,'test@example.com');h.close();});
test('曖昧な連絡先画面は勝手に送信しない',async()=>{const h=await harness('contact','<input><input><input><input><button>次へ</button>');await h.tick();assert.equal(h.job().actions.contactNext,undefined);h.close();});
test('ドメイン欄が構造上のラベルでも入力と次へを実行、送信は1回',async()=>{const h=await harness('bring',bring);let clicks=0;h.w.document.querySelector('button').onclick=()=>clicks++;assert.equal(h.w.document.querySelector('input').value,'example.co.jp');await h.tick();await h.tick();assert.equal(clicks,1);assert.equal(h.job().submitted,true);assert.equal(h.job().domainSeen,'example.co.jp');h.close();});
test('遅れて有効になる次へボタンを待つ',async()=>{const h=await harness('bring',bring.replace('<button>','<button disabled>'));await h.tick();assert.equal(h.job().submitted,false);h.w.document.querySelector('button').disabled=false;await h.tick();assert.equal(h.job().submitted,true);h.close();});
test('確認画面のURLが先に切り替わっても本文の描画を待ってOK、次へは押さない',async()=>{const h=await harness('bring',bring);await h.tick();h.navigate('/business/signup/bringconfirm','<div>読み込み中</div>');await h.tick();assert.equal(h.job().status,'running');h.w.document.body.innerHTML=confirm('example.co.jp');let clicks=0;h.w.document.querySelector('button').onclick=()=>clicks++;await h.tick();assert.equal(h.job().status,'ok');assert.equal(clicks,0);h.close();});
test('手動クリックで進んでも対象ドメインを確認してOK',async()=>{const h=await harness('bring',bring);assert.equal(h.job().submitted,false);h.w.document.querySelector('button').onclick=()=>h.navigate('/business/signup/bringconfirm',confirm('example.co.jp'));h.w.document.querySelector('button').click();await h.tick();assert.equal(h.job().status,'ok');h.close();});
test('別ドメインまたは過去の確認画面はOKにしない',async()=>{const h=await harness('bringconfirm',confirm('example.co.jp'));await h.tick();assert.notEqual(h.job().status,'ok');h.setJob({domainSeen:'example.co.jp'});h.w.document.body.innerHTML=confirm('other.co.jp');await h.tick();assert.notEqual(h.job().status,'ok');h.close();});
test('タイムアウト後も同じ実行の手動確認を15分まで受け付ける',async()=>{const h=await harness('bring',bring);await h.alarm();assert.equal(h.job().status,'unknown');assert.equal(h.job().recoverable,true);h.navigate('/business/signup/bringconfirm',confirm('example.co.jp'));await h.tick();assert.equal(h.job().status,'ok');h.close();});
test('別タブからの完了通知と過去の実行IDは拒否',async()=>{const h=await harness('bring',bring);await h.send({type:'finish',id:'run1',result:{status:'ok'}},{tab:{id:2},frameId:0,url:h.w.location.href});assert.equal(h.job().status,'running');await h.send({type:'finish',id:'old',result:{status:'ok'}});assert.equal(h.job().status,'running');h.close();});
test('明示的に停止した実行は手動確認で復活しない',async()=>{const h=await harness('bring',bring);await h.send({type:'stop'},{url:'chrome-extension://test/index.html'});h.navigate('/business/signup/bringconfirm',confirm('example.co.jp'));await h.tick();assert.equal(h.job().status,'unknown');h.close();});
test('対象ドメインの使用中警告を判定',async()=>{const h=await harness('bring',bring);await h.tick();h.w.document.body.insertAdjacentHTML('beforeend','<p>このドメイン名はすでに使用されています。</p>');await h.tick();assert.equal(h.job().status,'used');h.close();});
test('黒文字の既存サブスクリプション表示を検出し、追加操作しない',async()=>{
 const h=await harness('bring',bring);await h.tick();
 h.navigate('/business/signup/existing','<h1 style="color:black">既存のサブスクリプションが見つかりました</h1><p>ドメイン example.co.jp には既にGoogle Workspace サブスクリプションが関連付けられています。続行するには、既存example.co.jpのメールアドレスを入力するか、別のドメインを使用してください。</p><input type="email"><button>次へ</button>');
 let clicks=0;h.w.document.querySelector('button').onclick=()=>clicks++;
 await h.tick();assert.equal(h.job().status,'used');assert.equal(clicks,0);assert.equal(h.w.document.querySelector('input').value,'');h.close();
});
test('別ドメインのサブスクリプション表示は既存利用と判定しない',async()=>{
 const h=await harness('bring',bring);await h.tick();
 h.navigate('/business/signup/existing','既存のサブスクリプションが見つかりました other.co.jp Google Workspace サブスクリプション');
 await h.tick();assert.equal(h.job().status,'running');h.close();
});
test('UI再起動時は空欄と未表示、履歴クリックですぐ確認',async()=>{
 const d=new JSDOM(source('index.html'),{runScripts:'outside-only'});const w=d.window;
 let changed;const messages=[];
 w.chrome={storage:{onChanged:{addListener:f=>changed=f}},runtime:{sendMessage:async m=>{
 messages.push(m);if(m.type==='history')return ['example.co.jp','example.net'];
 if(m.type==='start')return {id:'new',domain:m.domain,status:'running'};
 throw Error('unexpected');
 }}};
 w.eval(source('core.js'));w.eval(source('ui.js'));await new Promise(r=>setImmediate(r));
 assert.equal(w.document.getElementById('domain').value,'');
 changed({job:{newValue:{id:'old',domain:'old.example',status:'ok'}}},'session');
 assert.equal(w.document.getElementById('result').textContent,'—');
 w.document.querySelector('#history button').click();await new Promise(r=>setImmediate(r));
 assert.equal(messages.find(m=>m.type==='start').domain,'example.co.jp');
 assert.equal(w.document.getElementById('domain').value,'example.co.jp');
 changed({job:{newValue:{id:'new',domain:'example.co.jp',status:'used'}}},'session');
 assert.equal(w.document.getElementById('result').textContent,'既存利用の表示あり');w.close();
});
test('履歴は直近5ドメインのみ、再利用は先頭へ、結果を保存しない',async()=>{
 let job=null,history=[];let listener;
 const chrome={runtime:{getURL:n=>'chrome-extension://test/'+n,onMessage:{addListener:f=>listener=f}},storage:{
 session:{get:async()=>({job}),set:async v=>job=v.job},
 local:{get:async()=>({history}),set:async v=>history=v.history}},
 action:{onClicked:{addListener(){}}},tabs:{onRemoved:{addListener(){}},create:async()=>({id:1}),update:async()=>{}},
 alarms:{create:async()=>{},onAlarm:{addListener(){}}}};
 vm.runInNewContext(source('background.js'),{chrome,GG:require(path.join(root,'core.js')),importScripts(){},crypto:require('node:crypto'),Date});
 const send=m=>new Promise(r=>listener(m,{url:'chrome-extension://test/index.html'},r));
 for(const domain of ['one.example','two.example','three.example','four.example','five.example','six.example','three.example']){
  const result=await send({type:'start',domain});assert.equal(result.status,'running');job.status='ok';
 }
 assert.deepEqual(Array.from(await send({type:'history'})),['three.example','six.example','five.example','four.example','two.example']);
});
