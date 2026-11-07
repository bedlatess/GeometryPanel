import mark from '../../../public/brand/mark.svg?raw';
import lightMark from '../../../public/brand/mark-on-light.svg?raw';
import wordmark from '../../../public/brand/wordmark.svg?raw';
import { PrimaryButton, SecondaryButton } from '../kit';
export function welcomePage(disabled = false) {
  return `<section class="welcome-page"><div class="welcome-identity"><div class="welcome-mark brand-dark">${mark}</div><div class="welcome-mark brand-light">${lightMark}</div><div class="welcome-wordmark">${wordmark}</div></div><div class="welcome-actions">${PrimaryButton('登录极核账号', 'data-action="connect"', disabled)}${SecondaryButton('体验演示', 'data-action="preview"', disabled)}<p>账号信息仅存于本机</p></div></section>`;
}
