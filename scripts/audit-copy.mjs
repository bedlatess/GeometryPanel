import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import ts from 'typescript';
import { parse as sfc } from '@vue/compiler-sfc';
import { baseParse, NodeTypes } from '@vue/compiler-dom';

const spec = readFileSync('../docs/design/设计规范.md', 'utf8');
const approved = spec.split('### 6.2 文案总表')[1].split('## 7.')[0];
const copies = new Map();
const walk = (root) =>
  readdirSync(root).flatMap((name) => {
    const file = `${root}/${name}`;
    return statSync(file).isDirectory() ? walk(file) : [file];
  });
function add(text, file) {
  const value = text.replace(/\s+/g, ' ').trim();
  if (!/[\u3400-\u9fff]/.test(value) || approved.includes(value)) return;
  if (!copies.has(value)) copies.set(value, new Set());
  copies.get(value).add(file);
}
function script(source, file) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const visit = (node) => {
    if (
      ts.isStringLiteralLike(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    )
      add(node.text, file);
    ts.forEachChild(node, visit);
  };
  visit(ast);
}
const files = ['src/app', 'src/stores', 'src/components', 'src/views']
  .flatMap(walk)
  .filter((file) => /\.(ts|vue)$/.test(file));
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  if (!file.endsWith('.vue')) {
    script(source, file);
    continue;
  }
  const { descriptor } = sfc(source);
  for (const part of [descriptor.script, descriptor.scriptSetup])
    if (part) script(part.content, file);
  if (!descriptor.template) continue;
  const visit = (node) => {
    if (node.type === NodeTypes.TEXT) add(node.content, file);
    if (node.type === NodeTypes.INTERPOLATION) script(`(${node.content.content})`, file);
    if (node.type === NodeTypes.ELEMENT) {
      for (const prop of node.props) {
        if (prop.type === NodeTypes.ATTRIBUTE && prop.value) add(prop.value.content, file);
        if (prop.type === NodeTypes.DIRECTIVE && prop.exp) script(prop.exp.content, file);
      }
    }
    for (const child of node.children || []) visit(child);
  };
  visit(baseParse(descriptor.template.content));
}
let output = '# 第 6.2 节以外的文案候审表\n\n';
output += '自动提取界面、编排和展示层的中文文本，排除文案总表已有的完整字面量。';
output += '包含沿用文案、页面名称、动态片段和法律条款，并非全部是本次新创作。';
output += '模板片段需与引用位置组合阅读；本表保守列全，供 Claude 逐项审定。\n\n';
output += '| 文本或动态片段 | 引用位置 |\n|---|---|\n';
for (const [copy, refs] of [...copies].sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))) {
  output += `| ${copy.replaceAll('|', '\\|')} | ${[...refs].join('<br>')} |\n`;
}
writeFileSync('../docs/audit/0.9.0/新增文案.md', output);
console.log(`${copies.size} copy candidates documented`);
