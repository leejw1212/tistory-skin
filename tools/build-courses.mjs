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
import { gpxToCourse, courseMarkdown, slugify, formatDuration, REGIONS } from './gpx-core.mjs';
import { tcxToCourse, isTcx } from './tcx-core.mjs';

/* RunGap 이 내보내는 이름: 2026-09-21_08-28-48_hk_1789946928.tcx
   그대로 두면 지도에 이 문자열이 코스 이름으로 뜹니다. 읽을 수 있게 바꿉니다. */
const RUNGAP = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-\d{2}_[a-z]+_\d+$/i;

function stemOf(file) { return file.replace(/\.(tcx|gpx)$/i, ''); }

/** RunGap 파일명 → run-2026-09-21-0828 (파일명만으로 정해집니다) */
function prettyId(file) {
    const m = stemOf(file).match(RUNGAP);
    return m ? `run-${m[1]}-${m[2]}-${m[3]}-${m[4]}${m[5]}` : null;
}

/** 빌드된 코스 → "2026-09-21 경기 4K" — 장소명은 아직 못 붙이므로 날짜·지역·거리로 */
function prettyTitle(course) {
    const region = REGIONS[course.region]?.label || '';
    const km = String(Number(course.distance.toFixed(1))).replace(/\.0$/, '');
    return [course.date, region, `${km}K`].filter(Boolean).join(' ');
}

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

    // sample* 은 저장소에 딸려 오는 예시입니다. 실제 지도에는 넣지 않습니다.
    // 예시까지 보고 싶으면 --with-sample 을 주세요.
    const withSample = process.argv.includes('--with-sample');
    const all = readdirSync(GPX_DIR).filter(f => /\.(tcx|gpx)$/i.test(f)).sort();
    const files = withSample ? all : all.filter(f => !/^sample/i.test(f));

    if (!files.length) {
        if (all.length) {
            console.error('❌ gpx/ 에 예시 파일(sample*)밖에 없습니다.');
            console.error('   본인 활동 파일(.tcx 또는 .gpx)을 넣거나, 예시로 시험만 하려면 --with-sample 을 주세요.');
        } else {
            console.error('❌ gpx/ 폴더에 .tcx 또는 .gpx 파일이 없습니다.');
        }
        process.exit(1);
    }

    const meta = readJson(join(GPX_DIR, 'meta.json'), {});
    const metaCourses = meta.courses || {};
    const previous = readJson(TARGET, {});
    const prevById = new Map((previous.courses || []).map(c => [c.id, c]));

    const courses = [];
    const rows = [];

    for (const file of files) {
        const id = prettyId(file) || slugify(file);
        const override = metaCourses[file] || metaCourses[id] || metaCourses[slugify(file)] || {};
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
        if (!override.title && prev?.titleLocked) {
            course.title = prev.title;
            course.titleLocked = true;
        } else if (!override.title && course.title === stemOf(file)) {
            // 이름을 아무도 정해주지 않았습니다 — 파일명 대신 읽을 수 있는 걸로
            course.title = prettyTitle(course);
        }

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
    const missing = courses.filter(c => !c.link);
    if (missing.length) {
        const one = missing[0];
        console.log(`\nℹ️  글에 연결되지 않은 코스가 ${missing.length}개 있습니다.`);
        console.log(`   글을 먼저 발행하고 받은 번호를 넣으세요 — 그래야 업로드를 한 번만 합니다.`);
        console.log(`\n   node tools/link-course.mjs ${one.id} 213 --title "여의도 한강 4K"`);
        console.log(`\n   (연결하지 않으면 지도에서 코스를 눌렀을 때 제목으로 블로그 내 검색이 열립니다)`);
    }

    console.log(`\n마지막 → 티스토리 [스킨 편집 > 파일 업로드] 에 images/courses.json 을 올리세요.`);
}

main();
