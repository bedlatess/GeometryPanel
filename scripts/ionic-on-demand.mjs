import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);

/** Preserve Ionic's wrappers, but give each wrapper its own bundler module. */
export function ionicOnDemand() {
  const file = require.resolve('@ionic/vue').replaceAll('\\', '/');
  const source = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const parts = new Map(),
    imports = new Map(),
    edits = [];
  for (const node of ast.statements) {
    if (ts.isImportDeclaration(node)) {
      for (const binding of node.importClause?.namedBindings?.elements || []) {
        imports.set(binding.name.text, node.getText(ast));
      }
    }
    if (!ts.isVariableStatement(node) || node.declarationList.declarations.length !== 1) continue;
    const declaration = node.declarationList.declarations[0];
    if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
    const name = declaration.name.text,
      expression = declaration.initializer;
    // IonTabs compares child component identity with this local binding.
    if (name === 'IonTab' || !name.startsWith('Ion') || !ts.isCallExpression(expression)) continue;
    const helper = expression.expression.getText(ast);
    if (!['defineContainer', 'defineOverlayContainer'].includes(helper)) continue;
    const definition = expression.arguments[1]?.getText(ast);
    if (!imports.has(definition)) throw new Error(`Unsupported Ionic wrapper: ${name}`);
    parts.set(
      name,
      `${imports.get(definition)}\n` +
        `import {__${helper} as ${helper}} from '@ionic/vue';\n` +
        `${node.getText(ast)}\nexport {${name}};`,
    );
    edits.push([
      node.getStart(ast),
      node.end,
      `export {${name}} from 'virtual:ionic-component/${name}';`,
    ]);
  }
  let body = source;
  for (const [start, end, value] of edits.sort((a, b) => b[0] - a[0])) {
    body = body.slice(0, start) + value + body.slice(end);
  }
  body = body.replace(
    /export \{([^}]+)\};/g,
    (_all, names) =>
      `export {${names
        .split(',')
        .map((v) => v.trim())
        .filter((v) => !parts.has(v))
        .join(',')}};`,
  );
  body = body.replace(/= createController\(/g, '= /*@__PURE__*/ createController(');
  body +=
    '\nexport {defineContainer as __defineContainer,' +
    'defineOverlayContainer as __defineOverlayContainer};';
  return {
    name: 'ionic-on-demand',
    enforce: 'pre',
    resolveId(id) {
      if (id.startsWith('virtual:ionic-component/')) return '\0' + id;
    },
    load(id) {
      if (id.startsWith('\0virtual:ionic-component/')) {
        return parts.get(id.split('/').at(-1));
      }
    },
    transform(code, id) {
      if (id.replaceAll('\\', '/') === file) return body;
      if (id.startsWith('\0') || !code.includes('@ionic/vue')) return;
      return code.replace(
        /import\s*\{([^}]+)\}\s*from\s*(['"])@ionic\/vue\2;?/g,
        (original, bindings) => {
          const separate = [],
            remaining = [];
          for (const binding of bindings
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)) {
            const name = binding.split(/\s+as\s+/)[0];
            if (parts.has(name)) {
              separate.push(`import {${binding}} from 'virtual:ionic-component/${name}';`);
            } else remaining.push(binding);
          }
          if (!separate.length) return original;
          if (remaining.length) separate.push(`import {${remaining.join(',')}} from '@ionic/vue';`);
          return separate.join('\n');
        },
      );
    },
  };
}
