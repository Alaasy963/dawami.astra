import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1365,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('http://dawami.test/**',async route=>{
 const url=new URL(route.request().url());
 if(url.pathname.startsWith('/api/'))return route.fulfill({status:url.pathname.endsWith('/me')?401:200,json:url.pathname.endsWith('/me')?{error:'Login required'}:{trialDays:14}});
 const relative=url.pathname==='/'?'index.html':url.pathname.slice(1);
 const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff'};
 try{await route.fulfill({body:await readFile(path.join('dist',relative)),contentType:types[path.extname(relative)]||'application/octet-stream'});}catch{await route.fulfill({status:404,body:''});}
});
await page.goto('http://dawami.test/');await page.getByRole('button',{name:'دخول',exact:true}).waitFor();
await page.screenshot({path:'../dawami-login-desktop.png',fullPage:true});
await page.setViewportSize({width:360,height:800});await page.screenshot({path:'../dawami-login-mobile.png',fullPage:true});
const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
console.log(JSON.stringify({pageErrors:errors,horizontalOverflowAt360:overflow}));
await browser.close();
if(errors.length||overflow)process.exitCode=1;
