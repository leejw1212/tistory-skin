#!/usr/bin/env node
/* =========================================================================
 * 러닝 글 초안 만들기 — GPX + 사진 + 소감  →  posts/<날짜-슬러그>/post.md
 * -------------------------------------------------------------------------
 *   사용법:
 *     node tools/build-post.mjs runs/2026-09-21-여의도
 *     node tools/build-post.mjs runs/... --cdn-ref main --tz 540
 *
 *   입력 폴더 구성 (파일 이름은 자유):
 *     activity.tcx      TCX 1개                     — 애플 헬스 → RunGap → Dropbox
 *                       (GPX 도 그대로 받습니다)
 *     IMG_*.jpg         사진 여러 장                 — 순서 상관 없음, 촬영 시각으로 배치됩니다
 *     notes.md          소감·메모 (선택)             — 글의 "다녀온 소감" 재료
 *     meta.json         제목·주차·급수대 등 (선택)
 *
 *   하는 일:
 *     1. 거리·시간·페이스·상승고도·난이도·구간 스플릿 계산
 *        TCX 면 기기가 측정한 거리와 심박·케이던스·칼로리까지 가져옵니다
 *     2. 사진을 1600px 로 줄이고 EXIF(위치정보 포함) 제거          ← 중요
 *     3. 촬영 시각 ↔ 트랙 시각을 맞춰 사진이 코스 몇 km 지점인지 계산
 *     4. 출발 전 / 달리는 중 / 끝난 뒤 로 나눠 글의 제자리에 배치
 *     5. images/courses.json 갱신 (지도에 코스 추가)
 *     6. post.md 초안 + data.json 출력
 *
 *   초안의 <!-- WRITE: ... --> 부분은 사람이(또는 Claude 가) 채웁니다.
 *   숫자와 사진 배치는 전부 맞춰져 있으니 문장만 쓰면 됩니다.
 * ========================================================================= */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import {
    gpxToCourse, parseGpx, splits, splitsMarkdown, locateByTime,
    formatDuration, formatPace, totalDistance, slugify, REGIONS
} from './gpx-core.mjs';
import { tcxToCourse, isTcx, lapSplits, lapSplitsMarkdown } from './tcx-core.mjs';
import { listPhotos, prepPhoto, rankCovers, ensureDir, niceName, loadSharp } from './photo-prep.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COURSES_JSON = join(ROOT, 'images', 'courses.json');

/* ------------------------------------------------------------------ 인자 */

function parseArgs(argv) {
    const out = { dir: null, cdnRef: 'main', tz: 540, repo: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--cdn-ref') out.cdnRef = argv[++i];
        else if (a === '--tz') out.tz = Number(argv[++i]);
        else if (a === '--repo') out.repo = argv[++i];
        else if (!a.startsWith('--') && !out.dir) out.dir = a;
    }
    return out;
}

function detectRepo() {
    try {
        const url = execSync('git remote get-url origin', { cwd: ROOT, encoding: 'utf8' }).trim();
        const m = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/i);
        return m ? `${m[1]}/${m[2]}` : null;
    } catch { return null; }
}

function currentBranch() {
    try { return execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT, encoding: 'utf8' }).trim(); }
    catch { return null; }
}

function readJson(path, fallback) {
    try { return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback; }
    catch (e) {
        console.warn(`⚠️  ${basename(path)} 를 읽지 못했습니다: ${e.message}`);
        return fallback;
    }
}

/* ------------------------------------------------------- 구간 나누기 */

/** 총 거리를 3구간 정도로 나눌 경계값 — 5.2km → [2, 4, 5.2] */
function segmentBounds(totalKm) {
    if (totalKm <= 2) return [Number(totalKm.toFixed(2))];
    const raw = totalKm / 3;
    const step = raw >= 3 ? Math.round(raw) : Math.round(raw * 2) / 2;   // 3km 넘으면 1km, 아니면 0.5km 단위
    const bounds = [];
    for (let v = step; v < totalKm - step * 0.4; v += step) bounds.push(Number(v.toFixed(1)));
    bounds.push(Number(totalKm.toFixed(2)));
    return bounds;
}

