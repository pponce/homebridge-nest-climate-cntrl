import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright/package.json' : import.meta.url);
const { chromium } = require('playwright');
const markup = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/homebridge-ui/dashboard/styles.css"><main style="padding:16px"><h2>Upstairs · Dining Room</h2><div id="tile"></div></main><script type="module">
import { renderScheduleControls } from '/homebridge-ui/public/schedule-controls.js';
window.requests=[]; window.device={serial:'TEST',data:{description:'Upstairs · Dining Room'},scheduleControls:{autoSchedule:false,modes:{heat:[{day:1,time:25200,heat:21}],cool:[]},expected:'test-revision',connected:true,learning:true,zone:'America/Los_Angeles',suggestions:[]}};
window.render=()=>document.querySelector('#tile').replaceChildren(renderScheduleControls(device,{unit:'F',live:true,send:async body=>{requests.push(body);return {message:'Waiting for Nest confirmation.'}},refresh:async()=>render()}));render();</script>`;
const server=createServer(async(req,res)=>{try{if(req.url==='/'){res.setHeader('content-type','text/html');res.end(markup);return;}const body=await readFile(new URL('../../'+req.url.slice(1),import.meta.url));res.setHeader('content-type',req.url.endsWith('.js')?'text/javascript':'text/css');res.end(body);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_PATH, args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.getByText('Temperature schedule · Nest Auto-Schedule off',{exact:true}).click();
 await page.getByRole('button',{name:'Turn Nest Auto-Schedule on',exact:true}).click();
 await page.getByRole('alertdialog').waitFor(); assert.equal(await page.evaluate(()=>requests.length),0);
 await page.getByRole('button',{name:'Confirm',exact:true}).click();
 await page.waitForFunction(()=>requests.length===1);assert.equal(await page.evaluate(()=>requests[0].confirmation),'enable-nest-learning');
 await page.getByRole('button',{name:'Edit schedule',exact:true}).click();
 await page.getByLabel('Heat (°F)',{exact:true}).fill('72');
 await page.evaluate(()=>render());assert.equal(await page.getByLabel('Heat (°F)',{exact:true}).inputValue(),'72.0');
 await page.getByRole('button',{name:'Save schedule to Nest',exact:true}).click();
 await page.getByRole('button',{name:'Confirm',exact:true}).click();
 await page.waitForFunction(()=>requests.length===2); const saved=await page.evaluate(()=>requests[1]);
 assert.ok(Math.abs(saved.entries[0].heat-22.2222222222)<1e-6);assert.equal(saved.expected,'test-revision');
 await page.getByRole('button',{name:'Clear temperature schedules',exact:true}).click();
 await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await page.evaluate(()=>requests.length),2);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
 await page.screenshot({path:'maintenance/checks/schedule-controls-mobile.png',fullPage:true});
 // Learning toggle must also work when no schedule modes are reported.
 await page.evaluate(()=>{device.scheduleControls.modes={};render()});
 await page.getByRole('button',{name:'Turn Nest Auto-Schedule on',exact:true}).click();await page.getByRole('alertdialog').waitFor();
 assert.deepEqual(errors,[]);console.log('PASS: mobile toggle warning, confirmed writes, Fahrenheit editor, draft preservation, clear cancellation, unsupported mode controls, no horizontal overflow.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
