/* =========================================================================
 * 사진 가공 — 리사이즈 · EXIF 제거 · 회전 보정 · 커버 후보 선정
 * -------------------------------------------------------------------------
 *   ⚠️ 위치정보(EXIF GPS)는 여기서 반드시 지웁니다.
 *      집 근처 러닝 사진에 GPS 가 남아 있으면 사는 곳이 그대로 공개됩니다.
 *      촬영 시각은 지우기 전에 읽어서 코스 매칭에 쓰고, 파일에는 남기지 않습니다.
 *
 *   sharp 가 필요합니다:  npm install
 *   없으면 원본을 그대로 복사하고 경고합니다 (EXIF 가 남으므로 권장하지 않습니다).
 * ========================================================================= */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { readExif } from './exif.mjs';

export const PHOTO_EXT = /\.(jpe?g|png|heic|heif|webp)$/i;
export const MAX_EDGE = 1600;
export const JPEG_QUALITY = 82;

let sharpModule;
/** sharp 를 한 번만 불러온다 — 없으면 null */
export async function loadSharp() {
    if (sharpModule !== undefined) return sharpModule;
    try {
        sharpModule = (await import('sharp')).default;
    } catch {
        sharpModule = null;
    }
    return sharpModule;
}

/** 폴더에서 사진 파일을 찾아 이름순으로 돌려준다 */
export function listPhotos(dir) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
        .filter(f => PHOTO_EXT.test(f) && !f.startsWith('.'))
        .sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }))
        .map(f => join(dir, f));
}

/**
 * 사진 한 장 가공
 * @returns { source, out, takenAt, hadGps, orientation, width, height, landscape, bytes, stripped }
 */
export async function prepPhoto(srcPath, outPath, { fallbackOffsetMin = 540 } = {}) {
    const buf = readFileSync(srcPath);
    const exif = readExif(buf, { fallbackOffsetMin });
    const sharp = await loadSharp();

    const info = {
        source: srcPath,
        out: outPath,
        takenAt: exif.takenAt,
        offset: exif.offset,
        hadGps: !!exif.gps,
        orientation: exif.orientation,
        width: exif.width,
        height: exif.height,
        landscape: null,
        bytes: 0,
        stripped: false
    };

    if (!sharp) {
        // 가공 없이 복사 — EXIF(위치정보 포함)가 그대로 남습니다
        copyFileSync(srcPath, outPath);
        info.bytes = buf.length;
        info.stripped = false;
        if (exif.width && exif.height) info.landscape = exif.width >= exif.height;
        return info;
    }

    // .rotate() 를 인자 없이 부르면 EXIF Orientation 을 실제 픽셀에 적용합니다.
    // sharp 는 기본적으로 메타데이터를 출력에 싣지 않으므로 GPS 도 함께 사라집니다.
    const pipeline = sharp(buf, { failOn: 'none' })
        .rotate()
        .resize({
            width: MAX_EDGE,
            height: MAX_EDGE,
            fit: 'inside',
            withoutEnlargement: true
        })
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true });

    const { data, info: outInfo } = await pipeline.toBuffer({ resolveWithObject: true });
    writeFileSync(outPath, data);

    info.bytes = data.length;
    info.width = outInfo.width;
    info.height = outInfo.height;
    info.landscape = outInfo.width >= outInfo.height;
    info.stripped = true;
    return info;
}

/**
 * 커버(대표) 이미지 후보 순위
 *   - 가로 사진 우선 (목록 카드 썸네일이 가로로 잘립니다)
 *   - 코스 앞쪽 30% 안에서 찍힌 사진 우선 (코스 첫인상)
 *   - 해상도가 큰 쪽 우선
 * @param photos prepPhoto 결과 + { km } 가 붙은 배열
 * @param totalKm 코스 총 거리
 */
export function rankCovers(photos, totalKm) {
    return photos
        .map(p => {
            let score = 0;
            if (p.landscape) score += 40;
            if (Number.isFinite(p.km) && totalKm > 0) {
                const ratio = p.km / totalKm;
                if (ratio <= 0.3) score += 30;
                else if (ratio <= 0.6) score += 12;
            }
            score += Math.min(20, ((p.width || 0) * (p.height || 0)) / 200000);
            return { ...p, coverScore: Math.round(score) };
        })
        .sort((a, b) => b.coverScore - a.coverScore);
}

export function ensureDir(dir) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
}

export function niceName(index, srcPath) {
    const stem = basename(srcPath, extname(srcPath))
        .toLowerCase()
        .replace(/[^a-z0-9가-힣]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 24) || 'photo';
    return `${String(index + 1).padStart(2, '0')}-${stem}.jpg`;
}