/* --------------------------------------------------------- 마크다운 */

const WRITE = (hint) => `<!-- WRITE: ${hint} -->`;

function photoLine(p) {
    // alt 안에는 HTML 주석을 넣지 않습니다 — 그대로 발행돼도 깨지지 않도록.
    const caption = p.caption || `설명 필요 · ${p.kmLabel}`;
    return `![${caption}](${p.url})`;
}

function infoTable(course, pace, meta, extra = {}) {
    const stars = '★'.repeat(course.difficulty) + '☆'.repeat(5 - course.difficulty);
    const ask = (key, hint) => meta[key] || WRITE(hint);
    const rows = [
        ['📍 장소', meta.place || course.title],
        ['📏 거리', `${course.distance} km`],
        ['⏱️ 시간', formatDuration(course.duration) || WRITE('소요 시간')],
        ['🏃 페이스', pace || WRITE('평균 페이스')],
        ['↗️ 상승고도', course.elevGain != null ? `${course.elevGain} m` : WRITE('상승고도')],
        ['⛰️ 난이도', stars],
    ];
    // TCX 에서만 나오는 값 — 있을 때만 줄을 넣습니다
    if (extra.heartRate && extra.heartRate.avg) {
        rows.push(['❤️ 심박', `평균 ${extra.heartRate.avg}` + (extra.heartRate.max ? ` · 최고 ${extra.heartRate.max} bpm` : ' bpm')]);
    }
    if (extra.cadence) rows.push(['👟 케이던스', `${extra.cadence} spm`]);
    if (extra.calories) rows.push(['🔥 칼로리', `${extra.calories} kcal`]);
    rows.push(
        ['🛣️ 노면', ask('surface', '노면 — 우레탄 / 보도블록 / 흙길')],
        ['🅿️ 주차', ask('parking', '주차장 이름 · 요금 · 혼잡 시간')],
        ['🚇 접근성', ask('transit', '가까운 역 · 출구 · 도보 시간')],
        ['🚰 급수대', ask('water', '개수 또는 위치')],
        ['🚻 화장실', ask('toilet', '개수 또는 위치')]
    );
    return [
        '## 📍 코스 정보',
        '',
        '| 항목 | 내용 |',
        '| --- | --- |',
        ...rows.map(([k, v]) => `| ${k} | ${v} |`),
        '',
        `[course:${course.id}]`
    ].join('\n');
}

