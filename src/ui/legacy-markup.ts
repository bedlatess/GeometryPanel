/** Temporary R3 adapter for the unchanged 0.8.0 secondary-page controllers. */
export function replaceLegacy(host: Element, source: string) {
  const parsed = new DOMParser().parseFromString(source, 'text/html');
  host.replaceChildren(...Array.from(parsed.body.childNodes));
}

export function serializeLegacy(host: Element) {
  return Array.from(host.childNodes)
    .map((node) => new XMLSerializer().serializeToString(node))
    .join('');
}
