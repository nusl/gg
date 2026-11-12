const $=id=>document.getElementById(id),send=m=>chrome.runtime.sendMessage(m);
const names={ok:'チェックOK',used:'既存利用の表示あり',unknown:'未確認',running:'確認中'};
function render(j){if(!j)return;$('badge').textContent=names[j.status];$('badge').className='badge '+j.status;$('target').textContent=j.domain;$('reason').textContent=j.reason;$('time').textContent=(j.finished?'確認日時：':'開始日時：')+new Date(j.finished||j.started).toLocaleString('ja-JP');$('start').disabled=j.status==='running';$('stop').hidden=j.status!=='running';$('show').hidden=false;}
$('form').addEventListener('submit',async e=>{e.preventDefault();$('error').textContent='';$('start').disabled=true;try{const domain=GG.normalize($('domain').value);$('domain').value=domain;const j=await send({type:'start',domain,contact:Object.fromEntries(['company','last','first','email'].map(k=>[k,$(k).value.trim()]))});if(j?.error)throw Error(j.error);render(j);}catch(e){$('error').textContent=e.message;$('start').disabled=false;}});
$('show').onclick=async()=>{try{const r=await send({type:'show'});if(r?.error)$('error').textContent='確認用タブがありません。再実行してください。';}catch(e){$('error').textContent=e.message;}};
$('stop').onclick=async()=>render(await send({type:'stop'}));
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='session'&&changes.job)render(changes.job.newValue);});
send({type:'get'}).then(render);
