const fs=require('fs'),path=require('path'),http=require('http'),crypto=require('crypto');
const {parseArgs}=require('node:util');
const {values}=parseArgs({options:{manifest:{type:'string'},'fixtures-dir':{type:'string'},output:{type:'string'},ocr:{type:'boolean',default:false}}});
if(!values.manifest){console.error('Usage: node scripts/draft-scan-benchmark.cjs --manifest labels.json --fixtures-dir image-folder --output result.json [--ocr]');process.exit(2);}
const {chromium}=require(require.resolve('playwright',{paths:[process.cwd(),path.join(path.dirname(process.execPath),'../node_modules')]}));
const manifest=JSON.parse(fs.readFileSync(values.manifest,'utf8'));
if(!Array.isArray(manifest.cases))throw new Error('Manifest must contain cases');
const groups=new Map(),sourceSplits=new Map(),cases=manifest.cases;
for(const row of cases){
 if(!['calibration','holdout'].includes(row.split)||!row.matchId||!Array.isArray(row.expected))throw new Error('Each case needs split, matchId and expected slots');
 if(groups.has(row.matchId)&&groups.get(row.matchId)!==row.split)throw new Error('Same match cannot belong to calibration and holdout');
 groups.set(row.matchId,row.split);
}
const base=path.resolve('dist/pages'),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png'};
const server=http.createServer((req,res)=>{
 let pathname=new URL(req.url,'http://localhost').pathname.replace(/^\/ho-tro-ban-pick/,'');
 let file=path.resolve(base,'.'+pathname);
 if(!file.startsWith(base+path.sep)){res.writeHead(403).end();return;}
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',mime[path.extname(file)]??'application/octet-stream');fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(resolve=>server.listen(0,resolve));
 const browser=await chromium.launch({channel:'chrome'});
 const report={createdAt:new Date().toISOString(),ocr:values.ocr,gemini:false,cases:[]};
 try{
 const page=await browser.newPage();
 await page.addInitScript(()=>document.addEventListener('draft-scan',event=>{window.scanResult=event.detail;}));
 await page.route('**/gemini',route=>route.abort());
 if(!values.ocr)await page.route('**/draft-ocr.js*',route=>route.fulfill({contentType:'text/javascript',body:'window.DRAFT_OCR={hasLabel:()=>false,read:async()=>[],nameplate:()=>""};'}));
 await page.goto('http://localhost:'+server.address().port+'/ho-tro-ban-pick/draft/?mode=rank');
 await page.locator('.airplay-panel > summary').click();
 const sourceHashes=new Set(await page.evaluate(()=>window.DRAFT_SCAN_LIBRARY.trainingSources()));
 for(const fixture of cases){
 const file=path.resolve(values['fixtures-dir']??path.dirname(values.manifest),fixture.file);
 const hash=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 if(sourceSplits.has(hash)&&sourceSplits.get(hash)!==fixture.split)throw new Error('Same image cannot be in both splits');
 sourceSplits.set(hash,fixture.split);
 if(fixture.split==='holdout'&&sourceHashes.has(hash))throw new Error('Known reference image cannot be a holdout: '+fixture.file);
 await page.locator('#scan-file').setInputFiles(file);
 await page.waitForFunction(()=>document.querySelector('#scan-results').textContent.includes('Quét'),null,{timeout:5000}).catch(()=>{});
 await page.waitForTimeout(values.ocr?15000:1200);
 const actual=await page.evaluate(()=>window.scanResult??[]);
 const key=row=>[row.side,row.kind,row.index].join('|');
 const missing=[],wrong=[],correct=[],unexpected=[];
 for(const expected of fixture.expected){
 const found=actual.find(row=>key(row)===key(expected));
 if(!found)missing.push(expected);
 else if(found.id!==expected.id||found.confirmed!==expected.confirmed)wrong.push({expected,actual:found});
 else correct.push(expected);
 }
 for(const row of actual)if(!fixture.expected.some(expected=>key(row)===key(expected)))unexpected.push(row);
 const result={file:fixture.file,matchId:fixture.matchId,split:fixture.split,sourceHash:hash,total:fixture.expected.length,correct:correct.length,missing,wrong,unexpected};
 report.cases.push(result);console.log(fixture.file,fixture.split,JSON.stringify({correct:correct.length,total:fixture.expected.length,wrong:wrong.length,missing:missing.length,unexpected:unexpected.length}));
 }
 for(const split of ['calibration','holdout']){
 const rows=report.cases.filter(row=>row.split===split);
 report[split]={images:rows.length,total:rows.reduce((n,row)=>n+row.total,0),correct:rows.reduce((n,row)=>n+row.correct,0),wrong:rows.reduce((n,row)=>n+row.wrong.length,0),missing:rows.reduce((n,row)=>n+row.missing.length,0),unexpected:rows.reduce((n,row)=>n+row.unexpected.length,0)};
 }
 if(values.output)fs.writeFileSync(values.output,JSON.stringify(report,null,2));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
