#!/usr/bin/env python3
import argparse,json,os,plistlib,signal,subprocess,time
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('app');p.add_argument('name');p.add_argument('--vscode',action='store_true');p.add_argument('--quit',action='store_true');a=p.parse_args()
volume=Path('/Volumes/ParadiseCodeBuild');out=volume/'artifacts/benchmark';out.mkdir(exist_ok=True)
result=out/(a.name+'-operations.json');result.unlink(missing_ok=True)
start=time.time();cmd=['open','-n','--env',f'PARADISE_BENCHMARK_FILE={result}','--env',f'PARADISE_BENCHMARK_START={int(start*1000)}','-a',a.app]
if a.vscode:cmd+=['--args','--user-data-dir',str(volume/'profiles/vscode-benchmark'),'--extensions-dir',str(volume/'profiles/vscode-benchmark/extensions'),'--disable-updates','--skip-welcome','--skip-release-notes','--disable-workspace-trust',str(volume/'qa/workspace فارسی')]
subprocess.run(cmd,check=True)
active_sample=None
exe=str(Path(a.app)/'Contents/MacOS'/plistlib.loads((Path(a.app)/'Contents/Info.plist').read_bytes())['CFBundleExecutable'])
def app_pid():
 rows=subprocess.check_output(['ps','-axo','pid=,command='],text=True).splitlines()
 return next(int(row.strip().split(None,1)[0]) for row in rows if row.strip().split(None,1)[1].startswith(exe))
while time.time()-start<180:
 if result.exists():
  data=json.loads(result.read_text())
  if 'error' in data:raise SystemExit(data['error'])
  if data.get('phase')=='active' and active_sample is None:
   time.sleep(1)
   active_sample=subprocess.Popen(['python3',str(volume/'project/scripts/measure-processes.py'),'--pid',str(app_pid()),'--seconds','5','--output',str(out/(a.name+'-active.json'))])
  if data.get('phase')=='complete':break
 time.sleep(.5)
else:raise SystemExit('Workbench readiness timed out')
if active_sample:active_sample.wait()
# Wait until the timed operations settle before measuring idle CPU/memory.
time.sleep(5)
exe=str(Path(a.app)/'Contents/MacOS'/plistlib.loads((Path(a.app)/'Contents/Info.plist').read_bytes())['CFBundleExecutable'])
rows=subprocess.check_output(['ps','-axo','pid=,command='],text=True).splitlines()
pid=next(int(row.strip().split(None,1)[0]) for row in rows if row.strip().split(None,1)[1].startswith(exe))
subprocess.run(['python3',str(volume/'project/scripts/measure-processes.py'),'--pid',str(pid),'--seconds','10','--output',str(out/(a.name+'-memory.json'))],check=True)
print(json.dumps({'name':a.name,'pid':pid,'readyMs':data['readyMs'],'operations':len(data['operations'])}))

if a.quit:
 os.kill(pid,signal.SIGTERM)
 for _ in range(40):
  if subprocess.run(['ps','-p',str(pid)],stdout=subprocess.DEVNULL).returncode:break
  time.sleep(.25)
 else:raise SystemExit('Benchmark app failed to exit')
 time.sleep(2)
