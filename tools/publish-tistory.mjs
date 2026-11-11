#!/usr/bin/env node
// 티스토리 글쓰기 화면을 Playwright 로 대신 조작해 글을 (예약) 발행한다.
//
// 티스토리 Open API 는 2024년에 글쓰기가 닫혔다. 그래서 사람이 하던 순서를 그대로 흉내 낸다:
//   글쓰기 → 마크다운 모드 → 제목·본문·카테고리·태그 → 완료 → 공개 범위·예약 시각·대표 이미지 → 발행
//
// 로그인은 자동화하지 않는다 (카카오 2단계·기기 인증). tools/tistory-login.mjs 로 한 번 로그인해
// 만든 세션 파일(storageState)을 --state 로 넘긴다.
//
//   node tools/publish-tistory.mjs --state ~/tistory-publisher/state.json \
//        --dir migrated --ledger ~/tistory-publisher/done.json [--dry-run] [--limit 1] [--only <폴더>]
//
// 글 고르는 법: <dir>/*/meta.json 중 tistory_url 이 비어 있고, ledger 에도 없는 글을 이름순으로.
// 발행 시각: meta.json 의 planned_date (YYYY-MM-DD) + --time (기본 09:00, 한국 시간).
//            그 시각이 이미 지났으면 바로 발행한다.
//
// --dry-run 은 발행 버튼만 빼고 전부 입력한 뒤 화면을 찍고 글을 저장하지 않고 나간다.
// 결과는 한 줄씩 `RESULT {json}` 으로 찍는다 (워크플로 로그에서 읽기 쉽게).
// TELEGRAM_BOT_TOKEN · TELEGRAM_OWNER_ID 가 있으면 결과와 (실패·dry-run 일 때) 스크린샷을 보낸다.

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

// ---------- 인자 ----------
const args = process.argv.slice(2);
const opt = (name, def) => {
    const i = args.indexOf('--' + name);
    if (i < 0) return def;
    const v = args[i + 1];
    return v === undefined || v.startsWith('--') ? true : v;
};
const BLOG = opt('blog', 'jjoyling');
const STATE = opt('state');
const DIR = opt('dir', 'migrated');
const LEDGER = opt('ledger', path.join(path.dirname(STATE || '.'), 'done.json'));
const SHOTS = opt('shots', path.join(path.dirname(STATE || '.'), 'shots'));
const TIME = opt('time', '09:00');
const VISIBILITY = opt('visibility', 'public'); // public | private
const LIMIT = Number(opt('limit', 1000));
const ONLY = opt('only');
const DRY = !!opt('dry-run', false);
const HEADED = !!opt('headed', false);
const BASE = opt('base', `https://${BLOG}.tistory.com`); // 시험용 가짜 화면을 띄울 때만 바꾼다

if (!STATE || !fs.existsSync(STATE)) {
    console.error('❌ --state 세션 파일이 없습니다. tools/tistory-login.mjs 로 먼저 만드세요.');
    process.exit(2);
}

// ---------- 화면 요소 ----------
// 티스토리가 화면을 바꾸면 여기만 고친다. 각 항목은 앞에서부터 차례로 시도한다.
const SEL = {
    title: ['#post-title-inp', 'textarea[placeholder*="제목"]'],
    modeOpen: ['#editor-mode-layer-btn-open', 'button:has-text("기본모드")'],
    modeMarkdown: ['#editor-mode-markdown', 'text=마크다운'],
    codemirror: ['.CodeMirror'],
    categoryBtn: ['#category-btn', 'button:has-text("카테고리")'],
    categoryItem: ['#category-list [role="option"]', '#category-list .mce-menu-item', '#category-list li'],
    tag: ['#tagText', 'input[placeholder*="태그"]'],
    done: ['#publish-layer-btn', 'button:has-text("완료")'],
    layer: ['.editor_layer', '#publish-layer', '[class*="layer_post"]'],
    visPublic: ['#open20', 'label:has-text("공개")'],
    visPrivate: ['#open0', 'label:has-text("비공개")'],
    reserveBtn: ['button:has-text("예약")', 'label:has-text("예약")'],
    publish: ['#publish-btn', 'button:has-text("발행")'],
};

