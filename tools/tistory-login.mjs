#!/usr/bin/env node
// 티스토리 로그인 세션을 파일로 저장한다 (자동 발행용). 맥에서 한 번, 세션이 풀릴 때마다 한 번.
//
//   npx -y playwright@1.49.1 install chromium   # 처음 한 번
//   node tools/tistory-login.mjs                 # 창이 뜨면 카카오로 평소처럼 로그인
//   node tools/tistory-login.mjs --channel chrome   # playwright 크로미엄 대신 PC 에 깔린 크롬으로
//
// 글 관리 화면이 열리면 창이 저절로 닫히고 tistory-state.json 이 생긴다.
// 이 파일이 있으면 누구든 블로그에 글을 쓸 수 있다 — 저장소에 올리지 말 것 (.gitignore 에 있음).
import { chromium } from 'playwright';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const ci = argv.indexOf('--channel');
const CHANNEL = ci >= 0 ? argv[ci + 1] : null; // 'chrome' 이면 PC 에 깔린 크롬을 쓴다
const BLOG = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--channel') || 'jjoyling';
const OUT = 'tistory-state.json';
const browser = await chromium.launch({ headless: false, ...(CHANNEL ? { channel: CHANNEL } : {}) });
const ctx = await browser.newContext({ locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
const page = await ctx.newPage();
await page.goto(`https://www.tistory.com/auth/login?redirectUrl=${encodeURIComponent(`https://${BLOG}.tistory.com/manage`)}`);
console.log('▶ 창에서 카카오 로그인을 마쳐 주세요 (최대 5분 기다립니다)');
await page.waitForURL(u => u.hostname === `${BLOG}.tistory.com` && u.pathname.startsWith('/manage'), { timeout: 5 * 60 * 1000 });
await ctx.storageState({ path: OUT });
fs.chmodSync(OUT, 0o600);
await browser.close();
console.log(`✅ ${OUT} 저장 완료. GitHub 시크릿에 넣을 값은 아래 명령으로 복사합니다:`);
console.log(`   base64 -i ${OUT} | pbcopy`);
console.log('   → dashboard-songhee 저장소 Settings → Secrets → TISTORY_STORAGE_STATE');