function buildMarkdown({ course, pace, meta, before, during, after, splitTable, segments, notes, extra }) {
    const out = [];

    out.push(infoTable(course, pace, meta, extra), '');
    out.push(`> 📌 **한 줄 요약** — ${WRITE('이 코스를 한 문장으로')}`, '', '---', '');

    /* 주차 & 출발 지점 — 달리기 시작 전에 찍은 사진 */
    out.push('## 🅿️ 주차 & 출발 지점', '');
    if (meta.parking) out.push(`> 🅿️ **주차 팁** — ${meta.parking}`, '');
    else out.push(`> 🅿️ **주차 팁** — ${WRITE('주차장 위치 · 요금 · 언제 차는지')}`, '');
    if (before.length) {
        out.push(before.map(photoLine).join('\n'), '');
    } else {
        out.push(`${WRITE('출발 지점 사진이 없습니다 — 설명만 적거나 이 섹션을 지우세요')}`, '');
    }
    out.push(WRITE('차에서 내려 출발 지점까지 어떻게 가는지'), '');
    out.push(`> 🚇 **대중교통** — ${meta.transit || WRITE('노선 · 역 · 출구 · 도보 시간')}`, '', '---', '');

    /* 코스 따라가기 — 달리는 중에 찍은 사진을 구간별로 */
    out.push('## 🏃 코스 따라가기', '');
    segments.forEach((seg, i) => {
        const label = `${seg.from} ~ ${seg.to}km`;
        out.push(`### ${label}${seg.name ? ` · ${seg.name}` : ''}`, '');
        if (seg.photos.length) {
            out.push(seg.photos.map(photoLine).join('\n'), '');
        }
        out.push(WRITE(`${label} 구간 — 노면 · 사람 · 풍경`), '');
    });
    if (splitTable) {
        out.push('### ⏱️ 구간 페이스', '', splitTable, '');
    }
    out.push('---', '');

    /* 난이도 & 추천 */
    const easy = course.difficulty <= 2;
    const hilly = (course.elevGain || 0) / Math.max(course.distance, 0.1) >= 15;
    out.push('## ⛰️ 난이도 & 누구에게 추천할까', '');
    out.push(
        `- [${easy ? 'x' : ' '}] 러닝 입문자 — ${easy ? '부담 없는 거리와 경사입니다' : WRITE('왜 부담스러운지')}`,
        `- [${hilly ? 'x' : ' '}] 언덕 훈련 — 누적 상승 ${course.elevGain ?? '?'}m`,
        `- [ ] 인터벌 훈련 — ${WRITE('직선 구간이 긴지')}`,
        `- [ ] 야간 러닝 — ${WRITE('가로등이 있는지')}`,
        ''
    );
    out.push('---', '');

    /* 러닝 기록 — 끝난 뒤 찍은 사진 (워치 화면 등) */
    if (after.length) {
        out.push('## 📸 러닝 기록', '', after.map(photoLine).join('\n'), '', '---', '');
    }

    /* 소감 */
    out.push('## ✅ 다녀온 소감', '');
    out.push(`> ✅ **또 올까요?** — ${WRITE('네 / 아니오 + 이유 한 줄')}`, '');
    out.push(WRITE('세 줄 정도 솔직한 후기 — 아래 메모가 재료입니다'), '');
    if (notes) {
        // 원본 메모는 주석 안에 둡니다. 다듬은 문장만 위에 쓰고 이 블록은 지우세요.
        out.push('<!-- 보내주신 메모 (글로 옮긴 뒤 이 블록은 지우세요)', '', notes, '', '-->', '');
    }

    /* 태그 안내 */
    const regionLabel = REGIONS[course.region]?.label || '';
    out.push('', `<!--`, `태그: 첫 번째를 지역명으로 두세요 (근처 맛집 자동 연결이 여기에 의존합니다)`,
        `추천: ${[meta.place || '', regionLabel, '러닝코스', `${Math.round(course.distance)}km`].filter(Boolean).join(', ')}`,
        `카테고리: 러닝코스`,
        `대표 이미지: ${meta.coverHint || '아래 data.json 의 coverCandidates 참고'}`,
        `-->`);

    return out.join('\n') + '\n';
}

