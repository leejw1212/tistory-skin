/* =========================================================================
 * TCX → 코스 데이터 변환
 * -------------------------------------------------------------------------
 *   애플 헬스 → RunGap → Dropbox 로 올라오는 파일은 GPX 가 아니라 TCX 입니다.
 *   TCX 는 GPX 보다 정보가 많습니다: 기기가 측정한 거리 · 심박 · 케이던스 · 칼로리.
 *
 *   의존성 없음. 정규식 기반 파서 (Node 에 DOMParser 가 없으므로)
 *
 *   ⚠️ 네임스페이스 접두사에 의존하지 않습니다.
 *      RunGap 이 <Trackpoint> 로 쓰든 <ns3:Trackpoint> 로 쓰든 똑같이 읽습니다.
 *      태그 이름으로만 찾으므로 요소 순서가 달라도 상관없습니다.
 * ========================================================================= */

import { haversine, totalDistance, cumulativeDistances } from './gpx-core.mjs';

/** 네임스페이스 접두사를 무시하는 태그 정규식 */
function tagRe(name, flags = 'i') {
    return new RegExp(`<(?:[\\w.-]+:)?${name}\\b[^>]*?(?:/>|>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}>)`, flags);
}

/** 첫 번째 <name> 의 내용 (없으면 null) */
function tagText(xml, name) {
    const m = xml.match(tagRe(name));
    return m && m[1] != null ? m[1].trim() : null;
}

/** 첫 번째 <name> 의 숫자 값 */
function tagNum(xml, name) {
    const t = tagText(xml, name);
    if (t == null) return null;
    const v = parseFloat(t);
    return Number.isFinite(v) ? v : null;
}

/** 모든 <name> 블록 */
function tagBlocks(xml, name) {
    const re = tagRe(name, 'gi');
    const out = [];
    let m;
    while ((m = re.exec(xml)) !== null) out.push(m[1] || '');
    return out;
}

/** 모든 <name> 블록을 여는 태그와 함께 — { open, inner } */
function tagBlocksWithOpen(xml, name) {
    const re = new RegExp(`(<(?:[\\w.-]+:)?${name}\\b[^>]*>)([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}>`, 'gi');
    const out = [];
    let m;
    while ((m = re.exec(xml)) !== null) out.push({ open: m[1], inner: m[2] || '' });
    return out;
}

/** 여는 태그 문자열에서 속성 값 */
function attrOf(openTag, attr) {
    const m = openTag.match(new RegExp(`\\b${attr}\\s*=\\s*["']([^"']*)["']`, 'i'));
    return m ? m[1] : null;
}

/** <name attr="..."> 의 속성 값 */
function tagAttr(xml, name, attr) {
    const re = new RegExp(`<(?:[\\w.-]+:)?${name}\\b[^>]*?\\b${attr}\\s*=\\s*["']([^"']*)["']`, 'i');
    const m = xml.match(re);
    return m ? m[1] : null;
}

/**
 * 심박 — <HeartRateBpm><Value>123</Value></HeartRateBpm>
 * Lap 의 Average/Maximum 도 같은 구조라 감싼 태그 이름을 받습니다.
 */
function heartRate(xml, wrapper) {
    const block = tagText(xml, wrapper);
    if (block == null) return null;
    const v = tagNum(block, 'Value');
    return Number.isFinite(v) ? v : null;
}

/**
 * TCX 텍스트 → { sport, startTime, points, laps, device }
 *   points 는 gpx-core 의 함수들과 같은 모양입니다: { lat, lon, ele, time }
 *   추가로 hr · cadence · speed · distance(기기 누적거리, m) 가 붙습니다.
 */
