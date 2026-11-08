import type { Captcha, Point, SliderTrack } from '../api/zeeho';

function image(source: string): Promise<HTMLImageElement> {
  const url = source.startsWith('data:') ? source : `data:image/png;base64,${source}`;
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(url))
    return Promise.reject(new Error('image'));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      img.width > 0 && img.width <= 4096 && img.height <= 4096
        ? resolve(img)
        : reject(new Error('image'));
    img.onerror = () => reject(new Error('image'));
    img.src = url;
  });
}

/** Records the user's actual gesture. No automatic puzzle solving or generated tracks. */
export async function mountCaptcha(
  canvas: HTMLCanvasElement,
  captcha: Captcha,
  submit: (track: SliderTrack) => void,
) {
  const [background, piece] = await Promise.all([
    image(captcha.backgroundImage),
    image(captcha.sliderImage),
  ]);
  if (!canvas.isConnected) return;
  const context = canvas.getContext('2d')!;
  const sample = document.createElement('canvas');
  sample.width = piece.width;
  sample.height = piece.height;
  const sampleContext = sample.getContext('2d')!;
  sampleContext.drawImage(piece, 0, 0);
  const alpha = sampleContext.getImageData(0, 0, piece.width, piece.height).data;
  let y = 0;
  outer: for (let row = 0; row < piece.height; row++) {
    for (let column = 0; column < piece.width; column++) {
      if (alpha[(row * piece.width + column) * 4 + 3] > 16) {
        y = row;
        break outer;
      }
    }
  }
  const maximum = Math.max(0, 720 - piece.width);
  let x = 0,
    grab = 0,
    start = 0,
    wallStart = 0,
    last = 0,
    points: Point[] = [];
  let dragging = false,
    submitted = false;
  const draw = () => {
    context.clearRect(0, 0, 720, 360);
    context.drawImage(background, 0, 0, 720, 360);
    context.drawImage(piece, x, 0);
    canvas.setAttribute('aria-valuenow', String(Math.round(x)));
  };
  const position = (clientX: number) =>
    ((clientX - canvas.getBoundingClientRect().left) * 720) / canvas.getBoundingClientRect().width;
  const point = (type: Point['type']) =>
    points.push({ t: Math.round(performance.now() - start), type, x: Math.round(x), y });
  const begin = () => {
    start = last = performance.now();
    wallStart = Date.now();
    points = [];
    point('down');
  };
  const finish = () => {
    if (submitted) return;
    point('up');
    submitted = true;
    submit({
      bgImageWidth: 720,
      bgImageHeight: 360,
      sliderImageWidth: captcha.sliderImageWidth ?? 110,
      sliderImageHeight: captcha.sliderImageHeight ?? 360,
      startSlidingTime: String(wallStart),
      endSlidingTime: String(Date.now()),
      trackList: points,
    });
  };
  canvas.setAttribute('aria-valuemax', String(maximum));
  canvas.addEventListener('pointerdown', (event) => {
    if (submitted || dragging) return;
    dragging = true;
    grab = position(event.clientX) - x;
    begin();
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging || submitted) return;
    x = Math.max(0, Math.min(maximum, position(event.clientX) - grab));
    draw();
    if (performance.now() - last > 16) {
      last = performance.now();
      point('move');
    }
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!dragging || submitted) return;
    dragging = false;
    x = Math.max(0, Math.min(maximum, position(event.clientX) - grab));
    draw();
    finish();
  });
  canvas.addEventListener('pointercancel', () => {
    dragging = false;
    points = [];
  });
  canvas.addEventListener('keydown', (event) => {
    if (submitted) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      if (!points.length) begin();
      x = Math.max(0, Math.min(maximum, x + (event.key === 'ArrowRight' ? 5 : -5)));
      point('move');
      draw();
    } else if (event.key === 'Enter' && points.length) {
      event.preventDefault();
      finish();
    }
  });
  draw();
}
