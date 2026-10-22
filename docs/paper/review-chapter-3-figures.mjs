import fs from 'node:fs';
import {createRequire} from 'node:module';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
const require=createRequire(import.meta.resolve('pdfjs-dist/package.json'));
const {createCanvas}=require('@napi-rs/canvas');
const d=await getDocument({data:new Uint8Array(fs.readFileSync('docs/paper/chapter-3-figures-review.pdf'))}).promise;
let chapter3=false;
for(let i=1;i<=d.numPages;i++){
 const p=await d.getPage(i); const text=(await p.getTextContent()).items.map(x=>x.str).join(' ').replace(/\s+/g,' ');
 if(text.includes('RESEARCH METHODOLOGY')||text.includes('Project Planning'))chapter3=true;
 if(chapter3 && /Figure [123478] (Work Breakdown Structure|Gantt Chart|Flowchart of the Pin|Context Diagram|Physical Layout|Logical Layout)/.test(text)){
  const v=p.getViewport({scale:1.2});const c=createCanvas(Math.ceil(v.width),Math.ceil(v.height));
  await p.render({canvasContext:c.getContext('2d'),viewport:v}).promise;
  fs.writeFileSync(`docs/paper/chapter-3-figures/page-${i}.png`,c.toBuffer('image/png'));
  console.log(JSON.stringify({page:i,text:text.slice(0,180),images:(await p.getOperatorList()).fnArray.filter(x=>[85,86].includes(x)).length}));
 }
}
