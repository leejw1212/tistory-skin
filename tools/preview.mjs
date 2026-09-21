#!/usr/bin/env node
/* =========================================================================
 * 티스토리에 올리기 전에 로컬에서 스킨을 확인하는 미리보기 생성기
 * -------------------------------------------------------------------------
 *   node tools/preview.mjs
 *   npx serve .        (또는)  python3 -m http.server 8777
 *   → http://localhost:8777/preview/
 *
 * skin.html 의 <s_*> 블록과 [##_치환자_##] 를 가짜 데이터로 채워
 * preview/index.html · post.html · category.html 을 만듭니다.
 * ========================================================================= */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'preview');

const stripBlock = (s, tag) => s.replace(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'g'), '');
const unwrap = (s, tag) => s.split(`<${tag}>`).join('').split(`</${tag}>`).join('');
const repeat = (s, tag, n) => {
    const m = s.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
    return m ? s.replace(m[0], m[1].repeat(n)) : s;
};

const POSTS = [
    ['러닝코스', '여의도 한강공원 5K — 주차부터 코스까지', '평지에 노면이 좋아 페이스 잡기 좋은 코스. 주차 정보와 급수대 위치까지 정리했습니다.', '2026.09.14'],
    ['맛집', '여의도 ○○버거 — 러닝 후 단백질 충전', '달리고 나서 바로 갈 수 있는 거리. 땀복 차림도 편한 분위기였습니다.', '2026.09.14'],
    ['제품리뷰', '○○ 러닝화 v3 — 240km 신어본 후기', '쿠션은 오래가지만 반응성은 아쉬웠습니다. 3개월 사용 후기.', '2026.09.08'],
    ['러닝코스', '올림픽공원 한 바퀴 — 4.8km 순환 코스', '주차가 편하고 그늘이 많아 여름에도 달릴 만합니다.', '2026.09.07'],
    ['러닝코스', '남산 순환로 10K — 언덕 훈련용', '오르막이 꾸준히 이어져 힘들지만 뷰가 보상해 줍니다.', '2026.08.30'],
    ['맛집', '성수 칼국수 — 저녁 러닝 후', '뜨끈한 국물로 마무리하기 좋은 곳.', '2026.08.24']
];

const POST_BODY = `
<div class="tt_article_useless_p_margin contents_style">
<h2>📍 코스 정보</h2>
<table>
<thead><tr><th>항목</th><th>내용</th></tr></thead>
<tbody>
<tr><td>📍 장소</td><td>여의도 한강공원 (서울 영등포구)</td></tr>
<tr><td>📏 거리</td><td>7.33 km</td></tr>
<tr><td>⏱️ 시간</td><td>30분</td></tr>
<tr><td>🅿️ 주차</td><td>여의도한강공원 주차장 · 30분 1,000원</td></tr>
<tr><td>🚇 접근성</td><td>5호선 여의나루역 2번 출구 도보 5분</td></tr>
<tr><td>⛰️ 난이도</td><td>★★☆☆☆ 평지 위주, 입문자도 편해요</td></tr>
<tr><td>🚰 급수대</td><td>3곳</td></tr>
<tr><td>🚻 화장실</td><td>4곳</td></tr>
</tbody>
</table>
<blockquote><p>📌 <strong>한 줄 요약</strong> — 평지에 노면이 좋아서 페이스 잡기 제일 좋은 코스.</p></blockquote>
<hr>
<h2>🅿️ 주차 &amp; 출발 지점</h2>
<blockquote><p>🅿️ <strong>주차 팁</strong> — 주말 오전 9시가 넘으면 1주차장이 꽉 찹니다.</p></blockquote>
<p><img src="https://picsum.photos/seed/park1/900/600" alt="주차장 입구 — 여의도한강공원 제1주차장"></p>
<p><img src="https://picsum.photos/seed/park2/900/600" alt="주차 요금 안내판"></p>
<p>차에서 내려 러닝 시작 지점까지는 도보 3분 정도 걸립니다.</p>
<blockquote><p>🚇 <strong>대중교통</strong> — 5호선 여의나루역 2번 출구로 나와 직진하면 바로 입구입니다.</p></blockquote>
<h2>🏃 코스 따라가기</h2>
<h3>0 ~ 2km · 물빛광장 구간</h3>
<p><img src="https://picsum.photos/seed/run1/1200/700" alt="출발 지점에서 바라본 코스"></p>
<p>우레탄 노면이라 무릎에 부담이 적습니다.</p>
<h3>2 ~ 4km · 마포대교 방향</h3>
<p><img src="https://picsum.photos/seed/run2/900/600" alt="마포대교 아래 구간"></p>
<p><img src="https://picsum.photos/seed/run3/900/600" alt="이 구간 급수대"></p>
<blockquote><p>💡 <strong>팁</strong> — 2km 지점 급수대는 겨울에 잠겨 있을 때가 있어요.</p></blockquote>
<h2>⛰️ 난이도 &amp; 누구에게 추천할까</h2>
<ul>
<li><input type="checkbox" checked disabled> 러닝 입문자 — 평지라 부담 없어요</li>
<li><input type="checkbox" checked disabled> 인터벌 훈련 — 직선 구간이 길어요</li>
<li><input type="checkbox" disabled> 언덕 훈련 — 오르막이 거의 없습니다</li>
</ul>
<pre><code class="language-bash">export PACE_TARGET="5:45"
run --route yeouido --laps 3</code></pre>
<h2>✅ 다녀온 소감</h2>
<blockquote><p>✅ <strong>또 올까요?</strong> — 네. 페이스 훈련하러 자주 올 것 같습니다.</p></blockquote>
<p>자세한 정보는 <a href="https://hangang.seoul.go.kr">한강공원 공식 사이트</a>에서 확인할 수 있습니다.</p>
</div>`;

