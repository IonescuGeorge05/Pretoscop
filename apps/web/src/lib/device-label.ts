// Pure (no server-only import): unit-tested in __tests__/channels.test.ts.

/** "Chrome · Android" from the User-Agent (only this label is stored, never the User-Agent). */
export function deviceLabel(ua: string | null): string {
  const u = ua ?? '';
  const browser = /Edg\//.test(u)
    ? 'Edge'
    : /OPR\//.test(u)
      ? 'Opera'
      : /SamsungBrowser\//.test(u)
        ? 'Samsung Internet'
        : /Firefox\//.test(u)
          ? 'Firefox'
          : /Chrome\//.test(u)
            ? 'Chrome'
            : /Safari\//.test(u)
              ? 'Safari'
              : 'Browser';
  const os = /Android/.test(u) ? 'Android' : /iPhone|iPad|iPod/.test(u) ? 'iOS' : /Windows/.test(u) ? 'Windows' : /Mac OS X/.test(u) ? 'macOS' : /Linux/.test(u) ? 'Linux' : 'alt sistem';
  return `${browser} · ${os}`;
}
