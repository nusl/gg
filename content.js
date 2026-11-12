(() => {
  const send = message => chrome.runtime.sendMessage(message);
  const text = element => element?.innerText ?? element?.textContent ?? '';
  const visible = element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
  const all = selector => [...document.querySelectorAll(selector)].filter(visible);
  const inputs = () => all('input').filter(e => ['text', 'email', 'url', ''].includes(e.type) && !e.disabled && !e.readOnly);
  const compact = value => String(value || '').normalize('NFKC').replace(/[\s\u200b*＊:：]/g, '');

  // Match each label independently. Combining a label and an example/placeholder
  // made the previous exact-name matching fail on the contact and domain forms.
  function names(element) {
    const values = [element.getAttribute('aria-label'), element.getAttribute('placeholder'),
      ...[...(element.labels || [])].map(text),
      ...(element.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => text(document.getElementById(id)))];
    let parent = element.parentElement;
    for (let depth = 0; parent && depth < 3; depth++, parent = parent.parentElement) {
      if (parent.querySelectorAll('input').length !== 1) break;
      values.push(...[...parent.querySelectorAll('label,span,legend')].map(text));
    }
    return values.filter(Boolean).map(compact);
  }
  function field(labels) {
    const wanted = labels.map(compact);
    const matches = inputs().filter(e => names(e).some(n => wanted.includes(n)));
    return matches.length === 1 ? matches[0] : null;
  }
  function contactFields() {
    const candidates = inputs();
    const last = field(['姓', '苗字', '姓（必須）']);
    const first = field(['名', '名前', '名（必須）']);
    const email = field(['現在のメールアドレス', 'メールアドレス']);
    if (last && first && email && new Set([last, first, email]).size === 3) return {last, first, email};
    // Scoped to the known contact route, and only an unambiguous three-field form.
    if (candidates.length === 3 && candidates.slice(0, 2).every(e => e.type === 'text') &&
        (candidates[2].type === 'email' || /メールアドレス/.test(text(document.body)))) {
      return {last: candidates[0], first: candidates[1], email: candidates[2]};
    }
    return null;
  }
  function domainField() {
    const found = field(['ご利用のドメイン名', 'ドメイン名', 'ドメイン']);
    return found || (inputs().length === 1 ? inputs()[0] : null);
  }
  function button(label) {
    const matches = all('button,[role=button],input[type=submit]').filter(e =>
      [text(e), e.getAttribute('aria-label'), e.value].some(n => compact(n) === compact(label)) &&
      !e.disabled && e.getAttribute('aria-disabled') !== 'true');
    return matches.length === 1 ? matches[0] : null;
  }
  function exact(label) {
    const matches = all('[role=option],[role=radio],button,label,span,div').filter(e => compact(text(e)) === compact(label));
    return matches.find(e => !matches.some(child => child !== e && e.contains(child)));
  }
  function fill(element, value) {
    if (element.value === value) return;
    element.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event('input', {bubbles: true}));
    element.dispatchEvent(new Event('change', {bubbles: true}));
    element.blur();
  }
  let busy = false, currentJob = null, route = '', routeSince = 0;
  async function rememberDomain(job, element) {
    if (!element) return job;
    let domain;
    try { domain = GG.normalize(element.value); } catch { return job; }
    if (domain !== job.domain || job.domainSeen === domain) return job;
    return await send({type: 'observeDomain', id: job.id, domain}) || job;
  }
  // Capture a manual Next/Enter too, before SPA navigation removes the field.
  function captureManualSubmission(event) {
    if (!currentJob || location.pathname !== '/business/signup/bring') return;
    if (event.type === 'keydown' && event.key !== 'Enter') return;
    if (event.type === 'click' && !event.target.closest('button,[role=button],input[type=submit]')) return;
    void rememberDomain(currentJob, domainField()).catch(() => {});
  }
  document.addEventListener('click', captureManualSubmission, true);
  document.addEventListener('keydown', captureManualSubmission, true);
  document.addEventListener('submit', captureManualSubmission, true);

  async function tick() {
    if (busy) return;
    busy = true;
    let job;
    try {
      job = await send({type: 'poll'});
      currentJob = job;
      if (!job) return;
      const path = location.pathname.replace(/\/$/, '');
      const routeKey = job.id + ':' + path;
      if (route !== routeKey) { route = routeKey; routeSince = Date.now(); }
      const finish = result => send({type: 'finish', id: job.id, result});
      const body = text(document.body);
      if (/unusual traffic|verify you are human|私はロボットではありません|通常と異なるトラフィック/i.test(body)) {
        return finish({status: 'unknown', reason: '人による確認が必要です。'});
      }
      const target = path === '/business/signup/bring' ? domainField() : null;
      if (target) job = await rememberDomain(job, target);
      const result = GG.classify({url: location.href, text: body, domain: job.domain,
        submitted: job.submitted, domainSeen: job.domainSeen, field: target?.value});
      if (result && result.status !== 'unknown') return finish(result);
      // The URL changes before Google's confirmation text renders. Do not fail
      // immediately, and never click Next on the confirmation page.
      if (path === '/business/signup/bringconfirm') {
        if (Date.now() - routeSince > 20000) return finish(result || {status: 'unknown', reason: '確認画面の対象ドメインを照合できませんでした。'});
        return;
      }
      if (job.status !== 'running') return; // timeout: observe manual completion only
      const stage = path.split('/').pop();
      await send({type: 'stage', id: job.id, stage});
      const clickOnce = async (key, element) => {
        if (element && await send({type: 'claim', id: job.id, key})) element.click();
      };
      const next = button('次へ');
      const newAccount = exact('新しいGoogle Workspace アカウントを作成');
      if (newAccount && /既存のアカウントが見つかりました/.test(body)) {
        await clickOnce('newAccount', newAccount); return;
      }
      if (path === '/business/signup/welcome') {
        const company = field(['会社名', '会社名（最大128文字）']) || (inputs().length === 1 ? inputs()[0] : null);
        const radio = all('[role=radio],input[type=radio]').find(e => [...names(e), compact(text(e))].some(n => /10[~～〜–-]99人/.test(n)));
        const region = all('[role=combobox],select').find(e => /日本/.test(text(e) || e.value));
        if (!company || !radio || !region) return;
        if (!company.value) { fill(company, job.contact.company); return; }
        if (!radio.checked && radio.getAttribute('aria-checked') !== 'true' && !job.actions.employee) {
          await clickOnce('employee', radio); return;
        }
        await clickOnce('welcomeNext', next); return;
      }
      if (path === '/business/signup/contact') {
        const fields = contactFields();
        if (!fields) return;
        let changed = false;
        for (const [key, element] of Object.entries(fields)) {
          if (!element.value.trim()) { fill(element, job.contact[key]); changed = true; }
        }
        if (changed) return;
        // Existing, prefilled contact values are intentionally left untouched.
        if (Object.values(fields).every(e => e.value.trim() && e.checkValidity())) await clickOnce('contactNext', next);
        return;
      }
      if (path === '/business/signup/signuptypeselect') {
        const option = exact('既存のドメインを使用して設定する');
        if (!job.actions.typeSelect) { await clickOnce('typeSelect', option); return; }
        await clickOnce('typeNext', next); return;
      }
      if (path === '/business/signup/bring') {
        if (!target) return;
        if (target.value !== job.domain) { fill(target, job.domain); await rememberDomain(job, target); return; }
        if (target.checkValidity()) await clickOnce('submit', next);
        return;
      }
      // Allow delayed SPA rendering/redirects instead of immediately terminating.
      if (Date.now() - routeSince > 20000) return finish({status: 'unknown', reason: '未対応の画面です。'});
    } catch (error) {
      if (job) await send({type: 'finish', id: job.id, result: {status: 'unknown', reason: '画面操作を完了できませんでした。'}}).catch(() => {});
    } finally { busy = false; }
  }
  setInterval(tick, 700);
  tick();
})();
