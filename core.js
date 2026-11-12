/* Shared pure validation and classification. No network access. */
(function(root){
  function normalize(value){
    let s=String(value||'').trim().toLowerCase().replace(/。/g,'.').replace(/\.$/,'');
    if(!s || /[\s/:@?#\\%]/.test(s)) throw Error('URL・メールアドレスではなく、ドメインだけを入力してください。');
    try{s=new URL('https://'+s).hostname;}catch{throw Error('ドメインの形式を確認してください。');}
    const labels=s.split('.');
    if(s.length>253 || labels.length<2 || labels.some(x=>! /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(x)) || /^\d+$/.test(labels.at(-1))) throw Error('有効なドメインを入力してください。');
    return s;
  }
  function classify({url,text,domain,submitted,field}){
    let u;try{u=new URL(url);}catch{return null;}
    if(u.origin!=='https://workspace.google.com' || !submitted) return null;
    const t=text.replace(/\s+/g,' ');
    const escaped=domain.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const matchesDomain=new RegExp('(^|[^a-z0-9.-])'+escaped+'($|[^a-z0-9.-])','i').test(t);
    if(u.pathname==='/business/signup/bringconfirm'){
      if(matchesDomain && /このアカウントでメールを設定するまで/.test(t) && /宛てのメールに影響はありません/.test(t)) return {status:'ok',reason:'入力したドメインで bringconfirm に到達しました。'};
      return {status:'unknown',reason:'確認画面のドメインまたは確認文言が一致しません。'};
    }
    if(u.pathname==='/business/signup/bring' && field===domain && /このドメイン名はすでに使用されています/.test(t)) return {status:'used',reason:'このドメイン名はすでに使用されています。'};
    if(/既存のサブスクリプションが見つかりました/.test(t) && matchesDomain && /Google Workspace\s*サブスクリプション/.test(t)) return {status:'used',reason:'入力ドメインに既存の Google Workspace サブスクリプションが見つかりました。'};
    return null;
  }
  root.GG={normalize,classify};
  if(typeof module!=='undefined') module.exports=root.GG;
})(globalThis);
