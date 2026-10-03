import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
const [backend, profile, port, tokenFile] = process.argv.slice(2);
if (!backend || !profile || !/^\d+$/.test(port) || !tokenFile) throw new Error('Invalid launcher arguments');
const pre = path.join(backend, 'out/vs/workbench/contrib/webview/browser/pre');
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
const assets = http.createServer((req,res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  let file;
  try { file = path.resolve(pre, '.' + decodeURIComponent(pathname)); } catch { res.writeHead(400).end(); return; }
  if (req.method !== 'GET' || !file.startsWith(pre + path.sep)) { res.writeHead(403).end(); return; }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});
    fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
  });
});
await new Promise((resolve,reject) => assets.once('error',reject).listen(0,'::1',resolve));
const origin = `http://127.0.0.1:${port}`;
fs.writeFileSync(path.join(profile,'webview-origin'), `http://{{uuid}}.localhost:${assets.address().port}`, {mode:0o600});
let stopping = false;
let retries = 0;
let child;
function startBackend() {
child = spawn(process.execPath, [path.join(backend,'out/server-main.js'), '--host','127.0.0.1','--port',port,
  '--connection-token-file',tokenFile,'--server-data-dir',path.join(profile,'server-data'),'--extensions-dir',path.join(profile,'extensions'),
  '--accept-server-license-terms','--disable-telemetry'], {
  cwd: backend, stdio:['ignore','pipe','pipe'], env: {...process.env, PARADISE_ORIGIN:origin, PARADISE_LOCAL_VOLUME:process.env.PARADISE_LOCAL_VOLUME,
    PARADISE_WEBVIEW_ORIGIN:`http://{{uuid}}.localhost:${assets.address().port}`, BROWSER:'none'}
});
const token = fs.readFileSync(tokenFile,'utf8').trim();
for (const stream of [child.stdout,child.stderr]) {
  stream.setEncoding('utf8');
  let pending='';
  stream.on('data', data => {
    pending += data;
    let end;
    while ((end=pending.indexOf('\n'))>=0) { process.stderr.write(pending.slice(0,end+1).replaceAll(token,'[redacted]')); pending=pending.slice(end+1); }
  });
  stream.on('end',()=>{if(pending)process.stderr.write(pending.replaceAll(token,'[redacted]'));});
}
child.on('error',error=>{process.stderr.write(error.message);process.exit(1)});
child.on('exit',code=>{
  if (!stopping && retries++ < 3) {
    process.stderr.write('Backend exited unexpectedly; reconnecting after restart.\n');
    setTimeout(startBackend,1000);
  } else { assets.close();process.exit(code ?? 1); }
});
}
startBackend();
for (const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>{stopping=true;child.kill(signal); assets.close()});
// Pipe closure also catches a native shell crash; Rust additionally terminates the process group.
process.stdin.resume();
process.stdin.on('end',()=>{stopping=true;child.kill('SIGTERM')});
