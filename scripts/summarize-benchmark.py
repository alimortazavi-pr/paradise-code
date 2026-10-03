#!/usr/bin/env python3
import json,statistics
from pathlib import Path
root=Path('/Volumes/ParadiseCodeBuild/artifacts/benchmark')
summary={}
for product in ['paradise','vscode']:
 runs=[]
 for number in range(1,4):
  prefix=root/f'{product}-{number}'
  op=json.loads(Path(str(prefix)+'-operations.json').read_text())
  memory=json.loads(Path(str(prefix)+'-memory.json').read_text())
  active=json.loads(Path(str(prefix)+'-active.json').read_text())
  runs.append(dict(run=number,readyMs=op['readyMs'],footprintMiB=memory['footprint_mean_bytes']/1048576,rssMiB=memory['rss_mean_bytes']/1048576,idleCpu=memory['cpu_percent_one_core'],activeCpu=active['cpu_percent_one_core'],symbolsMs=statistics.median(x['symbolsMs'] for x in op['operations']),searchMs=statistics.median(x['searchMs'] for x in op['operations'])))
 summary[product]={'runs':runs,'median':{key:statistics.median(run[key] for run in runs) for key in runs[0] if key!='run'}}
p=summary['paradise']['median'];v=summary['vscode']['median']
summary['changePercent']={key:(p[key]/v[key]-1)*100 for key in p}
summary['memoryTargetPassed']=p['footprintMiB']<=v['footprintMiB']*.8
summary['latencyTargetPassed']=all(p[key]<=v[key]*1.1 for key in ['readyMs','symbolsMs','searchMs'])
summary['performanceTargetPassed']=summary['memoryTargetPassed'] and summary['latencyTargetPassed']
print(json.dumps(summary,indent=2))
