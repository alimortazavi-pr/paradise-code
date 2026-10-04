/** Physical interface counters. Link rows only; IP and VPN rows would double count. */
export function parseCounters(text) {
 const result={};
 for (const line of text.split('\n')) {
  const fields=line.trim().split(/\s+/);const name=fields[0]?.replace(/\*$/,'');
  if (!/^en\d+$/.test(name)||!fields[2]?.startsWith('<Link#')) continue;
  const tail=fields.slice(-8);const rx=Number(tail[2]),tx=Number(tail[5]);
  if (Number.isSafeInteger(rx)&&rx>=0&&Number.isSafeInteger(tx)&&tx>=0) result[name]={rx,tx};
 }
 if (!Object.keys(result).length) throw new Error('No physical network interface counters are available.');
 return result;
}
export function delta(previous,current,seconds) {
 const interfaces={};let rx=0,tx=0;let reset=false;
 for (const [name,now] of Object.entries(current)) {
  const old=previous[name];if(!old)continue;
  if(now.rx<old.rx||now.tx<old.tx){reset=true;continue}
  const received=now.rx-old.rx,sent=now.tx-old.tx;
  interfaces[name]={rx:received,tx:sent};rx+=received;tx+=sent;
 }
 return {rx,tx,rxRate:rx/seconds,txRate:tx/seconds,interfaces,reset};
}
export function localDate(time){const d=new Date(time);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
export function validateRange(from,to){if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to||new Date(`${from}T00:00:00`).toString()==='Invalid Date'||new Date(`${to}T00:00:00`).toString()==='Invalid Date')throw new Error('Choose a valid date range.');if((Date.parse(to)-Date.parse(from))/86400000>366)throw new Error('Choose up to one year at a time.');}
