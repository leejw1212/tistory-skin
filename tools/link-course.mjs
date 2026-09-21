#!/usr/bin/env node
/* =========================================================================
 * 발행한 글 주소를 지도 코스에 연결합니다
 * -------------------------------------------------------------------------
 *   사용법:
 *     node tools/link-course.mjs                            코스 목록과 연결 상태 보기
 *     node tools/link-course.mjs run-2026-09-21-0828 213     그 코스에 /213 을 연결
 *     node tools/link-course.mjs 여의도 213 --title "여의도 한강 4K"
 *                                                           연결하면서 코스 이름도 정함
 *     node tools/link-course.mjs 여의도 --title "여의도 한강 4K"   이름만 바꿈
 *     node tools/link-course.mjs 여의도 --clear              연결을 지움
 *
 *   --title 로 정한 이름은 잠깁니다. 다시 빌드해도 그대로 남습니다.
 *
 *   코스는 아이디 전체를 적지 않아도 됩니다. 제목이나 아이디의 일부만 주면
 *   찾아서 연결하고, 여럿이 걸리면 후보를 보여주고 멈춥니다.
 *
 *   글 주소는 어떤 모양으로 줘도 `/213` 형태로 바뀝니다.
 *     213  ·  /213  ·  https://jjoyling.tistory.com/213
 *
 *   두 곳에 같이 씁니다.
 *     - images/courses.json   지금 올릴 파일. 다시 빌드하지 않아도 됩니다.
 *     - gpx/meta.json         다음에 빌드해도 연결이 남게 하는 기록.
 * ========================================================================= */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COURSES = join(ROOT, 'images', 'courses.json');
const META = join(ROOT, 'gpx', 'meta.json');

function readJson(path, fallback) {
    try { return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback; }
    catch (e) {
        console.error(`❌ ${path} 를 읽지 못했습니다: ${e.message}`);
        process.exit(1);
    }
}

