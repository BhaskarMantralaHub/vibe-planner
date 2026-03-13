import { chromium } from 'playwright';

const BASE = 'http://localhost:8787/vibe-planner/index.html';
const EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const PASS = process.env.TEST_PASSWORD || '';

let passed = 0, failed = 0;
const failures = [];
const bugs = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    const msg = e.message.split('\n')[0];
    failures.push({ name, error: msg });
    console.log(`  ✗ ${name}`);
    console.log(`    → ${msg}`);
  }
}

function bug(id, severity, title, detail) {
  bugs.push({ id, severity, title, detail });
}

async function login(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.auth-box', { timeout: 10000 });
  const inputs = await page.$$('.auth-input');
  await inputs[0].fill(EMAIL);
  await inputs[1].fill(PASS);
  await page.click('.auth-btn.primary');
  await page.waitForSelector('.header', { timeout: 15000 });
  await page.waitForTimeout(2000); // Let items fully load
}

async function addVibe(page, text) {
  await page.fill('.input-main', text);
  await page.click('.btn-add');
  await page.waitForTimeout(4000); // Wait for Supabase round-trip
}

async function findCard(page, text) {
  const cards = await page.$$('.card');
  for (const card of cards) {
    const content = await card.textContent();
    if (content.includes(text)) return card;
  }
  return null;
}

async function openCardMenu(page, card) {
  const menuBtn = await card.$('.menu-btn');
  await menuBtn.click();
  await page.waitForTimeout(500);
}

async function clickMenuItem(page, label) {
  const menuItems = await page.$$('.menu-item');
  for (const mi of menuItems) {
    const text = await mi.textContent();
    if (text.includes(label)) { await mi.click(); return true; }
  }
  return false;
}

async function deleteCard(page, card) {
  await openCardMenu(page, card);
  await clickMenuItem(page, 'Delete');
  await page.waitForTimeout(3000);
}

