import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {parseCounters,delta,localDate} from './core.mjs';
const run=promisify(execFile);
const data=process.argv[2];
if(process.platform!=='darwin'||!data||!path.isAbsolute(data))throw new Error('The collector requires macOS and an absolute data folder.');
fs.mkdirSync(data,{recursive:true,mode:0o700});
const lock=path.join(data,'collector.lock');
try{fs.mkdirSync(lock)}catch(error){
 const pid=Number(fs.readFileSync(path.join(lock,'pid'),'utf8'));
 try{process.kill(pid,0);throw new Error('The network collector is already running.')}catch(check){if(check.code!=='ESRCH')throw check}
 fs.rmSync(lock,{recursive:true});fs.mkdirSync(lock);
}
fs.writeFileSync(path.join(lock,'pid'),String(process.pid),{mode:0o600});
let previous=null,previousTime=0,bucket=null,stopping=false;
const statusFile=path.join(data,'status.json');
let firstObserved=new Date().toISOString();
try{firstObserved=JSON.parse(fs.readFileSync(statusFile)).firstObserved||firstObserved}catch{}
function atomic(file,value){const temporary=file+'.new';fs.writeFileSync(temporary,JSON.stringify(value),{mode:0o600});fs.renameSync(temporary,file)}
function flush(){if(bucket){fs.appendFileSync(path.join(data,bucket.date+'.jsonl'),JSON.stringify(bucket)+'\n',{mode:0o600});bucket=null}}
function settings(){try{return JSON.parse(fs.readFileSync(path.join(data,'config.json')))}catch{return {}}}
function stop(){if(stopping)return;stopping=true;flush();try{fs.rmSync(lock,{recursive:true})}catch{}process.exit(0)}
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,stop);
async function sample(){
 let interval=Math.max(1,Math.min(10,Number(settings().interval)||2));
 try{
  const {stdout}=await run('/usr/sbin/netstat',['-ibdn'],{timeout:3000,maxBuffer:512*1024});
  const now=Date.now(),current=parseCounters(stdout);const elapsed=(now-previousTime)/1000;
  const gap=previous&&elapsed>interval*3;
  const changes=previous&&!gap?delta(previous,current,elapsed):{rx:0,tx:0,rxRate:0,txRate:0,interfaces:{},reset:false};
  const minute=Math.floor(now/60000)*60000,date=localDate(now);
  if(bucket&&(bucket.time!==minute||bucket.date!==date))flush();
  bucket??={time:minute,date,rx:0,tx:0,observedSeconds:0,interfaces:{},gaps:0};
  bucket.rx+=changes.rx;bucket.tx+=changes.tx;
  bucket.observedSeconds+=previous&&!gap?elapsed:0;bucket.gaps+=gap||changes.reset?1:0;
  for(const[name,bytes]of Object.entries(changes.interfaces)){bucket.interfaces[name]??={rx:0,tx:0};bucket.interfaces[name].rx+=bytes.rx;bucket.interfaces[name].tx+=bytes.tx}
  atomic(statusFile,{schema:1,pid:process.pid,updatedAt:now,firstObserved,interval,rxRate:changes.rxRate,txRate:changes.txRate,interfaces:Object.keys(current),current:bucket,gap:!!gap,reset:changes.reset,error:null});
  previous=current;previousTime=now;
 }catch(error){atomic(statusFile,{schema:1,pid:process.pid,updatedAt:Date.now(),firstObserved,interval,error:error.message,current:bucket});previous=null}
 if(!stopping)setTimeout(sample,interval*1000);
}
await sample();
