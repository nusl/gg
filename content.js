(()=>{
 const send=m=>chrome.runtime.sendMessage(m);
 const visible=e=>!!(e.getClientRects().length) && getComputedStyle(e).visibility!=='hidden';
 const all=s=>[...document.querySelectorAll(s)].filter(visible);
 const label=e=>[...new Set([e.getAttribute('aria-label'),e.getAttribute('placeholder'),...(e.labels?[...e.labels].map(l=>l.innerText):[]),...(e.getAttribute('aria-labelledby')||'').split(' ').map(id=>document.getElementById(id)?.innerText)].filter(Boolean).map(s=>s.trim()))].join(' ').trim();
 const input=re=>{const a=all('input:not([type=hidden])').filter(e=>re.test(label(e)));return a.length===1?a[0]:null;};
 const button=t=>{const a=all('button,[role=button]').filter(e=>(e.innerText||e.getAttribute('aria-label')||'').trim()===t && !e.disabled && e.getAttribute('aria-disabled')!=='true');return a.length===1?a[0]:null;};
 function fill(e,value){if(!e)throw Error('入力欄を特定できません。');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}
 const exact=t=>{const a=all('[role=option],[role=radio],button,label,span,div').filter(e=>e.innerText.trim()===t);return a.find(e=>!a.some(c=>c!==e&&e.contains(c)));};
 let busy=false;
 async function tick(){
  if(busy)return;busy=true;
  let job;
  try{
   job=await send({type:'poll'});if(!job)return;
   const text=document.body.innerText,path=location.pathname;
   const done=async result=>send({type:'finish',id:job.id,result});
   if(/unusual traffic|verify you are human|私はロボットではありません|通常と異なるトラフィック/i.test(text) || all('iframe[src*="recaptcha"]').some(e=>e.getBoundingClientRect().height>60))return done({status:'unknown',reason:'人による確認が必要です。自動処理を停止しました。'});
   const domainField=input(/^ご利用のドメイン名$/);
   const result=GG.classify({url:location.href,text,domain:job.domain,submitted:job.submitted,field:domainField?.value});
   if(result)return done(result);
   if(path==='/business/signup/bringconfirm')return done({status:'unknown',reason:'送信との対応を確認できない確認画面です。'});
   const claim=async(key,reason)=>send({type:'claim',id:job.id,key,reason});
   const next=button('次へ');
   const newAccount=exact('新しいGoogle Workspace アカウントを作成') || exact('新しい Google Workspace アカウントを作成');
   if(newAccount && /既存のアカウントが見つかりました/.test(text)){
    if(await claim('newAccount','新しいアカウントのフローを選択しています'))newAccount.click();return;
   }
   if(path==='/business/signup/welcome'){
    const company=input(/会社名/),radio=all('[role=radio],input[type=radio]').find(e=>/10[～〜–-]99\s*人/.test(label(e)||e.innerText));
    const region=all('[role=combobox],select').find(e=>/日本/.test(e.innerText||e.value));
    if(!company||!radio||!region)return;
    if(await claim('welcomeFill','会社名・従業員数を入力しています')){fill(company,job.contact.company);radio.click();return;}
    if(next&&company.value&&await claim('welcomeNext','連絡先画面へ進んでいます'))next.click();return;
   }
   if(path==='/business/signup/contact'){
    const last=input(/^姓$/),first=input(/^名$/),email=input(/^現在のメールアドレス$/);
    if(!last||!first||!email)return;
    if(await claim('contactFill','連絡先を入力しています')){if(!last.value)fill(last,job.contact.last);if(!first.value)fill(first,job.contact.first);if(!email.value)fill(email,job.contact.email);return;}
    if(next&&last.value&&first.value&&email.value&&await claim('contactNext','アカウント設定方法へ進んでいます'))next.click();return;
   }
   if(path==='/business/signup/signuptypeselect'){
    const option=exact('既存のドメインを使用して設定する');
    if(option&&await claim('typeSelect','既存ドメインを使用する方法を選択しています')){option.click();return;}
    if(next&&job.actions.typeSelect&&await claim('typeNext','ドメイン入力画面へ進んでいます'))next.click();return;
   }
   if(path==='/business/signup/bring'){
    if(!domainField)return;
    if(await claim('domainFill','希望ドメインを入力しています')){fill(domainField,job.domain);return;}
    if(next&&domainField.value===job.domain&&await claim('submit','Google の判定を待っています'))next.click();return;
   }
   if(!newAccount)return done({status:'unknown',reason:'未対応の画面に移動しました。確認画面を開いてください。'});
  }catch(e){if(job)await send({type:'finish',id:job.id,result:{status:'unknown',reason:'画面操作を完了できませんでした: '+e.message}}).catch(()=>{});}
  finally{busy=false;}
 }
 setInterval(tick,800);tick();
})();
