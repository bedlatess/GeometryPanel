<script setup lang="ts">
import { motion, reducedMotion } from '../theme/motion';
function change(node: Element, done: () => void, entering: boolean) {
  const element = node as HTMLElement;
  const height = `${element.getBoundingClientRect().height}px`;
  const frames = reducedMotion()
    ? [{ opacity: entering ? 0 : 1 }, { opacity: entering ? 1 : 0 }]
    : entering
      ? [
          { height: '0px', minHeight: '0px', opacity: 0 },
          { height, opacity: 1 },
        ]
      : [
          { height, opacity: 1, transform: 'translateX(0)' },
          { height, opacity: 0, transform: 'translateX(-32px)', offset: 0.55 },
          { height: '0px', minHeight: '0px', opacity: 0, transform: 'translateX(-32px)' },
        ];
  element.style.overflow = 'hidden';
  const animation = element.animate(frames, {
    duration: reducedMotion() ? motion.reduced : motion.list,
    easing: motion.out,
  });
  void animation.finished
    .catch(() => {})
    .then(() => {
      element.style.removeProperty('overflow');
      done();
    });
}
const enter = (node: Element, done: () => void) => change(node, done, true);
const leave = (node: Element, done: () => void) => change(node, done, false);
</script>
<template>
  <TransitionGroup :css="false" @enter="enter" @leave="leave"><slot /></TransitionGroup>
</template>
