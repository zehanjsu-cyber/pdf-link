import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
import {resolve,download} from './edge-functions/api/resolve.js';

const index=await readFile(new URL('./index.html',import.meta.url));
const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
export const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/healthz'){return send(res,200,{status:'ok'});}
  if((req.method==='GET'||req.method==='HEAD')&&(url.pathname==='/'||url.pathname==='/index.html')){
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Length':index.length,'X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:index);return;
  }
  let response;
  if(url.pathname==='/api/resolve'&&req.method==='POST'){
   const chunks=[];let size=0;
   for await(const chunk of req){size+=chunk.length;if(size>12000){send(res,413,{error:'链接过长'});req.resume();return;}chunks.push(chunk);}
   const request=new Request('http://localhost/api/resolve',{method:'POST',headers:{'content-type':'application/json'},body:Buffer.concat(chunks)});
   response=await resolve(request);
  }else if(url.pathname==='/api/download'&&req.method==='GET'){
   response=await download(new Request(url));
  }else{return send(res,404,{error:'页面不存在'});}
  res.writeHead(response.status,Object.fromEntries(response.headers));
  if(response.body)await pipeline(Readable.fromWeb(response.body),res);else res.end();
 }catch(error){
  if(!res.headersSent)send(res,502,{error:'请求失败，请稍后重试'});else res.destroy();
 }
});
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const port=Number(process.env.PORT||8000);server.listen(port,'0.0.0.0',()=>console.log(`PDF resolver listening on port ${port}`));
}
