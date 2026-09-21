#!/usr/bin/env node
/* gpx-core.mjs + tcx-core.mjs 를 gpx-studio.html 안에 인라인으로 심어,
 * 파일을 더블클릭만 해도 동작하게 만듭니다.
 * 둘 중 하나라도 고친 뒤에는 반드시 `node tools/build-studio.mjs` 를 실행하세요. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const START = '/* ===== GPX_CORE_INLINE_START';
const END = '/* ===== GPX_CORE_INLINE_END ===== */';

/** export 와 import 를 걷어내 브라우저에서 그대로 돌아가게 만든다 */
function inlineable(file) {
    return readFileSync(join(DIR, file), 'utf8')
        .replace(/^import\s[\s\S]*?from\s+'[^']*';\s*$/gm, '')   // 모듈 간 import 제거
        .replace(/^export\s+(const|function|let|var|class)\s/gm, '$1 ');
}

// tcx-core 가 gpx-core 의 함수를 쓰므로 순서가 중요합니다
const clean = inlineable('gpx-core.mjs') + '\n' + inlineable('tcx-core.mjs');

const html = readFileSync(join(DIR, 'gpx-studio.html'), 'utf8');
const s = html.indexOf(START);
const e = html.indexOf(END);
if (s < 0 || e < 0) {
    console.error('❌ gpx-studio.html 에서 인라인 표시자를 찾지 못했습니다.');
    process.exit(1);
}

const block = `${START} — tools/gpx-core.mjs + tcx-core.mjs 에서 자동 생성됩니다 ===== */\n${clean}\n${END}`;
writeFileSync(join(DIR, 'gpx-studio.html'), html.slice(0, s) + block + html.slice(e + END.length), 'utf8');
console.log(`✅ gpx-studio.html 갱신 완료 (${(clean.length / 1024).toFixed(1)} KB 인라인)`);
