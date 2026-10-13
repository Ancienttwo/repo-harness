// Bundled status page. In DP0 it also proves T-BRG-6 (a command outside the
// five is refused here) and the positive control (the five are allowed here).
window.dp0ShowFailure = (code) => { document.getElementById('state').textContent = 'The local service stopped: ' + code; };
(async () => {
  const invoke = window.__TAURI_INTERNALS__.invoke;
  const results = [];
  for (const cmd of ['status_report', 'retry_start', 'choose_main_repo', 'open_config', 'quit_app',
    'plugin:app|version', 'plugin:window|title', 'plugin:webview|create_webview_window']) {
    const args = cmd === 'plugin:window|title' ? { label: 'status' }
      : cmd === 'plugin:webview|create_webview_window' ? { options: { label: 'evil', url: 'https://example.com' } } : {};
    try { results.push({ cmd, outcome: 'resolved', value: String(await invoke(cmd, args)).slice(0, 200) }); }
    catch (e) { results.push({ cmd, outcome: 'rejected', error: String(e && (e.message || e)).slice(0, 300) }); }
  }
  let report = {};
  for (let i = 0; i < 300; i++) {
    report = JSON.parse(await invoke('status_report'));
    if (report.url || report.error) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!report.url) return;
  const post = (record) => fetch(report.url + '/result', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ page: 'status', ...record }) });
  for (const r of results) await post({ probe: 'invoke', ...r });
  // T-NAV-8: the status window must not leave the bundled pages.
  location.href = report.url + '/';
  await new Promise((r) => setTimeout(r, 1500));
  await post({ probe: 'status-after-navigation', href: location.href });
})();
