importScripts('core.js');
let queue=Promise.resolve();
const read=async()=> (await chrome.storage.session.get('job')).job;
async function save(job){await chrome.storage.session.set({job});return job;}
chrome.action.onClicked.addListener(()=>chrome.tabs.create({url:'index.html'}));
chrome.runtime.onMessage.addListener((msg,sender,respond)=>{
  queue=queue.then(()=>handle(msg,sender)).then(respond,e=>respond({error:e.message}));return true;
});
async function handle(msg,sender){
  const ui=sender.url===chrome.runtime.getURL('index.html');
  let job=await read();
  if(msg.type==='start' && ui){
    if(job?.status==='running') throw Error('実行中です。停止してから再実行してください。');
    const domain=GG.normalize(msg.domain);
    const c=msg.contact;
    if(!c || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email) || !c.first.trim() || !c.last.trim() || !c.company.trim()) throw Error('連絡先と会社名を入力してください。');
    const tab=await chrome.tabs.create({url:'about:blank',active:false});
    job={id:crypto.randomUUID(),tabId:tab.id,domain,contact:c,status:'running',reason:'申込画面を開いています',started:Date.now(),submitted:false,actions:{}};
    await save(job);await chrome.alarms.create('timeout',{when:Date.now()+120000});
    try{await chrome.tabs.update(tab.id,{url:'https://workspace.google.com/business/signup/welcome?hl=ja'});}catch(e){await save({...job,status:'unknown',reason:e.message});throw e;}
    return job;
  }
  if(msg.type==='get' && ui)return job||null;
  if(msg.type==='show' && ui && job){await chrome.tabs.update(job.tabId,{active:true});return true;}
  if(msg.type==='stop' && ui && job?.status==='running')return save({...job,status:'unknown',reason:'ユーザーが停止しました。',finished:Date.now()});
  if(sender.tab?.id!==job?.tabId || sender.frameId!==0 || !sender.url?.startsWith('https://workspace.google.com/business/signup/')) return null;
  if(msg.type==='poll')return job?.status==='running'?job:null;
  if(job?.status!=='running' || msg.id!==job.id)return null;
  if(msg.type==='claim'){
    if(Date.now()-job.started>120000)return save({...job,status:'unknown',reason:'時間内に確認できませんでした。'}),null;
    if(job.actions[msg.key])return null;
    job.actions[msg.key]=true;job.reason=msg.reason;
    if(msg.key==='submit')job.submitted=true;
    await save(job);return job;
  }
  if(msg.type==='finish' && ['ok','used','unknown'].includes(msg.result?.status)){
    await chrome.alarms.clear('timeout');return save({...job,...msg.result,finished:Date.now()});
  }
  return null;
}
chrome.alarms.onAlarm.addListener(a=>{if(a.name==='timeout')queue=queue.then(async()=>{const j=await read();if(j?.status==='running')await save({...j,status:'unknown',reason:'120秒以内に確認できませんでした。確認画面を開いて状態を確認してください。',finished:Date.now()});});});
chrome.tabs.onRemoved.addListener(id=>{queue=queue.then(async()=>{const j=await read();if(j?.tabId===id&&j.status==='running')await save({...j,status:'unknown',reason:'確認用タブが閉じられました。',finished:Date.now()});});});
