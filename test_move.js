const { chromium } = require('playwright');
const http = require('http');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Need to start backend and frontend first
  // We will assume they are running, or we can just run the test

  await browser.close();
})();
