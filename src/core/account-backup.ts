import { validateAccounts, type AccountBook } from './accounts';
const iterations = 310000;
const bytes = (s: string) => Uint8Array.from(atob(s), x => x.charCodeAt(0));
const base64 = (a: Uint8Array) => btoa(Array.from(a, x => String.fromCharCode(x)).join(''));
async function key(password: string, salt: Uint8Array, usage: KeyUsage) {
  if (password.length < 8 || password.length > 256) throw new Error('password');
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt: salt as BufferSource,iterations},material,{name:'AES-GCM',length:256},false,[usage]);
}
export async function encryptAccounts(book: AccountBook, password: string): Promise<string> {
  const safe = validateAccounts(book), salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(password,salt,'encrypt'),new TextEncoder().encode(JSON.stringify(safe)));
  return JSON.stringify({format:'gpbackup',version:1,kdf:'PBKDF2-SHA256',iterations,salt:base64(salt),iv:base64(iv),ciphertext:base64(new Uint8Array(ciphertext))});
}
export async function decryptAccounts(text: string, password: string): Promise<AccountBook> {
  if (text.length > 1024*1024) throw new Error('backup');
  const v=JSON.parse(text);
  if(v.format!=='gpbackup'||v.version!==1||v.kdf!=='PBKDF2-SHA256'||v.iterations!==iterations||![v.salt,v.iv,v.ciphertext].every(x=>typeof x==='string'&&/^[A-Za-z0-9+/]*={0,2}$/.test(x))) throw new Error('backup');
  const salt=bytes(v.salt),iv=bytes(v.iv);if(salt.length!==16||iv.length!==12)throw new Error('backup');
  const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:iv as BufferSource},await key(password,salt,'decrypt'),bytes(v.ciphertext) as BufferSource);
  return validateAccounts(JSON.parse(new TextDecoder().decode(data)));
}
