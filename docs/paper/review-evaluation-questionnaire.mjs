import fs from 'node:fs';
import {createRequire} from 'node:module';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
const require=createRequire(import.meta.resolve('pdfjs-dist/package.json'));
const {createCanvas}=require('@napi-rs/canvas');
const d=await getDocument({data:new Uint8Array(fs.readFileSync('docs/paper/evaluation-questionnaire-review.pdf'))}).promise;
let active=false;
for(let i=1;i<=d.numPages;i++){
 const p=await d.getPage(i);const s=(await p.getTextContent()).items.map(x=>x.str).join(' ').replace(/\s+/g,' ');
 if(s.includes('APPENDIX A')&&s.includes('BuildTrack Software Quality'))active=true;
 if(!active)continue;
 console.log(JSON.stringify({page:i,text:s.slice(0,170),last:s.slice(-90)}));
 const v=p.getViewport({scale:1.2});const c=createCanvas(Math.ceil(v.width),Math.ceil(v.height));
 await p.render({canvasContext:c.getContext('2d'),viewport:v}).promise;
 fs.writeFileSync(`docs/paper/questionnaire-page-${i}.png`,c.toBuffer('image/png'));
}
