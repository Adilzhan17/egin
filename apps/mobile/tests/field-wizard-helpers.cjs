// Shared user-facing path for the post-rebuild field creation flow.
async function openPicker(page) {
  await page.getByRole('button', {name:'Добавить участок', exact:true}).first().click();
  const wizard = page.locator('.field-wizard');
  await wizard.waitFor();
  await wizard.getByRole('button', {name:'Выбрать контур ЕГКН', exact:true}).click();
  const dialog = page.getByRole('dialog', {name:'Добавить участок', exact:true});
  await dialog.waitFor();
  return dialog;
}

async function finishField(page, name) {
  const wizard = page.locator('.field-wizard');
  await wizard.waitFor();
  await wizard.getByRole('button', {name:'Продолжить', exact:true}).click();
  await wizard.getByRole('button', {name:/Пшеница/}).click();
  await wizard.getByRole('button', {name:'Продолжить', exact:true}).click();
  await wizard.getByLabel('Название участка').fill(name);
  await wizard.getByRole('button', {name:'Продолжить', exact:true}).click();
  await wizard.getByRole('button', {name:'Сохранить участок', exact:true}).click();
  await wizard.waitFor({state:'hidden'});
  await page.locator('.land-detail h2').filter({hasText:name}).waitFor();
}

async function closeWizard(page) {
  await page.locator('.field-wizard .wizard-footer').getByRole('button', {name:'Закрыть', exact:true}).click();
  await page.locator('.field-wizard').waitFor({state:'hidden'});
}

module.exports = {openPicker, finishField, closeWizard};
