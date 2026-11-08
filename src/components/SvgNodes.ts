import { h, defineComponent, type PropType, type VNode } from 'vue';
function nodeToVNode(node: Node): VNode | string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  const element = node as Element;
  const attrs = Object.fromEntries(Array.from(element.attributes).map((a) => [a.name, a.value]));
  return h(element.tagName, attrs, Array.from(element.childNodes).map(nodeToVNode));
}
export default defineComponent({
  props: { nodes: { type: Array as PropType<Node[]>, required: true } },
  setup(props) {
    return () => props.nodes.map(nodeToVNode);
  },
});
