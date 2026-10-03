#!/usr/bin/env python3
"""macOS process-coalition measurements include WKWebView's launchd-owned helpers."""
import argparse, ctypes, json, subprocess, time
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--pid',type=int,required=True);parser.add_argument('--seconds',type=float,default=10);parser.add_argument('--output',required=True);args=parser.parse_args()
lib=ctypes.CDLL('/usr/lib/libproc.dylib',use_errno=True)
lib.proc_pidinfo.argtypes=[ctypes.c_int,ctypes.c_int,ctypes.c_uint64,ctypes.c_void_p,ctypes.c_int]
lib.proc_pid_rusage.argtypes=[ctypes.c_int,ctypes.c_int,ctypes.c_void_p]
class Usage(ctypes.Structure):
    _fields_=[('uuid',ctypes.c_ubyte*16)]+[(n,ctypes.c_uint64) for n in ['user','system','wakeups','interrupts','pageins','wired','resident','footprint','start','exit']]
def coalition(pid):
    result=(ctypes.c_uint64*5)()
    if lib.proc_pidinfo(pid,20,0,ctypes.byref(result),ctypes.sizeof(result))!=40:return None
    return result[0]
root=coalition(args.pid)
if not root:raise SystemExit('Cannot determine app resource coalition')
def snapshot():
    rows=[]
    for line in subprocess.check_output(['ps','-axo','pid=,command='],text=True).splitlines():
        pid,command=line.strip().split(None,1);pid=int(pid)
        if coalition(pid)!=root:continue
        u=Usage()
        if lib.proc_pid_rusage(pid,0,ctypes.byref(u))!=0:continue
        rows.append(dict(pid=pid,command=command,cpu_ns=u.user+u.system,footprint=u.footprint,resident=u.resident))
    return dict(time=time.monotonic(),processes=rows,footprint=sum(r['footprint'] for r in rows),resident=sum(r['resident'] for r in rows))
samples=[snapshot()];end=time.monotonic()+args.seconds
while time.monotonic()<end:
    time.sleep(.5);samples.append(snapshot())
first={p['pid']:p['cpu_ns'] for p in samples[0]['processes']};last=samples[-1]
cpu=sum(max(0,p['cpu_ns']-first.get(p['pid'],p['cpu_ns'])) for p in last['processes'])/(last['time']-samples[0]['time'])/1e9*100
result=dict(coalition=root,pid=args.pid,cpu_percent_one_core=cpu,footprint_mean_bytes=sum(s['footprint'] for s in samples)/len(samples),rss_mean_bytes=sum(s['resident'] for s in samples)/len(samples),samples=samples)
Path(args.output).write_text(json.dumps(result,indent=2));print(json.dumps({k:v for k,v in result.items() if k!='samples'}))
