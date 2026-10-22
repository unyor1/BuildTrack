import fs from 'node:fs';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
const d=await getDocument({data:new Uint8Array(fs.readFileSync('D:/CAPSTONE/REFERENCES/IAS2_Module-ISO-25010.pdf'))}).promise;
for(let i=1;i<=d.numPages;i++){
 const p=await d.getPage(i);const s=(await p.getTextContent()).items.map(x=>x.str).join(' ');
 if(/questionnaire|2011|2023|Functional Suitability|Strongly|Likert|evaluation/i.test(s))console.log(JSON.stringify({page:i,text:s.slice(0,4300)}));
}
