// GitHub Pages repositories share an origin. Keep each installation's data separate.
export const appScope = new URL(import.meta.env.BASE_URL, document.baseURI).pathname;
export const storagePrefix = `zeeho-panel:${appScope}:`;
