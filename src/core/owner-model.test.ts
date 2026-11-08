import { ApiError } from '../api/client';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeOnce, tokenCredentials, tireHistory } from './owner-model';
import { encryptAccounts, decryptAccounts } from './account-backup';
import { emptyAccounts, rememberAccount } from './accounts';
test('credential parsing accepts URL and JWT, requires an identity for opaque credentials',()=>{
 assert.deepEqual(tokenCredentials('https://example.test/sign?token=synthetic&uid=test-user'),{token:'synthetic',uid:'test-user'});
 assert.deepEqual(tokenCredentials('Bearer synthetic','test-user'),{token:'synthetic',uid:'test-user'});
 assert.equal(tokenCredentials('a.'+btoa(JSON.stringify({uid:'jwt-test'}))+'.b').uid,'jwt-test');
 assert.throws(()=>tokenCredentials('opaque'));assert.throws(()=>tokenCredentials('secret with spaces','x'));
});
test('an uncertain write observes once and never resubmits; missing and mismatched observations differ',async()=>{
 let writes=0,reads=0;assert.equal(await changeOnce(async()=>{writes++;throw Error('network');},async()=>{reads++;return {};},()=>null),'已发送，车辆尚未确认');
 assert.equal(writes,1);assert.equal(reads,1);
 assert.equal(await changeOnce(async()=>true,async()=>({value:0}),()=>false),'修改未生效');
 const c=new AbortController();c.abort();await assert.rejects(changeOnce(async()=>{throw Error('must not write');},async()=>null,()=>null,c.signal),{name:'AbortError'});
});
test('account backup is authenticated encryption, rejects wrong passwords, tampering and plaintext',async()=>{
 const book=rememberAccount(emptyAccounts(),{uid:'backup-test',token:'synthetic-secret-never-plaintext',vehicle:{vin:'LAAAAAAAAAAAAAAA1',name:'测试车',type:'AE8',plate:''}},undefined,()=>crypto.randomUUID());
 const output=await encryptAccounts(book,'synthetic-password');assert.ok(!output.includes(book.accounts[0].token));assert.ok(!output.includes('backup-test'));assert.deepEqual(await decryptAccounts(output,'synthetic-password'),book);
 await assert.rejects(decryptAccounts(output,'wrong-password'));await assert.rejects(decryptAccounts(JSON.stringify(book),'synthetic-password'));
 const damaged=JSON.parse(output);damaged.ciphertext='AA'+damaged.ciphertext.slice(2);await assert.rejects(decryptAccounts(JSON.stringify(damaged),'synthetic-password'));
 await assert.rejects(encryptAccounts(book,'short'));
});
test('tire history drops invalid fields and keeps sorted timestamps without fabricating points',()=>{
 assert.deepEqual(tireHistory(null),[]);const result=tireHistory({data:[{sensorPosition:1,tirePressureStat:{list:[{time:2,value:'2.4'},{time:1,value:2.3},{time:null,value:2.5},{time:4,value:'bad'}]}}]});
 assert.deepEqual(result[0].pressure,[{t:1000,v:2.3},{t:2000,v:2.4}]);assert.deepEqual(result[0].temperature,[]);
});

test('server outages are uncertain, and an observed target value takes precedence',async()=>{
 assert.equal(await changeOnce(async()=>{throw new ApiError('rejected',503);},async()=>({}),()=>false),'已发送，车辆尚未确认');
 assert.equal(await changeOnce(async()=>{throw new ApiError('network');},async()=>({}),()=>true),'已生效');
 assert.equal(await changeOnce(async()=>{throw new ApiError('rejected',200);},async()=>({}),()=>false),'修改未生效');
});
