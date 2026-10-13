// T-BRG-4, T-BRG-5, T-BRG-7: every bridge call from the console origin must
// be refused. Each result is posted to the same origin before the next call.
(async () => {
  const post = (record) => fetch('/result', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ page: 'bridge', ...record }) });
  const internals = window.__TAURI_INTERNALS__;
  await post({ probe: 'globals', tauri: typeof window.__TAURI__, internals: typeof internals,
    invoke: typeof (internals && internals.invoke), ipcHandler: !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ipc) });
  const attempts = [
    ['status_report', {}], ['retry_start', {}], ['choose_main_repo', {}], ['open_config', {}], ['quit_app', {}],
    ['plugin:app|version', {}], ['plugin:window|title', { label: 'console' }], ['plugin:window|close', { label: 'console' }],
    ['plugin:webview|create_webview_window', { options: { label: 'evil', url: 'https://example.com' } }],
    ['plugin:event|emit', { event: 'dp0', payload: null }],
    ['plugin:shell|execute', { program: 'sh', args: ['-c', 'touch /tmp/dp0-shell-pwned'] }],
    ['plugin:fs|write_text_file', { path: '/tmp/dp0-fs-pwned', data: 'x' }],
    ['plugin:__TAURI_CHANNEL__|fetch', {}],
  ];
  for (const [cmd, args] of attempts) {
    if (!internals || typeof internals.invoke !== 'function') { await post({ probe: 'invoke', cmd, outcome: 'no-invoke' }); continue; }
    try {
      const value = await Promise.race([internals.invoke(cmd, args), new Promise((_, r) => setTimeout(() => r(new Error('dp0-timeout')), 3000))]);
      await post({ probe: 'invoke', cmd, outcome: 'resolved', value: String(value).slice(0, 200) });
    } catch (error) {
      await post({ probe: 'invoke', cmd, outcome: 'rejected', error: String(error && (error.message || error)).slice(0, 300) });
    }
  }
  // Raw channels without the injected helpers.
  for (const cmd of ['status_report', 'quit_app']) {
    try {
      const r = await fetch('ipc://localhost/' + cmd, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json', 'Tauri-Callback': '1', 'Tauri-Error': '2' } });
      await post({ probe: 'raw-fetch', cmd, outcome: 'response', status: r.status, body: (await r.text()).slice(0, 200) });
    } catch (error) {
      await post({ probe: 'raw-fetch', cmd, outcome: 'threw', error: String(error).slice(0, 200) });
    }
    try {
      window.webkit.messageHandlers.ipc.postMessage(JSON.stringify({ cmd, callback: 1, error: 2, payload: {} }));
      await post({ probe: 'raw-postmessage', cmd, outcome: 'posted' });
    } catch (error) {
      await post({ probe: 'raw-postmessage', cmd, outcome: 'threw', error: String(error).slice(0, 200) });
    }
  }
  await new Promise((r) => setTimeout(r, 1500));
  await post({ probe: 'done', still_here: location.href });
})();