export function parseTcx(xml) {
    const activityBlocks = tagBlocks(xml, 'Activity');
    // Activity 가 없으면 Course 형식일 수 있으니 전체를 한 덩어리로 본다
    const body = activityBlocks.length ? activityBlocks.join('\n') : xml;

    const sport = tagAttr(xml, 'Activity', 'Sport') || null;
    const id = tagText(body, 'Id');

    const laps = tagBlocksWithOpen(body, 'Lap').map(({ open, inner: lap }, i) => ({
        index: i,
        startTime: attrOf(open, 'StartTime'),
        seconds: tagNum(lap, 'TotalTimeSeconds'),
        meters: tagNum(lap, 'DistanceMeters'),
        maxSpeed: tagNum(lap, 'MaximumSpeed'),
        calories: tagNum(lap, 'Calories'),
        avgHr: heartRate(lap, 'AverageHeartRateBpm'),
        maxHr: heartRate(lap, 'MaximumHeartRateBpm'),
        intensity: tagText(lap, 'Intensity'),
        trigger: tagText(lap, 'TriggerMethod')
    }));

    const points = [];
    for (const tp of tagBlocks(body, 'Trackpoint')) {
        const pos = tagText(tp, 'Position');
        const lat = pos ? tagNum(pos, 'LatitudeDegrees') : null;
        const lon = pos ? tagNum(pos, 'LongitudeDegrees') : null;
        const time = tagText(tp, 'Time');

        // 위치가 없는 트랙포인트(실내 운동, GPS 끊김)는 코스에 쓸 수 없습니다
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

        const ext = tagText(tp, 'Extensions');
        const tpx = ext ? tagText(ext, 'TPX') : null;

        points.push({
            lat,
            lon,
            ele: tagNum(tp, 'AltitudeMeters'),
            time: time || null,
            hr: heartRate(tp, 'HeartRateBpm'),
            distance: tagNum(tp, 'DistanceMeters'),          // 기기가 준 누적거리 (m)
            cadence: tpx ? tagNum(tpx, 'RunCadence') : null,
            speed: tpx ? tagNum(tpx, 'Speed') : null
        });
    }

    return {
        sport,
        id,
        startTime: tagAttr(xml, 'Lap', 'StartTime') || id || (points[0] && points[0].time) || null,
        device: tagText(xml, 'Name'),
        laps,
        points
    };
}

/** 파일이 TCX 인지 (확장자가 아니라 내용으로 판별) */
export function isTcx(xml) {
    return /<(?:[\w.-]+:)?TrainingCenterDatabase\b/i.test(xml) ||
           /<(?:[\w.-]+:)?Trackpoint\b/i.test(xml);
}

/**
 * 기기가 측정한 총 거리(km). GPS 좌표로 계산한 값보다 정확합니다.
 * (애플워치는 보폭·가속도계를 함께 쓰므로 터널·고층 구간에서 특히 차이납니다)
 * 랩 합계 → 마지막 트랙포인트 누적거리 → 좌표 계산 순으로 시도합니다.
 */
export function deviceDistanceKm(parsed) {
    const lapSum = parsed.laps.reduce((s, l) => s + (Number.isFinite(l.meters) ? l.meters : 0), 0);
    if (lapSum > 0) return { km: lapSum / 1000, source: 'lap' };

    const withDist = parsed.points.filter(p => Number.isFinite(p.distance));
    if (withDist.length) {
        const last = withDist[withDist.length - 1].distance;
        if (last > 0) return { km: last / 1000, source: 'trackpoint' };
    }

    return { km: totalDistance(parsed.points), source: 'gps' };
}

/** 기기가 측정한 소요 시간(초) — 랩 합계 우선, 없으면 트랙포인트 시각 차 */
export function deviceDurationSec(parsed) {
    const lapSum = parsed.laps.reduce((s, l) => s + (Number.isFinite(l.seconds) ? l.seconds : 0), 0);
    if (lapSum > 0) return Math.round(lapSum);

    const times = parsed.points.map(p => (p.time ? Date.parse(p.time) : NaN)).filter(Number.isFinite);
    if (times.length < 2) return null;
    return Math.round((Math.max(...times) - Math.min(...times)) / 1000);
}

