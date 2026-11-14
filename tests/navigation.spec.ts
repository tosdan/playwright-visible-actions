import { test, expect } from './fixtures';

test('navigazioni Angular: routerLink, navigate, guard, timer e reload', async ({ page }) => {
  await test.step('goto / : il router applica redirectTo verso /orders', async () => {
    await page.goto('/');
    await expect(page).toHaveURL('/orders');
  });

  await test.step('salvataggio: router.navigate dopo una chiamata asincrona', async () => {
    await page.getByLabel('Nome cliente').fill('Mario Rossi');
    await page.getByLabel('Prodotto').selectOption('pro');
    await page.getByRole('button', { name: 'Salva ordine' }).click();
    await expect(page).toHaveURL('/orders/42?customer=Mario%20Rossi&product=pro');
    await expect(page.locator('#summary')).toHaveText('Salvato per Mario Rossi (pro)');
  });

  await test.step('window.location: reload completo avviato dall’app', async () => {
    await page.getByRole('button', { name: 'Apri report' }).click();
    await expect(page.getByRole('heading', { name: 'Report' })).toBeVisible();
  });

  await test.step('guard che rifiuta: il click non porta da nessuna parte', async () => {
    await page.getByRole('link', { name: 'Archivio' }).click();
    await expect(page).toHaveURL('/report');
    await expect(page.getByRole('heading', { name: 'Report' })).toBeVisible();
  });

  await test.step('link alla rotta già attiva: il Router ignora la navigazione', async () => {
    await page.getByRole('link', { name: 'Report' }).click();
    await expect(page).toHaveURL('/report');
  });

  await test.step('routerLink su rotta protetta: la guard porta al login', async () => {
    await page.getByRole('link', { name: 'Admin' }).click();
    await expect(page).toHaveURL('/login?returnUrl=%2Fadmin');
  });

  await test.step('login: navigateByUrl verso la destinazione ricordata', async () => {
    await page.getByRole('button', { name: 'Accedi' }).click();
    await expect(page.getByRole('heading', { name: 'Area riservata' })).toBeVisible();
  });

  await test.step('sessione scaduta: l’app torna al login da sola', async () => {
    await expect(page).toHaveURL('/login?reason=scaduta');
  });

  await test.step('goto su rotta protetta: guard durante la navigazione diretta', async () => {
    await page.goto('/admin');
    await expect(page).toHaveURL('/login?returnUrl=%2Fadmin');
  });

  await test.step('skipLocationChange: cambia la vista ma non l’URL', async () => {
    await page.goto('/orders/42?customer=Mario&product=base');
    await page.getByRole('button', { name: 'Anteprima report' }).click();
    await expect(page.getByRole('heading', { name: 'Report' })).toBeVisible();
    await expect(page).toHaveURL('/orders/42?customer=Mario&product=base');
  });
});