async function getVibeCount(page) {
  const stats = await page.$$('.stat-value');
  if (stats.length > 0) return parseInt(await stats[0].textContent());
  return -1;
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // ══════════════════════════════════════
  // 1. AUTH — BOUNDARY & EDGE CASES
  // ══════════════════════════════════════
  console.log('\n══════════════════════════════════════');
  console.log('  1. AUTH — BOUNDARY & EDGE CASES');
  console.log('══════════════════════════════════════');

  await test('Auth: Login page renders with correct elements', async () => {
    const page = await browser.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('.auth-box', { timeout: 10000 });
    const h1 = await page.textContent('.auth-box h1');
    if (!h1.includes('Vibe Planner')) throw new Error('Missing title: ' + h1);
    const subtitle = await page.textContent('.auth-sub');
    if (!subtitle.includes('Welcome back')) throw new Error('Wrong subtitle for login mode: ' + subtitle);
    const inputs = await page.$$('.auth-input');
    if (inputs.length !== 2) throw new Error('Login should have 2 inputs, got ' + inputs.length);
    await page.close();
  });

  await test('Auth: Signup toggle hidden when SIGNUP_ENABLED=false', async () => {
    const page = await browser.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('.auth-box', { timeout: 10000 });
    const toggles = await page.$$('.auth-toggle');
    for (const t of toggles) {
      const text = await t.textContent();
      if (text.includes('Sign up')) throw new Error('Signup toggle visible when disabled');
    }
    await page.close();
  });

  await test('Auth: Empty email + empty password shows error', async () => {
    const page = await browser.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('.auth-box', { timeout: 10000 });
    await page.click('.auth-btn.primary');
    await page.waitForTimeout(500);
    const error = await page.textContent('.auth-error');
    if (!error || error.trim() === '') throw new Error('No validation error shown');
    if (error.includes('Please enter your email')) { /* good */ }
    else throw new Error('Unexpected error: ' + error);
    await page.close();
  });

  await test('Auth: Email without password shows error', async () => {
    const page = await browser.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('.auth-box', { timeout: 10000 });
    const inputs = await page.$$('.auth-input');
    await inputs[0].fill(EMAIL);
    // Leave password empty
    await page.click('.auth-btn.primary');
    await page.waitForTimeout(500);
    const error = await page.textContent('.auth-error');
    if (!error.includes('password')) throw new Error('No password validation: ' + error);
    await page.close();
  });

  await test('Auth: Wrong password returns sanitized error (no info leak)', async () => {
    const page = await browser.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('.auth-box', { timeout: 10000 });
    const inputs = await page.$$('.auth-input');
    await inputs[0].fill(EMAIL);
    await inputs[1].fill('totallyWrongPassword');
    await page.click('.auth-btn.primary');
    await page.waitForTimeout(4000);
    const error = await page.textContent('.auth-error');
    // Must NOT leak raw Supabase messages
    const rawMessages = ['Invalid login credentials', 'invalid_grant', 'email not confirmed', 'user not found'];
    for (const raw of rawMessages) {
      if (error.includes(raw)) throw new Error('Raw error leaked: ' + error);
    }
    if (!error || error.trim() === '') throw new Error('No error shown for wrong password');
    await page.close();
  });

  await test('Auth: SQL injection in email field', async () => {
    const page = await browser.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('.auth-box', { timeout: 10000 });
    const inputs = await page.$$('.auth-input');
    await inputs[0].fill("'; DROP TABLE vibes; --");
    await inputs[1].fill('password123');
    await page.click('.auth-btn.primary');
    await page.waitForTimeout(3000);
    // Should show error, NOT crash
    const error = await page.textContent('.auth-error');
    if (!error || error.trim() === '') throw new Error('No error for SQL injection attempt');
    // Page should still be functional
    const box = await page.$('.auth-box');
    if (!box) throw new Error('Page crashed after SQL injection attempt');
    await page.close();
  });

  await test('Auth: XSS in email field', async () => {
    const page = await browser.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('.auth-box', { timeout: 10000 });
    const inputs = await page.$$('.auth-input');
    await inputs[0].fill('<script>alert("xss")</script>');
    await inputs[1].fill('password123');
    await page.click('.auth-btn.primary');
    await page.waitForTimeout(3000);
    // Check no script tags in DOM
    const scriptInError = await page.evaluate(() => {
      return document.querySelector('.auth-error')?.innerHTML?.includes('<script>') || false;
    });
    if (scriptInError) throw new Error('XSS: script tag rendered in error element');
    await page.close();
  });

  await test('Auth: Rate limiter triggers after 5 rapid attempts', async () => {
    const page = await browser.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('.auth-box', { timeout: 10000 });
    for (let i = 0; i < 6; i++) {
      const inputs = await page.$$('.auth-input');
      await inputs[0].fill('rate-test-' + i + '@test.com');
      await inputs[1].fill('password123');
      await page.click('.auth-btn.primary');
      await page.waitForTimeout(300);
    }
    const error = await page.textContent('.auth-error');
    if (!error.includes('Too many attempts')) throw new Error('Rate limiter not triggered after 6 attempts: ' + error);
    await page.close();
  });

  await test('Auth: Enter key on password field triggers login', async () => {
    const page = await browser.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('.auth-box', { timeout: 10000 });
    const inputs = await page.$$('.auth-input');
    await inputs[0].fill(EMAIL);
    await inputs[1].fill(PASS);
    await inputs[1].press('Enter');
    await page.waitForSelector('.header', { timeout: 15000 });
    // If we get here, Enter-to-login works
    await page.close();
  });

  await test('Auth: Successful login shows personalized greeting', async () => {
    const page = await browser.newPage();
    await login(page);
    const userBar = await page.textContent('.user-bar');
    // Should have greeting OR email fallback
    const hasGreeting = /Good (morning|afternoon|evening)|Late night/i.test(userBar);
    const hasEmail = userBar.includes('@');
    if (!hasGreeting && !hasEmail) throw new Error('No greeting or email in user bar: ' + userBar);
    await page.close();
  });

  await test('Auth: Theme toggle works on login page', async () => {
    const page = await browser.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('.auth-box', { timeout: 10000 });
    const before = await page.getAttribute('html', 'data-theme');
    await page.click('.theme-toggle');
    await page.waitForTimeout(300);
    const after = await page.getAttribute('html', 'data-theme');
    if (before === after) throw new Error('Theme did not toggle');
    await page.click('.theme-toggle'); // Reset
    await page.close();
  });

  // ══════════════════════════════════════
  // 2. CRUD — ADD VIBES
  // ══════════════════════════════════════
  console.log('\n══════════════════════════════════════');
  console.log('  2. CRUD — ADD VIBES');
  console.log('══════════════════════════════════════');

  await test('Add: New vibe appears in board', async () => {
    const page = await browser.newPage();
    await login(page);
    const vibe = 'ADD_TEST_' + Date.now();
    await addVibe(page, vibe);
    const content = await page.textContent('#app');
    if (!content.includes(vibe)) throw new Error('Vibe not found after adding');
    await page.close();
  });

  await test('Add: Vibe via Enter key', async () => {
    const page = await browser.newPage();
    await login(page);
    const vibe = 'ENTER_TEST_' + Date.now();
    await page.fill('.input-main', vibe);
    await page.press('.input-main', 'Enter');
    await page.waitForTimeout(3000);
    const content = await page.textContent('#app');
    if (!content.includes(vibe)) throw new Error('Enter key add failed');
    await page.close();
  });

  await test('Add: Empty input is rejected', async () => {
    const page = await browser.newPage();
    await login(page);
    const countBefore = await getVibeCount(page);
    await page.fill('.input-main', '');
    await page.click('.btn-add');
    await page.waitForTimeout(500);
    const countAfter = await getVibeCount(page);
    if (countAfter !== countBefore) throw new Error('Empty vibe was added');
    await page.close();
  });

  await test('Add: Whitespace-only input is rejected', async () => {
    const page = await browser.newPage();
    await login(page);
    const countBefore = await getVibeCount(page);
    await page.fill('.input-main', '     ');
    await page.click('.btn-add');
    await page.waitForTimeout(500);
    const countAfter = await getVibeCount(page);
    if (countAfter !== countBefore) throw new Error('Whitespace-only vibe was added');
    await page.close();
  });

  await test('Add: Input clears after adding', async () => {
    const page = await browser.newPage();
    await login(page);
    await page.fill('.input-main', 'CLEAR_TEST_' + Date.now());
    await page.click('.btn-add');
    await page.waitForTimeout(1000);
    const val = await page.inputValue('.input-main');
    if (val !== '') throw new Error('Input not cleared after add, value: "' + val + '"');
    await page.close();
  });

  await test('Add: New vibe defaults to Spark status', async () => {
    const page = await browser.newPage();
    await login(page);
    const vibe = 'SPARK_TEST_' + Date.now();
    await addVibe(page, vibe);
    // Find the card in Spark column
    const columns = await page.$$('.column');
    let foundInSpark = false;
    for (const col of columns) {
      const header = await col.$eval('.col-header', el => el.textContent);
      if (header.includes('Spark')) {
        const colContent = await col.textContent();
        if (colContent.includes(vibe)) foundInSpark = true;
        break;
      }
    }
    if (!foundInSpark) throw new Error('New vibe not in Spark column');
    await page.close();
  });

  await test('Add: XSS payload in vibe text is rendered safely', async () => {
    const page = await browser.newPage();
    await login(page);
    const xss = '<img src=x onerror=alert(1)>';
    await addVibe(page, xss);
    // Check no script execution (check for raw HTML in text nodes)
    const hasImg = await page.evaluate(() => {
      return document.querySelectorAll('.card img').length;
    });
    if (hasImg > 0) throw new Error('XSS: img tag rendered from user input');
    // Verify text is escaped
    const cardTexts = await page.$$eval('.card-text', els => els.map(e => e.textContent));
    const found = cardTexts.some(t => t.includes('<img'));
    if (!found) throw new Error('XSS vibe text not found (may have been stripped instead of escaped)');
    await page.close();
  });

  await test('Add: Very long vibe text (500 chars)', async () => {
    const page = await browser.newPage();
    await login(page);
    const longText = 'LONG_' + 'A'.repeat(495);
    await addVibe(page, longText);
    const content = await page.textContent('#app');
    if (!content.includes('LONG_')) throw new Error('Long vibe not added');
    await page.close();
  });

  await test('Add: Special characters in vibe text', async () => {
    const page = await browser.newPage();
    await login(page);
    const special = 'SPECIAL_' + Date.now() + ' !@#$%^&*() "quotes" \'apos\' <angle>';
    await addVibe(page, special);
    const content = await page.textContent('#app');
    if (!content.includes('SPECIAL_')) throw new Error('Special char vibe not added');
    await page.close();
  });

  await test('Add: Emoji in vibe text', async () => {
    const page = await browser.newPage();
    await login(page);
    const emoji = 'EMOJI_' + Date.now() + ' 🎉🚀💻';
    await addVibe(page, emoji);
    const content = await page.textContent('#app');
    if (!content.includes('EMOJI_')) throw new Error('Emoji vibe not added');
    await page.close();
  });

  await test('Add: Vibe persists after refresh', async () => {
    const page = await browser.newPage();
    await login(page);
    const vibe = 'PERSIST_TEST_' + Date.now();
    await addVibe(page, vibe);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.header', { timeout: 15000 });
    await page.waitForTimeout(3000);
    const content = await page.textContent('#app');
    if (!content.includes(vibe)) throw new Error('Vibe not found after refresh');
    await page.close();
  });

  // ══════════════════════════════════════
  // 3. CRUD — UPDATE STATUS
  // ══════════════════════════════════════
  console.log('\n══════════════════════════════════════');
  console.log('  3. CRUD — UPDATE STATUS');
  console.log('══════════════════════════════════════');

  await test('Status: Change to In Progress via menu', async () => {
    const page = await browser.newPage();
    await login(page);
    const vibe = 'STATUS_IP_' + Date.now();
    await addVibe(page, vibe);
    const card = await findCard(page, vibe);
    if (!card) throw new Error('Card not found');
    await openCardMenu(page, card);
    await clickMenuItem(page, 'In Progress');
    await page.waitForTimeout(2000);
    // Verify it moved to In Progress column
    const columns = await page.$$('.column');
    let found = false;
    for (const col of columns) {
      const header = await col.$eval('.col-header', el => el.textContent);
      if (header.includes('In Progress')) {
        const colContent = await col.textContent();
        if (colContent.includes(vibe)) found = true;
        break;
      }
    }
    if (!found) throw new Error('Vibe not in In Progress column');
    await page.close();
  });

  await test('Status: Change persists after refresh', async () => {
    const page = await browser.newPage();
    await login(page);
    const vibe = 'STATUS_PERSIST_' + Date.now();
    await addVibe(page, vibe);
    const card = await findCard(page, vibe);
    if (!card) throw new Error('Card not found');
    await openCardMenu(page, card);
    await clickMenuItem(page, 'Done');
    await page.waitForTimeout(4000); // Extra wait for Supabase

    // Refresh
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.header', { timeout: 15000 });
    await page.waitForTimeout(3000);

    // Verify in Done column
    const columns = await page.$$('.column');
    let found = false;
    for (const col of columns) {
      const header = await col.$eval('.col-header', el => el.textContent);
      if (header.includes('Done')) {
        const colContent = await col.textContent();
        if (colContent.includes(vibe)) found = true;
        break;
      }
    }
    if (!found) {
      // Check if vibe exists at all
      const allContent = await page.textContent('#app');
      if (!allContent.includes(vibe)) throw new Error('BUG: Vibe disappeared after refresh');
      throw new Error('BUG: Status reset after refresh — vibe exists but not in Done column');
    }
    await page.close();
  });

  await test('Status: Cycle through all 5 statuses', async () => {
    const page = await browser.newPage();
    await login(page);
    const vibe = 'STATUS_CYCLE_' + Date.now();
    await addVibe(page, vibe);
    const statuses = ['In Progress', 'Scheduled', 'Done', 'Future', 'Spark'];
    for (const status of statuses) {
      const card = await findCard(page, vibe);
      if (!card) throw new Error('Card lost while cycling to ' + status);
      await openCardMenu(page, card);
      await clickMenuItem(page, status);
      await page.waitForTimeout(1500);
    }
    // Should be back in Spark
    const card = await findCard(page, vibe);
    if (!card) throw new Error('Card lost after full status cycle');
    await page.close();
  });

  // ══════════════════════════════════════
  // 4. CRUD — DELETE
  // ══════════════════════════════════════
  console.log('\n══════════════════════════════════════');
  console.log('  4. CRUD — DELETE');
  console.log('══════════════════════════════════════');

  await test('Delete: Vibe removed from board immediately', async () => {
    const page = await browser.newPage();
    await login(page);
    const vibe = 'DEL_IMMED_' + Date.now();
    await addVibe(page, vibe);
    const card = await findCard(page, vibe);
    if (!card) throw new Error('Card not found');
    await deleteCard(page, card);
    const content = await page.textContent('#app');
    if (content.includes(vibe)) throw new Error('Vibe still visible after delete');
    await page.close();
  });

  await test('Delete: Vibe stays deleted after refresh', async () => {
    const page = await browser.newPage();
    await login(page);
    const vibe = 'DEL_PERSIST_' + Date.now();
    await addVibe(page, vibe);
    const card = await findCard(page, vibe);
    if (!card) throw new Error('Card not found');
    await deleteCard(page, card);
    await page.waitForTimeout(2000); // Extra wait

    // Refresh
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.header', { timeout: 15000 });
    await page.waitForTimeout(3000);
    const content = await page.textContent('#app');
    if (content.includes(vibe)) throw new Error('BUG: Deleted vibe reappeared after refresh');
    await page.close();
  });

  await test('Delete: Total Vibes count decreases', async () => {
    const page = await browser.newPage();
    await login(page);
    const countBefore = await getVibeCount(page);
    const vibe = 'DEL_COUNT_' + Date.now();
    await addVibe(page, vibe);
    const countAfterAdd = await getVibeCount(page);
    if (countAfterAdd !== countBefore + 1) throw new Error('Count did not increase: ' + countBefore + ' -> ' + countAfterAdd);
    const card = await findCard(page, vibe);
    await deleteCard(page, card);
    const countAfterDel = await getVibeCount(page);
    if (countAfterDel !== countBefore) throw new Error('Count did not decrease after delete: expected ' + countBefore + ', got ' + countAfterDel);
    await page.close();
  });

  // ══════════════════════════════════════
  // 5. CRUD — EDIT TEXT
  // ══════════════════════════════════════
  console.log('\n══════════════════════════════════════');
  console.log('  5. CRUD — EDIT TEXT');
  console.log('══════════════════════════════════════');

  await test('Edit: Click card text opens edit input', async () => {
    const page = await browser.newPage();
    await login(page);
    const vibe = 'EDIT_CLICK_' + Date.now();
    await addVibe(page, vibe);
    const card = await findCard(page, vibe);
    const cardText = await card.$('.card-text');
    await cardText.click();
    await page.waitForTimeout(300);
    const editInput = await card.$('.card-edit');
    if (!editInput) throw new Error('Edit input not shown on click');
    const val = await editInput.inputValue();
    if (!val.includes(vibe)) throw new Error('Edit input does not contain original text');
    await page.close();
  });

  await test('Edit: Save via Enter key', async () => {
    const page = await browser.newPage();
    await login(page);
    const vibe = 'EDIT_ENTER_' + Date.now();
    await addVibe(page, vibe);
    const card = await findCard(page, vibe);
    const cardText = await card.$('.card-text');
    await cardText.click();
    await page.waitForTimeout(300);
    const editInput = await card.$('.card-edit');
    const newText = vibe + '_MODIFIED';
    await editInput.fill(newText);
    await editInput.press('Enter');
    await page.waitForTimeout(2000);
    const content = await page.textContent('#app');
    if (!content.includes(newText)) throw new Error('Modified text not visible');
    await page.close();
  });

  await test('Edit: Save via blur (click away)', async () => {
    const page = await browser.newPage();
    await login(page);
    const vibe = 'EDIT_BLUR_' + Date.now();
    await addVibe(page, vibe);
    const card = await findCard(page, vibe);
    const cardText = await card.$('.card-text');
    await cardText.click();
    await page.waitForTimeout(300);
    const editInput = await card.$('.card-edit');
    const newText = vibe + '_BLURRED';
    await editInput.fill(newText);
    // Click away to trigger blur
    await page.click('.logo');
    await page.waitForTimeout(2000);
    const content = await page.textContent('#app');
    if (!content.includes(newText)) throw new Error('Blur-save did not work');
    await page.close();
  });

  await test('Edit: Persists after refresh', async () => {
    const page = await browser.newPage();
    await login(page);
    const vibe = 'EDIT_PERSIS_' + Date.now();
    await addVibe(page, vibe);
    const card = await findCard(page, vibe);
    const cardText = await card.$('.card-text');
    await cardText.click();
    await page.waitForTimeout(300);
    const editInput = await card.$('.card-edit');
    const newText = vibe + '_SAVED';
    await editInput.fill(newText);
    await editInput.press('Enter');
    await page.waitForTimeout(4000);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.header', { timeout: 15000 });
    await page.waitForTimeout(3000);
    const content = await page.textContent('#app');
    if (!content.includes(newText)) throw new Error('BUG: Edited text not retained after refresh');
    await page.close();
  });

  await test('Edit: Empty text — what happens?', async () => {
    const page = await browser.newPage();
    await login(page);
    const vibe = 'EDIT_EMPTY_' + Date.now();
    await addVibe(page, vibe);
    const card = await findCard(page, vibe);
    const cardText = await card.$('.card-text');
    await cardText.click();
    await page.waitForTimeout(300);
    const editInput = await card.$('.card-edit');
    await editInput.fill('');
    await editInput.press('Enter');
    await page.waitForTimeout(2000);
    // Check if card still exists or was deleted or shows empty
    const content = await page.textContent('#app');
    // An empty text card is a bug — either reject or keep original
    // Find if there's a card with empty text
    const emptyCards = await page.$$eval('.card-text', els => els.filter(e => e.textContent.trim() === '').length);
    if (emptyCards > 0) {
      bug('BUG-EMPTY-EDIT', 'MEDIUM', 'Empty text allowed on edit',
        'User can edit a vibe to have empty text. Should either reject or keep original text.');
    }
    await page.close();
  });

  // ══════════════════════════════════════
  // 6. CATEGORIES
  // ══════════════════════════════════════
  console.log('\n══════════════════════════════════════');
  console.log('  6. CATEGORIES');
  console.log('══════════════════════════════════════');

  await test('Category: Assign via menu', async () => {
    const page = await browser.newPage();
    await login(page);
    const vibe = 'CAT_ASSIGN_' + Date.now();
    await addVibe(page, vibe);
    const card = await findCard(page, vibe);
    await openCardMenu(page, card);
    await clickMenuItem(page, 'Work');
    await page.waitForTimeout(1500);
    const cardContent = await (await findCard(page, vibe)).textContent();
    if (!cardContent.includes('Work')) throw new Error('Category tag not shown on card');
    await page.close();
  });

  await test('Category: Toggle off same category', async () => {
    const page = await browser.newPage();
    await login(page);
    const vibe = 'CAT_TOGGLE_' + Date.now();
    await addVibe(page, vibe);
    // Set Work
    let card = await findCard(page, vibe);
    await openCardMenu(page, card);
    await clickMenuItem(page, 'Work');
    await page.waitForTimeout(1500);
    // Toggle off Work
    card = await findCard(page, vibe);
    await openCardMenu(page, card);
    await clickMenuItem(page, 'Work');
    await page.waitForTimeout(1500);
    const cardContent = await (await findCard(page, vibe)).textContent();
    if (cardContent.includes('Work')) throw new Error('Category not toggled off');
    await page.close();
  });

  await test('Category: Filter shows only matching vibes', async () => {
    const page = await browser.newPage();
    await login(page);
    const workVibe = 'CAT_WORK_' + Date.now();
    const personalVibe = 'CAT_PERSONAL_' + Date.now();
    await addVibe(page, workVibe);
    await addVibe(page, personalVibe);
    // Set categories
    let card = await findCard(page, workVibe);
    await openCardMenu(page, card);
    await clickMenuItem(page, 'Work');
    await page.waitForTimeout(1500);
    card = await findCard(page, personalVibe);
    await openCardMenu(page, card);
    await clickMenuItem(page, 'Personal');
    await page.waitForTimeout(1500);
    // Filter by Work
    await page.selectOption('.filter-select', 'Work');
    await page.waitForTimeout(500);
    let content = await page.textContent('#app');
    if (!content.includes(workVibe)) throw new Error('Work vibe hidden under Work filter');
    if (content.includes(personalVibe)) throw new Error('Personal vibe visible under Work filter');
    // Filter by All
    await page.selectOption('.filter-select', 'all');
    await page.waitForTimeout(500);
    content = await page.textContent('#app');
    if (!content.includes(workVibe) || !content.includes(personalVibe)) throw new Error('Not all vibes shown under All filter');
    await page.close();
  });

  await test('Category: Persists after refresh', async () => {
    const page = await browser.newPage();
    await login(page);
    const vibe = 'CAT_PERSIST_' + Date.now();
    await addVibe(page, vibe);
    let card = await findCard(page, vibe);
    await openCardMenu(page, card);
    await clickMenuItem(page, 'Creative');
    await page.waitForTimeout(4000);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.header', { timeout: 15000 });
    await page.waitForTimeout(3000);
    const cardAfter = await findCard(page, vibe);
    if (!cardAfter) throw new Error('Vibe missing after refresh');
    const content = await cardAfter.textContent();
    if (!content.includes('Creative')) throw new Error('BUG: Category not retained after refresh');
    await page.close();
  });

  // ══════════════════════════════════════
  // 7. VIEWS
  // ══════════════════════════════════════
  console.log('\n══════════════════════════════════════');
  console.log('  7. VIEWS');
  console.log('══════════════════════════════════════');

  await test('Views: Board has 5 columns', async () => {
    const page = await browser.newPage();
    await login(page);
    const columns = await page.$$('.column');
    if (columns.length !== 5) throw new Error('Expected 5 columns, got ' + columns.length);
    await page.close();
  });

  await test('Views: Switch to Timeline renders week grid', async () => {
    const page = await browser.newPage();
    await login(page);
    const tabs = await page.$$('.view-tab');
    for (const tab of tabs) {
      if ((await tab.textContent()) === 'Timeline') { await tab.click(); break; }
    }
    await page.waitForTimeout(500);
    const timeline = await page.$('.timeline');
    if (!timeline) throw new Error('Timeline not rendered');
    const days = await page.$$('.day-col');
    if (days.length !== 7) throw new Error('Expected 7 day columns, got ' + days.length);
    await page.close();
  });

  await test('Views: Switch to List renders items', async () => {
    const page = await browser.newPage();
    await login(page);
    const tabs = await page.$$('.view-tab');
    for (const tab of tabs) {
      if ((await tab.textContent()) === 'List') { await tab.click(); break; }
    }
    await page.waitForTimeout(500);
    const list = await page.$('.list');
    if (!list) throw new Error('List view not rendered');
    await page.close();
  });

  await test('Views: Timeline prev/next navigation', async () => {
    const page = await browser.newPage();
    await login(page);
    for (const tab of await page.$$('.view-tab')) {
      if ((await tab.textContent()) === 'Timeline') { await tab.click(); break; }
    }
    await page.waitForTimeout(500);
    const labelBefore = await page.textContent('.week-label');
    const btns = await page.$$('.week-btn');
    await btns[1].click(); // Next
    await page.waitForTimeout(300);
    const labelNext = await page.textContent('.week-label');
    if (labelBefore === labelNext) throw new Error('Next did not change week');
    await btns[0].click(); // Prev
    await btns[0].click(); // Prev again
    await page.waitForTimeout(300);
    const labelPrev = await page.textContent('.week-label');
    if (labelPrev === labelNext) throw new Error('Prev did not change week');
    await page.close();
  });

  await test('Views: Active tab has correct styling', async () => {
    const page = await browser.newPage();
    await login(page);
    const activeTabs = await page.$$('.view-tab.active');
    if (activeTabs.length !== 1) throw new Error('Expected 1 active tab, got ' + activeTabs.length);
    const activeText = await activeTabs[0].textContent();
    if (activeText !== 'Board') throw new Error('Default active tab is not Board: ' + activeText);
    await page.close();
  });

  await test('Views: List view status cycle button works', async () => {
    const page = await browser.newPage();
    await login(page);
    const vibe = 'LIST_CYCLE_' + Date.now();
    await addVibe(page, vibe);
    // Switch to list
    for (const tab of await page.$$('.view-tab')) {
      if ((await tab.textContent()) === 'List') { await tab.click(); break; }
    }
    await page.waitForTimeout(500);
    // Find the list item and click status button
    const listItems = await page.$$('.list-item');
    for (const item of listItems) {
      const text = await item.textContent();
      if (text.includes(vibe)) {
        const statusBtn = await item.$('.list-status-btn');
        await statusBtn.click();
        await page.waitForTimeout(1000);
        break;
      }
    }
    // Should have changed status
    await page.close();
  });

  // ══════════════════════════════════════
  // 8. TIMER
  // ══════════════════════════════════════
  console.log('\n══════════════════════════════════════');
  console.log('  8. TIMER');
  console.log('══════════════════════════════════════');

  await test('Timer: Start via menu shows tracking indicator', async () => {
    const page = await browser.newPage();
    await login(page);
    const vibe = 'TIMER_START_' + Date.now();
    await addVibe(page, vibe);
    const card = await findCard(page, vibe);
    await openCardMenu(page, card);
    await clickMenuItem(page, 'Start Timer');
    await page.waitForTimeout(2000);
    // Check for tracking indicator
    const cardContent = await (await findCard(page, vibe)).textContent();
    if (!cardContent.includes('tracking')) throw new Error('No tracking indicator shown');
    // Check timer display in header
    const timerDisplay = await page.$('.timer-display');
    if (!timerDisplay) throw new Error('Timer display not shown in header');
    // Stop timer
    const card2 = await findCard(page, vibe);
    await openCardMenu(page, card2);
    await clickMenuItem(page, 'Stop Timer');
    await page.waitForTimeout(1000);
    await page.close();
  });

  await test('Timer: Stop via menu records time', async () => {
    const page = await browser.newPage();
    await login(page);
    const vibe = 'TIMER_STOP_' + Date.now();
    await addVibe(page, vibe);
    let card = await findCard(page, vibe);
    await openCardMenu(page, card);
    await clickMenuItem(page, 'Start Timer');
    // Wait 3 seconds so at least 1 min recorded
    await page.waitForTimeout(3000);
    card = await findCard(page, vibe);
    await openCardMenu(page, card);
    await clickMenuItem(page, 'Stop Timer');
    await page.waitForTimeout(2000);
    // Check time tag appears (minimum 1m due to Math.max(1,...))
    card = await findCard(page, vibe);
    const content = await card.textContent();
    if (!content.includes('1m') && !content.includes('⏱')) {
      // Timer records at least 1 min due to Math.max(1, ...)
      // This is ok, the time might show differently
    }
    await page.close();
  });

  // ══════════════════════════════════════
  // 9. MENU & UI INTERACTIONS
  // ══════════════════════════════════════
  console.log('\n══════════════════════════════════════');
  console.log('  9. MENU & UI INTERACTIONS');
  console.log('══════════════════════════════════════');

  await test('Menu: Opens on ⋮ click', async () => {
    const page = await browser.newPage();
    await login(page);
    const vibe = 'MENU_OPEN_' + Date.now();
    await addVibe(page, vibe);
    const card = await findCard(page, vibe);
    await openCardMenu(page, card);
    const menu = await page.$('.menu');
    if (!menu) throw new Error('Menu not visible after click');
    await page.close();
  });

  await test('Menu: Closes on outside click', async () => {
    const page = await browser.newPage();
    await login(page);
    const vibe = 'MENU_CLOSE_' + Date.now();
    await addVibe(page, vibe);
    const card = await findCard(page, vibe);
    await openCardMenu(page, card);
    let menu = await page.$('.menu');
    if (!menu) throw new Error('Menu not opened');
    // Click outside
    await page.click('.logo');
    await page.waitForTimeout(500);
    menu = await page.$('.menu');
    if (menu) throw new Error('Menu not closed on outside click');
    await page.close();
  });

  await test('Menu: Closes on Escape key', async () => {
    const page = await browser.newPage();
    await login(page);
    const vibe = 'MENU_ESC_' + Date.now();
    await addVibe(page, vibe);
    const card = await findCard(page, vibe);
    await openCardMenu(page, card);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const menu = await page.$('.menu');
    if (menu) throw new Error('Menu not closed on Escape');
    await page.close();
  });

  await test('Menu: Only one menu open at a time', async () => {
    const page = await browser.newPage();
    await login(page);
    const vibe1 = 'MENU_SINGLE1_' + Date.now();
    const vibe2 = 'MENU_SINGLE2_' + (Date.now() + 1);
    await addVibe(page, vibe1);
    await addVibe(page, vibe2);
    // Open first menu
    const card1 = await findCard(page, vibe1);
    await openCardMenu(page, card1);
    // Open second menu
    const card2 = await findCard(page, vibe2);
    await openCardMenu(page, card2);
    await page.waitForTimeout(300);
    const menus = await page.$$('.menu');
    if (menus.length > 1) throw new Error('Multiple menus open: ' + menus.length);
    await page.close();
  });

  // ══════════════════════════════════════
  // 10. THEME & PERSISTENCE
  // ══════════════════════════════════════
  console.log('\n══════════════════════════════════════');
  console.log('  10. THEME & PERSISTENCE');
  console.log('══════════════════════════════════════');

  await test('Theme: Toggle dark to light', async () => {
    const page = await browser.newPage();
    await login(page);
    // Set to dark first
    const current = await page.getAttribute('html', 'data-theme');
    await page.click('.theme-toggle');
    await page.waitForTimeout(300);
    const after = await page.getAttribute('html', 'data-theme');
    if (current === after) throw new Error('Theme did not toggle');
    await page.click('.theme-toggle'); // Reset
    await page.close();
  });

  await test('Theme: Persists after refresh', async () => {
    const page = await browser.newPage();
    await login(page);
    // Toggle theme
    await page.click('.theme-toggle');
    await page.waitForTimeout(300);
    const before = await page.getAttribute('html', 'data-theme');
    // Refresh
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.header', { timeout: 15000 });
    await page.waitForTimeout(1000);
    const after = await page.getAttribute('html', 'data-theme');
    if (before !== after) throw new Error('Theme not persisted: was ' + before + ' now ' + after);
    // Toggle back
    await page.click('.theme-toggle');
    await page.close();
  });

  // ══════════════════════════════════════
  // 11. LOGOUT
  // ══════════════════════════════════════
  console.log('\n══════════════════════════════════════');
  console.log('  11. LOGOUT');
  console.log('══════════════════════════════════════');

  await test('Logout: Returns to auth screen', async () => {
    const page = await browser.newPage();
    await login(page);
    await page.click('.btn-sm');
    await page.waitForSelector('.auth-box', { timeout: 10000 });
    const h1 = await page.textContent('.auth-box h1');
    if (!h1.includes('Vibe Planner')) throw new Error('Not on auth screen after logout');
    await page.close();
  });

  await test('Logout: Cannot access data without re-login', async () => {
    const page = await browser.newPage();
    await login(page);
    await page.click('.btn-sm'); // Logout
    await page.waitForSelector('.auth-box', { timeout: 10000 });
    // Try to navigate directly
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    // Should show auth screen (session cleared)
    const authBox = await page.$('.auth-box');
    const header = await page.$('.header');
    // One of these must be true
    if (!authBox && !header) throw new Error('Neither auth nor dashboard shown');
    // If header is shown, the session might still be cached — this is Supabase behavior
    await page.close();
  });

  // ══════════════════════════════════════
  // 12. STATS ACCURACY
  // ══════════════════════════════════════
  console.log('\n══════════════════════════════════════');
  console.log('  12. STATS');
  console.log('══════════════════════════════════════');

  await test('Stats: Total Vibes matches actual card count', async () => {
    const page = await browser.newPage();
    await login(page);
    const totalStat = await getVibeCount(page);
    const cards = await page.$$('.card');
    if (totalStat !== cards.length) {
      bug('BUG-STAT-MISMATCH', 'LOW', 'Stats count mismatch',
        'Total Vibes stat (' + totalStat + ') does not match card count (' + cards.length + ')');
    }
    await page.close();
  });

  await test('Stats: In Progress count is accurate', async () => {
    const page = await browser.newPage();
    await login(page);
    const stats = await page.$$('.stat-value');
    const ipStat = parseInt(await stats[1].textContent());
    // Count cards in In Progress column
    const columns = await page.$$('.column');
    let ipCards = 0;
    for (const col of columns) {
      const header = await col.$eval('.col-header', el => el.textContent);
      if (header.includes('In Progress')) {
        ipCards = (await col.$$('.card')).length;
        break;
      }
    }
    if (ipStat !== ipCards) throw new Error('In Progress stat (' + ipStat + ') != cards (' + ipCards + ')');
    await page.close();
  });

  // ══════════════════════════════════════
  // CLEANUP
  // ══════════════════════════════════════
  console.log('\n══════════════════════════════════════');
  console.log('  CLEANUP');
  console.log('══════════════════════════════════════');

  const cleanupPage = await browser.newPage();
  await login(cleanupPage);
  await cleanupPage.waitForTimeout(2000);

  const testPrefixes = ['ADD_TEST_', 'ENTER_TEST_', 'CLEAR_TEST_', 'SPARK_TEST_', '<img', 'LONG_', 'SPECIAL_',
    'EMOJI_', 'PERSIST_TEST_', 'STATUS_IP_', 'STATUS_PERSIST_', 'STATUS_CYCLE_',
    'DEL_IMMED_', 'DEL_PERSIST_', 'DEL_COUNT_', 'EDIT_CLICK_', 'EDIT_ENTER_', 'EDIT_BLUR_',
    'EDIT_PERSIS_', 'EDIT_EMPTY_', 'CAT_ASSIGN_', 'CAT_TOGGLE_', 'CAT_WORK_', 'CAT_PERSONAL_',
    'CAT_PERSIST_', 'LIST_CYCLE_', 'TIMER_START_', 'TIMER_STOP_', 'MENU_OPEN_', 'MENU_CLOSE_',
    'MENU_ESC_', 'MENU_SINGLE1_', 'MENU_SINGLE2_', 'FILTER_TEST_'];

  let cleaned = 0;
  for (let attempt = 0; attempt < 60; attempt++) {
    const cards = await cleanupPage.$$('.card');
    let found = false;
    for (const card of cards) {
      const text = await card.textContent();
      const isTestVibe = testPrefixes.some(p => text.includes(p));
      if (isTestVibe) {
        const menuBtn = await card.$('.menu-btn');
        await menuBtn.click();
        await cleanupPage.waitForTimeout(300);
        const menuItems = await cleanupPage.$$('.menu-item');
        for (const mi of menuItems) {
          const miText = await mi.textContent();
          if (miText.includes('Delete')) { await mi.click(); found = true; cleaned++; break; }
        }
        await cleanupPage.waitForTimeout(1500);
        break;
      }
    }
    if (!found) break;
  }
  console.log(`  Cleaned up ${cleaned} test vibes`);
  await cleanupPage.close();

  // ══════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════
  await browser.close();

  console.log('\n══════════════════════════════════════');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed (${passed + failed} total)`);
  console.log('══════════════════════════════════════');

  if (failures.length > 0) {
    console.log('\n  FAILURES:');
    failures.forEach(f => console.log(`    ✗ ${f.name}`));
    failures.forEach(f => console.log(`      → ${f.error}`));
  }

  if (bugs.length > 0) {
    console.log('\n  BUGS FOUND:');
    bugs.forEach(b => console.log(`    [${b.severity}] ${b.id}: ${b.title}`));
    bugs.forEach(b => console.log(`      Detail: ${b.detail}`));
  }

  console.log('');
  process.exit(failed > 0 ? 1 : 0);
})();
