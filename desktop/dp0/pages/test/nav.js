// T-NAV-2/3/5/6/7: each step posts before and after. A blocked navigation
// leaves this page alive, so the "after" record proves the page stayed.
(async () => {
  const post = (record) => fetch('/result', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ page: 'nav', ...record }) });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const step = new URLSearchParams(location.search).get('step') || 'all';
  await post({ probe: 'loaded', href: location.href, step });
  // T-NAV-5: window.open from a timer, no user gesture.
  await new Promise((resolve) => setTimeout(async () => {
    let returned;
    try { returned = window.open('https://github.com/o/r/pull/5'); } catch (e) { returned = 'threw:' + e; }
    await post({ probe: 'window-open-timer', returned: returned === null ? 'null' : typeof returned });
    resolve();
  }, 200));
  // Synthetic click on target=_blank (script click, no user gesture).
  document.getElementById('pr').click();
  await wait(500);
  await post({ probe: 'synthetic-blank-click', href: location.href });
  // T-NAV-7: permission requests.
  try {
    await Promise.race([navigator.mediaDevices.getUserMedia({ video: true }), wait(4000).then(() => { throw new Error('dp0-timeout'); })]);
    await post({ probe: 'getUserMedia', outcome: 'granted' });
  } catch (e) { await post({ probe: 'getUserMedia', outcome: 'refused', error: String(e).slice(0, 200) }); }
  const geo = await new Promise((resolve) => {
    if (!navigator.geolocation) return resolve('no-api');
    const t = setTimeout(() => resolve('timeout'), 4000);
    navigator.geolocation.getCurrentPosition(() => { clearTimeout(t); resolve('granted'); }, (e) => { clearTimeout(t); resolve('error:' + e.code); });
  });
  await post({ probe: 'geolocation', outcome: geo });
  await post({ probe: 'notification', api: typeof window.Notification, permission: typeof Notification === 'undefined' ? 'n/a' : Notification.permission });
  // T-NAV-6: download.
  location.href = '/download';
  await wait(1500);
  await post({ probe: 'after-download', href: location.href });
  // T-NAV-2: top-level navigation to another origin.
  location.href = 'https://example.com/dp0-direct';
  await wait(2000);
  await post({ probe: 'after-external-navigation', href: location.href });
  // T-NAV-3: same-origin URL that answers 302 to another origin. Last step.
  await post({ probe: 'before-redirect' });
  location.href = '/redirect';
  await wait(3000);
  await post({ probe: 'after-redirect', href: location.href });
})();
