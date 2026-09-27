#!/usr/bin/env node
/* =========================================================================
 * GA4 일별 방문자 → visitors.json
 * -------------------------------------------------------------------------
 * 홈 화면 '📈 방문자' 그래프가 읽는 파일을 만듭니다.
 * GitHub Actions(.github/workflows/visitors.yml)가 몇 시간마다 돌려서
 * stats 브랜치에 올리고, 스킨은 raw.githubusercontent.com 에서 받아 그립니다.
 *
 *   GA4_SA_KEY=$(cat key.json) node tools/ga4-visitors.mjs out/visitors.json
 *   node tools/ga4-visitors.mjs --sample preview/visitors.json   # 가짜 데이터
 *
 * 환경 변수
 *   GA4_SA_KEY       서비스 계정 JSON 키 (GA4 속성에 '뷰어'로 추가돼 있어야 함)
 *   GA4_PROPERTY_ID  GA4 속성 번호 (기본값: jjoyling.tistory.com 속성)
 *   GA4_DAYS         며칠치를 담을지 (기본 30)
 * ========================================================================= */
import { createSign } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const PROPERTY_ID = process.env.GA4_PROPERTY_ID || '365093958';
const DAYS = Math.max(7, Math.min(90, Number(process.env.GA4_DAYS) || 30));
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

const args = process.argv.slice(2);
const sample = args.includes('--sample');
const out = args.find((a) => !a.startsWith('--')) || 'visitors.json';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

async function accessToken(key) {
    const now = Math.floor(Date.now() / 1000);
    const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = b64url(JSON.stringify({
        iss: key.client_email,
        scope: SCOPE,
        aud: key.token_uri || 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600
    }));
    const signer = createSign('RSA-SHA256');
    signer.update(head + '.' + claim);
    const jwt = head + '.' + claim + '.' + b64url(signer.sign(key.private_key));

    const res = await fetch(key.token_uri || 'https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt })
    });
    const body = await res.json();
    if (!res.ok) throw new Error('토큰 발급 실패: ' + JSON.stringify(body));
    return body.access_token;
}

async function runReport(token) {
    const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY_ID}:runReport`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            // 날짜는 GA4 속성의 시간대(한국) 기준입니다.
            dateRanges: [{ startDate: `${DAYS - 1}daysAgo`, endDate: 'today' }],
            dimensions: [{ name: 'date' }],
            metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }],
            orderBys: [{ dimension: { dimensionName: 'date' } }],
            keepEmptyRows: true
        })
    });
    const body = await res.json();
    if (!res.ok) throw new Error('GA4 보고서 실패: ' + JSON.stringify(body));
    const rows = new Map();
    for (const r of body.rows || []) {
        const d = r.dimensionValues[0].value; // 20260927
        rows.set(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, {
            users: Number(r.metricValues[0].value) || 0,
            views: Number(r.metricValues[1].value) || 0
        });
    }
    return rows;
}

/** 한국 시간 기준 오늘부터 거꾸로 DAYS 일. 데이터가 없는 날은 0 으로 채웁니다. */
function dateList() {
    const today = new Date(Date.now() + 9 * 3600 * 1000);
    const list = [];
    for (let i = DAYS - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setUTCDate(d.getUTCDate() - i);
        list.push(d.toISOString().slice(0, 10));
    }
    return list;
}

async function main() {
    let rows;
    if (sample) {
        rows = new Map(dateList().map((date, i) => {
            const users = Math.round(20 + i * 1.5 + Math.sin(i / 2) * 8 + Math.random() * 6);
            return [date, { users, views: Math.round(users * 1.6) }];
        }));
    } else {
        if (!process.env.GA4_SA_KEY) throw new Error('GA4_SA_KEY 가 없습니다. (저장소 Settings → Secrets 에 서비스 계정 키를 넣어 주세요)');
        const key = JSON.parse(process.env.GA4_SA_KEY);
        rows = await runReport(await accessToken(key));
    }

    const days = dateList().map((date) => ({ date, ...(rows.get(date) || { users: 0, views: 0 }) }));
    const data = { source: 'ga4', property: PROPERTY_ID, updated: new Date().toISOString(), days };

    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(data) + '\n');
    const sum = days.reduce((s, d) => s + d.users, 0);
    console.log(`✓ ${out}: ${days[0].date} ~ ${days[days.length - 1].date}, 방문자 합계 ${sum}`);
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
