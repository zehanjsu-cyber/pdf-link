const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const belongs=(host,domain)=>host===domain||host.endsWith('.'+domain);
export function publicUrl(value,base){
 const u=new URL(value,base),h=u.hostname.toLowerCase();
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||(u.port&&!['80','443'].includes(u.port)))throw Error('仅支持公开的 HTTP/HTTPS 网页地址');
 if(!h.includes('.')||h.includes(':')||/^\d+(?:\.\d+)*$/.test(h)||/(?:^|\.)(?:localhost|local|internal|lan|test|invalid)$/.test(h)||h==='metadata.google.internal')throw Error('不支持本机、内网或 IP 地址');
 return u;
}
const dnsCache=new Map();
function privateIP(ip){
 if(ip.includes(':'))return /^(?:0*:|f[cdfe]|2001:db8)/i.test(ip)||ip.includes('.');
 const p=ip.split('.').map(Number);return p.length!==4||p.some(x=>!Number.isInteger(x)||x<0||x>255)||p[0]===0||p[0]===10||p[0]===127||p[0]>=224||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&[0,168].includes(p[1]))||(p[0]===100&&p[1]>=64&&p[1]<=127)||(p[0]===198&&[18,19,51].includes(p[1]))||(p[0]===203&&p[1]===0&&p[2]===113);
}
async function checkDns(host){
 if(dnsCache.get(host)>Date.now())return;
 // Well-known source hosts still pass URL and redirect validation.
 if(['chaoxing.com','cldisk.com'].some(d=>belongs(host,d))||host.endsWith('.edu.cn'))return;
 const answers=await Promise.all(['A','AAAA'].map(async type=>{
  const r=await fetch('https://cloudflare-dns.com/dns-query?'+new URLSearchParams({name:host,type}),{headers:{Accept:'application/dns-json'}});
  if(!r.ok)throw Error('无法验证目标域名的公网地址');const data=await r.json();if(data.Status!==0)throw Error('目标域名无法解析');return(data.Answer||[]).filter(x=>x.type===1||x.type===28).map(x=>x.data);
 }));
 const ips=answers.flat();if(!ips.length||ips.some(privateIP))throw Error('目标域名不是可访问的公网地址');
 if(dnsCache.size>200)dnsCache.clear();dnsCache.set(host,Date.now()+60000);
}
async function safeFetch(value,options={}){
 let u=publicUrl(value);
 for(let n=0;n<5;n++){
  await checkDns(u.hostname);
  const r=await fetch(u.href,{...options,headers:{'User-Agent':'Mozilla/5.0',...options.headers},redirect:'manual'});
  if([301,302,303,307,308].includes(r.status)){const loc=r.headers.get('location');await r.body?.cancel();if(!loc)throw Error('源站重定向地址无效');u=publicUrl(loc,u);continue;}
  if(!r.ok){await r.body?.cancel();throw Error('源站返回 '+r.status);}
  return {response:r,url:u.href};
 }
 throw Error('源站重定向过多');
}
async function readHead(response){
 const reader=response.body.getReader(),chunks=[];let size=0;
 while(size<5){const part=await reader.read();if(part.done)break;const bytes=part.value instanceof Uint8Array?part.value:new Uint8Array(part.value);chunks.push(bytes);size+=bytes.byteLength;}
 const head=new Uint8Array(size);let offset=0;for(const part of chunks){head.set(part,offset);offset+=part.byteLength;}
 return {reader,head};
}
const isPdf=head=>head.length>=5&&head[0]===37&&head[1]===80&&head[2]===68&&head[3]===70&&head[4]===45;
export async function verify(response){const parts=await readHead(response);if(!isPdf(parts.head)){await parts.reader.cancel();throw Error('源站返回内容不是 PDF');}return parts;}
async function readText(parts){
 const decoder=new TextDecoder();let text=decoder.decode(parts.head,{stream:true}),size=parts.head.byteLength;
 try{while(size<2*1024*1024){const p=await parts.reader.read();if(p.done)break;const bytes=p.value instanceof Uint8Array?p.value:new Uint8Array(p.value);size+=bytes.byteLength;text+=decoder.decode(bytes,{stream:true});}return text+decoder.decode();}finally{await parts.reader.cancel();}
}
function unescapeHtml(s){return s.replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(Math.min(parseInt(n,16),0x10ffff))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(Number(n),0x10ffff))).replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&apos;|&#39;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');}
export function extractCandidates(source,base){
 const text=unescapeHtml(source.replace(/\\\//g,'/').replace(/\\u0026/gi,'&').replace(/\\u003d/gi,'='));
 const baseMatch=text.match(/<base\b[^>]*\bhref\s*=\s*["']([^"']+)/i);let root=base;try{if(baseMatch)root=publicUrl(baseMatch[1],base).href;}catch{}
 const out=new Map();
 function add(raw,depth=0,context=root){
  if(!raw||depth>3)return;
  try{const u=publicUrl(raw,context);u.hash='';
   for(const key of ['file','url','pdf','src','document']){const nested=u.searchParams.get(key);if(nested&&(/\.pdf(?:[?#]|$)/i.test(nested)||key==='file'))add(nested,depth+1,u.href);}
   if(!out.has(u.href))out.set(u.href,{url:u.href,priority:/\.pdf(?:[?#]|$)/i.test(u.href)?0:1});
  }catch{}
 }
 for(const m of text.matchAll(/showVsbpdfIframe\s*\(\s*["']([^"']+)/gi))add(m[1]);
 for(const m of text.matchAll(/<(?:iframe|embed|object)\b[^>]*\b(?:src|data)\s*=\s*(?:["']([^"']+)["']|([^\s>]+))/gi))add(m[1]||m[2]);
 for(const m of text.matchAll(/["']([^"'<>\s]+)["']/g)){if(/\.pdf(?:[?#]|$)|viewer\.html\?|preview[^\s]*\?/i.test(m[1]))add(m[1]);}
 return [...out.values()].sort((a,b)=>a.priority-b.priority).map(x=>x.url);
}
function cleanName(name){const cleaned=String(name).replace(/[\x00-\x1f/\\]/g,'_').slice(0,180);return /\.pdf$/i.test(cleaned)?cleaned:cleaned+'.pdf';}
function success(response,url,preferred){
 let name=preferred;
 if(!name){const cd=response.headers.get('content-disposition')||'';const match=cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)/i);try{name=match?decodeURIComponent(match[1]||match[2]):decodeURIComponent(new URL(url).pathname.split('/').pop());}catch{}}
 name=cleanName(name||'document.pdf');
 return json({name,url,bytes:Number(response.headers.get('content-length'))||null,verified:true,download:'/api/download?'+new URLSearchParams({url,name})});
}
export async function resolve(request){
 try{
  if(request.method!=='POST')return json({error:'仅支持 POST'},405);
  const raw=await request.text();if(raw.length>12000)throw Error('链接过长');const body=JSON.parse(raw);const u=publicUrl(String(body.url||'').trim().replaceAll('\\&','&'));
  const queue=[{url:u.href,depth:0}],seen=new Set();let preferred='',lastError='',fetchedPage=false;
  const oid=u.searchParams.get('objectid');
  if(belongs(u.hostname,'chaoxing.com')&&/^[a-f0-9]{32}$/i.test(oid||'')){
   const api=new URL('/pc/view/preview',u);api.searchParams.set('objectid',oid);api.searchParams.set('download','false');
   for(const key of ['enc','resid','type','puid'])if(u.searchParams.has(key))api.searchParams.set(key,u.searchParams.get(key));
   try{const {response}=await safeFetch(api.href);const data=await response.json();const file=data.data?.pdf||data.data?.yunfile?.pdf;if(data.result===1&&file){preferred=data.data.filename||'';queue.unshift({url:publicUrl(file,api).href,depth:0});}}catch(e){lastError=e.message;}
  }
  // A supplied PDF.js viewer link can itself contain the original PDF URL.
  for(const candidate of extractCandidates('"'+u.href+'"',u.href))if(candidate!==u.href)queue.unshift({url:candidate,depth:0});
  while(queue.length&&seen.size<10){
   const item=queue.shift();if(seen.has(item.url))continue;seen.add(item.url);
   try{
    const {response,url}=await safeFetch(item.url),parts=await readHead(response);
    if(isPdf(parts.head)){await parts.reader.cancel();return success(response,url,preferred);}
    const type=response.headers.get('content-type')||'';
    if(type&&!/html|text|json|javascript|xml/i.test(type)){await parts.reader.cancel();continue;}
    const text=await readText(parts);fetchedPage=true;
    if(item.depth<2){const candidates=extractCandidates(text,url);for(const candidate of candidates.slice(0,8))if(!seen.has(candidate))queue.push({url:candidate,depth:item.depth+1});}
   }catch(e){lastError=e.message;}
  }
  throw Error(fetchedPage?'页面中未找到可验证的原始 PDF。该页面可能只有文字、图片，或需要登录和动态脚本加载。':lastError||'无法读取网页或未找到 PDF');
 }catch(e){return json({error:e.message||'解析失败'},400);}
}
export async function download(request){
 try{
  const params=new URL(request.url).searchParams;const u=publicUrl(params.get('url'));
  const {response}=await safeFetch(u.href),{reader,head}=await verify(response);
  const stream=new ReadableStream({start(c){c.enqueue(head)},async pull(c){try{const {done,value}=await reader.read();if(done)c.close();else c.enqueue(value instanceof Uint8Array?value:new Uint8Array(value));}catch(e){c.error(e);}},cancel(reason){return reader.cancel(reason);}});
  const name=cleanName(params.get('name')||'document.pdf');
  return new Response(stream,{headers:{'content-type':'application/pdf','cache-control':'no-store','content-disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(name)}});
 }catch(e){return json({error:e.message||'下载失败'},400);}
}
export default function onRequest({request}){return resolve(request);}