/** 심박 요약 — { avg, max } (없으면 null) */
export function heartRateSummary(parsed) {
    // 랩마다 길이가 다르므로 시간으로 가중평균을 냅니다.
    // 5초짜리 마지막 랩이 30분치 평균을 끌어당기면 안 됩니다.
    const weighted = parsed.laps.filter(l => Number.isFinite(l.avgHr));
    const lapMax = parsed.laps.map(l => l.maxHr).filter(Number.isFinite);
    if (weighted.length || lapMax.length) {
        let avg = null;
        if (weighted.length) {
            const totalW = weighted.reduce((s, l) => s + (Number.isFinite(l.seconds) && l.seconds > 0 ? l.seconds : 1), 0);
            const sum = weighted.reduce((s, l) => s + l.avgHr * (Number.isFinite(l.seconds) && l.seconds > 0 ? l.seconds : 1), 0);
            avg = Math.round(sum / totalW);
        }
        return { avg, max: lapMax.length ? Math.max(...lapMax) : null };
    }
    const hrs = parsed.points.map(p => p.hr).filter(Number.isFinite);
    if (!hrs.length) return null;
    return {
        avg: Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length),
        max: Math.max(...hrs)
    };
}

/** 평균 케이던스(spm). TCX 의 RunCadence 는 보통 한쪽 발 기준이라 2배가 실제 걸음수입니다. */
export function cadenceSummary(parsed, { doubled = true } = {}) {
    const vals = parsed.points.map(p => p.cadence).filter(v => Number.isFinite(v) && v > 0);
    if (!vals.length) return null;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return Math.round(doubled ? avg * 2 : avg);
}

/**
 * 기기가 나눠준 랩을 구간 스플릿으로 변환합니다.
 * 애플워치는 보통 1km 마다 자동으로 랩을 끊습니다. 그 값이 직접 보간한 것보다 정확합니다.
 * 랩이 1개뿐이면(짧은 활동) null 을 돌려주니, 그때는 gpx-core 의 splits() 를 쓰세요.
 */
export function lapSplits(parsed) {
    const usable = parsed.laps.filter(l => Number.isFinite(l.meters) && Number.isFinite(l.seconds) && l.meters > 1);
    if (usable.length < 2) return null;

    let cum = 0;
    return usable.map((l, i) => {
        cum += l.meters / 1000;
        return {
            km: Number(cum.toFixed(2)),
            distance: Number((l.meters / 1000).toFixed(2)),
            seconds: Math.round(l.seconds),
            pace: formatPace(l.meters / 1000, l.seconds),
            hr: l.avgHr ?? null,
            // 마지막 랩은 1km 를 못 채우고 끝나는 조각인 경우가 많습니다
            partial: l.meters < 900 && i === usable.length - 1
        };
    });
}

export function caloriesTotal(parsed) {
    const sum = parsed.laps.reduce((s, l) => s + (Number.isFinite(l.calories) ? l.calories : 0), 0);
    return sum > 0 ? Math.round(sum) : null;
}

/**
 * 활동 분류 — 글로 쓸 만한 러닝인지 가려냅니다.
 *   RunGap 은 걷기 · 실내운동 · 실수로 켠 1초짜리까지 전부 내보냅니다.
 */