function build(kind) {
    let s = readFileSync(join(ROOT, 'skin.html'), 'utf8');
    s = s.replace(/\.\/style\.css/g, '../style.css').replace(/\.\/images\//g, '../images/');
    s = unwrap(s, 's_t3');
    s = stripBlock(s, 's_notice_rep');

    let bodyId;
    if (kind === 'post') {
        bodyId = 'tt-body-page';
        s = stripBlock(s, 's_index_article_rep');
        s = stripBlock(s, 's_list');
        s = stripBlock(s, 's_no_article');
        s = stripBlock(s, 's_paging');
        s = stripBlock(s, 's_article_protected');
        ['s_article_rep', 's_permalink_article_rep', 's_tag_label', 's_rp',
         's_rp_container', 's_rp_input_form', 's_rp_member', 's_rp_guest'].forEach(t => { s = unwrap(s, t); });
        s = repeat(s, 's_rp_rep', 2);
        s = s.replace('[##_article_rep_desc_##]', POST_BODY);
    } else {
        bodyId = kind === 'index' ? 'tt-body-index' : 'tt-body-category';
        s = stripBlock(s, 's_permalink_article_rep');
        s = stripBlock(s, 's_no_article');
        s = kind === 'category' ? unwrap(s, 's_list') : stripBlock(s, 's_list');
        if (kind === 'category') {
            s = unwrap(s, 's_paging');
            s = repeat(s, 's_paging_rep', 4);
            s = unwrap(s, 's_article_rep_thumbnail');
            s = stripBlock(s, 's_article_rep_thumbnail_none');
        } else {
            s = stripBlock(s, 's_paging');
            s = stripBlock(s, 's_article_rep_thumbnail');
            s = unwrap(s, 's_article_rep_thumbnail_none');
        }

        // 글 목록은 항목마다 내용이 달라야 하므로 직접 만든다
        const m = s.match(/<s_index_article_rep>([\s\S]*?)<\/s_index_article_rep>/);
        if (m) {
            const cards = POSTS.map(([cat, title, summary, date], i) =>
                m[1]
                    .replace(/\[##_article_rep_link_##\]/g, 'post.html')
                    .replace(/\[##_article_rep_category_##\]/g, cat)
                    .replace(/\[##_article_rep_title_##\]/g, title)
                    .replace(/\[##_article_rep_summary_##\]/g, summary)
                    .replace(/\[##_article_rep_date_##\]/g, date)
                    .replace(/\[##_article_rep_thumbnail_url_##\]/g, `https://picsum.photos/seed/card${i}/640/400`)
            ).join('');
            s = s.replace(m[0], cards);
        }
        s = unwrap(s, 's_article_rep');
    }

    s = s.replace(/<\/?s_[a-z_]+>/g, '');

    const vars = {
        '[##_body_id_##]': bodyId,
        '[##_page_title_##]': kind === 'post' ? POSTS[0][1] : '달리고 먹고',
        '[##_title_##]': '달리고 먹고',
        '[##_blog_link_##]': 'index.html',
        '[##_rss_url_##]': '#',
        '[##_search_onclick_submit_##]': 'return false',
        '[##_search_name_##]': 'search',
        '[##_search_text_##]': '',
        '[##_list_conform_##]': '러닝코스',
        '[##_article_rep_category_##]': POSTS[0][0],
        '[##_article_rep_title_##]': POSTS[0][1],
        '[##_article_rep_date_##]': POSTS[0][3],
        '[##_article_rep_author_##]': 'leejw',
        '[##_tag_label_rep_##]': '<a href="#">여의도</a><a href="#">한강</a><a href="#">러닝코스</a>',
        '[##_rp_count_##]': '2',
        '[##_rp_rep_id_##]': 'rp1',
        '[##_rp_rep_name_##]': '러너K',
        '[##_rp_rep_date_##]': '2026.09.15 09:12',
        '[##_rp_rep_desc_##]': '주차 정보 너무 유용하네요! 이번 주말에 가봐야겠어요.',
        '[##_rp_rep_onclick_delete_##]': 'return false',
        '[##_rp_rep_onclick_reply_##]': 'return false',
        '[##_rp_onclick_submit_##]': 'return false',
        '[##_paging_rep_link_##]': 'href="#"',
        '[##_paging_rep_link_num_##]': '1',
        '[##_prev_page_##]': 'href="#"',
        '[##_next_page_##]': 'href="#"',
        '[##_count_today_##]': '128',
        '[##_count_total_##]': '24,931'
    };
    for (const [k, v] of Object.entries(vars)) s = s.split(k).join(v);
    return s.replace(/\[##_[a-z0-9_]+_##\]/g, '');
}

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
for (const kind of ['index', 'post', 'category']) {
    writeFileSync(join(OUT, `${kind}.html`), build(kind), 'utf8');
}

console.log('✅ preview/index.html · post.html · category.html 생성 완료');
console.log('   python3 -m http.server 8777   →  http://localhost:8777/preview/');
console.log('   (file:// 로 열면 JSON fetch 가 막혀 지도가 나오지 않습니다)');