function writeJson(path, value) {
    writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

/** 213 · /213 · https://블로그/213 · /entry/제목  →  /213 꼴로 */
function normalizeLink(raw) {
    const text = String(raw).trim();
    if (!text) return '';

    let path = text;
    if (/^https?:\/\//i.test(text)) {
        try { path = new URL(text).pathname; }
        catch { console.error(`❌ 주소를 알아볼 수 없습니다: ${text}`); process.exit(1); }
    }
    if (/^\d+$/.test(path)) path = `/${path}`;
    if (!path.startsWith('/')) path = `/${path}`;

    // 글 주소는 숫자(/213) 아니면 /entry/... 둘 중 하나입니다
    if (!/^\/(\d+|entry\/.+)$/.test(path)) {
        console.error(`❌ 글 주소 모양이 아닙니다: ${path}`);
        console.error('   러닛 블로그의 글 주소는 숫자입니다 — 예: 213 또는 /213');
        process.exit(1);
    }
    return path;
}

function listCourses(courses) {
    if (!courses.length) {
        console.log('지도에 코스가 없습니다. 먼저 `node tools/build-courses.mjs` 를 실행하세요.');
        return;
    }
    console.log(`📍 코스 ${courses.length}개\n`);
    for (const c of courses) {
        const mark = c.link ? '🔗' : '  ';
        const link = c.link ? c.link : '(연결 안 됨)';
        console.log(`${mark} ${c.id}`);
        console.log(`     ${c.title} · ${c.distance}km · ${c.date} · ${link}`);
    }
    const missing = courses.filter(c => !c.link);
    if (missing.length) {
        console.log(`\n연결할 코스가 ${missing.length}개 남았습니다:`);
        console.log(`   node tools/link-course.mjs ${missing[0].id} 213`);
    }
}

/** 아이디 정확히 → 아이디 부분일치 → 제목 부분일치 순으로 찾습니다 */
function findCourse(courses, query) {
    const needle = query.toLowerCase();
    const exact = courses.filter(c => c.id.toLowerCase() === needle);
    if (exact.length) return exact;

    const hits = courses.filter(c =>
        c.id.toLowerCase().includes(needle) || (c.title || '').toLowerCase().includes(needle));
    return hits;
}

function main() {
    const args = process.argv.slice(2);

    const data = readJson(COURSES, null);
    if (!data) {
        console.error('❌ images/courses.json 이 없습니다.');
        console.error('   먼저 gpx/ 에 활동 파일을 넣고 `node tools/build-courses.mjs` 를 실행하세요.');
        process.exit(1);
    }
    const courses = data.courses || [];

    if (!args.length) {
        listCourses(courses);
        return;
    }

    const [query, ...rest] = args;
    const clearing = rest.includes('--clear');

    const titleAt = rest.indexOf('--title');
    const title = titleAt >= 0 ? rest[titleAt + 1] : undefined;
    if (titleAt >= 0 && (title === undefined || title.startsWith('--'))) {
        console.error('❌ --title 뒤에 이름이 빠졌습니다 — 예: --title "여의도 한강 4K"');
        process.exit(1);
    }

    // --title 의 값은 글 주소가 아닙니다 (--title 이 없으면 걸러낼 것도 없습니다)
    const titleValueAt = titleAt >= 0 ? titleAt + 1 : -1;
    const value = rest.find((a, i) => !a.startsWith('--') && i !== titleValueAt);

    if (!clearing && value === undefined && title === undefined) {
        console.error('❌ 글 주소가 빠졌습니다 — 예: node tools/link-course.mjs 여의도 213');
        console.error('   이름만 바꾸려면 --title, 연결을 지우려면 --clear 를 주세요.');
        process.exit(1);
    }

    const hits = findCourse(courses, query);
    if (!hits.length) {
        console.error(`❌ "${query}" 에 맞는 코스가 없습니다.\n`);
        listCourses(courses);
        process.exit(1);
    }
    if (hits.length > 1) {
        console.error(`❌ "${query}" 에 ${hits.length}개가 걸립니다. 더 정확히 적어주세요.\n`);
        for (const c of hits) console.error(`   ${c.id}  (${c.title})`);
        process.exit(1);
    }

    const course = hits[0];
    const before = course.link || '';
    const beforeTitle = course.title;

    const touchesLink = clearing || value !== undefined;
    const link = clearing ? '' : (value !== undefined ? normalizeLink(value) : before);

    if (link === before && (title === undefined || title === beforeTitle)) {
        console.log(`이미 그대로입니다 — ${course.title} → ${link || '(연결 안 됨)'}`);
        return;
    }

    // 1. 지금 올릴 파일
    if (touchesLink) course.link = link;
    if (title !== undefined) {
        course.title = title;
        course.titleLocked = true;   // 다시 빌드해도 이름이 되돌아가지 않도록
    }
    writeJson(COURSES, data);

    // 2. 다시 빌드해도 남도록
    const meta = readJson(META, {});
    meta.courses = meta.courses || {};
    const entry = { ...(meta.courses[course.id] || {}) };
    if (touchesLink) entry.link = link;
    if (title !== undefined) entry.title = title;
    meta.courses[course.id] = entry;
    writeJson(META, meta);

    if (title !== undefined && title !== beforeTitle) {
        console.log(`✏️  이름: ${beforeTitle} → ${title}`);
    }
    if (clearing) {
        console.log(`🔗 연결을 지웠습니다 — ${course.title}`);
    } else if (touchesLink) {
        console.log(`🔗 ${course.title} → ${link}`);
        if (before) console.log(`   (이전: ${before})`);
    }
    console.log(`   images/courses.json · gpx/meta.json 에 함께 적었습니다.`);

    const missing = courses.filter(c => !c.link);
    if (missing.length) {
        console.log(`\nℹ️  아직 연결 안 된 코스 ${missing.length}개: ${missing.map(c => c.id).join(', ')}`);
    } else {
        console.log(`\n✅ 모든 코스가 글에 연결됐습니다.`);
    }
    console.log(`\n다음 단계 → 티스토리 [스킨 편집 > 파일 업로드] 에 images/courses.json 을 올리세요.`);
}

main();
