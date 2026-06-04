import type { NetworkEntry, NetworkResourceType, RuntimeToShellMessage } from '@ve/core';

const MAX_ENTRIES = 500;
let seq = 0;

type PostFn = (msg: RuntimeToShellMessage) => void;

function mapInitiatorType(t: string): NetworkResourceType {
  switch (t) {
    case 'img':
    case 'image':
      return 'img';
    case 'script':
      return 'script';
    case 'css':
    case 'link':
      return 'css';
    case 'video':
    case 'audio':
      return 'media';
    case 'font':
      return 'font';
    case 'xmlhttprequest':
      return 'xhr';
    case 'fetch':
      return 'fetch';
    default:
      return 'other';
  }
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url, window.location.href);
    const path = u.pathname.split('/').pop() || u.pathname;
    return path || u.hostname;
  } catch {
    return url.length > 48 ? `${url.slice(0, 45)}…` : url;
  }
}

export function createNetworkMonitor(post: PostFn) {
  const buffer: NetworkEntry[] = [];

  const push = (partial: Omit<NetworkEntry, 'id' | 'timestamp'> & { url: string }) => {
    const entry: NetworkEntry = {
      id: `net_${++seq}`,
      timestamp: new Date().toISOString(),
      method: partial.method ?? 'GET',
      status: partial.status ?? null,
      ok: partial.ok ?? (partial.status !== null && partial.status >= 200 && partial.status < 400),
      resourceType: partial.resourceType ?? 'other',
      size: partial.size ?? null,
      durationMs: partial.durationMs ?? null,
      error: partial.error,
      url: partial.url,
    };
    buffer.push(entry);
    if (buffer.length > MAX_ENTRIES) buffer.shift();
    post({ type: 'VE_NETWORK', entry });
  };

  const hookFetch = () => {
    const orig = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const start = performance.now();
      try {
        const res = await orig(input, init);
        const len = res.headers.get('content-length');
        push({
          url,
          method,
          status: res.status,
          ok: res.ok,
          resourceType: 'fetch',
          size: len ? parseInt(len, 10) : null,
          durationMs: Math.round(performance.now() - start),
        });
        return res;
      } catch (err) {
        push({
          url,
          method,
          status: null,
          ok: false,
          resourceType: 'fetch',
          durationMs: Math.round(performance.now() - start),
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    };
  };

  const hookXhr = () => {
    const XHR = XMLHttpRequest;
    const origOpen = XHR.prototype.open;
    const origSend = XHR.prototype.send;

    XHR.prototype.open = function (
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ) {
      (this as XMLHttpRequest & { __veMethod?: string; __veUrl?: string }).__veMethod =
        method.toUpperCase();
      (this as XMLHttpRequest & { __veUrl?: string }).__veUrl = String(url);
      return origOpen.apply(this, [method, url, ...rest] as Parameters<typeof origOpen>);
    };

    XHR.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
      const xhr = this as XMLHttpRequest & {
        __veMethod?: string;
        __veUrl?: string;
        __veStart?: number;
      };
      xhr.__veStart = performance.now();
      const onEnd = () => {
        const url = xhr.__veUrl ?? '';
        if (!url) return;
        push({
          url,
          method: xhr.__veMethod ?? 'GET',
          status: xhr.status || null,
          ok: xhr.status >= 200 && xhr.status < 400,
          resourceType: 'xhr',
          durationMs: Math.round(performance.now() - (xhr.__veStart ?? performance.now())),
        });
      };
      this.addEventListener('loadend', onEnd, { once: true });
      this.addEventListener('error', () => {
        push({
          url: xhr.__veUrl ?? '',
          method: xhr.__veMethod ?? 'GET',
          status: null,
          ok: false,
          resourceType: 'xhr',
          durationMs: Math.round(performance.now() - (xhr.__veStart ?? performance.now())),
          error: 'Network error',
        });
      });
      return origSend.call(this, body);
    };
  };

  const observeResources = () => {
    try {
      const seen = new Set<string>();
      const record = (entries: PerformanceEntryList) => {
        entries.forEach((e) => {
          if (e.entryType !== 'resource') return;
          const r = e as PerformanceResourceTiming;
          const key = `${r.name}|${r.startTime}`;
          if (seen.has(key)) return;
          seen.add(key);
          const type = mapInitiatorType(r.initiatorType || 'other');
          if (type === 'fetch' || type === 'xhr') return;
          push({
            url: r.name,
            method: 'GET',
            status: 200,
            ok: true,
            resourceType: type,
            size: r.transferSize > 0 ? r.transferSize : null,
            durationMs: Math.round(r.duration),
          });
        });
      };
      const obs = new PerformanceObserver((list) => record(list.getEntries()));
      obs.observe({ type: 'resource', buffered: true });
      setTimeout(() => record(performance.getEntriesByType('resource')), 500);
    } catch {
      /* PerformanceObserver 不可用 */
    }
  };

  hookFetch();
  hookXhr();
  observeResources();

  return {
    flushBuffered: () => {
      if (buffer.length === 0) return;
      post({ type: 'VE_NETWORK_BATCH', entries: [...buffer] });
    },
  };
}

export { shortUrl };
