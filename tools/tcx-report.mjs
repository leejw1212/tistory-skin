#!/usr/bin/env node
/* =========================================================================
 * TCX 묶음 분석 — 어떤 활동이 글감이 되는지 가려냅니다
 * -------------------------------------------------------------------------
 *   사용법:
 *     node tools/tcx-report.mjs <폴더>              요약 표
 *     node tools/tcx-report.mjs <폴더> --runs       러닝만
 *     node tools/tcx-report.mjs <폴더> --json       기계가 읽을 형식
 *     node tools/tcx-report.mjs <폴더> --since 2026-09-01
 *
 *   RunGap 은 애플 헬스의 활동을 전부 내보냅니다 — 걷기, 실내운동,
 *   실수로 켠 1초짜리까지. 그중 글로 쓸 만한 러닝만 골라내는 게 이 도구의 일입니다.
 * ========================================================================= */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import {
    parseTcx, isTcx, deviceDistanceKm, deviceDurationSec,
    heartRateSummary, cadenceSummary, caloriesTotal, classify
} from './tcx-core.mjs';
import { formatPace, formatDuration, regionOf, REGIONS, localDateString } from './gpx-core.mjs';

/** RunGap 파일명: 2026-09-21_08-28-48_hk_1789946928.tcx
 *  앞쪽 날짜·시각은 현지시각(KST), 끝 숫자는 시작시각의 유닉스 타임스탬프입니다. */
export function parseRunGapName(name) {
    const m = basename(name).match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})_([a-z]+)_(\d+)\.tcx$/i);
    if (!m) return null;
    return {
        localDate: `${m[1]}-${m[2]}-${m[3]}`,
        localTime: `${m[4]}:${m[5]}:${m[6]}`,
        source: m[7],                        // hk = HealthKit (애플 건강)
        epoch: Number(m[8])
    };
}

function analyzeOne(path) {
    const size = statSync(path).size;
    const name = basename(path);
    const named = parseRunGapName(name);

    // 1KB 미만은 트랙이 없는 기록입니다 — 열어보지 않고 넘깁니다
    if (size < 1024) {
        return { name, size, localDate: named?.localDate || null, kind: 'no-gps',
                 reason: '트랙 없음 (1KB 미만)', km: 0, seconds: 0 };
    }

    let xml;
    try { xml = readFileSync(path, 'utf8'); }
    catch (e) { return { name, size, kind: 'error', reason: e.message }; }

    if (!isTcx(xml)) return { name, size, kind: 'error', reason: 'TCX 가 아닙니다' };

    const p = parseTcx(xml);
    const dist = deviceDistanceKm(p);
    const secs = deviceDurationSec(p);
    const c = classify(p);
    const hr = heartRateSummary(p);
    const mid = p.points[Math.floor(p.points.length / 2)];

    return {
        name, size,
        localDate: named?.localDate || (p.startTime ? localDateString(p.startTime, 540) : null),
        localTime: named?.localTime || null,
        sport: p.sport,
        device: p.device,
        kind: c.kind,
        reason: c.reason,
        km: Number(dist.km.toFixed(2)),
        distanceSource: dist.source,
        seconds: secs,
        pace: formatPace(dist.km, secs),
        points: p.points.length,
        laps: p.laps.length,
        hrAvg: hr?.avg ?? null,
        hrMax: hr?.max ?? null,
        cadence: cadenceSummary(p),
        calories: caloriesTotal(p),
        region: mid ? (REGIONS[regionOf(mid.lat, mid.lon)]?.label || '기타') : null
    };
}

function main() {
    const args = process.argv.slice(2);
    const dir = args.find(a => !a.startsWith('--'));
    const runsOnly = args.includes('--runs');
    const asJson = args.includes('--json');
    const sinceIdx = args.indexOf('--since');
    const since = sinceIdx >= 0 ? args[sinceIdx + 1] : null;

    if (!dir || !existsSync(dir)) {
        console.error('사용법: node tools/tcx-report.mjs <폴더> [--runs] [--json] [--since YYYY-MM-DD]');
        process.exit(1);
    }

    let files = readdirSync(dir).filter(f => /\.tcx$/i.test(f)).sort();
    if (since) files = files.filter(f => (parseRunGapName(f)?.localDate || '') >= since);
    if (!files.length) { console.error('❌ 조건에 맞는 .tcx 파일이 없습니다.'); process.exit(1); }

    const all = files.map(f => analyzeOne(join(dir, f)));
    const runs = all.filter(r => r.kind === 'run');
    const shown = runsOnly ? runs : all;

    if (asJson) { console.log(JSON.stringify({ total: all.length, runs: runs.length, activities: shown }, null, 2)); return; }

    const byKind = {};
    for (const r of all) byKind[r.kind] = (byKind[r.kind] || 0) + 1;

    console.log(`\n📂 ${dir} — 파일 ${all.length}개`);
    console.log('   분류:', Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join(' · '));

    if (shown.length) {
        console.table(shown.slice(0, 60).map(r => ({
            날짜: r.localDate || '-',
            시각: r.localTime || '-',
            분류: r.kind,
            거리: r.km ? `${r.km}km` : '-',
            시간: r.seconds ? formatDuration(r.seconds) : '-',
            페이스: r.pace || '-',
            심박: r.hrAvg || '-',
            지역: r.region || '-'
        })));
        if (shown.length > 60) console.log(`   … 외 ${shown.length - 60}개 (전체는 --json)`);
    }

    if (runs.length) {
        const totalKm = runs.reduce((s, r) => s + r.km, 0);
        const withHr = runs.filter(r => r.hrAvg);
        console.log(`\n🏃 러닝 ${runs.length}개 · 총 ${totalKm.toFixed(1)}km · 평균 ${(totalKm / runs.length).toFixed(2)}km`);
        if (withHr.length) {
            console.log(`   심박 기록 ${withHr.length}개 · 평균 ${Math.round(withHr.reduce((s, r) => s + r.hrAvg, 0) / withHr.length)} bpm`);
        }
        const dates = runs.map(r => r.localDate).filter(Boolean).sort();
        if (dates.length) console.log(`   기간: ${dates[0]} ~ ${dates[dates.length - 1]}`);
        console.log(`\n글로 쓸 만한 최근 러닝:`);
        for (const r of runs.slice(-5).reverse()) {
            console.log(`   ${r.localDate} ${r.localTime || ''} · ${r.km}km · ${r.pace || '-'} · ${r.region || '-'} — ${r.name}`);
        }
    } else {
        console.log('\n🏃 러닝으로 분류된 활동이 없습니다.');
    }
}

// 직접 실행할 때만 동작 (import 해서 쓰는 경우 대비)
if (process.argv[1] && process.argv[1].endsWith('tcx-report.mjs')) main();
