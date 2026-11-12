const $ = id => document.getElementById(id);
const send = message => chrome.runtime.sendMessage(message);
const labels = {running: '確認中…', ok: 'ドメインチェックOK', used: '既存利用の表示あり', unknown: '未確認'};
let currentId = null;
function render(job) {
  if (!job || job.id !== currentId) return;
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
    currentId = job.id;
    render(job);
    renderHistory(await send({type: 'history'}));
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
function renderHistory(domains) {
  const history = $('history');
  history.replaceChildren();
  for (const domain of domains) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = domain;
    button.addEventListener('click', () => {
      if ($('start').disabled) return;
      $('domain').value = domain;
      $('form').requestSubmit();
    });
    history.append(button);
  }
  history.hidden = domains.length === 0;
}
$('domain').value = '';
send({type: 'history'}).then(renderHistory).catch(() => {});
