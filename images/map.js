/* =========================================================================
 * Warm Life Skin — Running Map Engine
 * -------------------------------------------------------------------------
 * 레이어 구조
 *   baseLayer (offscreen)  : 바다 / 육지 / 강 / 공원 / 지역 라벨  → 뷰포트가 바뀔 때만 다시 그림
 *   overlayLayer (visible) : 코스 / 핀 / 내 위치 / 애니메이션    → 매 프레임
 *
 * 데이터 소스 (우선순위 순)
 *   1. images/courses.json          ← tools/gpx-studio.html, tools/build-courses.mjs 가 생성
 *   2. window.MAP_DATA.gpxFiles     ← 구버전 호환. 런타임에 GPX 를 직접 파싱
 * ========================================================================= */
(function () {
    'use strict';

    /* =====================================================================
     * 0. 기본 설정
     * ===================================================================== */
    var CONFIG = {
        // 거리(km)별 코스 색상
        tiers: [
            { max: 5,        name: '5km 미만', core: '#37c98a', edge: '#8ef0c2', glow: 'rgba(55,201,138,.55)' },
            { max: 10,       name: '5~10km',  core: '#3d8bff', edge: '#8fc0ff', glow: 'rgba(61,139,255,.55)' },
            { max: Infinity, name: '10km 이상', core: '#ff6b4a', edge: '#ffb199', glow: 'rgba(255,107,74,.55)' }
        ],
        palette: {
            seaTop:    '#e4f0f6',
            seaBottom: '#cfe3ee',
            seaLine:   'rgba(255,255,255,.55)',
            landTop:   '#fbf4e6',
            landBottom:'#efe4cd',
            landEdge:  '#d9c9ab',
            park:      'rgba(160,209,148,.55)',
            parkEdge:  'rgba(126,186,112,.65)',
            water:     'rgba(150,197,224,.65)',
            waterEdge: 'rgba(120,175,210,.75)',
            river:     '#9fc6de',
            label:     'rgba(122,105,84,.55)',
            pin:       '#ff8a3d'
        },
        minSpan: 0.0025,   // 최대 줌 (위도 span)
        maxSpan: 14,       // 최소 줌
        flyDuration: 620   // 뷰포트 이동 애니메이션 (ms)
    };

    /* =====================================================================
     * 1. 유틸
     * ===================================================================== */
    var EARTH_R = 6371;

    function haversine(a, b) {
        var dLat = (b.lat - a.lat) * Math.PI / 180;
        var dLon = (b.lon - a.lon) * Math.PI / 180;
        var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 2 * EARTH_R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
    }

    function pathDistance(points) {
        var d = 0;
        for (var i = 0; i < points.length - 1; i++) d += haversine(points[i], points[i + 1]);
        return d;
    }

    /** Google Encoded Polyline (precision 5) 디코더 */
    function decodePolyline(str) {
        var points = [], index = 0, lat = 0, lon = 0;
        while (index < str.length) {
            var shift = 0, result = 0, b;
            do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
            lat += (result & 1) ? ~(result >> 1) : (result >> 1);
            shift = 0; result = 0;
            do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
            lon += (result & 1) ? ~(result >> 1) : (result >> 1);
            points.push({ lat: lat / 1e5, lon: lon / 1e5 });
        }
        return points;
    }

    /** GPX 문자열 → {points, name, time} */
    function parseGpx(xmlText) {
        var doc = new DOMParser().parseFromString(xmlText, 'text/xml');
        if (doc.getElementsByTagName('parsererror').length) return null;

        var nodes = doc.getElementsByTagName('trkpt');
        if (!nodes.length) nodes = doc.getElementsByTagName('rtept');
        if (!nodes.length) nodes = doc.getElementsByTagName('wpt');

        var points = [];
        for (var i = 0; i < nodes.length; i++) {
            var la = parseFloat(nodes[i].getAttribute('lat'));
            var lo = parseFloat(nodes[i].getAttribute('lon'));
            if (isFinite(la) && isFinite(lo)) {
                var ele = nodes[i].getElementsByTagName('ele')[0];
                points.push({ lat: la, lon: lo, ele: ele ? parseFloat(ele.textContent) : null });
            }
        }
        if (!points.length) return null;

        var nameNode = doc.querySelector('trk > name') || doc.querySelector('metadata > name') || doc.getElementsByTagName('name')[0];
        var timeNode = doc.querySelector('metadata > time') || doc.getElementsByTagName('time')[0];
        return {
            points: points,
            name: nameNode ? nameNode.textContent.trim() : '',
            time: timeNode ? timeNode.textContent.trim() : ''
        };
    }

    /** Ramer–Douglas–Peucker 단순화 (화면 렌더 부하 감소용) */
    function simplify(points, tolerance) {
        if (points.length < 3) return points.slice();
        var sqTol = tolerance * tolerance;
        var keep = new Uint8Array(points.length);
        keep[0] = keep[points.length - 1] = 1;
        var stack = [[0, points.length - 1]];

        function sqSegDist(p, a, b) {
            var x = a.lon, y = a.lat, dx = b.lon - x, dy = b.lat - y;
            if (dx !== 0 || dy !== 0) {
                var t = ((p.lon - x) * dx + (p.lat - y) * dy) / (dx * dx + dy * dy);
                if (t > 1) { x = b.lon; y = b.lat; }
                else if (t > 0) { x += dx * t; y += dy * t; }
            }
            dx = p.lon - x; dy = p.lat - y;
            return dx * dx + dy * dy;
        }

        while (stack.length) {
            var range = stack.pop(), first = range[0], last = range[1];
            var maxD = 0, idx = -1;
            for (var i = first + 1; i < last; i++) {
                var d = sqSegDist(points[i], points[first], points[last]);
                if (d > maxD) { maxD = d; idx = i; }
            }
            if (maxD > sqTol && idx > 0) {
                keep[idx] = 1;
                stack.push([first, idx], [idx, last]);
            }
        }
        return points.filter(function (_, i) { return keep[i]; });
    }

    function easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

    function tierOf(distanceKm) {
        for (var i = 0; i < CONFIG.tiers.length; i++) {
            if (distanceKm < CONFIG.tiers[i].max) return CONFIG.tiers[i];
        }
        return CONFIG.tiers[CONFIG.tiers.length - 1];
    }

    var REGIONS = {
        all:      null,
        seoul:    { label: '서울', minLat: 37.42, maxLat: 37.70, minLon: 126.80, maxLon: 127.19 },
        incheon:  { label: '인천', minLat: 37.30, maxLat: 37.62, minLon: 126.35, maxLon: 126.80 },
        busan:    { label: '부산', minLat: 35.05, maxLat: 35.40, minLon: 128.85, maxLon: 129.30 },
        daegu:    { label: '대구', minLat: 35.75, maxLat: 36.05, minLon: 128.40, maxLon: 128.80 },
        gwangju:  { label: '광주', minLat: 35.08, maxLat: 35.28, minLon: 126.70, maxLon: 127.02 },
        daejeon:  { label: '대전', minLat: 36.22, maxLat: 36.50, minLon: 127.28, maxLon: 127.56 },
        jeju:     { label: '제주', minLat: 33.10, maxLat: 33.62, minLon: 126.10, maxLon: 127.00 },
        gyeonggi: { label: '경기', minLat: 36.88, maxLat: 38.30, minLon: 126.30, maxLon: 127.90 }
    };
    var REGION_ORDER = ['seoul', 'incheon', 'busan', 'daegu', 'gwangju', 'daejeon', 'jeju', 'gyeonggi'];

    /* 지도를 덜 허전하게 만드는 지명 — tier 1: 도시, tier 2: 동네/랜드마크 */
    var PLACES = [
        // 광역 도시
        [1, '서울', 37.566, 126.978], [1, '인천', 37.456, 126.705], [1, '수원', 37.264, 127.029],
        [1, '춘천', 37.881, 127.730], [1, '대전', 36.351, 127.385], [1, '청주', 36.642, 127.489],
        [1, '전주', 35.824, 127.148], [1, '광주', 35.160, 126.851], [1, '대구', 35.872, 128.601],
        [1, '부산', 35.180, 129.075], [1, '울산', 35.538, 129.311], [1, '포항', 36.019, 129.343],
        [1, '강릉', 37.752, 128.876], [1, '제주', 33.499, 126.531], [1, '서귀포', 33.254, 126.560],
        [1, '창원', 35.228, 128.682], [1, '목포', 34.812, 126.392], [1, '여수', 34.760, 127.662],
        [1, '안동', 36.568, 128.730], [1, '천안', 36.815, 127.114], [1, '원주', 37.342, 127.920],
        [1, '속초', 38.207, 128.592], [1, '경주', 35.856, 129.225], [1, '순천', 34.951, 127.488],
        // 서울 · 수도권 동네
        [2, '여의도', 37.526, 126.928], [2, '강남', 37.498, 127.028], [2, '잠실', 37.513, 127.100],
        [2, '홍대', 37.557, 126.924], [2, '종로', 37.573, 126.979], [2, '성수', 37.545, 127.056],
        [2, '용산', 37.532, 126.990], [2, '상암', 37.579, 126.890], [2, '반포', 37.503, 126.996],
        [2, '뚝섬', 37.531, 127.066], [2, '올림픽공원', 37.521, 127.121], [2, '남산', 37.551, 126.988],
        [2, '북한산', 37.659, 126.979], [2, '서울숲', 37.544, 127.037], [2, '난지', 37.568, 126.877],
        [2, '양재천', 37.478, 127.043], [2, '청계천', 37.569, 127.005], [2, '월드컵공원', 37.571, 126.884],
        [2, '보라매', 37.492, 126.920], [2, '석촌호수', 37.510, 127.103], [2, '광나루', 37.545, 127.117],
        [2, '일산', 37.658, 126.770], [2, '분당', 37.383, 127.119], [2, '판교', 37.395, 127.111],
        [2, '미사', 37.563, 127.193], [2, '광교', 37.298, 127.046], [2, '동탄', 37.201, 127.075],
        [2, '과천', 37.429, 126.988], [2, '송도', 37.383, 126.643],
        // 기타 도시 내 랜드마크
        [2, '해운대', 35.159, 129.160], [2, '광안리', 35.153, 129.118], [2, '서면', 35.158, 129.059],
        [2, '수성못', 35.833, 128.618], [2, '갑천', 36.354, 127.351], [2, '이호테우', 33.494, 126.454]
    ];

    function regionOf(lat, lon) {
        for (var i = 0; i < REGION_ORDER.length; i++) {
            var k = REGION_ORDER[i], b = REGIONS[k];
            if (lat >= b.minLat && lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon) return k;
        }
        return 'other';
    }

    /* 공개 유틸 — 본문 상세지도(post.js)와 도구에서 재사용 */
    window.RunMapUtil = {
        haversine: haversine,
        pathDistance: pathDistance,
        decodePolyline: decodePolyline,
        parseGpx: parseGpx,
        simplify: simplify,
        tierOf: tierOf,
        regionOf: regionOf,
        REGIONS: REGIONS,
        CONFIG: CONFIG
    };

    /* =====================================================================
     * 2. 스킨 경로 해석 + 데이터 로딩
     * ===================================================================== */
    var CURRENT_SCRIPT = document.currentScript || document.getElementById('skin-map-script');

    function skinPath() {
        var src = (CURRENT_SCRIPT && CURRENT_SCRIPT.src) || '';
        if (src) return src.replace(/[^/]*$/, '');
        var helper = document.getElementById('skin-path-helper');
        if (helper && helper.src) return helper.src.replace(/[^/]*$/, '');
        return './images/';
    }
    var BASE = skinPath();
    window.RunMapUtil.skinPath = BASE;

    function getJson(url) {
        return fetch(url, { credentials: 'same-origin' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; });
    }

    /** courses.json 항목 → 내부 코스 객체 */
    function normalizeCourse(c, index) {
        var points = null;
        if (c.polyline) points = decodePolyline(c.polyline);
        else if (Array.isArray(c.points) && c.points.length) {
            points = c.points.map(function (p) {
                return Array.isArray(p) ? { lat: p[0], lon: p[1] } : { lat: p.lat, lon: p.lon };
            });
        }
        if (!points || points.length < 2) return null;

        var dist = isFinite(c.distance) ? Number(c.distance) : pathDistance(points);
        var mid = points[Math.floor(points.length / 2)];
        var bounds = c.bounds && c.bounds.length === 4
            ? { minLat: c.bounds[0], minLon: c.bounds[1], maxLat: c.bounds[2], maxLon: c.bounds[3] }
            : boundsOf(points);

        return {
            id: c.id || ('course-' + index),
            title: c.title || c.name || '러닝 코스',
            link: c.link || c.url || '',
            date: c.date || '',
            distance: dist,
            elevGain: isFinite(c.elevGain) ? c.elevGain : null,
            duration: isFinite(c.duration) ? c.duration : null,
            difficulty: c.difficulty || null,
            region: c.region || regionOf(mid.lat, mid.lon),
            points: points,
            bounds: bounds,
            tier: tierOf(dist),
            // 렌더용 캐시
            simplified: null,
            projected: null,
            animProgress: 1,
            phase: (index % 7) / 7
        };
    }

    function boundsOf(points) {
        var b = { minLat: Infinity, maxLat: -Infinity, minLon: Infinity, maxLon: -Infinity };
        for (var i = 0; i < points.length; i++) {
            var p = points[i];
            if (p.lat < b.minLat) b.minLat = p.lat;
            if (p.lat > b.maxLat) b.maxLat = p.lat;
            if (p.lon < b.minLon) b.minLon = p.lon;
            if (p.lon > b.maxLon) b.maxLon = p.lon;
        }
        return b;
    }

    /** 구버전 mapData.js 의 gpxFiles 를 런타임 파싱 (호환용) */
    function loadLegacyGpx() {
        var legacy = (window.MAP_DATA && window.MAP_DATA.gpxFiles) || [];
        if (!legacy.length) return Promise.resolve([]);
        return Promise.all(legacy.map(function (file, i) {
            var url = file.url || (BASE + file.filename);
            return fetch(url, { credentials: 'same-origin' })
                .then(function (r) { return r.ok ? r.text() : null; })
                .then(function (xml) {
                    if (!xml) return null;
                    var parsed = parseGpx(xml);
                    if (!parsed) return null;
                    return normalizeCourse({
                        id: file.id || ('legacy-' + i),
                        title: file.title || parsed.name || '러닝 코스',
                        link: file.link || file.url,
                        date: (parsed.time || '').slice(0, 10),
                        points: parsed.points
                    }, i);
                })
                .catch(function () { return null; });
        })).then(function (list) { return list.filter(Boolean); });
    }

    /* courses.json 을 어디서 읽을지.
       mapData.js 에 coursesUrl 이 있으면 거기서 먼저 받고, 못 받으면
       스킨에 올려둔 파일로 되돌아갑니다. CDN 이 잠깐 죽어도 지도는 뜹니다. */
    function fetchCourseData() {
        var skinFile = BASE + 'courses.json';
        var remote = (window.MAP_DATA && window.MAP_DATA.coursesUrl) || '';
        if (!remote) return getJson(skinFile);

        return getJson(remote).then(function (data) {
            if (data) return data;
            if (window.console) console.warn('[러닝맵] coursesUrl 을 읽지 못해 스킨 파일로 대신합니다:', remote);
            return getJson(skinFile);
        });
    }

    function loadCourses() {
        return fetchCourseData().then(function (data) {
            var fromJson = [];
            var restaurants = [];

            if (data) {
                var raw = Array.isArray(data) ? data : (data.courses || []);
                fromJson = raw.map(normalizeCourse).filter(Boolean);
                if (Array.isArray(data.restaurants)) restaurants = data.restaurants.slice();
            }

            // mapData.js 의 맛집은 항상 병합 (수동 관리 가능)
            var manual = (window.MAP_DATA && window.MAP_DATA.restaurants) || [];
            manual.forEach(function (r) {
                if (!restaurants.some(function (x) { return x.title === r.title; })) restaurants.push(r);
            });

            return loadLegacyGpx().then(function (legacy) {
                // courses.json 에 같은 id 가 있으면 legacy 는 무시
                var seen = {};
                fromJson.forEach(function (c) { seen[c.id] = true; });
                var merged = fromJson.concat(legacy.filter(function (c) { return !seen[c.id]; }));

                restaurants = restaurants
                    .map(function (r, i) {
                        var lat = Number(r.lat), lon = Number(r.lon != null ? r.lon : r.lng);
                        if (!isFinite(lat) || !isFinite(lon)) return null;
                        return {
                            id: r.id || ('rest-' + i),
                            title: r.title || '맛집',
                            url: r.url || r.link || '',
                            desc: r.desc || '',
                            courseId: r.courseId || r.course || '',
                            lat: lat, lon: lon,
                            region: r.region || regionOf(lat, lon),
                            projected: null
                        };
                    })
                    .filter(Boolean);

                return { courses: merged, restaurants: restaurants };
            });
        });
    }

    window.RunMapData = { load: loadCourses };

    /* =====================================================================
     * 3. 지도 엔진
     * ===================================================================== */
    function createEngine(canvas, opts) {
        opts = opts || {};
        var ctx = canvas.getContext('2d');
        var host = canvas.parentElement;

        // 베이스 레이어(오프스크린) — 뷰포트보다 넉넉하게 그려서 팬 중 여백이 안 보이게
        var BASE_PAD = 1.35;
        var base = document.createElement('canvas');
        var bctx = base.getContext('2d');
        var baseViewport = null;

        var W = 0, H = 0, dpr = 1;
        var viewport = { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 };
        var homeViewport = null;

        var geo = null, rivers = null, parks = null;
        var courses = [], restaurants = [];
        var userLoc = null;

        var hovered = null;       // {type, data}
        var focusedId = null;
        var interacting = false;
        var frameQueued = false;
        var flight = null;        // 뷰포트 이동 애니메이션
        var t0 = performance.now();
        var lastDraw = 0;
        var onScreen = true;
        var paused = false;
        function resume() {
            if (paused && onScreen && !document.hidden) { paused = false; requestFrame(); }
        }
        if (window.IntersectionObserver) {
            new IntersectionObserver(function (entries) {
                onScreen = entries[entries.length - 1].isIntersecting;
                resume();
            }).observe(host);
        }
        document.addEventListener('visibilitychange', resume);

        /* ---------------- 크기 / DPR ---------------- */
        function resize() {
            var rect = host.getBoundingClientRect();
            if (rect.width < 2 || rect.height < 2) return false;
            var nextDpr = Math.min(window.devicePixelRatio || 1, 2);
            // 크기가 그대로면 캔버스를 다시 만들지 않습니다.
            // 폰에서는 스크롤할 때마다 주소창이 숨었다 나타나며 resize 가 쏟아지는데,
            // 그때마다 캔버스를 새로 잡고 베이스 지도를 다시 그리면 화면이 멈추고 탭이 죽습니다.
            if (rect.width === W && rect.height === H && nextDpr === dpr) return false;
            dpr = nextDpr;
            W = rect.width;
            H = rect.height;
            canvas.width = Math.round(W * dpr);
            canvas.height = Math.round(H * dpr);
            canvas.style.width = W + 'px';
            canvas.style.height = H + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            base.width = Math.round(W * BASE_PAD * dpr);
            base.height = Math.round(H * BASE_PAD * dpr);
            baseViewport = null; // 강제 재생성
            return true;
        }

        /* ---------------- 투영 ---------------- */
        function project(lat, lon) {
            return {
                x: ((lon - viewport.minLon) / (viewport.maxLon - viewport.minLon)) * W,
                y: H - ((lat - viewport.minLat) / (viewport.maxLat - viewport.minLat)) * H
            };
        }

        function unproject(x, y) {
            return {
                lon: viewport.minLon + (x / W) * (viewport.maxLon - viewport.minLon),
                lat: viewport.minLat + ((H - y) / H) * (viewport.maxLat - viewport.minLat)
            };
        }

        /** 현재 뷰포트에서 1픽셀이 몇 km 인지 */
        function kmPerPx() {
            var midLat = (viewport.minLat + viewport.maxLat) / 2;
            var lonSpan = viewport.maxLon - viewport.minLon;
            return (lonSpan * 111.32 * Math.cos(midLat * Math.PI / 180)) / W;
        }

        /** 화면비에 맞춰 bounds 를 꽉 채우는 뷰포트 계산 */
        function computeFit(b, padding) {
            padding = padding == null ? 0.22 : padding;
            var latD = Math.max(b.maxLat - b.minLat, 0.004);
            var lonD = Math.max(b.maxLon - b.minLon, 0.004);
            var midLat = (b.minLat + b.maxLat) / 2;
            var cosLat = Math.cos(midLat * Math.PI / 180);

            var minLat = b.minLat, maxLat = b.maxLat, minLon = b.minLon, maxLon = b.maxLon;
            var mapRatio = (lonD * cosLat) / latD;
            var canRatio = W / H;

            if (mapRatio > canRatio) {
                var needLat = (lonD * cosLat) / canRatio;
                var padLat = (needLat - latD) / 2;
                minLat -= padLat; maxLat += padLat;
            } else {
                var needLon = (latD * canRatio) / cosLat;
                var padLon = (needLon - lonD) / 2;
                minLon -= padLon; maxLon += padLon;
            }
            var pLat = (maxLat - minLat) * padding;
            var pLon = (maxLon - minLon) * padding;
            return {
                minLat: minLat - pLat, maxLat: maxLat + pLat,
                minLon: minLon - pLon, maxLon: maxLon + pLon
            };
        }

        function setViewport(v) {
            if (!v || !isFinite(v.minLat) || !isFinite(v.maxLat) || !isFinite(v.minLon) || !isFinite(v.maxLon)) return;
            var latSpan = clamp(v.maxLat - v.minLat, CONFIG.minSpan, CONFIG.maxSpan);
            var cLat = (v.minLat + v.maxLat) / 2;
            var cLon = (v.minLon + v.maxLon) / 2;
            var lonSpan = (v.maxLon - v.minLon) * (latSpan / Math.max(v.maxLat - v.minLat, 1e-9));
            viewport.minLat = cLat - latSpan / 2;
            viewport.maxLat = cLat + latSpan / 2;
            viewport.minLon = cLon - lonSpan / 2;
            viewport.maxLon = cLon + lonSpan / 2;
            requestFrame();
        }

        /** 부드럽게 이동 */
        function flyTo(target, duration) {
            var from = {
                minLat: viewport.minLat, maxLat: viewport.maxLat,
                minLon: viewport.minLon, maxLon: viewport.maxLon
            };
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                setViewport(target);
                return;
            }
            flight = {
                from: from, to: target,
                start: performance.now(),
                dur: duration || CONFIG.flyDuration
            };
            requestFrame();
        }

        /* ---------------- 베이스 레이어 ---------------- */
        function baseNeedsRedraw() {
            if (!baseViewport) return true;
            var vLat = viewport.maxLat - viewport.minLat;
            var bLat = baseViewport.maxLat - baseViewport.minLat;
            var zoomRatio = bLat / vLat;
            if (zoomRatio > 1.9 || zoomRatio < 1.05) return true;
            // 팬으로 베이스 밖이 보이려 하면
            if (viewport.minLon < baseViewport.minLon || viewport.maxLon > baseViewport.maxLon) return true;
            if (viewport.minLat < baseViewport.minLat || viewport.maxLat > baseViewport.maxLat) return true;
            return false;
        }

        function baseProject(lat, lon, bv, bw, bh) {
            return {
                x: ((lon - bv.minLon) / (bv.maxLon - bv.minLon)) * bw,
                y: bh - ((lat - bv.minLat) / (bv.maxLat - bv.minLat)) * bh
            };
        }

        function renderBase() {
            var cLat = (viewport.minLat + viewport.maxLat) / 2;
            var cLon = (viewport.minLon + viewport.maxLon) / 2;
            var latSpan = (viewport.maxLat - viewport.minLat) * BASE_PAD;
            var lonSpan = (viewport.maxLon - viewport.minLon) * BASE_PAD;
            baseViewport = {
                minLat: cLat - latSpan / 2, maxLat: cLat + latSpan / 2,
                minLon: cLon - lonSpan / 2, maxLon: cLon + lonSpan / 2
            };

            var bw = base.width / dpr, bh = base.height / dpr;
            bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            bctx.clearRect(0, 0, bw, bh);

            var P = CONFIG.palette;
            var bv = baseViewport;
            var pr = function (lat, lon) { return baseProject(lat, lon, bv, bw, bh); };

            /* --- 바다 --- */
            var sea = bctx.createLinearGradient(0, 0, bw * 0.3, bh);
            sea.addColorStop(0, P.seaTop);
            sea.addColorStop(1, P.seaBottom);
            bctx.fillStyle = sea;
            bctx.fillRect(0, 0, bw, bh);

            /* --- 바다 잔물결(빈티지 등고선 느낌) --- */
            bctx.save();
            bctx.strokeStyle = P.seaLine;
            bctx.lineWidth = 1;
            for (var wy = -bh; wy < bh * 2; wy += 26) {
                bctx.beginPath();
                for (var wx = 0; wx <= bw; wx += 8) {
                    var yy = wy + Math.sin((wx / bw) * Math.PI * 6) * 3;
                    wx === 0 ? bctx.moveTo(wx, yy) : bctx.lineTo(wx, yy);
                }
                bctx.stroke();
            }
            bctx.restore();

            if (!geo || !geo.features) { paperGrain(bctx, bw, bh); return; }

            /* --- 육지 --- */
            var minPx = 0.6;
            function traceRing(c2, ring) {
                var started = false, px = -1e9, py = -1e9;
                for (var i = 0; i < ring.length; i++) {
                    var p = pr(ring[i][1], ring[i][0]);
                    if (!started) { c2.moveTo(p.x, p.y); started = true; px = p.x; py = p.y; continue; }
                    if (Math.abs(p.x - px) < minPx && Math.abs(p.y - py) < minPx && i !== ring.length - 1) continue;
                    c2.lineTo(p.x, p.y);
                    px = p.x; py = p.y;
                }
                c2.closePath();
            }

            var landPath = new Path2D();
            geo.features.forEach(function (f) {
                if (!f.__bbox) f.__bbox = featureBBox(f);
                if (!bboxIntersects(f.__bbox, bv)) return;
                var g = f.geometry;
                if (g.type === 'Polygon') g.coordinates.forEach(function (r) { traceRing(landPath, r); });
                else if (g.type === 'MultiPolygon') g.coordinates.forEach(function (poly) {
                    poly.forEach(function (r) { traceRing(landPath, r); });
                });
            });

            // 해안 글로우
            bctx.save();
            bctx.shadowColor = 'rgba(120,150,170,.35)';
            bctx.shadowBlur = 16;
            bctx.shadowOffsetY = 4;
            var land = bctx.createLinearGradient(0, 0, 0, bh);
            land.addColorStop(0, P.landTop);
            land.addColorStop(1, P.landBottom);
            bctx.fillStyle = land;
            bctx.fill(landPath, 'evenodd');
            bctx.restore();

            // 육지 안쪽 미세 결
            bctx.save();
            bctx.clip(landPath, 'evenodd');
            paperGrain(bctx, bw, bh);

            /* --- 공원 / 호수 --- */
            if (parks && parks.features) {
                parks.features.forEach(function (f) {
                    if (!f.__bbox) f.__bbox = featureBBox(f);
                    if (!bboxIntersects(f.__bbox, bv)) return;
                    if (f.geometry.type !== 'Polygon') return;
                    var isWater = f.properties && f.properties.type === 'water';
                    var path = new Path2D();
                    f.geometry.coordinates.forEach(function (r) { traceRing(path, r); });
                    bctx.save();
                    bctx.shadowColor = isWater ? 'rgba(90,150,190,.35)' : 'rgba(100,150,90,.3)';
                    bctx.shadowBlur = 8;
                    bctx.fillStyle = isWater ? P.water : P.park;
                    bctx.fill(path, 'evenodd');
                    bctx.restore();
                    bctx.strokeStyle = isWater ? P.waterEdge : P.parkEdge;
                    bctx.lineWidth = 1;
                    bctx.stroke(path);
                });
            }

            /* --- 강 --- */
            if (rivers && rivers.features) {
                var zoomK = clamp(6 / Math.max(viewport.maxLat - viewport.minLat, 0.01), 0.6, 6);
                bctx.save();
                bctx.lineCap = 'round';
                bctx.lineJoin = 'round';
                bctx.strokeStyle = 'rgba(255,255,255,.5)';
                bctx.lineWidth = clamp(zoomK * 0.9, 1.4, 9);
                var riverPath = new Path2D();
                rivers.features.forEach(function (f) {
                    if (!f.__bbox) f.__bbox = featureBBox(f);
                    if (!bboxIntersects(f.__bbox, bv)) return;
                    var g = f.geometry;
                    var lines = g.type === 'LineString' ? [g.coordinates]
                              : g.type === 'MultiLineString' ? g.coordinates : [];
                    lines.forEach(function (line) {
                        var started = false, px = -1e9, py = -1e9;
                        for (var i = 0; i < line.length; i++) {
                            var p = pr(line[i][1], line[i][0]);
                            if (!started) { riverPath.moveTo(p.x, p.y); started = true; px = p.x; py = p.y; continue; }
                            if (Math.abs(p.x - px) < minPx && Math.abs(p.y - py) < minPx) continue;
                            riverPath.lineTo(p.x, p.y);
                            px = p.x; py = p.y;
                        }
                    });
                });
                bctx.stroke(riverPath);                        // 흰 테두리
                bctx.strokeStyle = P.river;
                bctx.lineWidth = clamp(zoomK * 0.55, 0.9, 6);
                bctx.stroke(riverPath);                        // 물빛
                bctx.restore();
            }
            bctx.restore(); // clip 해제

            // 해안선
            bctx.strokeStyle = P.landEdge;
            bctx.lineWidth = 1.1;
            bctx.stroke(landPath);

            /* --- 위경도 격자 (여백을 지도답게 채워줌) --- */
            var span = viewport.maxLat - viewport.minLat;
            var gridStep = span > 4 ? 1 : span > 1.2 ? 0.5 : span > 0.4 ? 0.1 : span > 0.12 ? 0.05 : 0.01;
            bctx.save();
            bctx.strokeStyle = 'rgba(150,130,105,.10)';
            bctx.lineWidth = 1;
            var latStart = Math.ceil(bv.minLat / gridStep) * gridStep;
            for (var gl = latStart; gl <= bv.maxLat; gl += gridStep) {
                var gy = pr(gl, bv.minLon).y;
                bctx.beginPath(); bctx.moveTo(0, gy); bctx.lineTo(bw, gy); bctx.stroke();
            }
            var lonStart = Math.ceil(bv.minLon / gridStep) * gridStep;
            for (var gn = lonStart; gn <= bv.maxLon; gn += gridStep) {
                var gx = pr(bv.minLat, gn).x;
                bctx.beginPath(); bctx.moveTo(gx, 0); bctx.lineTo(gx, bh); bctx.stroke();
            }
            bctx.restore();

            /* --- 지명 라벨 --- */
            var drawn = [];
            function placeFree(x, y, w, h) {
                for (var i = 0; i < drawn.length; i++) {
                    var d = drawn[i];
                    if (x - w / 2 < d.x + d.w / 2 && x + w / 2 > d.x - d.w / 2 &&
                        y - h / 2 < d.y + d.h / 2 && y + h / 2 > d.y - d.h / 2) return false;
                }
                return true;
            }

            function label(text, x, y, size, color, weight, dot) {
                bctx.font = weight + ' ' + size + 'px Pretendard, -apple-system, sans-serif';
                var w = bctx.measureText(text).width + 10;
                var h = size + 8;
                if (x < -20 || x > bw + 20 || y < -20 || y > bh + 20) return;
                if (!placeFree(x, y, w, h)) return;
                drawn.push({ x: x, y: y, w: w, h: h });
                if (dot) {
                    bctx.beginPath();
                    bctx.arc(x, y - size * 0.95, 2.6, 0, Math.PI * 2);
                    bctx.fillStyle = 'rgba(150,120,90,.5)';
                    bctx.fill();
                }
                bctx.lineWidth = 3.5;
                bctx.strokeStyle = 'rgba(255,255,255,.85)';
                bctx.strokeText(text, x, y);
                bctx.fillStyle = color;
                bctx.fillText(text, x, y);
            }

            bctx.save();
            bctx.textAlign = 'center';
            bctx.textBaseline = 'middle';

            // 광역 지역명 — 넓게 볼 때만, 가장 옅게
            if (span > 0.9) {
                REGION_ORDER.forEach(function (key) {
                    var r = REGIONS[key];
                    var p = pr((r.minLat + r.maxLat) / 2, (r.minLon + r.maxLon) / 2);
                    label(r.label, p.x, p.y, Math.round(clamp(12 + span, 13, 19)), 'rgba(140,120,96,.45)', '800', false);
                });
            }

            // 도시 / 동네
            var showTier = span > 2.6 ? 0 : span > 0.35 ? 1 : 2;
            if (showTier > 0) {
                PLACES.forEach(function (pl) {
                    if (pl[0] > showTier) return;
                    if (showTier === 2 && pl[0] === 1 && span > 0.14) return;
                    var p = pr(pl[2], pl[3]);
                    var size = pl[0] === 1 ? (showTier === 1 ? 12 : 11) : 11;
                    label(pl[1], p.x, p.y, size,
                          pl[0] === 1 ? 'rgba(112,94,74,.8)' : 'rgba(132,114,92,.72)',
                          pl[0] === 1 ? '700' : '600', true);
                });
            }
            bctx.restore();
        }

        function paperGrain(c2, w, h) {
            c2.save();
            c2.globalAlpha = 0.06;
            c2.fillStyle = '#8a7658';
            for (var i = 0; i < (w * h) / 900; i++) {
                c2.fillRect((Math.random() * w) | 0, (Math.random() * h) | 0, 1, 1);
            }
            c2.restore();
        }

        function featureBBox(f) {
            var b = { minLat: Infinity, maxLat: -Infinity, minLon: Infinity, maxLon: -Infinity };
            var walk = function (arr) {
                if (typeof arr[0] === 'number') {
                    if (arr[1] < b.minLat) b.minLat = arr[1];
                    if (arr[1] > b.maxLat) b.maxLat = arr[1];
                    if (arr[0] < b.minLon) b.minLon = arr[0];
                    if (arr[0] > b.maxLon) b.maxLon = arr[0];
                } else { arr.forEach(walk); }
            };
            if (f.geometry && f.geometry.coordinates) walk(f.geometry.coordinates);
            return b;
        }

        function bboxIntersects(b, v) {
            return !(b.maxLat < v.minLat || b.minLat > v.maxLat || b.maxLon < v.minLon || b.minLon > v.maxLon);
        }

        /* ---------------- 코스 / 핀 렌더 ---------------- */
        function projectCourses() {
            var minPx = 1.1;
            courses.forEach(function (c) {
                var pts = c.points, out = [], px = -1e9, py = -1e9;
                for (var i = 0; i < pts.length; i++) {
                    var p = project(pts[i].lat, pts[i].lon);
                    if (i === 0 || i === pts.length - 1 ||
                        Math.abs(p.x - px) >= minPx || Math.abs(p.y - py) >= minPx) {
                        out.push(p); px = p.x; py = p.y;
                    }
                }
                c.projected = out;
                // 누적 길이 (그리기 애니메이션용)
                var cum = [0];
                for (var j = 1; j < out.length; j++) {
                    cum.push(cum[j - 1] + Math.hypot(out[j].x - out[j - 1].x, out[j].y - out[j - 1].y));
                }
                c.cumLen = cum;
            });
            restaurants.forEach(function (r) { r.projected = project(r.lat, r.lon); });
        }

        function tracePartial(c2, pts, cum, progress) {
            if (pts.length < 2) return;
            var total = cum[cum.length - 1];
            var target = total * progress;
            c2.moveTo(pts[0].x, pts[0].y);
            for (var i = 1; i < pts.length; i++) {
                if (cum[i] <= target) { c2.lineTo(pts[i].x, pts[i].y); continue; }
                var seg = cum[i] - cum[i - 1];
                var t = seg > 0 ? (target - cum[i - 1]) / seg : 0;
                c2.lineTo(pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
                          pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t);
                return;
            }
        }

        /** 경로 위 비율 t(0~1) 지점의 화면 좌표 */
        function pointAt(pts, cum, t) {
            if (!pts || pts.length < 2) return null;
            var target = cum[cum.length - 1] * clamp(t, 0, 1);
            for (var i = 1; i < pts.length; i++) {
                if (cum[i] < target) continue;
                var seg = cum[i] - cum[i - 1];
                var k = seg > 0 ? (target - cum[i - 1]) / seg : 0;
                return {
                    x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k,
                    y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k
                };
            }
            return pts[pts.length - 1];
        }

        function drawCourses(now) {
            var anyFocus = !!focusedId || (hovered && hovered.type === 'course');
            var focusId = focusedId || (hovered && hovered.type === 'course' ? hovered.data.id : null);

            courses.forEach(function (c) {
                var pts = c.projected;
                if (!pts || pts.length < 2) return;
                // 화면 밖이면 건너뛰기
                if (!bboxIntersects(c.bounds, viewport)) return;

                var active = !anyFocus || c.id === focusId;
                var prog = c.animProgress;

                ctx.save();
                ctx.globalAlpha = active ? 1 : 0.22;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                // 1) 외곽 글로우
                ctx.save();
                ctx.shadowColor = c.tier.glow;
                ctx.shadowBlur = active ? 16 : 8;
                ctx.strokeStyle = c.tier.glow;
                ctx.lineWidth = active ? 9 : 6;
                ctx.beginPath(); tracePartial(ctx, pts, c.cumLen, prog); ctx.stroke();
                ctx.restore();

                // 2) 흰 케이싱
                ctx.strokeStyle = 'rgba(255,255,255,.95)';
                ctx.lineWidth = active ? 7 : 5;
                ctx.beginPath(); tracePartial(ctx, pts, c.cumLen, prog); ctx.stroke();

                // 3) 코어 그라데이션
                var s = pts[0], e = pts[pts.length - 1];
                var grad = ctx.createLinearGradient(s.x, s.y, e.x, e.y);
                grad.addColorStop(0, c.tier.core);
                grad.addColorStop(1, c.tier.edge);
                ctx.strokeStyle = grad;
                ctx.lineWidth = active ? 4.2 : 3;
                ctx.beginPath(); tracePartial(ctx, pts, c.cumLen, prog); ctx.stroke();

                // 4) 흐르는 점선 + 달려가는 점 — "달리는 중" 느낌
                if (active && prog >= 1) {
                    ctx.save();
                    ctx.strokeStyle = 'rgba(255,255,255,.9)';
                    ctx.lineWidth = 2.4;
                    ctx.setLineDash([3, 14]);
                    ctx.lineDashOffset = -((now - t0) / 20) % 17;
                    ctx.beginPath(); tracePartial(ctx, pts, c.cumLen, 1); ctx.stroke();
                    ctx.restore();

                    var runner = pointAt(pts, c.cumLen, ((now - t0) / 6200 + c.phase) % 1);
                    if (runner) {
                        ctx.save();
                        ctx.shadowColor = c.tier.core;
                        ctx.shadowBlur = 12;
                        ctx.beginPath();
                        ctx.arc(runner.x, runner.y, 3.4, 0, Math.PI * 2);
                        ctx.fillStyle = '#fff';
                        ctx.fill();
                        ctx.restore();
                    }
                }

                // 5) 시작점 마커 (맥박)
                if (prog > 0.02) {
                    var pulse = 0.5 + 0.5 * Math.sin((now - t0) / 480);
                    if (active) {
                        ctx.beginPath();
                        ctx.arc(s.x, s.y, 8 + pulse * 6, 0, Math.PI * 2);
                        ctx.fillStyle = c.tier.glow.replace(/[\d.]+\)$/, (0.22 - pulse * 0.14).toFixed(2) + ')');
                        ctx.fill();
                    }
                    ctx.beginPath();
                    ctx.arc(s.x, s.y, active ? 6 : 4.5, 0, Math.PI * 2);
                    ctx.fillStyle = c.tier.core;
                    ctx.fill();
                    ctx.lineWidth = 2.2;
                    ctx.strokeStyle = '#fff';
                    ctx.stroke();
                }

                // 6) 도착점 (순환 코스가 아니면 체크 플래그)
                if (prog >= 1 && Math.hypot(e.x - s.x, e.y - s.y) > 14) {
                    ctx.beginPath();
                    ctx.arc(e.x, e.y, active ? 5.5 : 4, 0, Math.PI * 2);
                    ctx.fillStyle = '#fff';
                    ctx.fill();
                    ctx.lineWidth = 2.6;
                    ctx.strokeStyle = c.tier.core;
                    ctx.stroke();
                }
                ctx.restore();

                // 7) 거리 칩 — 확대했거나 포커스 상태일 때만
                if (prog >= 1 && (active && (kmPerPx() * W < 26 || c.id === focusId))) {
                    drawChip(s.x, s.y - 22, c.distance.toFixed(1) + 'km', c.tier.core, active ? 1 : 0.3);
                }
            });
        }

        function drawChip(x, y, text, color, alpha) {
            ctx.save();
            ctx.globalAlpha = alpha == null ? 1 : alpha;
            ctx.font = '700 11px Pretendard, -apple-system, sans-serif';
            var w = ctx.measureText(text).width + 16;
            var h = 20;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h, w, h, 10);
            else ctx.rect(x - w / 2, y - h, w, h);
            ctx.fillStyle = color;
            ctx.shadowColor = 'rgba(0,0,0,.18)';
            ctx.shadowBlur = 6;
            ctx.shadowOffsetY = 2;
            ctx.fill();
            ctx.shadowColor = 'transparent';
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, x, y - h / 2 + 0.5);
            ctx.restore();
        }

        function drawPins(now) {
            restaurants.forEach(function (r) {
                var p = r.projected;
                if (!p || p.x < -40 || p.x > W + 40 || p.y < -50 || p.y > H + 40) return;
                var isHover = hovered && hovered.type === 'restaurant' && hovered.data === r;
                var lift = isHover ? 4 + Math.sin((now - t0) / 160) * 1.5 : 0;
                var y = p.y - lift;
                var scale = isHover ? 1.15 : 1;

                ctx.save();
                ctx.translate(p.x, y);
                ctx.scale(scale, scale);

                // 그림자
                ctx.save();
                ctx.scale(1, 0.4);
                ctx.beginPath();
                ctx.arc(0, (lift + 2) / 0.4, 6, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(70,55,40,.18)';
                ctx.fill();
                ctx.restore();

                // 물방울 핀
                ctx.beginPath();
                ctx.moveTo(0, 2);
                ctx.bezierCurveTo(-9, -8, -10, -16, 0, -24);
                ctx.bezierCurveTo(10, -16, 9, -8, 0, 2);
                ctx.closePath();
                var pg = ctx.createLinearGradient(0, -24, 0, 2);
                pg.addColorStop(0, '#ffb066');
                pg.addColorStop(1, CONFIG.palette.pin);
                ctx.fillStyle = pg;
                ctx.shadowColor = 'rgba(255,138,61,.45)';
                ctx.shadowBlur = isHover ? 12 : 6;
                ctx.fill();
                ctx.shadowColor = 'transparent';
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#fff';
                ctx.stroke();

                ctx.font = '10px serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('🍽', 0, -14);
                ctx.restore();
            });
        }

        function drawUser(now) {
            if (!userLoc) return;
            var p = project(userLoc.lat, userLoc.lon);
            var t = ((now - t0) % 2200) / 2200;
            ctx.save();
            ctx.beginPath();
            ctx.arc(p.x, p.y, 10 + t * 26, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(61,139,255,' + (0.22 * (1 - t)).toFixed(3) + ')';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(61,139,255,.16)';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#3d8bff';
            ctx.fill();
            ctx.lineWidth = 2.4;
            ctx.strokeStyle = '#fff';
            ctx.stroke();
            ctx.restore();
        }

        /** 축척 막대 */
        function drawScaleBar() {
            var kpp = kmPerPx();
            if (!isFinite(kpp) || kpp <= 0) return;
            var targetPx = Math.min(110, W * 0.28);
            var rawKm = kpp * targetPx;
            var pow = Math.pow(10, Math.floor(Math.log10(rawKm)));
            var nice = [1, 2, 5, 10].map(function (n) { return n * pow; })
                .reduce(function (a, b) { return Math.abs(b - rawKm) < Math.abs(a - rawKm) ? b : a; });
            var px = nice / kpp;
            var label = nice >= 1 ? nice + 'km' : Math.round(nice * 1000) + 'm';

            var x = W - px - 16, y = H - 16;
            ctx.save();
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(255,255,255,.85)';
            ctx.beginPath();
            ctx.moveTo(x, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + px, y); ctx.lineTo(x + px, y - 5);
            ctx.stroke();
            ctx.lineWidth = 1.4;
            ctx.strokeStyle = 'rgba(90,76,60,.75)';
            ctx.stroke();
            ctx.font = '700 10px Pretendard, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(255,255,255,.85)';
            ctx.strokeText(label, x + px / 2, y - 6);
            ctx.fillStyle = 'rgba(90,76,60,.9)';
            ctx.fillText(label, x + px / 2, y - 6);
            ctx.restore();
        }

        function drawVignette() {
            var g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
            g.addColorStop(0, 'rgba(0,0,0,0)');
            g.addColorStop(1, 'rgba(90,70,45,.13)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);
        }

        /* ---------------- 합성 / 프레임 루프 ---------------- */
        function composite() {
            ctx.clearRect(0, 0, W, H);
            if (!baseViewport) { renderBase(); }

            var bw = base.width / dpr, bh = base.height / dpr;
            var bv = baseViewport;
            var vLon = viewport.maxLon - viewport.minLon;
            var vLat = viewport.maxLat - viewport.minLat;

            var sx = ((bv.maxLon - bv.minLon) * W) / (bw * vLon);
            var dx = ((bv.minLon - viewport.minLon) / vLon) * W;
            var sy = (H * (bv.maxLat - bv.minLat)) / (vLat * bh);
            var dy = H - (H * (bv.minLat - viewport.minLat)) / vLat - sy * bh;

            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(base, dx, dy, bw * sx, bh * sy);
        }

        function needsAnimation() {
            if (flight) return true;
            if (userLoc) return true;
            for (var i = 0; i < courses.length; i++) {
                if (courses[i].animProgress < 1) return true;
            }
            return courses.length > 0 || (hovered && hovered.type === 'restaurant');
        }

        function frame(now) {
            frameQueued = false;
            if (!(W > 0) || !(H > 0)) return;
            // 화면 밖이거나 탭이 숨겨졌으면 멈춥니다. 다시 보이면 이어서 그립니다.
            if (!onScreen || document.hidden) { paused = true; return; }

            // 코스 위를 달리는 점 같은 상시 애니메이션은 30fps 면 충분합니다.
            if (!flight && !interacting && !hovered && now - lastDraw < 32 && courses.every(function (c) { return c.animProgress >= 1; })) {
                requestFrame();
                return;
            }
            lastDraw = now;

            // 뷰포트 이동 애니메이션
            if (flight) {
                var t = clamp((now - flight.start) / flight.dur, 0, 1);
                var k = easeInOutCubic(t);
                var f = flight.from, to = flight.to;
                viewport.minLat = f.minLat + (to.minLat - f.minLat) * k;
                viewport.maxLat = f.maxLat + (to.maxLat - f.maxLat) * k;
                viewport.minLon = f.minLon + (to.minLon - f.minLon) * k;
                viewport.maxLon = f.maxLon + (to.maxLon - f.maxLon) * k;
                if (t >= 1) { flight = null; baseViewport = null; }
            }

            // 인터랙션 중이 아닐 때만 베이스 재생성 (팬/줌 중엔 비트맵 스트레치)
            if (!interacting && !flight && baseNeedsRedraw()) renderBase();

            composite();
            projectCourses();

            // 코스 그리기 애니메이션 진행
            courses.forEach(function (c) {
                if (c.animProgress < 1) {
                    c.animProgress = clamp(c.animProgress + 0.022, 0, 1);
                }
            });

            drawCourses(now);
            drawPins(now);
            drawUser(now);
            drawVignette();
            drawScaleBar();

            if (needsAnimation()) requestFrame();
        }

        function requestFrame() {
            if (frameQueued) return;
            frameQueued = true;
            requestAnimationFrame(frame);
        }

        /* ---------------- 줌 / 팬 ---------------- */
        function zoomAt(cx, cy, factor) {
            var center = unproject(cx, cy);
            var latSpan = (viewport.maxLat - viewport.minLat) * factor;
            var lonSpan = (viewport.maxLon - viewport.minLon) * factor;
            if (latSpan < CONFIG.minSpan || latSpan > CONFIG.maxSpan) return;

            var rx = cx / W, ry = (H - cy) / H;
            viewport.minLon = center.lon - lonSpan * rx;
            viewport.maxLon = center.lon + lonSpan * (1 - rx);
            viewport.minLat = center.lat - latSpan * ry;
            viewport.maxLat = center.lat + latSpan * (1 - ry);
            requestFrame();
        }

        function panPx(dxPx, dyPx) {
            var lonPerPx = (viewport.maxLon - viewport.minLon) / W;
            var latPerPx = (viewport.maxLat - viewport.minLat) / H;
            viewport.minLon -= dxPx * lonPerPx;
            viewport.maxLon -= dxPx * lonPerPx;
            viewport.minLat += dyPx * latPerPx;
            viewport.maxLat += dyPx * latPerPx;
            requestFrame();
        }

        /* ---------------- 히트 테스트 ---------------- */
        function sqDistToSegment(p, a, b) {
            var dx = b.x - a.x, dy = b.y - a.y;
            var l2 = dx * dx + dy * dy;
            if (l2 === 0) return (p.x - a.x) * (p.x - a.x) + (p.y - a.y) * (p.y - a.y);
            var t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1);
            var qx = a.x + t * dx, qy = a.y + t * dy;
            return (p.x - qx) * (p.x - qx) + (p.y - qy) * (p.y - qy);
        }

        function hitTest(x, y, tolerance) {
            var tol = tolerance || 14;
            var p = { x: x, y: y };
            for (var i = 0; i < restaurants.length; i++) {
                var r = restaurants[i];
                if (!r.projected) continue;
                var d = Math.hypot(x - r.projected.x, y - (r.projected.y - 12));
                if (d < tol + 6) return { type: 'restaurant', data: r };
            }
            var best = null, bestD = tol * tol;
            for (var j = 0; j < courses.length; j++) {
                var c = courses[j];
                if (!c.projected) continue;
                for (var k = 0; k < c.projected.length - 1; k++) {
                    var d2 = sqDistToSegment(p, c.projected[k], c.projected[k + 1]);
                    if (d2 < bestD) { bestD = d2; best = { type: 'course', data: c }; }
                }
            }
            return best;
        }

        /* ---------------- 공개 API ---------------- */
        var api = {
            get viewport() { return viewport; },
            get courses() { return courses; },
            get restaurants() { return restaurants; },
            project: project,
            unproject: unproject,
            hitTest: hitTest,
            requestFrame: requestFrame,
            resize: function () { if (resize()) requestFrame(); },
            setData: function (d) {
                courses = d.courses || [];
                restaurants = d.restaurants || [];
                requestFrame();
            },
            setGeo: function (g, r, p) { geo = g; rivers = r; parks = p; baseViewport = null; requestFrame(); },
            setUserLocation: function (loc) { userLoc = loc; requestFrame(); },
            setHovered: function (h) { hovered = h; requestFrame(); },
            get hovered() { return hovered; },
            setFocus: function (id) { focusedId = id; requestFrame(); },
            setInteracting: function (v) {
                interacting = v;
                if (!v) { requestFrame(); }
            },
            zoomAt: zoomAt,
            zoomCenter: function (f) { zoomAt(W / 2, H / 2, f); },
            panPx: panPx,
            computeFit: computeFit,
            setViewport: setViewport,
            flyTo: flyTo,
            get size() { return { w: W, h: H }; },
            get home() { return homeViewport; },
            setHome: function (v) { homeViewport = { minLat: v.minLat, maxLat: v.maxLat, minLon: v.minLon, maxLon: v.maxLon }; },
            kmPerPx: kmPerPx,
            playCourse: function (c) {
                courses.forEach(function (x) { x.animProgress = 1; });
                c.animProgress = 0;
                requestFrame();
            }
        };

        if (!resize()) {
            // 컨테이너가 아직 0 크기 (숨김/레이아웃 전) → 크기가 생기면 초기화
            if (window.ResizeObserver) {
                var ro = new ResizeObserver(function () {
                    if (resize()) { ro.disconnect(); requestFrame(); if (opts.onReady) opts.onReady(); }
                });
                ro.observe(host);
            }
        }
        return api;
    }

    window.RunMapEngine = { create: createEngine };

    /* =====================================================================
     * 4. 홈 지도 부트스트랩
     * ===================================================================== */
    function boot() {
        var canvas = document.getElementById('route-canvas');
        if (!canvas) return;

        var host = canvas.parentElement;
        // 홈이 아닌 페이지에서는 지도 컨테이너가 display:none 이다 → 데이터도 받지 않고 종료
        if (getComputedStyle(host).display === 'none') return;

        var tooltip = document.getElementById('map-tooltip');
        var hint = document.getElementById('map-hint');
        var statusEl = document.getElementById('map-status');

        host.classList.add('is-loading');

        var map = createEngine(canvas);
        window.RunMap = map;          // 콘솔에서 지도를 직접 제어할 수 있는 핸들
        var data = { courses: [], restaurants: [] };
        var currentRegion = 'all';
        var engaged = false;   // 데스크톱: 클릭해서 지도에 집중한 상태

        /* ---------- 데이터 로드 ---------- */
        Promise.all([
            getJson(BASE + 'korea.json'),
            getJson(BASE + 'rivers.json'),
            getJson(BASE + 'parks.json'),
            loadCourses()
        ]).then(function (res) {
            var geo = res[0], rivers = res[1], parks = res[2];
            data = res[3];

            host.classList.remove('is-loading');
            if (!geo) {
                host.classList.add('is-error');
                if (statusEl) statusEl.textContent = '지도 데이터를 불러오지 못했습니다. korea.json 업로드를 확인해 주세요.';
                return;
            }

            map.setGeo(geo, rivers, parks);
            map.setData(data);

            var b = data.courses.length
                ? data.courses.reduce(function (acc, c) {
                    return {
                        minLat: Math.min(acc.minLat, c.bounds.minLat),
                        maxLat: Math.max(acc.maxLat, c.bounds.maxLat),
                        minLon: Math.min(acc.minLon, c.bounds.minLon),
                        maxLon: Math.max(acc.maxLon, c.bounds.maxLon)
                    };
                }, { minLat: 90, maxLat: -90, minLon: 180, maxLon: -180 })
                : { minLat: 33.0, maxLat: 38.7, minLon: 125.9, maxLon: 129.8 };

            var fit = map.computeFit(b, data.courses.length ? 0.15 : 0.04);
            map.setHome(fit);
            map.setViewport(fit);

            // 첫 진입 시 코스가 순서대로 그려지는 연출
            if (!window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                data.courses.forEach(function (c, i) {
                    c.animProgress = 0;
                    setTimeout(function () { c.animProgress = 0.001; map.requestFrame(); }, i * 130);
                });
            }

            buildRegionCounts();
            updatePanels('all');
            updateSummary();
            map.requestFrame();
        });

        /* ---------- HUD 요약 ---------- */
        function updateSummary() {
            var totalKm = data.courses.reduce(function (s, c) { return s + c.distance; }, 0);
            setText('map-total-distance', totalKm >= 1000 ? (totalKm / 1000).toFixed(1) + 'k' : totalKm.toFixed(0));
            setText('map-total-courses', String(data.courses.length));
            setText('map-total-restaurants', String(data.restaurants.length));
        }

        function setText(id, v) {
            var el = document.getElementById(id);
            if (el) el.textContent = v;
        }

        /* ---------- 지역 카운트 ---------- */
        function buildRegionCounts() {
            document.querySelectorAll('.map-region-item').forEach(function (btn) {
                var key = btn.dataset.region;
                if (key === 'all') return;
                var n = data.courses.filter(function (c) { return c.region === key; }).length +
                        data.restaurants.filter(function (r) { return r.region === key; }).length;
                var badge = btn.querySelector('.region-count');
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'region-count';
                    btn.appendChild(badge);
                }
                badge.textContent = n ? '(' + n + ')' : '';
                btn.classList.toggle('is-empty', n === 0);
            });
        }

        /* ---------- 드롭다운 패널 ---------- */
        function updatePanels(region) {
            currentRegion = region;
            var cs = region === 'all' ? data.courses : data.courses.filter(function (c) { return c.region === region; });
            var rs = region === 'all' ? data.restaurants : data.restaurants.filter(function (r) { return r.region === region; });

            setText('count-routes', '(' + cs.length + ')');
            setText('count-restaurants', '(' + rs.length + ')');

            var dc = document.getElementById('dropdown-routes');
            if (dc) {
                dc.innerHTML = cs.length
                    ? cs.map(function (c) {
                        return '<button type="button" class="stat-item" data-id="' + esc(c.id) + '">' +
                               '<span class="stat-item-dot" style="background:' + c.tier.core + '"></span>' +
                               '<span class="stat-item-name">' + esc(c.title) + '</span>' +
                               '<span class="stat-item-meta">' + c.distance.toFixed(1) + 'km</span></button>';
                    }).join('')
                    : '<div class="stat-item is-empty">해당 지역 코스가 없습니다</div>';
            }

            var dr = document.getElementById('dropdown-restaurants');
            if (dr) {
                dr.innerHTML = rs.length
                    ? rs.map(function (r) {
                        return '<button type="button" class="stat-item" data-id="' + esc(r.id) + '">' +
                               '<span class="stat-item-dot" style="background:' + CONFIG.palette.pin + '"></span>' +
                               '<span class="stat-item-name">' + esc(r.title) + '</span></button>';
                    }).join('')
                    : '<div class="stat-item is-empty">해당 지역 맛집이 없습니다</div>';
            }
        }

        function esc(s) {
            return String(s).replace(/[&<>"']/g, function (m) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
            });
        }

        /* ---------- 툴팁 ---------- */
        function showTooltip(x, y, hit) {
            if (!tooltip) return;
            var html;
            if (hit.type === 'restaurant') {
                html = '<strong>🍽️ ' + esc(hit.data.title) + '</strong>' +
                       (hit.data.desc ? '<span>' + esc(hit.data.desc) + '</span>' : '');
            } else {
                var c = hit.data;
                var bits = [c.distance.toFixed(1) + 'km'];
                if (c.elevGain != null) bits.push('↗ ' + Math.round(c.elevGain) + 'm');
                if (c.date) bits.push(c.date);
                html = '<strong>🏃 ' + esc(c.title) + '</strong><span>' + bits.join(' · ') + '</span>';
            }
            tooltip.innerHTML = html;
            tooltip.classList.add('visible');
            var size = map.size;
            var tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
            tooltip.style.left = clamp(x, tw / 2 + 8, size.w - tw / 2 - 8) + 'px';
            tooltip.style.top = clamp(y - 16, th + 8, size.h - 8) + 'px';
        }

        function hideTooltip() {
            if (tooltip) tooltip.classList.remove('visible');
        }

        function flashHint(msg) {
            if (!hint) return;
            hint.textContent = msg;
            hint.classList.add('visible');
            clearTimeout(flashHint._t);
            flashHint._t = setTimeout(function () { hint.classList.remove('visible'); }, 1600);
        }

        /* ---------- 포인터: 드래그 팬 / 호버 / 클릭 ---------- */
        var drag = null, moved = 0;

        function localPoint(e) {
            var r = canvas.getBoundingClientRect();
            return { x: e.clientX - r.left, y: e.clientY - r.top };
        }

        canvas.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            var p = localPoint(e);
            drag = { x: p.x, y: p.y };
            moved = 0;
            engaged = true;
            map.setInteracting(true);
            canvas.classList.add('is-dragging');
        });

        window.addEventListener('mousemove', function (e) {
            if (!drag) return;
            var p = localPoint(e);
            var dx = p.x - drag.x, dy = p.y - drag.y;
            moved += Math.abs(dx) + Math.abs(dy);
            map.panPx(dx, dy);
            drag.x = p.x; drag.y = p.y;
            hideTooltip();
        });

        window.addEventListener('mouseup', function () {
            if (!drag) return;
            drag = null;
            map.setInteracting(false);
            canvas.classList.remove('is-dragging');
        });

        canvas.addEventListener('mousemove', function (e) {
            if (drag) return;
            var p = localPoint(e);
            var hit = map.hitTest(p.x, p.y);
            map.setHovered(hit);
            if (hit) {
                canvas.style.cursor = 'pointer';
                showTooltip(p.x, p.y, hit);
            } else {
                canvas.style.cursor = 'grab';
                hideTooltip();
            }
        });

        canvas.addEventListener('mouseleave', function () {
            map.setHovered(null);
            hideTooltip();
        });

        canvas.addEventListener('click', function (e) {
            if (moved > 6) return;
            var p = localPoint(e);
            var hit = map.hitTest(p.x, p.y, 18);
            if (!hit) return;
            go(hit);
        });

        /** 글 주소가 있으면 그 글로, 없으면 제목으로 블로그 내 검색 */
        function go(hit) {
            var url = hit.type === 'restaurant' ? hit.data.url : hit.data.link;
            if (url) { window.location.href = url; return; }
            var title = hit.data.title;
            if (title) window.location.href = '/search/' + encodeURIComponent(title);
            else flashHint('연결된 글이 아직 없습니다');
        }

        /* ---------- 휠 줌 (페이지 스크롤을 뺏지 않도록) ---------- */
        canvas.addEventListener('wheel', function (e) {
            var force = e.ctrlKey || e.metaKey;
            if (!force && !engaged) {
                flashHint('Ctrl(⌘) + 스크롤 또는 지도를 클릭 후 확대·축소');
                return;                         // 페이지 스크롤 유지
            }
            e.preventDefault();
            var p = localPoint(e);
            map.setInteracting(true);
            map.zoomAt(p.x, p.y, e.deltaY > 0 ? 1.14 : 0.88);
            clearTimeout(canvas.__wheelT);
            canvas.__wheelT = setTimeout(function () { map.setInteracting(false); }, 160);
        }, { passive: false });

        document.addEventListener('click', function (e) {
            if (!host.contains(e.target)) engaged = false;
        });

        /* ---------- 터치: 두 손가락 팬 + 핀치, 한 손가락은 페이지 스크롤 ---------- */
        var touch = null, tapStart = null;

        canvas.addEventListener('touchstart', function (e) {
            if (e.touches.length === 2) {
                e.preventDefault();
                touch = twoFingerState(e);
                map.setInteracting(true);
            } else if (e.touches.length === 1) {
                var r = canvas.getBoundingClientRect();
                tapStart = {
                    x: e.touches[0].clientX - r.left,
                    y: e.touches[0].clientY - r.top,
                    t: Date.now(), scrolled: false
                };
            }
        }, { passive: false });

        canvas.addEventListener('touchmove', function (e) {
            if (e.touches.length === 2 && touch) {
                e.preventDefault();
                var now = twoFingerState(e);
                map.panPx(now.cx - touch.cx, now.cy - touch.cy);
                if (touch.dist > 0) map.zoomAt(now.cx, now.cy, touch.dist / now.dist);
                touch = now;
            } else if (e.touches.length === 1 && tapStart) {
                var r = canvas.getBoundingClientRect();
                var dx = Math.abs(e.touches[0].clientX - r.left - tapStart.x);
                var dy = Math.abs(e.touches[0].clientY - r.top - tapStart.y);
                if (dx > 8 || dy > 8) {
                    if (!tapStart.scrolled) flashHint('두 손가락으로 지도를 움직여 보세요');
                    tapStart.scrolled = true;
                }
            }
        }, { passive: false });

        canvas.addEventListener('touchend', function (e) {
            if (touch && e.touches.length < 2) {
                touch = null;
                map.setInteracting(false);
            }
            if (tapStart && !tapStart.scrolled && Date.now() - tapStart.t < 500) {
                var hit = map.hitTest(tapStart.x, tapStart.y, 22);
                if (hit) {
                    var cur = map.hovered;
                    if (cur && cur.data === hit.data) {
                        go(hit);
                    } else {
                        // 첫 탭: 정보만 보여주고, 한 번 더 탭하면 이동
                        map.setHovered(hit);
                        showTooltip(tapStart.x, tapStart.y, hit);
                    }
                } else {
                    map.setHovered(null);
                    hideTooltip();
                }
            }
            tapStart = null;
        });

        function twoFingerState(e) {
            var r = canvas.getBoundingClientRect();
            var a = e.touches[0], b = e.touches[1];
            return {
                cx: (a.clientX + b.clientX) / 2 - r.left,
                cy: (a.clientY + b.clientY) / 2 - r.top,
                dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
            };
        }

        /* ---------- 컨트롤 버튼 ---------- */
        function focusCourse(c) {
            map.setFocus(c.id);
            map.playCourse(c);
            map.flyTo(map.computeFit(c.bounds, 0.22));
            setTimeout(function () { map.setFocus(null); }, 2600);
        }

        on('map-zoom-in', function () { map.zoomCenter(0.72); });
        on('map-zoom-out', function () { map.zoomCenter(1.38); });
        on('map-reset', function () {
            if (map.home) map.flyTo(map.home);
            map.setFocus(null);
            updatePanels('all');
            markRegion('all');
        });
        on('map-gps', function (btn) {
            if (!navigator.geolocation) { flashHint('이 브라우저는 위치 기능을 지원하지 않습니다'); return; }
            btn.classList.add('is-busy');
            navigator.geolocation.getCurrentPosition(function (pos) {
                btn.classList.remove('is-busy');
                var loc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
                map.setUserLocation(loc);
                map.flyTo(map.computeFit({
                    minLat: loc.lat - 0.02, maxLat: loc.lat + 0.02,
                    minLon: loc.lon - 0.02, maxLon: loc.lon + 0.02
                }, 0.1));
                // 가장 가까운 코스 안내
                var near = data.courses.map(function (c) {
                    return { c: c, d: haversine(loc, c.points[0]) };
                }).sort(function (a, b) { return a.d - b.d; })[0];
                if (near) flashHint('가장 가까운 코스: ' + near.c.title + ' (' + near.d.toFixed(1) + 'km)');
            }, function () {
                btn.classList.remove('is-busy');
                flashHint('위치 권한이 필요합니다');
            }, { enableHighAccuracy: true, timeout: 8000 });
        });

        function on(id, fn) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('click', function (e) { e.stopPropagation(); fn(el, e); });
        }

        /* ---------- 드롭다운 ---------- */
        var dropdowns = ['map-region-dropdown', 'dropdown-routes', 'dropdown-restaurants']
            .map(function (id) { return document.getElementById(id); }).filter(Boolean);

        function closeAll(except) {
            dropdowns.forEach(function (d) {
                if (d !== except) {
                    d.classList.remove('open');
                    var t = d.previousElementSibling;
                    if (t && t.setAttribute) t.setAttribute('aria-expanded', 'false');
                }
            });
        }

        function toggle(btnId, dropId) {
            var btn = document.getElementById(btnId), drop = document.getElementById(dropId);
            if (!btn || !drop) return;
            btn.setAttribute('aria-expanded', 'false');
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var open = !drop.classList.contains('open');
                closeAll(open ? drop : null);
                drop.classList.toggle('open', open);
                btn.setAttribute('aria-expanded', String(open));
            });
        }

        toggle('map-region-toggle', 'map-region-dropdown');
        toggle('btn-stat-routes', 'dropdown-routes');
        toggle('btn-stat-restaurants', 'dropdown-restaurants');

        document.addEventListener('click', function () { closeAll(null); });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { closeAll(null); hideTooltip(); }
        });

        function markRegion(key) {
            document.querySelectorAll('.map-region-item').forEach(function (b) {
                b.classList.toggle('active', b.dataset.region === key);
            });
            var label = document.getElementById('map-region-label');
            if (label) label.textContent = key === 'all' ? '전체' : (REGIONS[key] ? REGIONS[key].label : '전체');
        }

        var regionDrop = document.getElementById('map-region-dropdown');
        if (regionDrop) {
            regionDrop.addEventListener('click', function (e) {
                var btn = e.target.closest('.map-region-item');
                if (!btn) return;
                var key = btn.dataset.region;
                if (key === 'all') {
                    if (map.home) map.flyTo(map.home);
                } else {
                    var b = REGIONS[key];
                    map.flyTo(map.computeFit({
                        minLat: b.minLat, maxLat: b.maxLat, minLon: b.minLon, maxLon: b.maxLon
                    }, 0.06));
                }
                updatePanels(key);
                markRegion(key);
            });
        }

        var dRoutes = document.getElementById('dropdown-routes');
        if (dRoutes) {
            dRoutes.addEventListener('click', function (e) {
                var btn = e.target.closest('.stat-item[data-id]');
                if (!btn) return;
                var c = data.courses.filter(function (x) { return x.id === btn.dataset.id; })[0];
                if (c) focusCourse(c);
            });
        }

        var dRest = document.getElementById('dropdown-restaurants');
        if (dRest) {
            dRest.addEventListener('click', function (e) {
                var btn = e.target.closest('.stat-item[data-id]');
                if (!btn) return;
                var r = data.restaurants.filter(function (x) { return x.id === btn.dataset.id; })[0];
                if (!r) return;
                map.setHovered({ type: 'restaurant', data: r });
                map.flyTo(map.computeFit({
                    minLat: r.lat - 0.008, maxLat: r.lat + 0.008,
                    minLon: r.lon - 0.008, maxLon: r.lon + 0.008
                }, 0.1));
            });
        }

        /* ---------- 리사이즈 ---------- */
        var rt;
        window.addEventListener('resize', function () {
            clearTimeout(rt);
            rt = setTimeout(function () { map.resize(); }, 140);
        });
        if (window.ResizeObserver) {
            new ResizeObserver(function () {
                clearTimeout(rt);
                rt = setTimeout(function () { map.resize(); }, 140);
            }).observe(host);
        }

        markRegion('all');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