async function first(page, list, { timeout = 8000, visible = true } = {}) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        for (const s of list) {
            const loc = page.locator(s).first();
            try {
                if (await loc.count() && (!visible || await loc.isVisible())) return loc;
            } catch { /* 다음 후보 */ }
        }
        await page.waitForTimeout(250);
    }
    throw new Error('화면 요소를 못 찾음: ' + list.join(' | '));
}

// ---------- 글 목록 ----------
const ledger = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, 'utf8')) : {};
const saveLedger = () => fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));

function loadPosts() {
    return fs.readdirSync(DIR, { withFileTypes: true })
        .filter(d => d.isDirectory() && fs.existsSync(path.join(DIR, d.name, 'meta.json')))
        .map(d => {
            const folder = path.join(DIR, d.name);
            const meta = JSON.parse(fs.readFileSync(path.join(folder, 'meta.json'), 'utf8'));
            return { id: d.name, folder, meta };
        })
        .filter(p => !p.meta.tistory_url && !ledger[p.id])
        .filter(p => !ONLY || p.id === ONLY)
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, LIMIT);
}

// 대표 이미지: meta.thumbnail → 본문 첫 사진(jsDelivr 주소를 저장소 경로로 되돌림)
function thumbnailPath(p, md) {
    const pick = p.meta.thumbnail || (md.match(/!\[[^\]]*\]\(([^)\s]+)\)/) || [])[1];
    if (!pick) return null;
    const m = pick.match(/tistory-skin@[^/]+\/(.+)$/);
    const rel = m ? m[1] : pick;
    const abs = path.isAbsolute(rel) ? rel : rel.includes('/') ? path.resolve(rel) : path.join(p.folder, rel);
    return fs.existsSync(abs) ? abs : null;
}

// KST 기준 예약 시각
function when(p) {
    if (!p.meta.planned_date) return null;
    const [h, mi] = String(TIME).split(':').map(Number);
    const at = new Date(`${p.meta.planned_date}T${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:00+09:00`);
    return at.getTime() > Date.now() + 10 * 60 * 1000 ? at : null; // 10분 안쪽·과거면 즉시 발행
}

// ---------- 텔레그램 ----------
const TG = process.env.TELEGRAM_BOT_TOKEN, TG_TO = process.env.TELEGRAM_OWNER_ID;
async function tg(text, photo) {
    if (!TG || !TG_TO) return;
    try {
        if (photo && fs.existsSync(photo)) {
            const fd = new FormData();
            fd.append('chat_id', TG_TO);
            fd.append('caption', text.slice(0, 1000));
            fd.append('photo', new Blob([fs.readFileSync(photo)]), path.basename(photo));
            await fetch(`https://api.telegram.org/bot${TG}/sendPhoto`, { method: 'POST', body: fd });
        } else {
            await fetch(`https://api.telegram.org/bot${TG}/sendMessage`, {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ chat_id: TG_TO, text, disable_web_page_preview: true }),
            });
        }
    } catch (e) { console.error('텔레그램 실패:', e.message); }
}

