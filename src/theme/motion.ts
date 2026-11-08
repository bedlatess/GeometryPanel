export const motion = Object.freeze({
  ios: 'cubic-bezier(.32,.72,0,1)',
  out: 'cubic-bezier(.2,.8,.2,1)',
  spring: { stiffness: 400, damping: 32, mass: 1, duration: 350 },
  snap: 180,
  page: 540,
  sheet: 540,
  scrim: 250,
  press: 80,
  number: 300,
  digitStagger: 30,
  toast: 2500,
  reduced: 150,
});

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Samples the specified damped spring without a runtime animation dependency. */
export function springCurve() {
  const { stiffness, damping, mass, duration } = motion.spring;
  const rate = damping / (2 * mass);
  const frequency = Math.sqrt(stiffness / mass - rate * rate);
  const values = Array.from({ length: 33 }, (_, index) => {
    if (index === 0) return '0';
    if (index === 32) return '1';
    const time = (index / 32) * (duration / 1000);
    return String(
      Number(
        (
          1 -
          Math.exp(-rate * time) *
            (Math.cos(frequency * time) + (rate / frequency) * Math.sin(frequency * time))
        ).toFixed(4),
      ),
    );
  });
  return `linear(${values.join(',')})`;
}
