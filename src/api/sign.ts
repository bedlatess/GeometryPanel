import { md5, sha1 } from '@noble/hashes/legacy.js';
import { bytesToHex } from '@noble/hashes/utils.js';

// Compatibility with the authorized legacy client, not a new cryptographic protocol.
const APP_ID = 'S7qPWPU1';
const SECRET = 'c5e0da7f4da28df805694ec3dd1fc6792e9df99d';
const encode = (text: string) => new TextEncoder().encode(text);

export function sign(body = '', query: Record<string, string> = {}, timestamp = Date.now(),
  nonce = `${timestamp}${bytesToHex(crypto.getRandomValues(new Uint8Array(8)))}`) {
  const canonical = Object.keys(query).filter(key => query[key] !== '').sort().map(key => `${key}=${query[key]}`).join('&');
  const parameters = `appId=${APP_ID}&nonce=${nonce}&timestamp=${timestamp}`;
  const digest = bytesToHex(md5(encode(bytesToHex(sha1(encode(canonical + body + parameters + SECRET))))));
  return { canonical, parameters, digest, nonce, timestamp, appId: APP_ID };
}