// ---------- 한 편 ----------
async function publishOne(page, p) {
    const md = fs.readFileSync(path.join(p.folder, 'post.md'), 'utf8');
    const [catParent, catLeaf] = String(p.meta.category || '').split('/');
    const tags = p.meta.tags || [];
    const at = when(p);
    const thumb = thumbnailPath(p, md);
    const shot = name => path.join(SHOTS, `${p.id}-${name}.png`);
    fs.mkdirSync(SHOTS, { recursive: true });

    await page.goto(`${BASE}/manage/newpost/`, { waitUntil: 'domcontentloaded' });
    if (/accounts\.kakao|tistory\.com\/auth\/login/.test(page.url())) {
        throw Object.assign(new Error('로그인이 풀렸습니다 — tistory-login.mjs 로 세션을 다시 만들어 주세요'), { fatal: true });
    }

    // 마크다운 모드 (이미 마크다운이면 건너뜀)
    if (!(await page.locator('.CodeMirror').count())) {
        await (await first(page, SEL.modeOpen)).click();
        await (await first(page, SEL.modeMarkdown)).click();
    }
    await first(page, SEL.codemirror, { timeout: 15000, visible: false });

    await (await first(page, SEL.title)).fill(p.meta.title);
    await page.evaluate(text => document.querySelector('.CodeMirror').CodeMirror.setValue(text), md);

    // 카테고리 — 하위 이름으로 고른다 (목록에는 "- AI·에이전트" 처럼 보인다)
    if (catLeaf || catParent) {
        const want = (catLeaf || catParent).trim();
        await (await first(page, SEL.categoryBtn)).click();
        const items = page.locator(SEL.categoryItem.join(', '));
        await items.first().waitFor({ timeout: 8000 });
        const n = await items.count();
        let hit = null;
        for (let i = 0; i < n; i++) {
            const t = (await items.nth(i).innerText()).replace(/^[\s\-–·]+/, '').trim();
            if (t === want) { hit = items.nth(i); break; }
        }
        if (!hit) throw new Error(`카테고리 "${want}" 가 티스토리에 없습니다 — 관리 화면에서 먼저 만들어 주세요`);
        await hit.click();
    }

    // 태그
    if (tags.length) {
        const tagBox = await first(page, SEL.tag);
        for (const t of tags) { await tagBox.fill(t); await tagBox.press('Enter'); }
    }

    await page.screenshot({ path: shot('1-editor'), fullPage: false });

    // 완료 → 발행 레이어
    await (await first(page, SEL.done)).click();
    const layer = await first(page, SEL.layer, { timeout: 10000 });

    await (await first(page, VISIBILITY === 'private' ? SEL.visPrivate : SEL.visPublic)).click();

    // 대표 이미지 — 레이어 안의 파일 입력에 원본 파일을 넣는다
    let thumbOk = false;
    if (thumb) {
        const input = layer.locator('input[type="file"]').first();
        if (await input.count()) {
            await input.setInputFiles(thumb);
            await page.waitForTimeout(3000);
            thumbOk = true;
        }
    }

    // 예약
    if (at) {
        await (await first(page, SEL.reserveBtn)).click();
        await page.waitForTimeout(800);
        // 화면 구조가 다를 때 고칠 수 있게 발행 레이어를 통째로 남긴다
        fs.writeFileSync(path.join(SHOTS, `${p.id}-layer.html`), await layer.evaluate(el => el.outerHTML).catch(() => ''));
        await setReserveTime(page, layer, at);
    }

    await page.screenshot({ path: shot('2-layer'), fullPage: false });

    const base = { id: p.id, title: p.meta.title, category: p.meta.category, at: at ? at.toISOString() : 'now', thumbnail: thumb ? path.basename(thumb) : null, thumbOk };
    if (DRY) return { ...base, dryRun: true, shot: shot('2-layer') };

    // 발행 — 저장 요청의 응답에서 글 번호를 읽는다
    const resP = page.waitForResponse(r => /\/manage\/post/.test(r.url()) && r.request().method() === 'POST', { timeout: 30000 }).catch(() => null);
    await (await first(page, SEL.publish)).click();
    const res = await resP;
    let body = null;
    try { body = res ? await res.json() : null; } catch { /* JSON 아님 */ }
    const url = body?.entryUrl || body?.url || (body?.id || body?.entryId ? `${BASE}/${body.id || body.entryId}` : null);
    if (!res || !res.ok() || !url) {
        await page.screenshot({ path: shot('3-after'), fullPage: false });
        throw Object.assign(new Error(`발행 응답을 확인하지 못했습니다 (status ${res?.status()}) — 티스토리 글 관리에서 실제로 올라갔는지 확인 필요`), { shot: shot('3-after'), unsure: true });
    }
    return { ...base, url };
}

