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
    reserveBtn: ['.btn_date:has-text("예약")', 'button:has-text("예약")'],
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

    // 마크다운 모드 — 화면에 "보이는" 마크다운 편집기가 있을 때만 이미 마크다운이다.
    // (기본모드에서도 숨은 CodeMirror 가 DOM 에 있어서 개수만 세면 속는다)
    const MD_EDITORS = '.CodeMirror, .cm-editor, [class*="markdown" i] textarea, textarea[class*="markdown" i]';
    const mdVisible = () => page.evaluate(sel => [...document.querySelectorAll(sel)]
        .some(e => e.offsetParent !== null && e.getBoundingClientRect().height > 50), MD_EDITORS);
    if (!(await mdVisible())) {
        await (await first(page, SEL.modeOpen)).click();
        await (await first(page, SEL.modeMarkdown)).click();
        const until = Date.now() + 15000;
        while (!(await mdVisible())) {
            // "마크다운으로 전환하면 서식이…" 같은 확인 창이 브라우저 기본 창이 아니라 화면 안 모달일 수 있다
            const ok = page.locator('[role="dialog"] button:has-text("확인"):visible, .ReactModal__Content button:has-text("확인"):visible, .mce-window button:has-text("확인"):visible, button.btn_ok:visible').first();
            if (await ok.count()) { await ok.click().catch(() => {}); await page.waitForTimeout(500); continue; }
            if (Date.now() > until) {
                fs.writeFileSync(path.join(SHOTS, `${p.id}-page.html`), await page.content());
                await page.screenshot({ path: shot('mode') });
                throw Object.assign(new Error(`마크다운 모드로 바뀌지 않았습니다 — shots 의 ${p.id}-page.html 과 -mode.png 를 보내 주세요`), { shot: shot('mode') });
            }
            await page.waitForTimeout(300);
        }
    }

    await (await first(page, SEL.title)).fill(p.meta.title);

    // 본문 — CodeMirror 5 면 API 로, 아니면 편집기를 눌러 통째로 바꿔 넣는다
    const usedApi = await page.evaluate(({ sel, text }) => {
        const el = [...document.querySelectorAll(sel)].find(e => e.offsetParent !== null && e.getBoundingClientRect().height > 50);
        if (el?.CodeMirror) { el.CodeMirror.setValue(text); el.CodeMirror.save?.(); return el.CodeMirror.getValue().length; }
        return -1;
    }, { sel: MD_EDITORS, text: md });
    if (usedApi < 0) {
        await page.evaluate(sel => [...document.querySelectorAll(sel)]
            .find(e => e.offsetParent !== null && e.getBoundingClientRect().height > 50)
            .setAttribute('data-autopub', 'md'), MD_EDITORS);
        await page.locator('[data-autopub="md"]').click();
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Delete');
        await page.keyboard.insertText(md);
    } else if (usedApi < md.length * 0.9) {
        throw new Error(`본문이 다 들어가지 않았습니다 (${usedApi}/${md.length}자)`);
    }

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

    // 대표 이미지 — 티스토리가 본문 첫 사진(= 커버)을 저절로 대표 이미지로 잡는다.
    // 레이어에 파일 입력이 있으면 지정한 파일로 바꾸고, 없으면 자동으로 잡힌 것을 확인만 한다.
    let thumbOk = false;
    const input = layer.locator('input[type="file"]').first();
    if (thumb && await input.count()) {
        await input.setInputFiles(thumb);
        await page.waitForTimeout(3000);
    }
    thumbOk = await layer.locator('.box_thumb .thumb_g, .box_thumb img').count() > 0;

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

