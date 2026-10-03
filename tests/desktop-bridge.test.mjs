import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../src/desktop.js',import.meta.url),'utf8').replace('__ORIGIN__',JSON.stringify('http://127.0.0.1:1234')).replace('__NONCE__',JSON.stringify('test-nonce'));
function context(origin='http://127.0.0.1:1234',iframe=false){
 const events=new Map();const window={addEventListener(name,callback){events.set(name,callback)}};window.top=iframe?{}:window;
 const timers=new Map();let id=0;
 const sandbox={window,location:{origin,href:''},document:{addEventListener(){}},Map,URLSearchParams,Object,JSON,Element:class{},setTimeout(fn){timers.set(++id,fn);return id},clearTimeout(key){timers.delete(key)}};
 vm.runInNewContext(source,sandbox);return {...sandbox,timers,events};
}
test('extension frames never receive the native bridge',()=>{const c=context(undefined,true);assert.equal(c.window.paradiseDesktop,undefined);assert.equal(c.window.paradiseNative,undefined)});
test('untrusted top-level origins never receive the bridge',()=>{assert.equal(context('https://example.com').window.paradiseNative,undefined)});
test('picker round trip carries safe encoded paths and resolves cancellation',async()=>{const c=context();const result=c.window.paradiseDesktop.pick({folders:true,defaultPath:'/tmp/فارسی & files'});const url=new URL(c.location.href);assert.equal(url.searchParams.get('key'),'test-nonce');const payload=JSON.parse(url.searchParams.get('payload'));assert.equal(payload.defaultPath,'/tmp/فارسی & files');c.window.paradiseResolve(payload.id,null);assert.equal(await result,null);assert.equal(c.timers.size,0)});
test('picker timeout rejects and releases pending state',async()=>{const c=context();const result=c.window.paradiseDesktop.pick({});const rejection=assert.rejects(result,/timed out/);[...c.timers.values()][0]();await rejection;c.window.paradiseResolve('1',['/unrelated']);});
test('Mac Option-O uses the physical shortcut despite its alternate character',()=>{const c=context();let command;let prevented=false;c.window.paradiseWorkbench={executeCommand:value=>command=value};c.events.get('keydown')({metaKey:true,altKey:true,key:'ø',code:'KeyO',preventDefault(){prevented=true},stopImmediatePropagation(){}});assert.equal(command,'workbench.action.files.openFolder');assert.equal(prevented,true)});
