import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';
const dir = decodeURIComponent(new URL('.', import.meta.url).pathname);
const roster = JSON.parse(await fs.readFile(dir+'roster.json','utf8'));
const w=Workbook.create(), s=w.worksheets.add('Team Selection');
s.showGridLines=false; s.tabColor='#254C34';
const put=(a,v)=>s.getRange(a).values=[[v]];
const formula=(a,v)=>s.getRange(a).formulas=[[v]];
s.getRange('A1:G44').format.font={name:'Arial',size:11,color:'#243228'};
s.getRange('A1:G44').format.rowHeight=23;
s.getRange('A1:G44').format.verticalAlignment='center';
for(const [col,width] of Object.entries({A:7,B:27,C:13,D:28,E:13,F:15,G:25})) s.getRange(col+'1:'+col+'44').format.columnWidth=width;
put('A2','Shooktoberfest • Team selection'); s.getRange('A2:G2').format.font={size:16,bold:true};
put('A3','October 2, 2026  |  Yellow cells are editable. Choose partners in the table below.');
put('A5','B flight • Draw numbers'); s.getRange('A5:D5').format.font.bold=true;
s.getRange('A6:D6').values=[['Draw #','B-flight player','Course HCP','Assignment']];
const b=roster.slice(15); s.getRange('A7:C22').values=b.map((p,i)=>[i+1,...p]);
for(let r=7;r<=22;r++) formula('D'+r,`=IF(B${r}="","",IF(COUNTIF($D$27:$D$42,B${r})=0,"Available",IF(COUNTIF($D$27:$D$42,B${r})=1,"Assigned","Selected twice")))`);
put('E6','How to use'); put('E8','1. Draw a B-player number.'); put('E9','2. Find that player above.'); put('E10','3. Select their name below.');
put('E12','31 players: 15 A + 16 B.'); put('E13','One extra A slot is blank.');
put('E15','Team HCP = 35% low + 15% high.'); put('E16','Rounded to a whole stroke.');
put('E18','Use course handicaps.'); put('E19','Enter plus handicaps as negatives.');
put('E21','Roster snapshot: Sept. 11, 2026.');
put('A24','Choose your teams'); s.getRange('A24:G24').format.font.bold=true;
put('A25','A players are prefilled. Choose a B player from each yellow dropdown; red highlights repeat selections.');
s.getRange('A26:G26').values=[['Team','A-flight player','A HCP','B-flight player ▼','B HCP','Scramble HCP','Selection check']];
for(let i=0;i<16;i++){
 const r=27+i; put('A'+r,i+1); if(i<15)s.getRange(`B${r}:C${r}`).values=[roster[i]];
 formula('E'+r,`=IF(D${r}="","",IFERROR(IF(COUNT(INDEX($C$7:$C$22,MATCH(D${r},$B$7:$B$22,0)))=0,"",INDEX($C$7:$C$22,MATCH(D${r},$B$7:$B$22,0))),""))`);
 formula('F'+r,`=IF(OR(B${r}="",D${r}="",COUNT(C${r},E${r})<2),"",ROUND(MIN(C${r},E${r})*35%+MAX(C${r},E${r})*15%,0))`);
 formula('G'+r,`=IF(D${r}="","",IF(COUNTIF($D$27:$D$42,D${r})>1,"Duplicate B player",IF(B${r}="","Enter A player",IF(COUNT(C${r},E${r})<2,"Missing handicap",""))))`);
}
s.getRange('D27:D42').dataValidation={rule:{type:'list',formula1:'$B$7:$B$22'}};
for(const range of ['B7:C22','B27:D42'])s.getRange(range).format.fill='#FFF2CC';
for(const range of ['A6:D6','A26:G26']){s.getRange(range).format.fill='#254C34';s.getRange(range).format.font={color:'#FFFFFF',bold:true};s.getRange(range).format.horizontalAlignment='center';s.getRange(range).format.rowHeight=32;}
for(const range of ['C7:C22','C27:C42','E27:F42']) {s.getRange(range).setNumberFormat('0');s.getRange(range).format.horizontalAlignment='right';}
s.getRange('F27:F42').setNumberFormat('0');s.getRange('F27:F42').format.fill='#E8EFE6';s.getRange('F27:F42').format.font.bold=true;
s.getRange('D27:D42').conditionalFormats.addCustom('AND(D27<>"",COUNTIF($D$27:$D$42,D27)>1)',{fill:'#FADBD8',font:{color:'#9C211C',bold:true}});
s.getRange('G27:G42').conditionalFormats.addCustom('G27<>""',{fill:'#FADBD8',font:{color:'#9C211C'}});
s.getRange('B7:B22').conditionalFormats.addCustom('AND(B7<>"",COUNTIF($B$7:$B$22,B7)>1)',{fill:'#FADBD8'});
put('A44','Source: Shooktoberfest website roster and lib/admin.ts flight split; current course handicaps.');
w.notes.add({id:'source',target:{cell:{sheetName:s.name,sheetId:s.sheetId,address:'C7'}},authorId:'',createdAt:'',body:{plainText:'Roster: Supabase project moqvxilwgjcvrhnmtewr, event 44790ca5-34a1-423d-8df7-089e1c458151, paid/comped players. Flight split follows website lib/admin.ts. Handicap allowance: https://www.usga.org/content/usga/home-page/handicapping/roh/Content/rules/Committee%20Content/USGA/LG_R7h5.htm'}});
// Exercise dropdown lookup, changing inputs, blank/zero, and duplicate checks before restoring.
put('D27',b[0][0]);w.recalculate();assert.equal(s.getRange('E27').values[0][0],20);assert.equal(s.getRange('F27').values[0][0],5);
put('D27',b[15][0]);w.recalculate();assert.equal(s.getRange('E27').values[0][0],37);assert.equal(s.getRange('F27').values[0][0],7);
put('D28',b[15][0]);w.recalculate();assert.equal(s.getRange('G27').values[0][0],'Duplicate B player');
put('C27',0);w.recalculate();assert.equal(s.getRange('F27').values[0][0],6);
put('C27',null);w.recalculate();assert.equal(s.getRange('F27').values[0][0],'');
put('C27',roster[0][1]);s.getRange('D27:D42').clear({applyTo:'contents'});w.recalculate();
console.log((await w.inspect({kind:'table',range:'Team Selection!A26:G29',include:'values,formulas',tableMaxRows:4,tableMaxCols:7,maxChars:2200})).ndjson);
console.log((await w.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!',options:{useRegex:true,maxResults:30},summary:'Formula error scan'})).ndjson);
const preview=await w.render({sheetName:s.name,range:'A1:G44',scale:1.5});await fs.writeFile(dir+'preview.png',new Uint8Array(await preview.arrayBuffer()));
const out=await SpreadsheetFile.exportXlsx(w);await out.save(dir+'Shooktoberfest Team Selection.xlsx');console.log('Saved and calculation checks passed');
