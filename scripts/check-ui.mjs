import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const out = '.tools/ui-v2';
await mkdir(out, { recursive: true });
const tokens = await readFile('src/styles/tokens.css','utf8');
const declarations = block => Object.fromEntries([...block.matchAll(/--([\w-]+):([^;]+);/g)].map(m=>[m[1],m[2].trim()]));
const light = declarations(tokens.match(/:root\s*\{([\s\S]*?)\}/)[1]);
const dark = {...light,...declarations(tokens.match(/:root\[data-theme="dark"\][^{]+\{([\s\S]*?)\}/)[1])};
function rgba(value, palette) {
  if (value.startsWith('var(')) return rgba(palette[value.slice(6,-1)],palette);
  if (value.startsWith('#')) return [...value.slice(1).matchAll(/../g)].map(m=>parseInt(m[0],16)).concat(1);
  if (value.startsWith('rgba')) return value.slice(5,-1).split(',').map(Number);
  throw new Error('Unsupported audit color: '+value);
}
function over(color, base) { return color.slice(0,3).map((v,i)=>v*(color[3]??1)+base[i]*(1-(color[3]??1))); }
function lum(rgb) { const c=rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722; }
const pairs = [['t1','bg',4.5],['t1','card',4.5],['t1','fill',4.5],['t2','bg',4.5],['t2','card',4.5],['t2','fill',4.5],['energy-t','bg',4.5],['energy-t','card',4.5],['attn','attn-bg',4.5],['alert','bg',4.5],['alert','card',4.5],['ink-t','ink',4.5],['knob-t','knob',4.5],['focus','bg',3],['energy','fill',3],['t2','fill',3]];
const contrast = [];
for (const [theme,p] of [['light',light],['dark',dark]]) for (const [foreground,background,minimum] of pairs) {
  const b=over(rgba(p[background],p),rgba(p.bg,p)),f=over(rgba(p[foreground],p),b);
  const l=[lum(f),lum(b)].sort((a,b)=>b-a),ratio=(l[0]+.05)/(l[1]+.05);
  contrast.push({theme,foreground,background,minimum,ratio:Number(ratio.toFixed(2)),passed:ratio>=minimum});
}
const styles=[];
for(const name of ['base','components','pages']) {
  const source=await readFile(`src/styles/${name}.css`,'utf8');
  const withoutQueries=source.replace(/@media[^\{]+\{/g,'{');
  styles.push({file:`src/styles/${name}.css`,colors:source.match(/#[\da-f]{3,8}\b|(?:rgb|hsl)a?\(/gi)||[],sizes:withoutQueries.match(/(?<![\w.-])-?(?:\d*\.)?\d+(?:px|rem|em|ms|s|deg)\b/g)||[]});
}
async function list(dir) { const all=[];for(const d of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,d.name);if(d.isDirectory())all.push(...await list(p));else if(p.endsWith('.ts'))all.push(p);}return all; }
const copy=new Map(),banned=[];
const forbidden=/云端|接口|\bAPI\b|原生|桥接|缓存|上报|回读|回执|字段|契约|能力|合成|模拟|脱敏|Safari|PWA|IPA|APK|WebView|token|\bVIN\b|epoch|payload|请求|服务端|客户端|操作失败|未知错误|请稍候|暂无数据/gi;
for(const file of [...await list('src/ui'),'src/main.ts']) {
  if(file.endsWith('brand.ts'))continue;
  const source=await readFile(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  function visit(n) {
    if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)||[ts.SyntaxKind.TemplateHead,ts.SyntaxKind.TemplateMiddle,ts.SyntaxKind.TemplateTail].includes(n.kind)) {
      const text=n.text;
      if(text) for(const m of text.matchAll(/[\u3400-\u9fff][\u3400-\u9fffA-Za-z0-9% ·：，、（）. /→｜-]*/g)) {
        const term=m[0].trim(); if(!copy.has(term))copy.set(term,new Set());copy.get(term).add(file.replaceAll('\\','/'));
      }
      // Identifier strings (e.g. token), imports, SVG source and developer-only routes are not visible copy.
      if(text&&/[\u3400-\u9fff]/.test(text)&&!file.endsWith('design-lab.ts')&&!file.endsWith('about.ts')) {
        const clean=text.replaceAll('状态模拟器','');const hits=clean.match(forbidden)||[];
        if(hits.length)banned.push({file,line:ast.getLineAndCharacterOfPosition(n.pos).line+1,hits});
      }
    }
    ts.forEachChild(n,visit);
  }
  visit(ast);
}
const parity=JSON.parse(await readFile('docs/dev/verification/original-parity.json','utf8'));
const missing=[];
for(const e of parity.entries)for(const file of e.implementation)try{await readFile(file);}catch{missing.push({method:e.method,file});}
const report={contrast,styles,banned,parity:{entries:parity.entries.length,categories:new Set(parity.entries.map(e=>e.category)).size,missing}};
await writeFile(`${out}/static-checks.json`,JSON.stringify(report,null,2));
await writeFile(`${out}/copy-inventory.json`,JSON.stringify([...copy].sort(([a],[b])=>a.localeCompare(b,'zh-CN')).map(([text,files])=>({text,files:[...files]})),null,2));
const failed=contrast.some(c=>!c.passed)||styles.some(c=>c.colors.length||c.sizes.length)||banned.length||missing.length||parity.entries.length!==117;
console.log(JSON.stringify({passed:!failed,contrastChecks:contrast.length,minimumTextRatio:Math.min(...contrast.filter(c=>c.minimum===4.5).map(c=>c.ratio)),styles,banned,parity:report.parity},null,2));
if(failed)process.exitCode=1;
