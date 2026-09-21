/* =========================================================================
 * 최소 EXIF 리더 — 의존성 없음
 *   사진을 코스 위 어느 지점에서 찍었는지 계산하려면 촬영 시각이 필요합니다.
 *   sharp 로 리사이즈하면 메타데이터가 전부 날아가므로, 가공 전에 여기서 읽어둡니다.
 *
 *   읽는 값: DateTimeOriginal · OffsetTimeOriginal · Orientation · GPS 좌표 · 크기
 * ========================================================================= */

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

/** JPEG 에서 APP1(Exif) 세그먼트를 찾아 TIFF 블록의 시작 위치를 돌려준다 */
function findExifOffset(buf) {
    if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return -1;  // SOI 아님
    let p = 2;
    while (p + 4 <= buf.length) {
        if (buf[p] !== 0xff) { p++; continue; }
        const marker = buf[p + 1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { p += 2; continue; }
        if (marker === 0xda || marker === 0xd9) return -1;               // 이미지 데이터 시작
        const len = buf.readUInt16BE(p + 2);
        if (len < 2) return -1;
        if (marker === 0xe1 && buf.slice(p + 4, p + 10).toString('latin1') === 'Exif\0\0') {
            return p + 10;
        }
        p += 2 + len;
    }
    return -1;
}

function makeReader(buf, tiff) {
    const le = buf.slice(tiff, tiff + 2).toString('latin1') === 'II';
    return {
        le,
        u16: (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o)),
        u32: (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o))
    };
}

/** IFD 하나를 읽어 { tag: value } 로 돌려준다 */
function readIfd(buf, tiff, ifdOffset, r) {
    const out = {};
    const base = tiff + ifdOffset;
    if (base + 2 > buf.length) return out;

    const count = r.u16(base);
    for (let i = 0; i < count; i++) {
        const e = base + 2 + i * 12;
        if (e + 12 > buf.length) break;

        const tag = r.u16(e);
        const type = r.u16(e + 2);
        const num = r.u32(e + 4);
        const size = (TYPE_SIZE[type] || 0) * num;
        if (!size) continue;

        const valueOffset = size <= 4 ? e + 8 : tiff + r.u32(e + 8);
        if (valueOffset < 0 || valueOffset + size > buf.length) continue;

        if (type === 2) {
            // ASCII — 끝의 NUL 제거
            out[tag] = buf.slice(valueOffset, valueOffset + size).toString('latin1').replace(/\0.*$/, '').trim();
        } else if (type === 3) {
            out[tag] = num === 1 ? r.u16(valueOffset)
                                 : Array.from({ length: num }, (_, k) => r.u16(valueOffset + k * 2));
        } else if (type === 4) {
            out[tag] = num === 1 ? r.u32(valueOffset)
                                 : Array.from({ length: num }, (_, k) => r.u32(valueOffset + k * 4));
        } else if (type === 5) {
            const vals = Array.from({ length: num }, (_, k) => {
                const n = r.u32(valueOffset + k * 8);
                const d = r.u32(valueOffset + k * 8 + 4);
                return d ? n / d : 0;
            });
            out[tag] = num === 1 ? vals[0] : vals;
        }
    }
    return out;
}

/** GPS 도분초 배열 + 방향 → 십진 좌표 */
function toDecimal(dms, ref) {
    if (!Array.isArray(dms) || dms.length < 3) return null;
    const v = dms[0] + dms[1] / 60 + dms[2] / 3600;
    return (ref === 'S' || ref === 'W') ? -v : v;
}

/**
 * "2026:09:21 08:31:07" + "+09:00" → Date (UTC 기준)
 * 오프셋이 없으면 fallbackOffsetMin 을 쓴다 (기본 한국 +540분).
 * GPX 의 시각은 UTC 라 오프셋을 틀리면 사진이 엉뚱한 지점에 붙습니다.
 */
export function parseExifDate(str, offsetStr, fallbackOffsetMin = 540) {
    if (!str) return null;
    const m = String(str).match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    if (!m) return null;

    let offsetMin = fallbackOffsetMin;
    const om = offsetStr && String(offsetStr).match(/^([+-])(\d{2}):(\d{2})$/);
    if (om) offsetMin = (om[1] === '-' ? -1 : 1) * (Number(om[2]) * 60 + Number(om[3]));

    const localMs = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    const d = new Date(localMs - offsetMin * 60000);
    return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * 사진 버퍼 → { takenAt, offset, orientation, gps, width, height, hasExif }
 * EXIF 가 없거나 JPEG 가 아니면 값들이 null 입니다 (에러를 던지지 않습니다).
 */
export function readExif(buf, { fallbackOffsetMin = 540 } = {}) {
    const empty = { takenAt: null, offset: null, orientation: 1, gps: null, width: null, height: null, hasExif: false };

    const tiff = findExifOffset(buf);
    if (tiff < 0 || tiff + 8 > buf.length) return empty;

    const r = makeReader(buf, tiff);
    const ifd0Offset = r.u32(tiff + 4);
    const ifd0 = readIfd(buf, tiff, ifd0Offset, r);

    const exif = ifd0[0x8769] ? readIfd(buf, tiff, ifd0[0x8769], r) : {};
    const gpsIfd = ifd0[0x8825] ? readIfd(buf, tiff, ifd0[0x8825], r) : {};

    const dateStr = exif[0x9003] || exif[0x9004] || ifd0[0x0132] || null;   // Original → Digitized → DateTime
    const offsetStr = exif[0x9011] || exif[0x9010] || null;

    let gps = null;
    const lat = toDecimal(gpsIfd[0x0002], gpsIfd[0x0001]);
    const lon = toDecimal(gpsIfd[0x0004], gpsIfd[0x0003]);
    if (Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)) gps = { lat, lon };

    return {
        takenAt: parseExifDate(dateStr, offsetStr, fallbackOffsetMin),
        offset: offsetStr,
        orientation: Number.isFinite(ifd0[0x0112]) ? ifd0[0x0112] : 1,
        gps,
        width: exif[0xa002] ?? ifd0[0x0100] ?? null,
        height: exif[0xa003] ?? ifd0[0x0101] ?? null,
        hasExif: true
    };
}
