import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {randomBytes} from 'node:crypto';
test('native bundled backend boots, enforces token, and serves the full workbench', {timeout:90000}, async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'paradise-smoke-'));
 const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const token=randomBytes(32).toString('hex');fs.writeFileSync(path.join(profile,'connection-token'),token,{mode:0o600});
 const backend=path.resolve('resources/backend');const child=spawn(path.join(backend,process.platform==='win32'?'node.exe':'node'),['resources/backend-launcher.mjs',backend,profile,String(port),path.join(profile,'connection-token')],{stdio:['pipe','pipe','pipe']});
 let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);const origin=`http://127.0.0.1:${port}`;
 try {
  let ready=false;for(let i=0;i<240;i++){try{if((await fetch(`${origin}/version`)).ok){ready=true;break}}catch{}if(child.exitCode!==null)throw new Error(log);await new Promise(r=>setTimeout(r,250))}
  assert.ok(ready,log);
  assert.ok(!(await fetch(origin)).ok,'unauthenticated workbench rejected');
  const page=await fetch(`${origin}/?tkn=${token}`);assert.equal(page.status,200);assert.match(await page.text(),/workbench/);
  fs.writeFileSync('platform-smoke.json',JSON.stringify({platform:process.platform,node:process.version,backendReady:true,tokenEnforced:true,workbenchServed:true,guiTested:false},null,2));
 } finally {child.stdin.end();await new Promise(resolve=>{child.once('exit',resolve);setTimeout(()=>{child.kill();resolve()},5000)});fs.rmSync(profile,{recursive:true,force:true})}
});
