#!/usr/bin/env node
/* =========================================================================
 * gpx/*.tcx · gpx/*.gpx  →  images/courses.json
 * -------------------------------------------------------------------------
 *   사용법:  node tools/build-courses.mjs
 *
 *   1. gpx/ 폴더에 활동 파일(.tcx 또는 .gpx)을 넣습니다.
 *      애플 헬스 → RunGap → Dropbox 로 올라오는 건 .tcx 입니다.
 *   2. 이 스크립트를 실행하면
 *        - 거리 / 상승고도 / 소요시간 / 난이도 / 지역을 자동 계산하고
 *        - 좌표를 압축(Encoded Polyline)해 images/courses.json 을 만듭니다.
 *        - gpx/out/<id>.md 에 글에 붙여넣을 마크다운 표를 만들어 둡니다.
 *   3. images/courses.json 을 티스토리 스킨 파일업로드에 올리면 끝.
 *
 *   glink(글 주소)·제목을 직접 지정하려면 gpx/meta.json 을 사용하세요.
 *   기존 images/courses.json 에 적어둔 link 는 다시 빌드해도 보존됩니다.
 * ========================================================================= */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gpxToCourse, courseMarkdown, slugify, formatDuration } from './gpx-core.mjs';
import { tcxToCourse, isTcx } from './tcx-core.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GPX_DIR = join(ROOT, 'gpx');
const OUT_DIR = join(GPX_DIR, 'out');
const TARGET = join(ROOT, 'images', 'courses.json');

function readJson(path, fallback) {
    try { return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback; }
    catch (e) {
        console.warn(`⚠️  ${basename(path)} 를 읽지 못했습니다: ${e.message}`);
        return fallback;
    }
}

function main() {
    if (!existsSync(GPX_DIR)) {
        console.error('❌ gpx/ 폴더가 없습니다. 먼저 폴더를 만들고 .gpx 파일을 넣어주세요.');
        process.exit(1);
    }

    const files = readdirSync(GPX_DIR).filter(f => /\.(tcx|gpx)$/i.test(f)).sort();
    if (!files.length) {
        console.error('❌ gpx/ 폴더에 .tcx 또는 .gpx 파일이 없습니다.');
        process.exit(1);
    }

    const meta = readJson(join(GPX_DIR, 'meta.json'), {});
    const metaCourses = meta.courses || {};
    const previous = readJson(TARGET, {});
    const prevById = new Map((previous.courses || []).map(c => [c.id, c]));

    const courses = [];
    const rows = [];

    for (const file of files) {
        const id = slugify(file);
        const override = metaCourses[file] || metaCourses[id] || {};
        const prev = prevById.get(override.id || id);

        let result;
        try {
            const xml = readFileSync(join(GPX_DIR, file), 'utf8');
            // 내용을 보고 TCX / GPX 를 고릅니다 (확장자만 믿지 않습니다)
            result = isTcx(xml)
                ? tcxToCourse(xml, file, { id, ...override })
                : gpxToCourse(xml, file, { id, ...override });
        } catch (e) {
            console.warn(`⚠️  건너뜀 — ${e.message}`);
            continue;
        }

        const { course, rawPoints, keptPoints, pace } = result;

        // 걷기·실내운동은 코스 목록에 넣지 않습니다
        if (result.classification && result.classification.kind !== 'run') {
            console.warn(`⚠️  건너뜀 — ${file}: ${result.classification.kind} (${result.classification.reason || ''})`);
            continue;
        }

        // 이전 빌드에서 손으로 채운 값은 유지
        if (!course.link && prev?.link) course.link = prev.link;
        if (!course.note && prev?.note) course.note = prev.note;
        if (!override.title && prev?.titleLocked) course.title = prev.title;

        courses.push(course);
        rows.push({
            제목: course.title,
            거리: `${course.distance}km`,
            시간: formatDuration(course.duration) || '-',
            페이스: pace || '-',
            고도: course.elevGain != null ? `${course.elevGain}m` : '-',
            난이도: '★'.repeat(course.difficulty),
            심박: result.heartRate?.avg ? `${result.heartRate.avg}` : '-',
            지역: course.region,
            점: `${rawPoints}→${keptPoints}`,
            글주소: course.link || '(미지정)'
        });

        if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
        writeFileSync(join(OUT_DIR, `${course.id}.md`), courseMarkdown(course, pace), 'utf8');
    }

    if (!courses.length) {
        console.error('❌ 변환된 코스가 없습니다.');
        process.exit(1);
    }

    // 맛집: meta.json 우선, 없으면 기존 courses.json 유지
    const restaurants = meta.restaurants || previous.restaurants || [];

    const output = {
        version: 1,
        generated: new Date().toISOString(),
        courses,
        restaurants
    };

    writeFileSync(TARGET, JSON.stringify(output, null, 2) + '\n', 'utf8');

    console.table(rows);
    const totalKm = courses.reduce((s, c) => s + c.distance, 0);
    console.log(`\n✅ images/courses.json 생성 완료 — 코스 ${courses.length}개 · 총 ${totalKm.toFixed(1)}km · 맛집 ${restaurants.length}곳`);
    console.log(`   파일 크기: ${(JSON.stringify(output).length / 1024).toFixed(1)} KB`);
    console.log(`📝 글에 붙여넣을 표: gpx/out/*.md`);
    console.log(`\n다음 단계 → 티스토리 [스킨 편집 > 파일 업로드] 에 images/courses.json 을 올리세요.`);

    const missing = courses.filter(c => !c.link);
    if (missing.length) {
        console.log(`\nℹ️  글 주소가 비어 있는 코스 ${missing.length}개 — 글을 발행한 뒤 gpx/meta.json 에 이렇게 적어주세요:`);
        console.log(JSON.stringify({
            courses: Object.fromEntries(missing.slice(0, 2).map(c => [c.id, { link: '/12' }]))
        }, null, 2));
        console.log('   link 는 글을 발행하면 생기는 주소입니다 — 예: /12 또는 /entry/여의도-한강-5k');
        console.log('   (비워두면 지도에서 코스를 눌렀을 때 제목으로 블로그 내 검색이 열립니다)');
    }
}

main();
