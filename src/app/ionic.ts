import { IonicVue } from '@ionic/vue';
import type { App } from 'vue';
import { motion, reducedMotion, springCurve } from '../theme/motion';

export function installIonic(app: App) {
  app.use(IonicVue, { mode: 'ios', swipeBackEnabled: true, animated: !reducedMotion() });
  const style = document.documentElement.style;
  for (const [name, value] of Object.entries(motion)) {
    if (typeof value === 'number') style.setProperty(`--motion-${name}`, `${value}ms`);
  }
  style.setProperty('--ease-ios', motion.ios);
  style.setProperty('--ease-out', motion.out);
  style.setProperty('--spring-duration', `${motion.spring.duration}ms`);
  style.setProperty('--press-duration', `${motion.press}ms`);
  if (CSS.supports('transition-timing-function', springCurve())) {
    style.setProperty('--spring', springCurve());
  }
}