// 예약 날짜·시각 입력. 티스토리 레이어는 날짜 input 하나와 시·분 입력(또는 select)으로 되어 있다.
async function setReserveTime(page, layer, at) {
    const kst = new Date(at.getTime() + 9 * 3600 * 1000);
    const date = kst.toISOString().slice(0, 10);
    const hh = String(kst.getUTCHours()).padStart(2, '0');
    const mm = String(kst.getUTCMinutes()).padStart(2, '0');
    const inputs = layer.locator('input:visible:not([type="radio"]):not([type="file"]):not([type="checkbox"])');
    const n = await inputs.count();
    let dateSet = false, hourSet = false, minSet = false;
    for (let i = 0; i < n; i++) {
        const el = inputs.nth(i);
        const v = (await el.inputValue().catch(() => '')) || '';
        if (!dateSet && /\d{4}[-.]\d{1,2}[-.]\d{1,2}/.test(v)) { await el.fill(date.replace(/-/g, v.includes('.') ? '.' : '-')); dateSet = true; continue; }
        if (dateSet && !hourSet && /^\d{1,2}$/.test(v)) { await el.fill(hh); hourSet = true; continue; }
        if (hourSet && !minSet && /^\d{1,2}$/.test(v)) { await el.fill(mm); minSet = true; }
    }
    const selects = layer.locator('select:visible');
    for (let i = 0, k = await selects.count(); i < k && (!hourSet || !minSet); i++) {
        const s = selects.nth(i);
        if (!hourSet) { await s.selectOption({ value: hh }).catch(() => s.selectOption({ label: hh })); hourSet = true; }
        else if (!minSet) { await s.selectOption({ value: mm }).catch(() => s.selectOption({ label: mm })); minSet = true; }
    }
    if (!dateSet || !hourSet) throw new Error(`예약 시각 칸을 못 찾았습니다 (날짜 ${dateSet}, 시 ${hourSet}, 분 ${minSet})`);
}

// ---------- 실행 ----------
const posts = loadPosts();
console.log(`▶ 대상 ${posts.length}편${DRY ? ' (dry-run)' : ''} · 공개 범위 ${VISIBILITY}`);
if (!posts.length) process.exit(0);

const CHANNEL = opt('channel'); // 'chrome' 이면 PC 에 깔린 크롬을 쓴다 (playwright install 생략 가능)
const browser = await chromium.launch({ headless: !HEADED, ...(CHANNEL ? { channel: CHANNEL } : {}) });
const ctx = await browser.newContext({ storageState: STATE, locale: 'ko-KR', timezoneId: 'Asia/Seoul', viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
page.on('dialog', d => d.message().includes('저장된 글') ? d.dismiss() : d.accept()); // 임시저장 이어쓰기는 거절, 모드 전환 확인은 수락

let ok = 0, fail = 0;
for (const p of posts) {
    try {
        const r = await publishOne(page, p);
        console.log('RESULT ' + JSON.stringify(r));
        if (!DRY) { ledger[p.id] = r; saveLedger(); }
        ok++;
        if (DRY) await tg(`🧪 dry-run: ${p.meta.title}\n예약 ${r.at} · 썸네일 ${r.thumbOk ? r.thumbnail : '없음'}`, r.shot);
        // 사람 속도로 — 연달아 몰아치지 않는다
        await page.waitForTimeout(Number(process.env.PUBLISH_GAP_MS ?? 20000 + Math.random() * 20000));
    } catch (e) {
        fail++;
        const shot = e.shot || path.join(SHOTS, `${p.id}-error.png`);
        if (!e.shot) await page.screenshot({ path: shot }).catch(() => {});
        console.log('RESULT ' + JSON.stringify({ id: p.id, title: p.meta.title, error: e.message, unsure: !!e.unsure }));
        if (e.unsure) { ledger[p.id] = { unsure: true, error: e.message }; saveLedger(); } // 두 번 올라가지 않게
        await tg(`❌ 티스토리 발행 실패: ${p.meta.title}\n${e.message}`, shot);
        if (e.fatal || e.unsure) break;
    }
}

await browser.close();
const summary = `티스토리 ${DRY ? 'dry-run' : '발행'}: 성공 ${ok} · 실패 ${fail} (대상 ${posts.length})`;
console.log('▶ ' + summary);
if (!DRY) await tg('📮 ' + summary);
process.exit(fail ? 1 : 0);
