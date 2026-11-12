const $ = id => document.getElementById(id);
const send = message => chrome.runtime.sendMessage(message);
const labels = {running: '確認中…', ok: 'ドメインチェックOK', used: '既存利用の表示あり', unknown: '未確認'};
function render(job) {
  if (!job) return;
  $('result').textContent = labels[job.status] || '未確認';
  $('result').dataset.status = job.status;
  $('start').disabled = job.status === 'running';
  $('domain').disabled = job.status === 'running';
  if (job.domain) $('domain').value = job.domain;
}
$('form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const domain = GG.normalize($('domain').value);
    $('result').textContent = '確認中…';
    $('start').disabled = true;
    const job = await send({type: 'start', domain});
    if (!job || job.error) throw Error(job?.error || '確認を開始できませんでした。');
    render(job);
  } catch (error) {
    $('result').textContent = error.message;
    $('result').dataset.status = 'error';
    $('start').disabled = false;
    $('domain').disabled = false;
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.job) render(changes.job.newValue);
});
send({type: 'get'}).then(render).catch(() => {
  $('result').textContent = '拡張機能から開いてください';
});
