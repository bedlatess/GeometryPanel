export const nativeMethods = ['capabilities', 'status', 'bindVehicle', 'forgetVehicle', 'ble.scan', 'ble.connect', 'ble.disconnect', 'ble.command', 'ble.proximity', 'notifications.configure', 'widget.update', 'meter.open', 'accounts.sync', 'accounts.remove', 'background.configure', 'background.status', 'background.run', 'background.history', 'history.clear', 'tasks.configure', 'tasks.run', 'tasks.status', 'widget.configure', 'widget.pin', 'shortcuts.configure', 'tools.open', 'diagnostics.export', 'updates.check', 'updates.install', 'keepalive.export', 'officialLogin.start', 'officialLogin.stop', 'officialLogin.result', 'asset.export', 'haptic'] as const;
export type NativeMethod = typeof nativeMethods[number];
export interface NativeCapabilities {
  platform: 'android' | 'ios'; version: 1;
  features: { ble: boolean; proximity: boolean; notifications: boolean; widget: boolean; meter: boolean; background?: boolean; history?: boolean; multiAccount?: boolean; tasks?: boolean; shortcuts?: boolean; scanner?: boolean; ota?: boolean; diagnostics?: boolean; updates?: boolean; officialLogin?: boolean; keepalive?: boolean; wallpaperZip?: boolean };
  limitations: string[];
}
export class NativeError extends Error {
  constructor(readonly code: string) { super(code); }
}
export interface NativeTransport { send(message: { id: string; method: NativeMethod; params: Record<string, unknown> }): void }
type NativeWindow = Window & {
  GeometryNative?: { postMessage(message: string): void; onmessage?: (event: { data: unknown }) => void };
  webkit?: { messageHandlers?: { geometry?: { postMessage(message: unknown): void } } };
  __geometryNativeReceive?: (message: unknown) => void;
};

/** A fixed RPC surface. There is deliberately no arbitrary URL, Java method or socket call. */
export class NativeClient {
  private readonly pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void; cleanup(): void }>();
  private serial = 0;
  private readonly nonce = crypto.randomUUID();
  constructor(private readonly transport: NativeTransport | null, private readonly timeoutMs = 45000) {}
  get available() { return this.transport !== null; }
  call<T = unknown>(method: NativeMethod, params: object = {}, signal?: AbortSignal): Promise<T> {
    if (!this.transport) return Promise.reject(new NativeError('unavailable'));
    if (!nativeMethods.includes(method) || !params || Array.isArray(params) || JSON.stringify(params).length > (method === 'asset.export' && (params as any).kind === 'panel' ? 1500000 : ['accounts.sync', 'background.configure', 'tasks.configure'].includes(method) ? 262144 : 16384)) return Promise.reject(new NativeError('invalid_request'));
    if (signal?.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'));
    if (this.pending.size >= 8) return Promise.reject(new NativeError('busy'));
    const id = `${this.nonce}:${++this.serial}`;
    return new Promise<T>((resolve, reject) => {
      const cancel = () => settle(new DOMException('Cancelled', 'AbortError'));
      const timer = setTimeout(() => settle(new NativeError('timeout')), method === 'ble.command' ? Math.max(this.timeoutMs, 90000) : this.timeoutMs);
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); this.pending.delete(id); };
      const settle = (error: Error) => { cleanup(); reject(error); };
      this.pending.set(id, { resolve: value => resolve(value as T), reject, cleanup });
      signal?.addEventListener('abort', cancel, { once: true });
      try { this.transport!.send({ id, method, params: params as Record<string, unknown> }); }
      catch { settle(new NativeError('transport')); }
    });
  }
  receive(input: unknown) {
    let message: any;
    try { message = typeof input === 'string' && input.length <= 524288 ? JSON.parse(input) : input; } catch { return; }
    if (!message || typeof message !== 'object' || typeof message.id !== 'string' || typeof message.ok !== 'boolean') return;
    const request = this.pending.get(message.id);
    if (!request) return;
    request.cleanup();
    if (message.ok) request.resolve(message.result);
    else request.reject(new NativeError(typeof message.error?.code === 'string' && /^[a-z0-9_]{1,64}$/.test(message.error.code) ? message.error.code : 'failed'));
  }
  dispose() {
    for (const request of this.pending.values()) { request.cleanup(); request.reject(new NativeError('cancelled')); }
  }
}
export function connectNative(window: NativeWindow): NativeClient {
  // The containers independently verify exact origin AND main-frame status.
  const android = window.GeometryNative;
  const ios = window.webkit?.messageHandlers?.geometry;
  const client = new NativeClient(android ? { send: message => android.postMessage(JSON.stringify(message)) }
    : ios ? { send: message => ios.postMessage(message) } : null);
  window.__geometryNativeReceive = message => client.receive(message);
  if (android) android.onmessage = event => client.receive(event.data);
  return client;
}
export function nativeMessage(error:unknown):string {
 if(!(error instanceof NativeError))return '未收到车辆响应';
 const messages:Record<string,string>={unavailable:'以下功能需在 App 中使用',permission_denied:'权限未开启，请到系统设置开启',unsupported:'此车型不支持',unsupported_ble2:'此车型不支持',stale_material:'资料已过期，请重新准备资料',owner_not_verified:'车主身份未确认',refresh_required:'资料已过期，请重新准备资料',refresh_or_connect_required:'请更新资料后重新连接',connect_first:'请先连接车辆蓝牙',authenticate_first:'请先完成车辆认证',ble_material_missing:'钥匙资料不可用，请稍后刷新',enable_inductive_in_cloud_first:'请先开启车辆感应钥匙',pairing_generation_unsupported:'此车型不支持',timeout:'未收到车辆响应',busy:'上一项尚未结束',not_connected:'请先连接车辆蓝牙',bluetooth_off:'请先打开蓝牙',cloud_disabled:'请先开启车辆感应钥匙'};
 return messages[error.code]??'未收到车辆响应';
}
