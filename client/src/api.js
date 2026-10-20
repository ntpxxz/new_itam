export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function request(method, url, body) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch {
    throw new ApiError(0, 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบอินเทอร์เน็ตหรือเครือข่ายแล้วลองใหม่');
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth/login')) onUnauthorized();
    throw new ApiError(res.status, data?.error || `เกิดข้อผิดพลาด (${res.status}) กรุณาลองใหม่`);
  }
  return data;
}

const qs = (params) => {
  if (!params) return '';
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null)).toString();
  return s ? `?${s}` : '';
};

export const api = {
  get: (url, params) => request('GET', url + qs(params)),
  post: (url, body) => request('POST', url, body ?? {}),
  put: (url, body) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
  qs,
};

export function download(url, params) {
  const a = document.createElement('a');
  a.href = url + qs(params);
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