export function classify(parsed) {
    const { km } = deviceDistanceKm(parsed);
    const sec = deviceDurationSec(parsed) || 0;
    const paceSecPerKm = km > 0 && sec > 0 ? sec / km : null;

    if (!parsed.points.length) return { kind: 'no-gps', reason: '위치 기록이 없습니다 (실내운동이거나 GPS 미사용)' };
    if (sec < 60 || km < 0.3) return { kind: 'too-short', reason: '너무 짧습니다 (실수로 켠 기록으로 보입니다)' };

    const sportRaw = (parsed.sport || '').toLowerCase();
    if (sportRaw.includes('bik') || sportRaw.includes('cycl')) return { kind: 'cycling', reason: 'Sport=' + parsed.sport };

    // Sport 속성이 Running 이어도 애플워치는 걷기를 Running 으로 쓰는 경우가 있어 페이스로 한 번 더 봅니다
    if (paceSecPerKm != null && paceSecPerKm > 480) {
        return { kind: 'walk', reason: `페이스 ${Math.floor(paceSecPerKm / 60)}'${String(Math.round(paceSecPerKm % 60)).padStart(2, '0')}" — 걷기로 보입니다` };
    }

    return { kind: 'run', reason: null };
}

/* =========================================================================
 * TCX → courses.json 항목  (gpx-core 의 gpxToCourse 와 같은 모양을 돌려줍니다)
 * ========================================================================= */

import {
    elevationGain, bounds, simplifyToBudget, encodePolyline,
    regionOf, difficultyOf, slugify, formatPace, localDateString
} from './gpx-core.mjs';

/**
 * @param {string} xml   TCX 원본
 * @param {string} file  파일명 (id / 제목 폴백)
 * @param {object} meta  { id, title, link, date, tzOffsetMin } 수동 지정값
 */
export function tcxToCourse(xml, file = 'activity.tcx', meta = {}) {
    const parsed = parseTcx(xml);
    const pts = parsed.points;
    if (pts.length < 2) {
        const c = classify(parsed);
        throw new Error(`${file}: 좌표가 있는 트랙포인트가 없습니다 — ${c.reason || c.kind}`);
    }

    const dist = deviceDistanceKm(parsed);
    const secs = deviceDurationSec(parsed);
    const elevGain = elevationGain(pts);
    const mid = pts[Math.floor(pts.length / 2)];
    const slim = simplifyToBudget(pts, meta.budget || 320);
    const tz = meta.tzOffsetMin ?? 540;
    const firstTime = parsed.startTime || pts.find(p => p.time)?.time;

    const course = {
        id: meta.id || slugify(file),
        title: meta.title || file.replace(/\.tcx$/i, ''),
        link: meta.link || '',
        date: meta.date || (firstTime ? localDateString(firstTime, tz) : ''),
        distance: Number(dist.km.toFixed(2)),
        region: meta.region || regionOf(mid.lat, mid.lon),
        difficulty: meta.difficulty || difficultyOf(dist.km, elevGain),
        bounds: bounds(pts).map(v => Number(v.toFixed(5))),
        polyline: encodePolyline(slim)
    };
    if (elevGain != null) course.elevGain = elevGain;
    if (secs != null) course.duration = secs;
    if (meta.note) course.note = meta.note;

    return {
        course,
        parsed,
        rawPoints: pts.length,
        keptPoints: slim.length,
        pace: formatPace(dist.km, secs),
        distanceSource: dist.source,
        heartRate: heartRateSummary(parsed),
        cadence: cadenceSummary(parsed),
        calories: caloriesTotal(parsed),
        classification: classify(parsed),
        sport: parsed.sport,
        device: parsed.device
    };
}

/** 랩 스플릿 → 마크다운 표 (심박이 있으면 같이) */
export function lapSplitsMarkdown(list) {
    if (!list || !list.length) return '';
    const hasHr = list.some(s => Number.isFinite(s.hr));
    const head = hasHr ? '| 구간 | 페이스 | 심박 |' : '| 구간 | 페이스 |';
    const sep = hasHr ? '| --- | --- | --- |' : '| --- | --- |';
    const rows = list.map(s => {
        const label = s.partial ? `${s.km} km (마지막)` : `${s.km} km`;
        return hasHr
            ? `| ${label} | ${s.pace || '—'} | ${Number.isFinite(s.hr) ? s.hr : '—'} |`
            : `| ${label} | ${s.pace || '—'} |`;
    });
    return [head, sep, ...rows].join('\n');
}
