import { chromium } from 'playwright';

const BASE = 'http://localhost:8787/vibe-planner/index.html';
const EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const PASS = process.env.TEST_PASSWORD || '';
let passed = 0, failed = 0;

async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n    → ${e.message.split('\n')[0]}`); }
}

async function login(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.auth-box', { timeout: 10000 });
  const inputs = await page.$$('.auth-input');
  await inputs[0].fill(EMAIL);
  await inputs[1].fill(PASS);
  await page.click('.auth-btn.primary');
  await page.waitForSelector('.header', { timeout: 15000 });
  await page.waitForTimeout(2000);
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  console.log('\n═══ SMOKE TEST ═══');

  await test('Login works', async () => {
    const page = await browser.newPage();
    await login(page);
    await page.close();
  });

  await test('Board has 4 columns (no Future/Deferred)', async () => {
    const page = await browser.newPage();
    await login(page);
    const columns = await page.$$('.column');
    if (columns.length !== 4) throw new Error('Expected 4 columns, got ' + columns.length);
    const headers = await page.$$eval('.col-header', els => els.map(e => e.textContent));
    if (headers.some(h => h.includes('Future'))) throw new Error('Future column still present');
    await page.close();
  });

  await test('Duplicate prevention', async () => {
    const page = await browser.newPage();
    await login(page);
    const vibe = 'DUP_TEST_' + Date.now();
    await page.fill('.input-main', vibe);
    await page.click('.btn-add');
    await page.waitForTimeout(3000);
    // Try adding same vibe again
    await page.fill('.input-main', vibe);
    await page.click('.btn-add');
    await page.waitForTimeout(1000);
    const cards = await page.$$('.card');
    let count = 0;
    for (const c of cards) { if ((await c.textContent()).includes(vibe)) count++; }
    if (count > 1) throw new Error('Duplicate vibe was added! count=' + count);
    // Cleanup
    const card = cards.find(async c => (await c.textContent()).includes(vibe));
    if (card) {
      const mb = await card.$('.menu-btn');
      await mb.click();
      await page.waitForTimeout(300);
      for (const mi of await page.$$('.menu-item')) {
        if ((await mi.textContent()).includes('Delete')) { await mi.click(); break; }
      }
      await page.waitForTimeout(2000);
    }
    await page.close();
  });

  await test('Notes: Add via menu and save', async () => {
    const page = await browser.newPage();
    await login(page);
    const vibe = 'NOTES_TEST_' + Date.now();
    await page.fill('.input-main', vibe);
    await page.click('.btn-add');
    await page.waitForTimeout(3000);
    // Open menu and click Add Notes
    const cards = await page.$$('.card');
    let targetCard = null;
    for (const c of cards) { if ((await c.textContent()).includes(vibe)) { targetCard = c; break; } }
    if (!targetCard) throw new Error('Card not found');
    const mb = await targetCard.$('.menu-btn');
    await mb.click();
    await page.waitForTimeout(500);
    for (const mi of await page.$$('.menu-item')) {
      if ((await mi.textContent()).includes('Notes')) { await mi.click(); break; }
    }
    await page.waitForTimeout(500);
    // Find textarea and type
    const ta = await page.$('textarea');
    if (!ta) throw new Error('Notes textarea not found');
    await ta.fill('https://example.com - test note');
    // Blur to save
    await page.click('.logo');
    await page.waitForTimeout(3000);
    // Verify notes tag shows
    const content = await page.textContent('#app');
    if (!content.includes('Notes')) throw new Error('Notes tag not visible after saving');
    // Cleanup
    const cards2 = await page.$$('.card');
    for (const c of cards2) {
      if ((await c.textContent()).includes(vibe)) {
        const mb2 = await c.$('.menu-btn');
        await mb2.click();
        await page.waitForTimeout(300);
        for (const mi of await page.$$('.menu-item')) {
          if ((await mi.textContent()).includes('Delete')) { await mi.click(); break; }
        }
        break;
      }
    }
    await page.waitForTimeout(2000);
    await page.close();
  });

  await test('Edit text inline works', async () => {
    const page = await browser.newPage();
    await login(page);
    const vibe = 'EDIT_SMOKE_' + Date.now();
    await page.fill('.input-main', vibe);
    await page.click('.btn-add');
    await page.waitForTimeout(3000);
    // Click on card text — need to find it fresh from page
    const cardText = await page.$('.card-text:last-child') || await page.locator('.card-text').filter({ hasText: vibe }).first();
    // Use page-level query to find the right card-text
    const allTexts = await page.$$('.card-text');
    for (const ct of allTexts) {
      if ((await ct.textContent()).includes(vibe)) {
        await ct.click();
        break;
      }
    }
    await page.waitForTimeout(500);
    const editInput = await page.$('.card-edit');
    if (!editInput) throw new Error('Edit input not shown');
    const newText = vibe + '_EDITED';
    await editInput.fill(newText);
    await editInput.press('Enter');
    await page.waitForTimeout(2000);
    const content = await page.textContent('#app');
    if (!content.includes(newText)) throw new Error('Edited text not found');
    // Cleanup
    const cards = await page.$$('.card');
    for (const c of cards) {
      if ((await c.textContent()).includes(newText)) {
        const mb = await c.$('.menu-btn');
        await mb.click();
        await page.waitForTimeout(300);
        for (const mi of await page.$$('.menu-item')) {
          if ((await mi.textContent()).includes('Delete')) { await mi.click(); break; }
        }
        break;
      }
    }
    await page.waitForTimeout(2000);
    await page.close();
  });

  await test('Edit notes via tag click', async () => {
    const page = await browser.newPage();
    await login(page);
    const vibe = 'EDITNOTES_' + Date.now();
    await page.fill('.input-main', vibe);
    await page.click('.btn-add');
    await page.waitForTimeout(3000);
    // Add notes first via menu
    const cards = await page.$$('.card');
    for (const c of cards) {
      if ((await c.textContent()).includes(vibe)) {
        const mb = await c.$('.menu-btn');
        await mb.click();
        await page.waitForTimeout(300);
        for (const mi of await page.$$('.menu-item')) {
          if ((await mi.textContent()).includes('Notes')) { await mi.click(); break; }
        }
        break;
      }
    }
    await page.waitForTimeout(500);
    const ta = await page.$('textarea');
    if (!ta) throw new Error('Textarea not found for initial note');
    await ta.fill('Initial note');
    await page.click('.logo'); // blur to save
    await page.waitForTimeout(3000);
    // Now click the Notes tag to re-open
    const notesTag = await page.$('.notes-tag');
    if (!notesTag) throw new Error('Notes tag not found to click');
    await notesTag.click();
    await page.waitForTimeout(500);
    const ta2 = await page.$('textarea');
    if (!ta2) throw new Error('Textarea not reopened on tag click');
    const val = await ta2.inputValue();
    if (!val.includes('Initial note')) throw new Error('Notes content lost: ' + val);
    // Edit the note
    await ta2.fill('Updated note with URL: https://example.com');
    await page.click('.logo');
    await page.waitForTimeout(3000);
    // Cleanup
    const cards2 = await page.$$('.card');
    for (const c of cards2) {
      if ((await c.textContent()).includes(vibe)) {
        const mb = await c.$('.menu-btn');
        await mb.click();
        await page.waitForTimeout(300);
        for (const mi of await page.$$('.menu-item')) {
          if ((await mi.textContent()).includes('Delete')) { await mi.click(); break; }
        }
        break;
      }
    }
    await page.waitForTimeout(2000);
    await page.close();
  });

  await browser.close();
  console.log(`\n  RESULTS: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
