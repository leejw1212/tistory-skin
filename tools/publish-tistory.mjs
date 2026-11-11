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
//   --start 2026-11-12 --times 13:00,18:00 을 주면 planned_date 대신, 남은 글을 그 날부터
//            하루에 시각 수만큼(여기선 2편) 차례로 채운다. 이미 예약한 글(ledger)은 건드리지 않는다.
//   글 사이 쉬는 시간: PUBLISH_GAP_MS (기본 5~10초).
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
const START = opt('start');                       // YYYY-MM-DD
const TIMES = opt('times') ? String(opt('times')).split(',').map(t => t.trim()).filter(Boolean) : null;
if (START && !/^\d{4}-\d{2}-\d{2}$/.test(String(START))) { console.error('❌ --start 는 YYYY-MM-DD'); process.exit(2); }
if (TIMES && !TIMES.every(t => /^\d{1,2}:\d{2}$/.test(t))) { console.error('❌ --times 는 13:00,18:00 꼴'); process.exit(2); }
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
function slot(p) {
    if (START && TIMES) {
        const i = posts.indexOf(p);
        const d = new Date(`${START}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + Math.floor(i / TIMES.length));
        return [d.toISOString().slice(0, 10), TIMES[i % TIMES.length]];
    }
    return p.meta.planned_date ? [p.meta.planned_date, TIME] : null;
}
function when(p) {
    const sl = slot(p);
    if (!sl) return null;
    const [h, mi] = String(sl[1]).split(':').map(Number);
    const at = new Date(`${sl[0]}T${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:00+09:00`);
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
    // 티스토리(2026-11 확인): 마크다운 모드 = .markdown-editor 안의 .CodeMirror.cm-s-tistory-markdown.
    // HTML 모드용 .cm-s-tistory-html 은 기본모드에서도 숨어 있다. 빈 편집기는 높이가 작아서 높이로는 판단하지 않는다.
    const MD_EDITORS = '.CodeMirror.cm-s-tistory-markdown, .markdown-editor .CodeMirror';
    const mdVisible = () => page.evaluate(sel => [...document.querySelectorAll(sel)]
        .some(e => e.offsetParent !== null), MD_EDITORS);
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

    // 본문 — 키보드 입력처럼 넣는다. CodeMirror.setValue() 는 화면에는 보여도 티스토리(React)가
    // 들고 있는 값이 안 바뀌어서 빈 글로 발행됐다 (2026-11-11). 입력 이벤트로 넣어야 저장된다.
    await page.evaluate(sel => [...document.querySelectorAll(sel)]
        .find(e => e.offsetParent !== null)
        .setAttribute('data-autopub', 'md'), MD_EDITORS);
    await page.locator('[data-autopub="md"] .CodeMirror-lines, [data-autopub="md"]').first().click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    await page.keyboard.insertText(md);
    await page.waitForTimeout(800);
    const got = await page.evaluate(() => {
        const el = document.querySelector('[data-autopub="md"]');
        return el?.CodeMirror ? el.CodeMirror.getValue() : (el?.innerText || '');
    });
    const norm = t => t.replace(/\s+/g, '');
    if (norm(got).length < norm(md).length * 0.95) throw new Error(`본문이 다 들어가지 않았습니다 (${norm(got).length}/${norm(md).length}자)`);

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

    // 발행 — 버튼을 누른 뒤 /manage/ 로 가는 POST 응답을 모아, 글 주소를 찾고 기록으로 남긴다
    const seen = [];
    // 발행 요청 본문에 글 내용이 실려 가는지 본다 (빈 글 발행을 바로 잡아내기 위해).
    // 티스토리는 마크다운을 HTML 로 바꿔 보내므로 [링크](주소)·**굵게** 같은 문법이 든
    // 문장을 그대로 찾으면 못 찾는다 (실제로 본문이 잘 올라간 글을 빈 글로 오판했다).
    // 그래서 마크다운 문법을 걷어 낸 본문에서 한글 낱말 몇 개를 골라, 그중 하나라도
    // 실려 가면 본문이 있는 것으로 본다. \uXXXX 로 이스케이프돼 가는 경우도 본다.
    const plain = md
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
    // 제목·태그에도 있는 낱말은 빈 글이어도 요청에 실리니 뺀다.
    const meta = `${p.meta.title || ''} ${(p.meta.tags || []).join(' ')}`;
    const probes = [...new Set(plain.match(/[가-힣]{4,}/g) || [])].filter(w => !meta.includes(w)).slice(0, 5);
    const esc = w => [...w].map(c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).join('');
    let carried = null;
    const onReq = r => {
        if (r.method() !== 'POST' || !/\/manage\//.test(r.url())) return;
        const data = r.postData() || '';
        let dec = data; try { dec = decodeURIComponent(data.replace(/\+/g, ' ')); } catch { /* 그대로 */ }
        const low = data.toLowerCase();
        if (!probes.length || probes.some(w => data.includes(w) || dec.includes(w) || low.includes(esc(w)))) carried = true;
        else if (carried === null) carried = false;
    };
    page.on('request', onReq);
    const onRes = async r => {
        if (r.request().method() !== 'POST' || !/\/manage\//.test(r.url())) return;
        let text = '';
        try { text = await r.text(); } catch { /* 본문 없음 */ }
        seen.push({ url: r.url(), status: r.status(), body: text.slice(0, 4000) });
    };
    page.on('response', onRes);
    await (await first(page, SEL.publish)).click();
    // 발행되면 티스토리가 글 관리 화면으로 넘긴다
    const left = await page.waitForURL(u => !/\/manage\/newpost/.test(String(u)), { timeout: 30000 }).then(() => true).catch(() => false);
    await page.waitForTimeout(1500);
    page.off('response', onRes);
    page.off('request', onReq);
    fs.writeFileSync(path.join(SHOTS, `${p.id}-response.json`), JSON.stringify({ left, pageUrl: page.url(), seen }, null, 2));

    // 응답 안에서 글 주소/번호를 찾는다 (entryUrl, /entry/..., "id":219 등)
    let url = null;
    for (const r of seen) {
        let j = null; try { j = JSON.parse(r.body); } catch { /* JSON 아님 */ }
        const find = o => {
            if (!o || typeof o !== 'object') return null;
            for (const k of ['entryUrl', 'url', 'permalink']) if (typeof o[k] === 'string' && /tistory\.com\/(entry\/|\d)/.test(o[k])) return o[k];
            for (const k of ['entryId', 'id', 'postId']) if (/^\d+$/.test(String(o[k] ?? ''))) return `${BASE}/${o[k]}`;
            for (const v of Object.values(o)) { const f = find(v); if (f) return f; }
            return null;
        };
        url = find(j) || (r.body.match(/https?:\/\/[a-z0-9-]+\.tistory\.com\/(?:entry\/[^"'\s]+|\d+)/i) || [])[0] || null;
        if (url) break;
    }
    const okRes = seen.some(r => r.status >= 200 && r.status < 300);
    if (carried === false) {
        throw Object.assign(new Error('발행 요청에 본문이 실려 가지 않았습니다 — 빈 글로 올라갔을 수 있으니 글 관리에서 지워 주세요'), { unsure: true, fatal: true });
    }
    if (!left && !okRes) {
        await page.screenshot({ path: shot('3-after'), fullPage: false });
        throw Object.assign(new Error('발행이 됐는지 확인하지 못했습니다 — 티스토리 글 관리에서 확인 필요'), { shot: shot('3-after'), unsure: true });
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
        await page.waitForTimeout(Number(process.env.PUBLISH_GAP_MS ?? 5000 + Math.random() * 5000));
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
