import { LoginResponseDto } from '@immich/sdk';
import { expect, test } from '@playwright/test';
import { resolve4, resolve6 } from 'node:dns/promises';
import { playwrightHost } from 'playwright.config';
import { utils } from 'src/utils';

test.describe('Websocket', () => {
  let admin: LoginResponseDto;

  test.beforeAll(async () => {
    utils.initSdk();
    await utils.resetDatabase();
    admin = await utils.adminSetup();
  });

  test('connects using ipv4', async ({ page, context }) => {
    const [ipv4] = await resolve4(playwrightHost);
    await utils.setAuthCookies(context, admin.accessToken, ipv4);
    await page.goto(`http://${ipv4}:2285/`);
    await expect(page.locator('#sidebar')).toContainText('Server Online');
  });

  test('connects using ipv6', async ({ page, context }) => {
    let ipv6: string;
    try {
      [ipv6] = await resolve6(playwrightHost);
    } catch {
      test.skip(true, 'No IPv6 address available');
      return;
    }
    await utils.setAuthCookies(context, admin.accessToken, `[${ipv6}]`);
    await page.goto(`http://[${ipv6}]:2285/`);
    await expect(page.locator('#sidebar')).toContainText('Server Online');
  });
});
