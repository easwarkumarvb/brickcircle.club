// Only browser push services may receive outbound notification traffic.
export function trustedPushEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > 4096 || /[^\x21-\x7e]|\\/.test(endpoint)) return false;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || url.pathname === '/' || url.href !== endpoint) return false;
    return ['fcm.googleapis.com','updates.push.services.mozilla.com','push.services.mozilla.com'].includes(url.hostname)
      || /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:push\.apple\.com|notify\.windows\.com)$/.test(url.hostname);
  } catch { return false; }
}
