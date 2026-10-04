const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const {execFile}=require('node:child_process');const {promisify}=require('node:util');const crypto=require('node:crypto');const run=promisify(execFile);
const xml=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function identity(data){return 'dev.paradise.code.network.'+crypto.createHash('sha256').update(data).digest('hex').slice(0,12)}
function plistPath(data){return path.join(os.homedir(),'Library/LaunchAgents',identity(data)+'.plist')}
async function enable(data,source){
 if(process.platform!=='darwin')throw new Error('Network monitoring currently supports macOS only.');
 fs.mkdirSync(data,{recursive:true,mode:0o700});const service=path.join(data,'service');fs.mkdirSync(service,{recursive:true});
 // A local copy survives extension removal and supports a clean stop command.
 for(const file of ['core.mjs','collector.mjs'])fs.copyFileSync(path.join(source,file),path.join(service,file));
 const label=identity(data),file=plistPath(data);fs.mkdirSync(path.dirname(file),{recursive:true});
 const executable=process.execPath; // Bundled Node; no installation required.
 fs.writeFileSync(file,`<?xml version="1.0"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>${xml(executable)}</string><string>${xml(path.join(service,'collector.mjs'))}</string><string>${xml(data)}</string></array><key>RunAtLoad</key><true/><key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict><key>ThrottleInterval</key><integer>30</integer><key>ProcessType</key><string>Background</string><key>StandardErrorPath</key><string>${xml(path.join(data,'service-error.log'))}</string></dict></plist>`,{mode:0o600});
 try{await run('/bin/launchctl',['bootout',`gui/${process.getuid()}/${label}`],{timeout:5000})}catch{}
 await run('/bin/launchctl',['bootstrap',`gui/${process.getuid()}`,file],{timeout:5000});
 return label;
}
async function disable(data){
 try{await run('/bin/launchctl',['bootout',`gui/${process.getuid()}/${identity(data)}`],{timeout:5000})}catch(error){
  try{await run('/bin/launchctl',['print',`gui/${process.getuid()}/${identity(data)}`],{timeout:3000});throw error}catch(check){if(check===error)throw error}
 }
 fs.rmSync(plistPath(data),{force:true});
}
module.exports={enable,disable,identity,plistPath};