/* -------------------------------------------------------------- 메인 */

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args.dir) {
        console.error('사용법: node tools/build-post.mjs <입력폴더> [--cdn-ref main] [--tz 540]');
        process.exit(1);
    }

    const inDir = join(ROOT, args.dir);
    if (!existsSync(inDir)) {
        console.error(`❌ 폴더가 없습니다: ${args.dir}`);
        process.exit(1);
    }

    /* --- 활동 파일 (TCX 우선, GPX 도 허용) --- */
    const actFiles = readdirSync(inDir)
        .filter(f => /\.(tcx|gpx)$/i.test(f))
        .sort((a, b) => (/\.tcx$/i.test(b) ? 1 : 0) - (/\.tcx$/i.test(a) ? 1 : 0));
    if (!actFiles.length) {
        console.error(`❌ ${args.dir} 에 .tcx 또는 .gpx 파일이 없습니다.`);
        process.exit(1);
    }
    if (actFiles.length > 1) console.warn(`⚠️  활동 파일이 ${actFiles.length}개입니다 — ${actFiles[0]} 만 씁니다.`);

    const actFile = actFiles[0];
    const xml = readFileSync(join(inDir, actFile), 'utf8');
    const useTcx = isTcx(xml);

    const meta = readJson(join(inDir, 'meta.json'), {});
    const notesPath = ['notes.md', 'notes.txt', '소감.md'].map(f => join(inDir, f)).find(existsSync);
    const notes = notesPath ? readFileSync(notesPath, 'utf8').trim() : '';

    // TCX 는 기기가 잰 거리·심박·케이던스가 들어 있어 그대로 씁니다.
    const convert = useTcx ? tcxToCourse : gpxToCourse;
    const fallbackName = useTcx ? null : parseGpx(xml).name;
    const result = convert(xml, actFile, {
        id: meta.id || slugify(meta.title || fallbackName || basename(inDir)),
        title: meta.title || fallbackName || basename(inDir),
        link: meta.link || '',
        date: meta.date || '',
        tzOffsetMin: args.tz
    });
    const { course, pace, rawPoints, keptPoints } = result;

    const points = useTcx ? result.parsed.points : parseGpx(xml).points;

    // 걷기·실내운동·실수로 켠 기록이면 글로 쓸 게 못 됩니다 — 막지는 않고 알려만 줍니다
    const kind = useTcx ? result.classification : null;
    if (kind && kind.kind !== 'run') {
        console.warn(`\n⚠️  이 활동은 "${kind.kind}" 로 보입니다 — ${kind.reason || ''}`);
        console.warn('    러닝 글로 쓰실 거면 파일을 다시 확인해 주세요.\n');
    }
    const times = points.map(p => (p.time ? Date.parse(p.time) : NaN)).filter(Number.isFinite);
    const startMs = times.length ? Math.min(...times) : null;
    const endMs = times.length ? Math.max(...times) : null;
    // 기기가 1km 마다 랩을 끊어줬으면 그 값을 씁니다 — 직접 보간한 것보다 정확합니다
    const deviceLaps = useTcx ? lapSplits(result.parsed) : null;
    const splitList = deviceLaps || splits(points, 1);
    const splitTable = deviceLaps
        ? lapSplitsMarkdown(deviceLaps)
        : (splitList.length >= 2 ? splitsMarkdown(splitList) : '');

    /* --- 사진 --- */
    const slug = `${course.date || new Date().toISOString().slice(0, 10)}-${course.id}`;
    const outDir = ensureDir(join(ROOT, 'posts', slug));
    const photoDir = ensureDir(join(outDir, 'photos'));

    const repo = args.repo || detectRepo();
    if (!repo) console.warn('⚠️  GitHub 저장소를 알아내지 못했습니다 — 사진 주소가 상대경로가 됩니다.');
    const urlBase = repo
        ? `https://cdn.jsdelivr.net/gh/${repo}@${args.cdnRef}/posts/${slug}/photos`
        : 'photos';

    const sharp = await loadSharp();
    if (!sharp) {
        console.warn('⚠️  sharp 가 없어 사진을 가공하지 못합니다 — 원본이 그대로 복사되고 EXIF(위치정보)가 남습니다.');
        console.warn('    npm install 을 먼저 실행하세요.');
    }

    const srcPhotos = listPhotos(inDir);
    const photos = [];
    for (let i = 0; i < srcPhotos.length; i++) {
        const src = srcPhotos[i];
        const outName = niceName(i, src);
        let info;
        try {
            info = await prepPhoto(src, join(photoDir, outName), { fallbackOffsetMin: args.tz });
        } catch (e) {
            console.warn(`⚠️  사진 건너뜀 — ${basename(src)}: ${e.message}`);
            continue;
        }
        const loc = info.takenAt ? locateByTime(points, info.takenAt) : null;
        photos.push({
            ...info,
            name: outName,
            url: `${urlBase}/${outName}`,
            km: loc ? loc.km : null,
            deltaSec: loc ? loc.deltaSec : null,
            phase: !info.takenAt ? 'unknown'
                : (startMs != null && info.takenAt.getTime() < startMs) ? 'before'
                : (endMs != null && info.takenAt.getTime() > endMs) ? 'after'
                : 'during'
        });
        const p = photos[photos.length - 1];
        p.kmLabel = p.phase === 'before' ? '출발 전'
                  : p.phase === 'after' ? '완주 후'
                  : p.phase === 'unknown' ? '시각 없음'
                  : `${p.km}km`;
    }

    // 촬영 시각 순으로 정렬 (시각이 없는 사진은 뒤로)
    photos.sort((a, b) => {
        if (a.takenAt && b.takenAt) return a.takenAt - b.takenAt;
        if (a.takenAt) return -1;
        if (b.takenAt) return 1;
        return a.name.localeCompare(b.name);
    });

    const before = photos.filter(p => p.phase === 'before');
    const during = photos.filter(p => p.phase === 'during');
    const after = photos.filter(p => p.phase === 'after' || p.phase === 'unknown');

    /* --- 구간에 사진 배치 --- */
    const boundList = segmentBounds(course.distance);
    const segments = [];
    let from = 0;
    for (const to of boundList) {
        segments.push({
            from: Number(from.toFixed(1)),
            to,
            name: (meta.segments || {})[String(to)] || '',
            photos: during.filter(p => p.km != null && p.km > from - 0.001 && p.km <= to + 0.001)
        });
        from = to;
    }
    // 어느 구간에도 못 들어간 사진은 첫 구간에
    const placed = new Set(segments.flatMap(s => s.photos.map(p => p.name)));
    const orphans = during.filter(p => !placed.has(p.name));
    if (orphans.length && segments.length) segments[0].photos.push(...orphans);

    /* --- 커버 후보 --- */
    const covers = rankCovers(photos, course.distance).slice(0, 3);

    /* --- 글 초안 --- */
    const extra = useTcx
        ? { heartRate: result.heartRate, cadence: result.cadence, calories: result.calories }
        : {};
    const md = buildMarkdown({ course, pace, meta, before, during, after, splitTable, segments, notes, extra });
    writeFileSync(join(outDir, 'post.md'), md, 'utf8');

    /* --- Claude / 사람이 참고할 계산 결과 --- */
    const data = {
        generated: new Date().toISOString(),
        source: {
            file: actFile,
            format: useTcx ? 'tcx' : 'gpx',
            dir: args.dir,
            notes: notesPath ? basename(notesPath) : null,
            device: useTcx ? result.device : null,
            sport: useTcx ? result.sport : null,
            distanceSource: useTcx ? result.distanceSource : 'gps',
            classification: useTcx ? result.classification : null
        },
        course,
        pace,
        heartRate: useTcx ? result.heartRate : null,
        cadence: useTcx ? result.cadence : null,
        calories: useTcx ? result.calories : null,
        points: { raw: rawPoints, kept: keptPoints },
        startedAt: startMs ? new Date(startMs).toISOString() : null,
        finishedAt: endMs ? new Date(endMs).toISOString() : null,
        splits: splitList,
        splitsSource: deviceLaps ? 'device-lap' : 'computed',
        segments: segments.map(s => ({ from: s.from, to: s.to, photos: s.photos.map(p => p.name) })),
        photos: photos.map(p => ({
            name: p.name, url: p.url, km: p.km, phase: p.phase,
            takenAt: p.takenAt ? p.takenAt.toISOString() : null,
            exifOffset: p.offset, deltaSec: p.deltaSec,
            landscape: p.landscape, width: p.width, height: p.height,
            kb: Math.round(p.bytes / 1024), gpsStripped: p.hadGps, metadataStripped: p.stripped
        })),
        coverCandidates: covers.map(c => ({ name: c.name, url: c.url, score: c.coverScore })),
        notes
    };
    writeFileSync(join(outDir, 'data.json'), JSON.stringify(data, null, 2) + '\n', 'utf8');

    /* --- courses.json 갱신 --- */
    const prev = readJson(COURSES_JSON, { version: 1, courses: [], restaurants: [] });
    const others = (prev.courses || []).filter(c => c.id !== course.id);
    const existing = (prev.courses || []).find(c => c.id === course.id);
    if (!course.link && existing?.link) course.link = existing.link;   // 발행 후 적어둔 글 주소는 지키기
    const merged = {
        version: 1,
        generated: new Date().toISOString(),
        courses: [course, ...others].sort((a, b) => String(b.date).localeCompare(String(a.date))),
        restaurants: prev.restaurants || []
    };
    delete merged._note;
    writeFileSync(COURSES_JSON, JSON.stringify(merged, null, 2) + '\n', 'utf8');

    /* --- 결과 출력 --- */
    console.log(`\n✅ posts/${slug}/post.md`);
    console.table({
        제목: course.title,
        거리: `${course.distance} km`,
        시간: formatDuration(course.duration) || '-',
        페이스: pace || '-',
        상승고도: course.elevGain != null ? `${course.elevGain} m` : '-',
        난이도: '★'.repeat(course.difficulty),
        지역: REGIONS[course.region]?.label || course.region,
        ...(useTcx && result.heartRate?.avg ? { 심박: `${result.heartRate.avg} bpm` } : {}),
        ...(useTcx && result.cadence ? { 케이던스: `${result.cadence} spm` } : {})
    });
    if (useTcx) {
        const src = { lap: '기기 측정(랩)', trackpoint: '기기 측정(트랙포인트)', gps: 'GPS 좌표 계산' }[result.distanceSource];
        console.log(`📐 거리 출처: ${src}${result.device ? ` · ${result.device}` : ''}`);
        console.log(`⏱️ 구간 페이스: ${deviceLaps ? `기기 랩 ${deviceLaps.length}개` : '직접 계산 (랩이 1개뿐)'}`);
    }

    const gpsCount = photos.filter(p => p.hadGps).length;
    console.log(`📷 사진 ${photos.length}장 — 출발 전 ${before.length} · 달리는 중 ${during.length} · 끝난 뒤 ${after.length}`);
    if (gpsCount) console.log(`🔒 위치정보(EXIF GPS) ${gpsCount}장에서 제거${sharp ? '' : ' 실패 — sharp 를 설치하세요'}`);
    const noTime = photos.filter(p => !p.takenAt).length;
    if (noTime) console.log(`ℹ️  촬영 시각이 없는 사진 ${noTime}장 — 글 끝의 "러닝 기록"에 모았습니다.`);
    const far = photos.filter(p => p.phase === 'during' && p.deltaSec != null && p.deltaSec > 300);
    if (far.length) console.log(`⚠️  코스 시각과 5분 넘게 어긋난 사진 ${far.length}장 — 폰 시계나 --tz 를 확인하세요.`);

    const branch = currentBranch();
    if (branch && branch !== args.cdnRef) {
        console.log(`\n⚠️  사진 주소가 @${args.cdnRef} 를 가리킵니다. 지금 브랜치는 ${branch} 입니다.`);
        console.log(`    ${args.cdnRef} 에 합쳐 푸시한 뒤에 글을 발행하세요. (아니면 --cdn-ref ${branch})`);
    }
    console.log(`\n다음 단계 → post.md 의 <!-- WRITE: ... --> 를 채우고, images/courses.json 을 티스토리에 올리세요.`);
}

main().catch(e => { console.error('❌', e.stack || e.message); process.exit(1); });
