#!/usr/bin/env node
// 구글 드라이브에서 받은 사진을 러닝 폴더로 옮깁니다.
//
//   node tools/drive-import.mjs runs/2026-09-21-여의도 <내려받은-파일...>
//   node tools/drive-import.mjs runs/2026-09-21-여의도 --from <폴더>
//
// 커넥터로 사진을 내려받으면 { id, title, mimeType, content } 모양의 JSON 이 남습니다.
// content 는 base64 라서 그대로는 사진이 아닙니다. 이 도구가 원래 파일로 되돌리고,
// 촬영 시각을 읽어 어느 날 사진인지 바로 보여줍니다.
//
//   --day 2026-09-21   그 날 찍은 사진만 남기고 나머지는 건너뜁니다
//   --tz 540           촬영 시각에 오프셋이 없을 때 쓸 시간대 (기본: 한국)
//   --dry              실제로 쓰지 않고 무엇이 들어갈지만 봅니다

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { readExif } from './exif.mjs';
import { localDateString } from './gpx-core.mjs';

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/heic': '.heic', 'image/webp': '.webp' };

// EXIF 의 시간대는 "+09:00" 같은 문자열입니다. 날짜를 가르려면 분으로 바꿔야 합니다.
function offsetMinutes(offsetStr, fallback) {
    const m = offsetStr && String(offsetStr).match(/^([+-])(\d{2}):(\d{2})$/);
    if (!m) return fallback;
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

function usage(msg) {
    if (msg) console.error(`\n✗ ${msg}`);
    console.error(`
사용법: node tools/drive-import.mjs <러닝폴더> <내려받은-파일...>
        node tools/drive-import.mjs <러닝폴더> --from <폴더>

  --day YYYY-MM-DD  그 날 찍은 사진만
  --tz  540         촬영 시각에 시간대가 없을 때 (기본 540 = 한국)
  --dry             쓰지 않고 목록만
`);
    process.exit(msg ? 1 : 0);
}

// 커넥터가 남긴 JSON 한 개를 { name, buf } 로 되돌립니다. 사진이 아니면 null.
function decode(file) {
    let raw;
    try {
        raw = readFileSync(file, 'utf8');
    } catch {
        return null;
    }
    if (raw[0] !== '{') return null;
    let payload;
    try {
        payload = JSON.parse(raw);
    } catch {
        return null;
    }
    if (typeof payload.content !== 'string') return null;
    if (payload.mimeType && !payload.mimeType.startsWith('image/')) return null;

    const buf = Buffer.from(payload.content, 'base64');
    if (buf.length < 512) return null;

    let name = payload.title || payload.name || basename(file);
    if (!extname(name)) name += EXT[payload.mimeType] || '.jpg';
    return { name, buf, id: payload.id || '' };
}

function main(argv) {
    const files = [];
    let dest = '';
    let from = '';
    let day = '';
    let tz = 540;
    let dry = false;

    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--help' || a === '-h') usage();
        else if (a === '--from') from = argv[++i] || '';
        else if (a === '--day') day = argv[++i] || '';
        else if (a === '--tz') tz = Number(argv[++i]);
        else if (a === '--dry') dry = true;
        else if (a.startsWith('--')) usage(`모르는 옵션입니다: ${a}`);
        else if (!dest) dest = a;
        else files.push(a);
    }

    if (!dest) usage('러닝 폴더를 알려주세요.');
    if (!Number.isFinite(tz)) usage('--tz 는 분 단위 숫자입니다.');

    if (from) {
        let entries;
        try {
            entries = readdirSync(from);
        } catch {
            usage(`폴더를 열 수 없습니다: ${from}`);
        }
        for (const e of entries) {
            const p = join(from, e);
            if (statSync(p).isFile()) files.push(p);
        }
    }
    if (!files.length) usage('내려받은 파일을 하나도 못 찾았습니다.');

    if (!dry) mkdirSync(dest, { recursive: true });

    let saved = 0;
    let skipped = 0;
    for (const file of files.sort()) {
        const got = decode(file);
        if (!got) continue;

        const exif = readExif(got.buf, { fallbackOffsetMin: tz });
        const shot = exif.takenAt ? localDateString(exif.takenAt, offsetMinutes(exif.offset, tz)) : '';

        if (day && shot && shot !== day) {
            console.log(`  건너뜀  ${got.name} — ${shot} 에 찍은 사진입니다`);
            skipped++;
            continue;
        }

        const when = shot ? `${shot} 촬영` : '촬영 시각 없음';
        const where = exif.gps ? ' · 위치정보 있음 (글에는 안 들어갑니다)' : '';
        const kb = Math.round(got.buf.length / 1024);

        if (dry) {
            console.log(`  넣을 것  ${got.name}  ${kb}KB · ${when}${where}`);
        } else {
            writeFileSync(join(dest, got.name), got.buf);
            console.log(`  ✓ ${got.name}  ${kb}KB · ${when}${where}`);
        }
        saved++;
    }

    if (!saved && !skipped) {
        console.error('\n✗ 사진이 하나도 없습니다. 내려받은 JSON 이 맞는지 확인해 주세요.');
        process.exit(1);
    }

    console.log(`\n사진 ${saved}장${skipped ? ` (다른 날 ${skipped}장은 건너뜀)` : ''} → ${dest}`);
    if (!dry && saved) console.log(`다음: node tools/build-post.mjs ${dest}`);
}

main(process.argv.slice(2));
