import { chromium } from 'playwright-core';

const url = process.argv[2];
const output = process.argv[3];
if (!url || !output) throw new Error('Usage: node tests/capture.mjs URL OUTPUT');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.getElementById('homeTodayMoney')?.textContent.includes('DH'));
await page.screenshot({ path: output, fullPage: false });
await browser.close();
