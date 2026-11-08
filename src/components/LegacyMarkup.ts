/** R3-only compatibility renderer. New screens use their own Vue templates. */
import { defineComponent, h, type VNode } from 'vue';
function renderNode(node: Node): VNode | string {
  if (node.nodeType !== Node.ELEMENT_NODE) return node.textContent ?? '';
  const element = node as Element;
  if (['script', 'iframe'].includes(element.tagName.toLowerCase())) return '';
  const attrs = Object.fromEntries(
    [...element.attributes].filter((a) => !a.name.startsWith('on')).map((a) => [a.name, a.value]),
  );
  return h(element.tagName.toLowerCase(), attrs, [...element.childNodes].map(renderNode));
}
export default defineComponent({
  props: { source: { type: String, required: true } },
  setup(props) {
    return () =>
      [...new DOMParser().parseFromString(props.source, 'text/html').body.childNodes].map(
        renderNode,
      );
  },
});
