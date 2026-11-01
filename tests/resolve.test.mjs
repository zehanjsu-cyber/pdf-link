import assert from 'node:assert/strict';
import {extractCandidates,resolve,download,publicUrl} from '../edge-functions/api/resolve.js';
const base='https://www.csust.edu.cn/cgj2026/index/a.htm';
assert.deepEqual(extractCandidates('showVsbpdfIframe("/__local/report.pdf","100%")',base),['https://www.csust.edu.cn/__local/report.pdf']);
assert.equal(extractCandidates('<iframe src="/system/pdfjs/viewer.html?file=%2F__local%2Freport.pdf"></iframe>',base)[0],'https://www.csust.edu.cn/__local/report.pdf');
assert.equal(extractCandidates('<iframe src="/pdfjs/viewer.html?file=docs/a.pdf"></iframe>',base)[0],'https://www.csust.edu.cn/pdfjs/docs/a.pdf');
assert.equal(extractCandidates('<a href="../a.pdf?x=1&amp;y=2">PDF</a>',base)[0],'https://www.csust.edu.cn/cgj2026/a.pdf?x=1&y=2');
for(const bad of ['file:///etc/passwd','https://127.0.0.1/a','https://2130706433/a','http://[::1]/a','https://a:pw@example.com/a','https://a.local/a'])assert.throws(()=>publicUrl(bad));
let mode='vsb',calls=[];
const pdfBytes=new TextEncoder().encode('%PDF-1.7\nfixture');
const pdf=()=>({headers:new Headers({'Content-Type':'application/pdf','Content-Length':String(pdfBytes.length)}),body:{getReader(){let read=false;return {async read(){if(read)return{done:true};read=true;return{done:false,value:pdfBytes.buffer};},async cancel(){}}}}});
globalThis.fetch=async value=>{
 const u=new URL(value);calls.push(u.href);
 if(u.pathname.endsWith('.pdf'))return {...pdf(),ok:true,status:200};
 if(u.pathname==='/pc/view/preview')return Response.json({result:1,data:{filename:'report.pdf',pdf:'https://s3.cldisk.com/doc/pdf/report.pdf'}});
 if(mode==='none')return new Response('<html>纯文字正文</html>',{headers:{'content-type':'text/html'}});
 if(mode==='iframe')return new Response('<iframe src="/system/pdfjs/viewer.html?file=/__local/report.pdf"></iframe>');
 return new Response('showVsbpdfIframe("/__local/report.pdf","100%")');
};
const request=url=>new Request('https://site.example/api/resolve',{method:'POST',body:JSON.stringify({url})});
for(mode of ['vsb','iframe']){
 const r=await resolve(request(base)),data=await r.json();assert.equal(r.status,200);assert.equal(data.verified,true);assert.equal(data.url,'https://www.csust.edu.cn/__local/report.pdf');
 const d=await download(new Request('https://site.example'+data.download));assert.equal(d.status,200);assert.equal(await d.text(),'%PDF-1.7\nfixture');
}
mode='none';let r=await resolve(request(base));assert.equal(r.status,400);assert.match((await r.json()).error,/未找到/);
r=await resolve(request('https://previewyd.chaoxing.com/res/view/view.html?objectid=6f14ff3640a48e4c3c38e6b35404d2d9'));assert.equal(r.status,200);assert.equal((await r.json()).name,'report.pdf');
r=await resolve(request('https://www.csust.edu.cn/direct.pdf'));assert.equal(r.status,200);
// Unknown domains resolving to private addresses are rejected before fetching the source.
globalThis.fetch=async()=>Response.json({Status:0,Answer:[{type:1,data:'127.0.0.1'}]});
r=await resolve(request('https://evil.example/a'));assert.equal(r.status,400);assert.match((await r.json()).error,/公网/);
console.log('PASS: VSB, PDF.js, relative URLs, HTML entities, direct PDF, Chaoxing, download, ArrayBuffer streams, no-PDF pages, unsafe URLs and private DNS.');
