import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
const profile=process.env.PARADISE_PROFILE || '/Volumes/ParadiseCodeBuild/profiles/default';
const {port}=JSON.parse(fs.readFileSync(`${profile}/session.json`));
const token=fs.readFileSync(`${profile}/connection-token`,'utf8').trim();
function request(path,headers={}){return new Promise((resolve,reject)=>{const req=http.get({hostname:'127.0.0.1',port,path,headers},res=>{let body='';res.on('data',d=>body+=d);res.on('end',()=>resolve({status:res.statusCode,body,headers:res.headers}));});req.on('error',reject);});}
test('workbench refuses an unauthenticated request',async()=>assert.equal((await request('/')).status,403));
test('workbench accepts the connection token',async()=>assert.equal((await request(`/?tkn=${token}`)).status,302));
test('cross-origin requests fail even with a valid token',async()=>assert.equal((await request(`/?tkn=${token}`,{Origin:'https://example.invalid'})).status,403));
test('unexpected Host fails even with a valid token',async()=>assert.equal((await request(`/?tkn=${token}`,{Host:'example.invalid'})).status,403));
test('authenticated HTML uses local webview resources',async()=>{const res=await request('/',{Cookie:`vscode-tkn=${token}`});assert.equal(res.status,200);assert.match(res.body,/webviewEndpoint/);assert.match(res.body,/127\.0\.0\.1/);});
test('client, server and cached NLS assets share the Paradise build revision', async () => {
  const headers = {Cookie: `vscode-tkn=${token}`};
  const {body} = await request('/', headers);
  const settings = body.match(/id="vscode-workbench-web-configuration" data-settings="([^"]+)"/);
  assert.ok(settings, 'Workbench configuration must be present');
  const config = JSON.parse(settings[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'));
  const revision = config.productConfiguration.commit;
  assert.match(revision, /^[a-f0-9]{40}$/);
  assert.notEqual(revision, JSON.parse(fs.readFileSync(new URL('../upstream.json', import.meta.url))).commit);
  assert.equal((await request('/version', headers)).body, revision);
  const base = body.match(/id="vscode-workbench-web-base-url" data-settings="([^"]+)"/)?.[1];
  assert.ok(base?.endsWith(`-${revision}/static`));
  const nlsPath = `${base}/out/nls.messages.js`;
  assert.ok(body.includes(`src="${nlsPath}"`), 'NLS must use the same immutable build URL');
  assert.equal((await request(nlsPath, headers)).status, 200);
});
test('webview server cannot read parent directories',async()=>{const origin=fs.readFileSync(`${profile}/webview-origin`,'utf8').replace('{{uuid}}','a'.repeat(52));const res=await fetch(`${origin}/%2e%2e%2f%2e%2e%2fproduct.json`);assert.equal(res.status,403);});
function upgrade(origin){return new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path:`/?tkn=${token}`,headers:{Origin:origin,Connection:'Upgrade',Upgrade:'websocket','Sec-WebSocket-Version':'13','Sec-WebSocket-Key':'dGhlIHNhbXBsZSBub25jZQ=='}},res=>{res.resume();resolve(res.statusCode)});req.on('upgrade',(_res,socket)=>{socket.destroy();resolve(101)});req.on('error',reject);req.end();});}
test('cross-origin WebSocket upgrade is refused',async()=>assert.equal(await upgrade('https://example.invalid'),403));
