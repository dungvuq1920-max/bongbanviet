import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--no-sandbox']
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto('file:///c:/Users/dungvuq1920/Desktop/WORK/index.html', { waitUntil: 'networkidle0' });
await page.screenshot({ path: 'c:/Users/dungvuq1920/Desktop/WORK/ss_full.png', fullPage: true });
await browser.close();
console.log('done');
