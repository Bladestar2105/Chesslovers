import { test, expect } from '@playwright/test';

async function initClient(page, name) {
  await page.goto('/');
  await page.getByTestId('mode-random').click();
  await page.locator('#nickname-input').fill(name);
  await page.getByTestId('start-game-button').click();
}

test('draw handshake completes for both clients', async ({ browser }) => {
  const aContext = await browser.newContext();
  const bContext = await browser.newContext();
  const pageA = await aContext.newPage();
  const pageB = await bContext.newPage();

  await initClient(pageA, 'Alice');
  await initClient(pageB, 'Bob');

  await expect(pageA).toHaveURL(/\/game\//);
  await expect(pageB).toHaveURL(/\/game\//);

  await pageA.getByTestId('offer-draw-button').click();

  await expect(pageB.getByTestId('confirm-action-modal')).toBeVisible();
  await pageB.getByTestId('confirm-action-accept').click();

  await expect(pageA.getByTestId('game-result-banner')).toBeVisible();
  await expect(pageB.getByTestId('game-result-banner')).toBeVisible();

  await aContext.close();
  await bContext.close();
});
