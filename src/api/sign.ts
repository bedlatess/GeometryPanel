import { md5, sha1 } from '@noble/hashes/legacy.js';
import { bytesToHex } from '@noble/hashes/utils.js';

// Compatibility with the authorized legacy client, not a new cryptographic protocol.
const APP_ID = 'S7qPWPU1';
const SECRET = 'c5e0da7f4da28df805694ec3dd1fc6792e9df99d';
const H5_ID = 'AiTXmBrm';
const H5_SECRET = '70c2c7458ab88ca9504ad0521f170075bc91f2f7';
const encode = (text: string) => new TextEncoder().encode(text);

export function sign(body = '', query: Record<string, string> = {}, timestamp = Date.now(),
  nonce = `${timestamp}${bytesToHex(crypto.getRandomValues(new Uint8Array(8)))}`) {
  return signature(APP_ID, SECRET, body, query, timestamp, nonce);
}

/** Native legacy H5 signing includes the POST body, including the literal {}. */
export function signH5(body = '', query: Record<string, string> = {}, timestamp = Date.now(), nonce: string = crypto.randomUUID()) {
  return signature(H5_ID, H5_SECRET, body, query, timestamp, nonce);
}

function signature(appId: string, secret: string, body: string, query: Record<string, string>, timestamp: number, nonce: string) {
  const canonical = Object.keys(query).filter(key => query[key] !== '').sort().map(key => `${key}=${query[key]}`).join('&');
  const parameters = `appId=${appId}&nonce=${nonce}&timestamp=${timestamp}`;
  const digest = bytesToHex(md5(encode(bytesToHex(sha1(encode(canonical + body + parameters + secret))))));
  return { canonical, parameters, digest, nonce, timestamp, appId };
}
