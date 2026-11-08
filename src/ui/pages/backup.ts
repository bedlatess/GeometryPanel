import {ListGroup,ListRow} from '../kit';
export function backupPage(_backup:string){return ListGroup('',ListRow('导出配置','','data-action="export-preferences"')+ListRow('导入配置','','data-action="import-preferences"')+ListRow('复制配置','','data-action="copy-preferences"'))+ListGroup('',`<button class="list-row danger" data-action="reset-preferences">恢复默认</button>`);}
