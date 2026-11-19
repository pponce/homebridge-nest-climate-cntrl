import assert from 'node:assert/strict';

// Hold responses explicitly so a fast fixture cannot conceal a login flash.
export async function checkSessionStartup(browser, base) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let receiveSession;
  let nextSession = new Promise((resolve) => { receiveSession = resolve; });
  await page.route('**/api/session', (route) => receiveSession(route));
  const assertLoading = async () => {
    await page.getByText('Loading dashboard…', { exact: true }).waitFor();
    assert.equal(await page.locator('#login-screen').isVisible(), false);
    assert.equal(await page.locator('#app').isVisible(), false);
    assert.equal(await page.locator('#session-retry').isVisible(), false);
  };
  const takeSession = async () => {
    const route = await nextSession;
    nextSession = new Promise((resolve) => { receiveSession = resolve; });
    await assertLoading();
    return route;
  };
  const respond = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  try {
    let receiveModule;
    const startupModule = new Promise((resolve) => { receiveModule = resolve; });
    await page.route('**/app.js', (route) => receiveModule(route), { times: 1 });
    await page.goto(base, { waitUntil: 'commit' });
    const module = await startupModule;
    await assertLoading();
    await module.continue();
    await respond(await takeSession(), { authenticated: true, username: 'admin', csrfToken: 'fixture-csrf' });
    await page.getByRole('heading', { name: 'Living room', exact: true }).waitFor();
    assert.equal(await page.locator('#session-screen').isVisible(), false);
    assert.equal(await page.locator('#login-screen').isVisible(), false);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await respond(await takeSession(), { error: 'Fixture unavailable.' }, 503);
    await page.getByRole('button', { name: 'Try again', exact: true }).waitFor();
    assert.match(await page.locator('#session-message').textContent(), /Cannot reach the dashboard/);
    assert.equal(await page.locator('#login-screen').isVisible(), false);
    assert.equal(await page.locator('#app').isVisible(), false);
    assert.equal(await page.locator('#session-spinner').isVisible(), false);
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await respond(await takeSession(), { authenticated: true, username: 'admin', csrfToken: 'fixture-csrf' });
    await page.getByRole('heading', { name: 'Living room', exact: true }).waitFor();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await respond(await takeSession(), { authenticated: false, setupRequired: false });
    await page.getByRole('heading', { name: 'Welcome home.', exact: true }).waitFor();
    assert.equal(await page.locator('#session-screen').isVisible(), false);
    assert.equal(await page.locator('#app').isVisible(), false);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await respond(await takeSession(), { authenticated: false, setupRequired: true });
    await page.getByRole('heading', { name: 'A little setup first.', exact: true }).waitFor();
    assert.equal(await page.locator('#login-form').isVisible(), false);
    assert.equal(await page.locator('#session-screen').isVisible(), false);
    await page.getByRole('button', { name: 'Check setup again', exact: true }).click();
    await respond(await takeSession(), { authenticated: false, setupRequired: false });
    await page.getByRole('heading', { name: 'Welcome home.', exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS session startup: initial paint, delayed authentication, refresh, failure/retry, sign-in and setup');
  } finally {
    await page.close();
  }
}
