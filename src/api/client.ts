import { sign, signH5 } from './sign';

export type ApiErrorKind = 'expired' | 'network' | 'rejected' | 'format' | 'limit';
export class ApiError extends Error {
  readonly httpStatus?: number;
  readonly businessCode?: string;
  constructor(readonly kind: ApiErrorKind, status?: number, code?: unknown) {
    super(kind);
    if (typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599) this.httpStatus = status;
    // Keep only numeric protocol codes, never a server message or response body.
    if ((typeof code === 'number' || typeof code === 'string') && /^-?\d{1,6}$/.test(String(code))) this.businessCode = String(code);
  }
}

export function messageFor(error: unknown): string {
  if (!(error instanceof ApiError)) return '操作未完成，请稍后再试。';
  return {
    expired: '登录信息已失效，请重新登录。',
    network: '暂时无法连接服务，请检查网络后重试。',
    rejected: '服务端未接受本次请求，请检查后重试。',
    format: '收到的数据暂时无法识别，请稍后再试。',
    limit: '返回内容超出限制，请稍后再试。',
  }[error.kind];
}

type Options = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; token?: string; body?: unknown;
  clientAuth?: boolean; appLike?: boolean; signal?: AbortSignal;
  query?: Record<string, string>;
  service?: 'app' | 'h5';
};

export class CloudClient {
  constructor(private readonly fetcher: typeof fetch = (...args) => fetch(...args)) {}

  async request(path: string, options: Options = {}): Promise<unknown> {
    const h5 = options.service === 'h5';
    if (options.service && options.service !== 'app' && !h5) throw new ApiError('format');
    if (h5 ? !/^\/(?:cfmotoservermine\/H5\/signin(?:\/info|\/supplementPrize)?|cfmotoserverapp\/H5\/vehicle\/tire\/statistics)$/.test(path) || options.appLike || options.clientAuth
      : !/^\/v1\.0\/[A-Za-z0-9/_-]+$/.test(path)) throw new ApiError('format');
    const query = options.query ?? {};
    if (!query || typeof query !== 'object' || Array.isArray(query) || Object.keys(query).length > 30
      || Object.entries(query).some(([key, value]) => !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key)
        || typeof value !== 'string' || value.length > 256 || !/^[A-Za-z0-9_.:-]*$/.test(value))) throw new ApiError('format');
    const body = options.body === undefined ? '' : JSON.stringify(options.body);
    // Legacy query signing uses sorted, nonempty raw k=v pairs. These recovered
    // endpoints use bounded ASCII values without query delimiters, so wire and
    // signed text agree.
    const signed = h5 ? signH5(body, query) : sign(body, query);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json;charset=UTF-8', 'Accept-Language': 'zh-CN',
      interfaceversion: '2', 'cfmoto-x-param': signed.parameters,
      'cfmoto-x-sign': signed.digest, 'cfmoto-x-sign-type': '0',
    };
    if (options.token) {
      if (/\s/.test(options.token)) throw new ApiError('format');
      headers.Authorization = `Bearer ${options.token}`;
    }
    if (options.clientAuth) headers.Authorization = 'Basic bWNrOjEyMzQ1Ng==';
    if (options.appLike) Object.assign(headers, {
      appid: signed.appId, nonce: signed.nonce, signature: signed.digest, timestamp: String(signed.timestamp),
      'x-app-info': 'MOBILE|Android|17|ZEEHO_APP|3.0.5|Dalvik/2.1.0 (Linux; U; Android 17; 2510DRK44C Build/CP2A.260605.016)|1156*2510|1|100|5G|xiaomi',
    });
    // Browsers forbid setting User-Agent. The original browser path has the same restriction.
    const controller = new AbortController();
    const cancel = () => controller.abort();
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) cancel();
    const timeout = setTimeout(cancel, 20000);
    try {
      const response = await this.fetcher(`${h5 ? 'https://h5.zeehoev.com' : 'https://tapi.zeehoev.com'}${path}${signed.canonical ? `?${signed.canonical}` : ''}`, {
        method: options.method ?? 'GET', headers, body: body || undefined,
        signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
      });
      if (response.status === 401) throw new ApiError('expired', response.status);
      let text = '';
      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let size = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new ApiError('limit'); }
            text += decoder.decode(value, { stream: true });
          }
          text += decoder.decode();
        } finally { reader.releaseLock(); }
      }
      let json: Record<string, unknown>;
      try { json = JSON.parse(text); } catch { throw new ApiError('format', response.status); }
      if (!json || typeof json !== 'object') throw new ApiError('format', response.status);
      if (response.ok && String(json.code) === '10000') return json.data;
      const detail = `${json.code ?? ''} ${json.message ?? ''}`.toLowerCase();
      if (/invalid_?token|登录已过期|登录失效|请重新登录|未登录|token过期|token失效/.test(detail)) throw new ApiError('expired', response.status, json.code);
      throw new ApiError('rejected', response.status, json.code);
    } catch (error) {
      if (options.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      if (error instanceof ApiError) throw error;
      throw new ApiError('network');
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', cancel);
    }
  }
}
