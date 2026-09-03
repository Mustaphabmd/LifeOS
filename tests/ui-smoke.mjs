import { chromium } from 'playwright-core';

const baseURL = process.env.LIFEOS_TEST_URL || 'http://127.0.0.1:4173/LifeOS.html?visual-test=1';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('dialog', dialog => dialog.accept());

await page.goto(baseURL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.getElementById('homeTodayMoney')?.textContent.includes('DH'));
const viewportFits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
if (!viewportFits) throw new Error('Mobile layout overflows the viewport');
await page.screenshot({ path: '/tmp/lifeos-after.png', fullPage: false });

await page.evaluate(() => { openExpense('Other'); applyTemplate(db.templates[0]); });
if (await page.locator('#expenseAmount').inputValue() !== '6') throw new Error('Frequent expense preset failed');
await page.evaluate(() => closeSheets());

await page.evaluate(() => openExpense('Food'));
await page.locator('#expenseAmount').fill('12');
await page.locator('#expenseSub').fill('Smoke test meal');
await page.evaluate(() => saveExpense());
await page.evaluate(() => showScreen('money'));
if (!(await page.locator('#moneyRecent').textContent()).includes('Smoke test meal')) throw new Error('Expense create/render failed');

await page.evaluate(() => openIncomeSheet());
await page.locator('#incomeAmount').fill('100');
await page.evaluate(() => saveIncome());
if (!(await page.locator('#walletTransactions').textContent()).includes('My Job')) throw new Error('Income create/render failed');

await page.evaluate(() => openTime('Sleep'));
await page.locator('#timeFrom').fill('23:30');
await page.locator('#timeTo').fill('07:30');
await page.evaluate(() => saveTime());
if (!(await page.locator('#latestSleepDuration').textContent()).includes('8h 00m')) throw new Error('Cross-midnight sleep calculation failed');

await page.evaluate(() => openMotoKmEditor());
await page.locator('#motoCurrentKmInput').fill('25000');
await page.evaluate(() => saveMotoKm());
await page.evaluate(() => openMotoExpense('Oil'));
await page.locator('#motoExpenseAmount').fill('80');
await page.evaluate(() => saveMotoExpense());
if ((await page.locator('#oilHealthPercent').textContent()).trim() !== '100%') throw new Error('Oil health calculation failed');

await page.evaluate(() => openCardSheet());
await page.locator('#cardBank').fill('Smoke Bank');
await page.locator('#cardBalance').fill('500');
await page.evaluate(() => saveCard());
if (!(await page.locator('#walletCards').textContent()).includes('Smoke Bank')) throw new Error('Account create/render failed');

await page.evaluate(() => openGoalSheet());
await page.locator('#goalName').fill('Smoke Goal');
await page.locator('#goalTarget').fill('1000');
await page.locator('#goalSaved').fill('100');
await page.evaluate(() => saveGoal());
if (!(await page.locator('#walletGoals').textContent()).includes('Smoke Goal')) throw new Error('Savings goal create/render failed');

await page.evaluate(() => addCategory());
await page.locator('#cfgName').fill('Smoke Category');
await page.locator('#cfgIcon').fill('check');
await page.evaluate(() => saveConfigEditor());
await page.evaluate(() => openManager());
if (!(await page.locator('#managerCategories').textContent()).includes('Smoke Category')) throw new Error('Category create/render failed');

await page.evaluate(() => { showScreen('profile'); document.getElementById('profileStatusInput').value='Smoke status'; saveProfileStatus(); });
if ((await page.locator('#profileStatusDisplay').textContent()).trim() !== 'Smoke status') throw new Error('Settings/profile persistence failed');

await page.evaluate(() => {
  const expense=db.expenses.find(item=>item.details==='Smoke test meal');
  if(expense)removeExpense(expense.id);
  const sleep=db.times.find(item=>item.type==='Sleep');
  if(sleep)removeTime(sleep.id);
});
if ((await page.locator('#moneyRecent').textContent()).includes('Smoke test meal')) throw new Error('Expense delete failed');

const state = await page.evaluate(() => ({
  expenses: db.expenses.length,
  incomes: db.incomes.length,
  times: db.times.length,
  accounts: db.wallet.cards.length,
  categories: db.categories.length,
  motoRecords: db.motoEntries.length
}));

const authPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
const authErrors=[];
authPage.on('pageerror',error=>authErrors.push(error.message));
authPage.on('console',message=>{if(message.type()==='error')authErrors.push(message.text())});
await authPage.goto(baseURL.replace('/LifeOS.html?visual-test=1','/LifeOS.html'),{waitUntil:'networkidle'});
if(!authPage.url().includes('/auth.html?setup=1'))throw new Error('Unconfigured/unauthenticated redirect failed');
if(!(await authPage.locator('#message').textContent()).includes('not configured'))throw new Error('Configuration guidance failed');
if (errors.length || authErrors.length) throw new Error(`Browser errors: ${[...errors,...authErrors].join(' | ')}`);
console.log(JSON.stringify({ ok: true, state }));
await browser.close();