// 예약 날짜·시각 입력. 티스토리 발행 레이어(2026-11 확인):
//   날짜 = button.btn_reserve ("2026-11-11") → 누르면 달력, 시 = #dateHour, 분 = #dateMinute (number)
async function setReserveTime(page, layer, at) {
    const kst = new Date(at.getTime() + 9 * 3600 * 1000);
    const Y = kst.getUTCFullYear(), M = kst.getUTCMonth() + 1, D = kst.getUTCDate();
    const want = `${Y}-${String(M).padStart(2, '0')}-${String(D).padStart(2, '0')}`;
    const dateBtn = layer.locator('.btn_reserve').first();
    await dateBtn.waitFor({ timeout: 8000 });

    if ((await dateBtn.innerText()).trim() !== want) {
        await dateBtn.click();
        await page.waitForTimeout(500);
        // 달력은 레이어 안에 그려질 수도, 페이지 맨 끝(portal)에 따로 그려질 수도 있다
        const calSel = '[class*="calendar" i]:visible, [class*="datepicker" i]:visible, [class*="picker" i]:visible, [class*="layer_date" i]:visible';
        const cal = (await page.locator(calSel).count()) ? page.locator(calSel).first() : layer;
        fs.writeFileSync(path.join(SHOTS, `calendar.html`), await cal.evaluate(el => el.outerHTML).catch(() => ''));
        await page.screenshot({ path: path.join(SHOTS, `calendar.png`) }).catch(() => {});
        // 달력 머리의 "2026.11" / "2026년 11월" 을 읽어 원하는 달까지 다음 달로 넘긴다
        const readYM = () => cal.evaluate(el => {
            // 날짜 버튼("2026-11-11")과 제목은 빼고 달력 머리만 읽는다
            const c = el.cloneNode(true);
            c.querySelectorAll('.btn_reserve, .tit_publish, .layer_head, #urlPublish').forEach(x => x.remove());
            const t = c.innerText || c.textContent;
            const m = t.match(/(20\d\d)\s*[.년\-/]\s*(\d{1,2})/);
            return m ? [Number(m[1]), Number(m[2])] : null;
        });
        for (let guard = 0; guard < 24; guard++) {
            const ym = await readYM();
            if (!ym) break;
            const diff = (Y - ym[0]) * 12 + (M - ym[1]);
            if (diff === 0) break;
            const nav = cal.locator(diff > 0
                ? '[class*="next"], button:has-text("다음"), [aria-label*="다음"], [aria-label*="next" i]'
                : '[class*="prev"], button:has-text("이전"), [aria-label*="이전"], [aria-label*="prev" i]').first();
            if (!(await nav.count())) break;
            await nav.click();
            await page.waitForTimeout(250);
        }
        // 날짜 칸: 숫자만 있는 칸 중 비활성/다른 달이 아닌 것
        const cells = cal.locator('td, button, a, span').filter({ hasText: new RegExp(`^\\s*${D}\\s*$`) });
        const n = await cells.count();
        let clicked = false;
        for (let i = 0; i < n && !clicked; i++) {
            const c = cells.nth(i);
            const cls = ((await c.getAttribute('class')) || '') + ' ' + ((await c.evaluate(e => e.parentElement?.className || '')) || '');
            if (/disabled|other|prev|next|off|dimmed/i.test(cls) || !(await c.isVisible())) continue;
            await c.click();
            clicked = true;
        }
        await page.waitForTimeout(400);
        const now = (await dateBtn.innerText().catch(() => '')).trim();
        if (now !== want) throw new Error(`예약 날짜를 못 골랐습니다 (원한 날 ${want}, 지금 ${now || '?'}) — shots/calendar.html 을 보내 주세요`);
    }

    const hour = layer.locator('#dateHour'), minute = layer.locator('#dateMinute');
    if (!(await hour.count()) || !(await minute.count())) throw new Error('예약 시·분 칸(#dateHour, #dateMinute)을 못 찾았습니다');
    await hour.fill(String(kst.getUTCHours()));
    await minute.fill(String(kst.getUTCMinutes()));
    await hour.press('Tab');
    const hv = Number(await hour.inputValue()), mv = Number(await minute.inputValue());
    if (hv !== kst.getUTCHours() || mv !== kst.getUTCMinutes()) throw new Error(`예약 시각이 안 들어갔습니다 (${hv}:${mv})`);
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
