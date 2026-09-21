/* =========================================================================
 * GPX → 코스 데이터 변환 공용 로직
 *   build-courses.mjs (Node) 와 gpx-studio.html (브라우저) 가 함께 사용합니다.
 *   의존성 없음 · 정규식 기반 GPX 파서 (Node 에 DOMParser 가 없으므로)
 * ========================================================================= */

export const EARTH_R = 6371;

export function haversine(a, b) {
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLon = (b.lon - a.lon) * Math.PI / 180;
    const s = Math.sin(dLat / 2) ** 2 +
              Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/** GPX 텍스트 → { name, points:[{lat,lon,ele,time}] } */
export function parseGpx(xml) {
    const points = [];
    const ptRe = /<(?:trkpt|rtept|wpt)\b[^>]*?lat\s*=\s*["']([-\d.]+)["'][^>]*?lon\s*=\s*["']([-\d.]+)["'][^>]*?(\/?)>/gi;
    let m;
    while ((m = ptRe.exec(xml)) !== null) {
        const lat = parseFloat(m[1]);
        const lon = parseFloat(m[2]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

        let ele = null, time = null;
        if (m[3] !== '/') {
            // 여는 태그면 대응하는 닫는 태그까지의 내용에서 ele/time 추출
            const tail = xml.slice(ptRe.lastIndex, ptRe.lastIndex + 400);
            const eleM = tail.match(/<ele>\s*([-\d.]+)\s*<\/ele>/i);
            const timeM = tail.match(/<time>\s*([^<]+?)\s*<\/time>/i);
            if (eleM) ele = parseFloat(eleM[1]);
            if (timeM) time = timeM[1];
        }
        points.push({ lat, lon, ele, time });
    }

    const nameM = xml.match(/<trk>[\s\S]*?<name>\s*([^<]+?)\s*<\/name>/i) ||
                  xml.match(/<metadata>[\s\S]*?<name>\s*([^<]+?)\s*<\/name>/i) ||
                  xml.match(/<name>\s*([^<]+?)\s*<\/name>/i);

    return { name: nameM ? nameM[1].trim() : '', points };
}

/** 총 거리(km) */
export function totalDistance(points) {
    let d = 0;
    for (let i = 1; i < points.length; i++) d += haversine(points[i - 1], points[i]);
    return d;
}

/** 누적 상승고도(m) — 3m 미만 변화는 GPS 노이즈로 간주 */
export function elevationGain(points) {
    const withEle = points.filter(p => Number.isFinite(p.ele));
    if (withEle.length < 2) return null;
    let gain = 0, ref = withEle[0].ele;
    for (const p of withEle) {
        const diff = p.ele - ref;
        if (diff > 3) { gain += diff; ref = p.ele; }
        else if (diff < -3) { ref = p.ele; }
    }
    return Math.round(gain);
}

/** 소요 시간(초) */
export function duration(points) {
    const times = points.map(p => p.time).filter(Boolean).map(t => Date.parse(t)).filter(Number.isFinite);
    if (times.length < 2) return null;
    return Math.round((Math.max(...times) - Math.min(...times)) / 1000);
}

export function bounds(points) {
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    for (const p of points) {
        if (p.lat < minLat) minLat = p.lat;
        if (p.lat > maxLat) maxLat = p.lat;
        if (p.lon < minLon) minLon = p.lon;
        if (p.lon > maxLon) maxLon = p.lon;
    }
    return [minLat, minLon, maxLat, maxLon];
}

/** Ramer–Douglas–Peucker (tolerance 단위: 도) */
export function simplify(points, tolerance = 0.00004) {
    if (points.length < 3) return points.slice();
    const sqTol = tolerance * tolerance;
    const keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    const stack = [[0, points.length - 1]];

    const sqSegDist = (p, a, b) => {
        let x = a.lon, y = a.lat;
        let dx = b.lon - x, dy = b.lat - y;
        if (dx !== 0 || dy !== 0) {
            const t = ((p.lon - x) * dx + (p.lat - y) * dy) / (dx * dx + dy * dy);
            if (t > 1) { x = b.lon; y = b.lat; }
            else if (t > 0) { x += dx * t; y += dy * t; }
        }
        dx = p.lon - x; dy = p.lat - y;
        return dx * dx + dy * dy;
    };

    while (stack.length) {
        const [first, last] = stack.pop();
        let maxD = 0, idx = -1;
        for (let i = first + 1; i < last; i++) {
            const d = sqSegDist(points[i], points[first], points[last]);
            if (d > maxD) { maxD = d; idx = i; }
        }
        if (maxD > sqTol && idx > 0) {
            keep[idx] = 1;
            stack.push([first, idx], [idx, last]);
        }
    }
    return points.filter((_, i) => keep[i]);
}

/** 목표 점 개수에 맞춰 자동으로 tolerance 를 조절 */
export function simplifyToBudget(points, budget = 320) {
    if (points.length <= budget) return points;
    let lo = 0.000005, hi = 0.005, best = simplify(points, hi);
    for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        const out = simplify(points, mid);
        if (out.length > budget) lo = mid;
        else { best = out; hi = mid; }
        if (Math.abs(out.length - budget) <= 10) { best = out; break; }
    }
    return best.length >= 2 ? best : points.slice(0, budget);
}

/** Google Encoded Polyline (precision 5) */
export function encodePolyline(points) {
    let lastLat = 0, lastLon = 0, out = '';
    const enc = (v) => {
        v = v < 0 ? ~(v << 1) : (v << 1);
        let s = '';
        while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; }
        s += String.fromCharCode(v + 63);
        return s;
    };
    for (const p of points) {
        const lat = Math.round(p.lat * 1e5), lon = Math.round(p.lon * 1e5);
        out += enc(lat - lastLat) + enc(lon - lastLon);
        lastLat = lat; lastLon = lon;
    }
    return out;
}

export const REGIONS = {
    seoul:    { label: '서울', minLat: 37.42, maxLat: 37.70, minLon: 126.80, maxLon: 127.19 },
    incheon:  { label: '인천', minLat: 37.30, maxLat: 37.62, minLon: 126.35, maxLon: 126.80 },
    busan:    { label: '부산', minLat: 35.05, maxLat: 35.40, minLon: 128.85, maxLon: 129.30 },
    daegu:    { label: '대구', minLat: 35.75, maxLat: 36.05, minLon: 128.40, maxLon: 128.80 },
    gwangju:  { label: '광주', minLat: 35.08, maxLat: 35.28, minLon: 126.70, maxLon: 127.02 },
    daejeon:  { label: '대전', minLat: 36.22, maxLat: 36.50, minLon: 127.28, maxLon: 127.56 },
    jeju:     { label: '제주', minLat: 33.10, maxLat: 33.62, minLon: 126.10, maxLon: 127.00 },
    gyeonggi: { label: '경기', minLat: 36.88, maxLat: 38.30, minLon: 126.30, maxLon: 127.90 }
};
const REGION_ORDER = ['seoul', 'incheon', 'busan', 'daegu', 'gwangju', 'daejeon', 'jeju', 'gyeonggi'];

export function regionOf(lat, lon) {
    for (const k of REGION_ORDER) {
        const b = REGIONS[k];
        if (lat >= b.minLat && lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon) return k;
    }
    return 'other';
}

/** 거리 + 상승고도로 난이도 추정 (1~5) */
export function difficultyOf(distanceKm, elevGain) {
    let score = 1;
    if (distanceKm >= 5) score++;
    if (distanceKm >= 10) score++;
    if (distanceKm >= 18) score++;
    const gainPerKm = elevGain != null && distanceKm > 0 ? elevGain / distanceKm : 0;
    if (gainPerKm >= 15) score++;
    if (gainPerKm >= 35) score++;
    return Math.min(5, score);
}

export function slugify(text) {
    return String(text)
        .trim()
        .toLowerCase()
        .replace(/\.[a-z0-9]+$/i, '')
        .replace(/[^가-힣a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'course';
}

export function formatPace(distanceKm, seconds) {
    if (!seconds || !distanceKm) return null;
    const secPerKm = seconds / distanceKm;
    const m = Math.floor(secPerKm / 60);
    const s = Math.round(secPerKm % 60);
    return `${m}'${String(s).padStart(2, '0')}"`;
}

export function formatDuration(seconds) {
    if (!seconds) return null;
    const m = Math.round(seconds / 60);
    return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`;
}

/**
 * GPX 텍스트 → courses.json 항목 1개
 * @param {string} xml   GPX 원본
 * @param {string} file  파일명 (id / 제목 폴백)
 * @param {object} meta  { id, title, link, date, note } 수동 지정값
 */
export function gpxToCourse(xml, file = 'course.gpx', meta = {}) {
    const parsed = parseGpx(xml);
    if (parsed.points.length < 2) {
        throw new Error(`${file}: 트랙 포인트를 찾지 못했습니다`);
    }

    const pts = parsed.points;
    const distance = totalDistance(pts);
    const elevGain = elevationGain(pts);
    const secs = duration(pts);
    const mid = pts[Math.floor(pts.length / 2)];
    const slim = simplifyToBudget(pts, meta.budget || 320);
    const firstTime = pts.find(p => p.time)?.time;

    const title = meta.title || parsed.name || file.replace(/\.gpx$/i, '');

    const course = {
        id: meta.id || slugify(file),
        title,
        link: meta.link || '',
        date: meta.date || (firstTime ? firstTime.slice(0, 10) : ''),
        distance: Number(distance.toFixed(2)),
        region: meta.region || regionOf(mid.lat, mid.lon),
        difficulty: meta.difficulty || difficultyOf(distance, elevGain),
        bounds: bounds(pts).map(v => Number(v.toFixed(5))),
        polyline: encodePolyline(slim)
    };
    if (elevGain != null) course.elevGain = elevGain;
    if (secs != null) course.duration = secs;
    if (meta.note) course.note = meta.note;

    return { course, rawPoints: pts.length, keptPoints: slim.length, pace: formatPace(distance, secs) };
}

/** 글에 붙여넣을 마크다운 표 */
export function courseMarkdown(course, pace) {
    const stars = '★'.repeat(course.difficulty) + '☆'.repeat(5 - course.difficulty);
    const rows = [
        ['📍 장소', course.title],
        ['📏 거리', `${course.distance} km`],
        ['⏱️ 시간', formatDuration(course.duration) || '— '],
        ['🏃 페이스', pace || '— '],
        ['↗️ 상승고도', course.elevGain != null ? `${course.elevGain} m` : '— '],
        ['⛰️ 난이도', `${stars}`],
        ['🅿️ 주차', '(주차장 이름 / 요금을 적어주세요)'],
        ['🚇 접근성', '(가까운 역 · 출구 · 도보 시간)'],
        ['🚰 급수대', '(개수 또는 위치)'],
        ['🚻 화장실', '(개수 또는 위치)']
    ];
    return [
        '## 📍 코스 정보',
        '',
        '| 항목 | 내용 |',
        '| --- | --- |',
        ...rows.map(([k, v]) => `| ${k} | ${v} |`),
        '',
        `[course:${course.id}]`,
        ''
    ].join('\n');
}
