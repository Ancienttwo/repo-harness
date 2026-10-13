// T-OWN-4: stands in for the console's 30 s refresh, every second.
setInterval(() => { fetch('/poll', { cache: 'no-store' }).catch(() => {}); }, 1000);
