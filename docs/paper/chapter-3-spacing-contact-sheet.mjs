import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.resolve('pdfjs-dist/package.json'));
const {createCanvas,loadImage}=require('@napi-rs/canvas');
const pages=JSON.parse(fs.readFileSync('docs/paper/chapter-3-page-layout.json','utf8'));
for(let offset=0;offset<pages.length;offset+=20){
 const c=createCanvas(1000,1700),g=c.getContext('2d');g.fillStyle='#ddd';g.fillRect(0,0,1000,1700);
 for(let i=0;i<Math.min(20,pages.length-offset);i++){
  const n=pages[offset+i].page,im=await loadImage(`docs/paper/ch3-spacing-page-${n}.png`),x=i%4*250,y=Math.floor(i/4)*340;
  g.drawImage(im,x,y+20,245,317);g.fillStyle='black';g.font='14px Arial';g.fillText(`Page ${n}`,x+5,y+15);
 }
 fs.writeFileSync(`docs/paper/chapter-3-spacing-contact-${offset/20+1}.png`,c.toBuffer('image/png'));
}
