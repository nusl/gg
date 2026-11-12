const {test}=require('node:test');const assert=require('node:assert/strict');const {normalize,classify}=require('../core.js');
test('ドメインの正規化とIDN',()=>{assert.equal(normalize(' EXAMPLE.co.jp. '),'example.co.jp');assert.equal(normalize('日本.jp'),'xn--wgv71a.jp');});
test('URL、メール、IP、不正なラベルは拒否',()=>{for(const d of ['https://example.com','test@example.com','127.0.0.1','localhost','a..jp','-a.jp','a-.jp','a/b.jp','a%20.jp','a b.jp','a'.repeat(64)+'.jp'])assert.throws(()=>normalize(d));});
const base={url:'https://workspace.google.com/business/signup/bringconfirm?hl=ja',text:'このアカウントでメールを設定するまで、example.co.jp 宛てのメールに影響はありません。',domain:'example.co.jp',submitted:true,field:'example.co.jp'};
test('今回送信したドメインと確認文言の一致でOK',()=>assert.equal(classify(base).status,'ok'));
test('未送信と別originでOKを返さない',()=>{assert.equal(classify({...base,submitted:false}),null);assert.equal(classify({...base,url:'https://evil.test/business/signup/bringconfirm'}),null);});
test('ドメインの部分一致や文言の不足を拒否',()=>{for(const text of [base.text.replace('example.co.jp','other.jp'),base.text.replace('example.co.jp','notexample.co.jp'),base.text.replace('example.co.jp','example.co.jp.evil.test'),'example.co.jp'])assert.equal(classify({...base,text}).status,'unknown');});
test('使用中表示は送信ドメインと入力欄を照合',()=>{const x={...base,url:'https://workspace.google.com/business/signup/bring',text:'このドメイン名はすでに使用されています。'};assert.equal(classify(x).status,'used');assert.equal(classify({...x,field:'other.jp'}),null);});
test('サブスクリプション表示と対象ドメインを照合',()=>{const x={...base,url:'https://workspace.google.com/business/signup/bring',text:'既存のサブスクリプションが見つかりました ドメイン example.co.jp には既にGoogle Workspace サブスクリプションが関連付けられています。'};assert.equal(classify(x).status,'used');assert.equal(classify({...x,text:x.text.replace('example.co.jp','other.jp')}),null);});
test('単なる遷移や通信エラーから成功を推測しない',()=>assert.equal(classify({...base,url:'https://workspace.google.com/business/signup/bring',text:'通信エラー'}),null));

