export const nativeMethods = ['capabilities', 'status', 'bindVehicle', 'forgetVehicle', 'ble.scan', 'ble.connect', 'ble.disconnect', 'ble.command', 'ble.proximity', 'notifications.configure', 'widget.update', 'meter.open'] as const;
export type NativeMethod = typeof nativeMethods[number];
export interface NativeCapabilities {
  platform: 'android' | 'ios'; version: 1;
  features: { ble: boolean; proximity: boolean; notifications: boolean; widget: boolean; meter: boolean };
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
    if (!nativeMethods.includes(method) || !params || Array.isArray(params) || JSON.stringify(params).length > 16384) return Promise.reject(new NativeError('invalid_request'));
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
    try { message = typeof input === 'string' && input.length <= 65536 ? JSON.parse(input) : input; } catch { return; }
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
export function nativeMessage(error: unknown): string {
  if (!(error instanceof NativeError)) return '操作未完成，请稍后重试。';
  const messages: Record<string, string> = {
    unavailable: '当前浏览器没有原生能力，请安装 APK 或自签 IPA。',
    permission_denied: '系统权限未允许，请在系统设置中开启后重试。',
    unsupported: '当前系统或车型暂不支持此能力。', unsupported_ble2: '此代蓝牙协议尚未恢复，暂不支持配对。',
    stale_material: '车辆授权资料已过期，请重新准备蓝牙资料。', owner_not_verified: '未能核实当前账号为车主，无法操作蓝牙钥匙。',
    refresh_required: '车辆授权资料已过期，请重新准备蓝牙资料。',
    refresh_or_connect_required: '请先刷新蓝牙资料并重新连接车辆。',
    connect_first: '请先连接当前车辆蓝牙。', authenticate_first: '请先完成蓝牙认证。',
    ble_material_missing: '车辆未提供完整蓝牙钥匙材料，可继续使用其它功能。',
    enable_inductive_in_cloud_first: '请在车辆设置中开启感应钥匙，然后刷新资料。',
    pairing_generation_unsupported: '当前只恢复了旧版支持的 2.0 BLE1 钥匙登记，此代暂不支持。',
    timeout: '等待设备超时，结果尚未确认，请先检查车辆再重试。',
    busy: '设备仍在处理上一项操作，请稍候。', not_connected: '请先选择并连接车辆蓝牙。',
    bluetooth_off: '请先打开系统蓝牙。', cloud_disabled: '请先开启车辆感应功能。',
  };
  return messages[error.code] ?? '设备操作未完成，请检查系统权限、连接和车型兼容性后重试。';
}
