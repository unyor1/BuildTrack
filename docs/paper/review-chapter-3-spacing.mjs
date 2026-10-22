import fs from 'node:fs';
import {createRequire} from 'node:module';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
const require=createRequire(import.meta.resolve('pdfjs-dist/package.json'));
const {createCanvas}=require('@napi-rs/canvas');
const file=process.argv[2]||'docs/paper/chapter-3-spacing-review.pdf';
const d=await getDocument({data:new Uint8Array(fs.readFileSync(file))}).promise;
let active=false;const summaries=[];
for(let i=1;i<=d.numPages;i++){
 const p=await d.getPage(i);const tc=await p.getTextContent();const s=tc.items.map(x=>x.str).join(' ').replace(/\s+/g,' ');
 if(/CHAPTER 3\s+METHOD OF RESEARCH/.test(s)&&!active)active=true;
 if(!active)continue;
 const body=tc.items.filter(x=>x.str?.trim()&&x.transform[5]<650&&x.transform[5]>60);
 const minY=body.length?Math.min(...body.map(x=>x.transform[5])):0;
 summaries.push({page:i,chars:s.length,bottomGap:Math.round(minY-60),first:s.slice(0,90),last:s.slice(-60)});
 const v=p.getViewport({scale:0.8});const c=createCanvas(Math.ceil(v.width),Math.ceil(v.height));
 await p.render({canvasContext:c.getContext('2d'),viewport:v}).promise;
 fs.writeFileSync(`docs/paper/ch3-spacing-page-${i}.png`,c.toBuffer('image/png'));
 if(s.includes('sample outcomes shown in the instructor'))break;
}
fs.writeFileSync('docs/paper/chapter-3-page-layout.json',JSON.stringify(summaries,null,2));
console.log(JSON.stringify({pages:summaries.length,range:[summaries[0]?.page,summaries.at(-1)?.page],largeTextGaps:summaries.filter(p=>p.bottomGap>130)}));
