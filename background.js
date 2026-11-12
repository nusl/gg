importScripts('core.js');
const TIMEOUT = 5 * 60 * 1000;
const OBSERVE_UNTIL = 15 * 60 * 1000;
const DEFAULT_CONTACT = {company: 'test', last: 'test', first: 'test', email: 'test@example.com'};
const stages = {welcome: '会社情報を確認中', contact: '連絡先を確認中', signuptypeselect: '設定方法を選択中', bring: 'ドメインを確認中'};
let queue = Promise.resolve();
const read = async () => (await chrome.storage.session.get('job')).job;
async function save(job) { await chrome.storage.session.set({job}); return job; }
const active = job => job && (job.status === 'running' || job.recoverable && Date.now() - job.started < OBSERVE_UNTIL);
chrome.action.onClicked.addListener(() => chrome.tabs.create({url: 'index.html'}));
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  queue = queue.then(() => handle(message, sender)).then(respond, error => respond({error: error.message}));
  return true;
});
async function handle(message, sender) {
  const ui = sender.url === chrome.runtime.getURL('index.html');
  let job = await read();
  if (message.type === 'get' && ui) return job || null;
  if (message.type === 'start' && ui) {
    if (job?.status === 'running') throw Error('確認中');
    const domain = GG.normalize(message.domain);
    const tab = await chrome.tabs.create({url: 'about:blank', active: false});
    job = {id: crypto.randomUUID(), tabId: tab.id, domain, contact: DEFAULT_CONTACT,
      status: 'running', reason: '確認中', started: Date.now(), submitted: false, domainSeen: null, actions: {}};
    await save(job);
    await chrome.alarms.create('timeout', {when: Date.now() + TIMEOUT});
    try { await chrome.tabs.update(tab.id, {url: 'https://workspace.google.com/business/signup/welcome?hl=ja'}); }
    catch { return save({...job, status: 'unknown', reason: '確認画面を開けませんでした。', finished: Date.now()}); }
    return job;
  }
  if (message.type === 'show' && ui && job) { await chrome.tabs.update(job.tabId, {active: true}); return true; }
  if (message.type === 'stop' && ui && job) return save({...job, status: 'unknown', recoverable: false, reason: '停止しました。', finished: Date.now()});
  if (!job || sender.tab?.id !== job.tabId || sender.frameId !== 0 ||
      !sender.url?.startsWith('https://workspace.google.com/business/signup/')) return null;
  if (message.type === 'poll') return active(job) ? job : null;
  if (!active(job) || message.id !== job.id) return null;
  if (message.type === 'observeDomain') {
    if (message.domain !== job.domain) return null;
    if (job.domainSeen === message.domain) return job;
    return save({...job, domainSeen: message.domain});
  }
  if (message.type === 'stage' && job.status === 'running') {
    const reason = stages[message.stage] || '画面を確認中';
    if (job.reason !== reason) await save({...job, reason});
    return true;
  }
  if (message.type === 'claim' && job.status === 'running') {
    if (!['employee', 'welcomeNext', 'contactNext', 'typeSelect', 'typeNext', 'submit', 'newAccount'].includes(message.key)) return null;
    if (job.actions[message.key]) return null;
    if (message.key === 'submit' && job.domainSeen !== job.domain) return null;
    job.actions[message.key] = true;
    if (message.key === 'submit') job.submitted = true;
    await save(job);
    return job;
  }
  if (message.type === 'finish' && ['ok', 'used', 'unknown'].includes(message.result?.status)) {
    if (message.result.status !== 'unknown' && !job.submitted && job.domainSeen !== job.domain) return null;
    await chrome.alarms.clear('timeout');
    return save({...job, status: message.result.status, reason: message.result.reason,
      recoverable: false, finished: Date.now()});
  }
  return null;
}
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name !== 'timeout') return;
  queue = queue.then(async () => {
    const job = await read();
    if (job?.status === 'running') await save({...job, status: 'unknown', recoverable: true,
      reason: '時間内に確認できませんでした。', finished: Date.now()});
  });
});
chrome.tabs.onRemoved.addListener(id => {
  queue = queue.then(async () => {
    const job = await read();
    if (job?.tabId === id && active(job)) await save({...job, status: 'unknown', recoverable: false,
      reason: '確認用タブが閉じられました。', finished: Date.now()});
  });
});
