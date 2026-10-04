const CATALOG_URL='https://ide.paradisecode.ir/extensions/catalog.json';
function validateCatalog(value){
 if(value?.schema!==1||!Array.isArray(value.extensions)||value.extensions.length>100)throw new Error('Unsupported Paradise catalog.');
 return value.extensions.map(item=>{
  if(!/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/.test(item.id)||!/^\d+\.\d+\.\d+$/.test(item.version)||!/^[a-f0-9]{64}$/.test(item.sha256)||typeof item.name!=='string'||item.name.length>100||typeof item.description!=='string'||item.description.length>600||!Array.isArray(item.platforms)||!item.platforms.every(p=>['darwin','win32','linux'].includes(p)))throw new Error('Invalid extension metadata.');
  const url=new URL(item.download);if(url.protocol!=='https:'||url.host!=='github.com'||!url.pathname.startsWith('/alimortazavi-pr/paradise-code/releases/download/'))throw new Error('Extension download is outside the Paradise release repository.');
  return item;
 });
}
module.exports={CATALOG_URL,validateCatalog};
