import { ApiError } from './client';
import { validVehicleId } from '../core/model';

// Compatibility with the authorized legacy client's cloud protocol. This is
// the literal 32-byte ASCII key, not a hex-decoded 16-byte key.
const KEY = '9dbc2cbf2ec327699301b495010316ec';

export async function createUnlockSecret(lockFlag: 0 | 1, vin: string, signal?: AbortSignal): Promise<string> {
  if ((lockFlag !== 0 && lockFlag !== 1) || typeof vin !== 'string' || !validVehicleId(vin)) throw new ApiError('format');
  signal?.throwIfAborted();
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(KEY), 'AES-CBC', false, ['encrypt']);
  signal?.throwIfAborted();
  const plain = encoder.encode(JSON.stringify({ lockFlag, vinNo: vin }));
  const padding = 16 - plain.length % 16;
  const padded = new Uint8Array(plain.length + padding);
  padded.set(plain); padded.fill(padding, plain.length);
  const output = new Uint8Array(padded.length);
  const zeroIv = new Uint8Array(16);
  // WebCrypto does not offer ECB. With a fresh zero IV per block, the first
  // CBC block is E_K(block). Discard CBC's own extra padding block each time.
  for (let offset = 0; offset < padded.length; offset += 16) {
    signal?.throwIfAborted();
    const encrypted = new Uint8Array(await crypto.subtle.encrypt(
      { name: 'AES-CBC', iv: zeroIv }, key, padded.subarray(offset, offset + 16),
    ));
    signal?.throwIfAborted();
    output.set(encrypted.subarray(0, 16), offset);
  }
  return btoa(String.fromCharCode(...output));
}
