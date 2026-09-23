/* =========================================================================
 * Warm Life Skin — UI & 본문 향상 스크립트
 *   1. 헤더 / 모바일 메뉴 / 맨 위로
 *   2. 카테고리 컬러 매핑
 *   3. 카드 등장 애니메이션
 *   4. 홈 사이드바 탭 (캐시 적용)
 *   5. 마크다운 본문 꾸미기 (콜아웃 / 코드 / 표 / 이미지 / 목차)
 *   6. 러닝 코스 상세 (코스 정보 카드 · 본문 지도 · 근처 맛집)
 * ========================================================================= */
(function () {
    'use strict';

    var $ = function (sel, root) { return (root || document).querySelector(sel); };
    var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    document.documentElement.classList.add('js');

    function ready(fn) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
        else fn();
    }

    /* =====================================================================
     * 1. 헤더 / 스크롤
     * ===================================================================== */
    function initChrome() {
        var header = $('#header');
        var toTop = $('.back-to-top');
        var progress = $('#read-progress');
        var ticking = false;

        function onScroll() {
            var y = window.scrollY || window.pageYOffset;
            if (header) header.classList.toggle('scrolled', y > 10);
            if (toTop) toTop.classList.toggle('visible', y > 400);
            if (progress) {
                var doc = document.documentElement;
                var max = doc.scrollHeight - doc.clientHeight;
                progress.style.transform = 'scaleX(' + (max > 0 ? Math.min(y / max, 1) : 0) + ')';
            }
            ticking = false;
        }

        window.addEventListener('scroll', function () {
            if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
        }, { passive: true });
        onScroll();

        if (toTop) {
            toTop.addEventListener('click', function () {
                window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
            });
        }

        /* 모바일 메뉴 */
        var btn = $('.mobile-menu-btn');
        var nav = $('.mobile-nav');
        var scrim = $('.mobile-nav-scrim');
        if (btn && nav) {
            var setOpen = function (open) {
                btn.classList.toggle('active', open);
                btn.setAttribute('aria-expanded', String(open));
                nav.classList.toggle('open', open);
                if (scrim) scrim.classList.toggle('visible', open);
                document.body.classList.toggle('nav-locked', open);
            };
            btn.setAttribute('aria-expanded', 'false');
            btn.addEventListener('click', function () { setOpen(!nav.classList.contains('open')); });
            if (scrim) scrim.addEventListener('click', function () { setOpen(false); });
            $$('a', nav).forEach(function (a) { a.addEventListener('click', function () { setOpen(false); }); });
            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape' && nav.classList.contains('open')) setOpen(false);
            });
        }

        /* 현재 카테고리 메뉴 강조 */
        var path = decodeURIComponent(location.pathname);
        $$('.gnb a, .mobile-nav a').forEach(function (a) {
            var href = decodeURIComponent(a.getAttribute('href') || '');
            if (href.length > 1 && path.indexOf(href) === 0) a.classList.add('is-current');
        });
    }

    /* =====================================================================
     * 2. 카테고리 컬러
     * ===================================================================== */
    var CAT_MAP = [
        { key: 'running', match: ['러닝', '코스', 'run'] },
        { key: 'food',    match: ['맛집', '음식', 'food', '카페'] },
        { key: 'review',  match: ['리뷰', '제품', 'review', '장비'] }
    ];

    function initCategories() {
        $$('.post-item .category, .post-header .category').forEach(function (el) {
            var text = el.textContent.toLowerCase();
            for (var i = 0; i < CAT_MAP.length; i++) {
                if (CAT_MAP[i].match.some(function (m) { return text.indexOf(m) > -1; })) {
                    el.dataset.cat = CAT_MAP[i].key;
                    return;
                }
            }
            el.dataset.cat = 'etc';
        });
    }

    /* =====================================================================
     * 3. 카드 등장 애니메이션
     * ===================================================================== */
    function initReveal(root) {
        var items = $$('.post-item, .reveal', root || document).filter(function (el) { return !el.__revealed; });
        if (!items.length) return;
        if (reduceMotion || !window.IntersectionObserver) {
            items.forEach(function (el) { el.__revealed = true; el.classList.add('is-visible'); });
            return;
        }
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry, i) {
                if (!entry.isIntersecting) return;
                var el = entry.target;
                el.style.transitionDelay = Math.min(i * 60, 240) + 'ms';
                el.classList.add('is-visible');
                io.unobserve(el);
            });
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
        items.forEach(function (el) { el.__revealed = true; io.observe(el); });
    }

    /* =====================================================================
     * 4. 홈 사이드바 탭
     * ===================================================================== */
    var CATEGORY_URLS = {
        running: '/category/러닝코스',
        food: '/category/맛집',
        review: '/category/제품리뷰'
    };
    var CACHE_TTL = 10 * 60 * 1000;

    function cacheGet(key) {
        try {
            var raw = sessionStorage.getItem(key);
            if (!raw) return null;
            var obj = JSON.parse(raw);
            if (Date.now() - obj.t > CACHE_TTL) return null;
            return obj.v;
        } catch (e) { return null; }
    }

    function cacheSet(key, value) {
        try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value })); } catch (e) { /* quota */ }
    }

    function initSidebarTabs() {
        if (document.body.id !== 'tt-body-index') return;
        var loaded = {};

        function load(key) {
            if (loaded[key]) return;
            loaded[key] = true;
            var panel = document.getElementById('panel-' + key);
            if (!panel) return;

            var cacheKey = 'wl:cat:' + key;
            var cached = cacheGet(cacheKey);
            if (cached != null) { paint(panel, cached); return; }

            fetch(CATEGORY_URLS[key], { credentials: 'same-origin' })
                .then(function (r) { return r.ok ? r.text() : Promise.reject(r.status); })
                .then(function (html) {
                    var doc = new DOMParser().parseFromString(html, 'text/html');
                    var posts = $$('.original-list .post-item', doc).slice(0, 4);
                    // 외부 문서의 이미지가 즉시 로드되지 않도록 lazy 속성 부여
                    posts.forEach(function (p) {
                        $$('img', p).forEach(function (img) { img.loading = 'lazy'; });
                    });
                    var markup = posts.map(function (p) { return p.outerHTML; }).join('');
                    cacheSet(cacheKey, markup);
                    paint(panel, markup);
                })
                .catch(function () {
                    loaded[key] = false;
                    panel.innerHTML = '<div class="panel-empty">불러오지 못했습니다. ' +
                        '<a href="' + CATEGORY_URLS[key] + '">카테고리로 이동</a></div>';
                });
        }

        function paint(panel, markup) {
            if (!markup) {
                panel.innerHTML = '<div class="panel-empty">아직 등록된 글이 없습니다.</div>';
                return;
            }
            panel.innerHTML = markup;
            initCategories();
            initReveal(panel);
        }

        $$('.tab-btn').forEach(function (btn) {
            btn.setAttribute('aria-selected', String(btn.classList.contains('active')));
            btn.addEventListener('click', function () {
                $$('.tab-btn').forEach(function (b) {
                    b.classList.remove('active');
                    b.setAttribute('aria-selected', 'false');
                });
                $$('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
                btn.classList.add('active');
                btn.setAttribute('aria-selected', 'true');
                var panel = document.getElementById('panel-' + btn.dataset.tab);
                if (panel) panel.classList.add('active');
                load(btn.dataset.tab);
            });
        });

        load('running');
        // 나머지 탭은 잠시 뒤 미리 로드 (첫 화면 렌더 방해 금지)
        setTimeout(function () { load('food'); load('review'); }, 1200);
    }

    /* 4-1. 글 목록의 러닝 글 미리보기 → '다녀온 소감'
     *   티스토리 요약은 본문 앞부분(코스 정보 표)을 잘라 쓰므로,
     *   러닝 글은 글을 불러와 소감 절의 문단으로 바꿔 보여 준다. */
    function feelingsExcerpt(html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var content = $('.post-content', doc);
        if (!content) return '';
        var head = $$('h2', content).filter(function (h) { return h.textContent.indexOf('소감') > -1; })[0];
        if (!head) return '';
        var paras = [], quotes = [];
        for (var n = head.nextElementSibling; n && !/^H[12]$/.test(n.tagName); n = n.nextElementSibling) {
            var text = n.textContent.replace(/\s+/g, ' ').trim();
            if (!text) continue;
            (n.tagName === 'BLOCKQUOTE' ? quotes : paras).push(text);
        }
        return (paras.length ? paras : quotes).join(' ').slice(0, 240);
    }

    function initListExcerpts() {
        if (document.body.id === 'tt-body-index' || document.body.id === 'tt-body-page') return;
        var cards = $$('.original-list .post-item').filter(function (item) {
            var cat = $('.category', item);
            return cat && cat.dataset.cat === 'running' && $('a', item) && $('.summary', item);
        });
        if (!cards.length) return;

        function fill(item) {
            var summary = $('.summary', item);
            var url = $('a', item).href;
            var cacheKey = 'wl:excerpt:' + url;
            var done = function (text) {
                if (text) summary.textContent = text;
                summary.classList.remove('excerpt-pending');
            };
            var cached = cacheGet(cacheKey);
            if (cached != null) { done(cached); return; }
            summary.classList.add('excerpt-pending');
            fetch(url, { credentials: 'same-origin' })
                .then(function (r) { return r.ok ? r.text() : Promise.reject(r.status); })
                .then(function (html) {
                    var text = feelingsExcerpt(html);
                    cacheSet(cacheKey, text);
                    done(text);
                })
                .catch(function () { done(''); });
        }

        if (!window.IntersectionObserver) { cards.forEach(fill); return; }
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (!e.isIntersecting) return;
                io.unobserve(e.target);
                fill(e.target);
            });
        }, { rootMargin: '300px 0px' });
        cards.forEach(function (item) { io.observe(item); });
    }

    /* =====================================================================
     * 5. 마크다운 본문 꾸미기
     * ===================================================================== */

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
        });
    }

    /* 5-1. 제목에 id 부여 + 목차 생성 */
    function initToc(content) {
        var heads = $$('h2, h3', content).filter(function (h) { return h.textContent.trim(); });
        if (heads.length < 3) {
            // style.css 가 미리 비워 둔 목차 칸을 거둔다
            var wrap = content.closest('.article-wrap');
            if (wrap) wrap.classList.add('no-toc-rail');
            return;
        }

        var used = {};
        var items = heads.map(function (h) {
            var slug = h.textContent.trim().toLowerCase()
                .replace(/[^가-힣\w\s-]/g, '')
                .replace(/\s+/g, '-').slice(0, 40) || 'section';
            used[slug] = (used[slug] || 0) + 1;
            if (used[slug] > 1) slug += '-' + used[slug];
            h.id = h.id || slug;
            h.classList.add('has-anchor');
            return { id: h.id, text: h.textContent.trim(), level: h.tagName === 'H3' ? 3 : 2, el: h };
        });

        var toc = document.createElement('nav');
        toc.className = 'post-toc';
        toc.setAttribute('aria-label', '목차');
        toc.innerHTML =
            '<button class="toc-toggle" type="button" aria-expanded="true">📑 목차</button>' +
            '<ol class="toc-list">' +
            items.map(function (it) {
                return '<li class="toc-l' + it.level + '"><a href="#' + it.id + '">' +
                       escapeHtml(it.text) + '</a></li>';
            }).join('') + '</ol>';

        // 넓은 화면: 글 오른쪽에 따라다니는 목차 / 좁은 화면: 본문 맨 위
        var article = content.closest('.post-single');
        var rail = null;
        if (article && article.parentNode) {
            rail = document.createElement('aside');
            rail.className = 'toc-rail';
            article.parentNode.insertBefore(rail, article.nextSibling);
            article.parentNode.classList.add('has-toc-rail');
        }

        var wide = window.matchMedia && window.matchMedia('(min-width: 1100px)');
        function place() {
            if (rail && wide && wide.matches) {
                if (toc.parentNode !== rail) rail.appendChild(toc);
            } else if (toc.parentNode !== content) {
                content.insertBefore(toc, content.firstChild);
            }
        }
        place();
        if (wide) {
            if (wide.addEventListener) wide.addEventListener('change', place);
            else if (wide.addListener) wide.addListener(place);
        }

        var toggle = $('.toc-toggle', toc);
        toggle.addEventListener('click', function () {
            if (toc.parentNode === rail) return;
            var open = toc.classList.toggle('collapsed');
            toggle.setAttribute('aria-expanded', String(!open));
        });

        // 스크롤 위치에 따라 지금 읽는 항목 강조 (지나온 항목은 따로 표시)
        var links = $$('a', toc);
        var current = -2;
        var ticking = false;

        function spy() {
            ticking = false;
            var line = 120;   // 고정 헤더(64px) 아래 이 선을 지난 마지막 제목이 지금 읽는 곳
            var idx = -1;
            for (var i = 0; i < items.length; i++) {
                if (items[i].el.getBoundingClientRect().top <= line) idx = i;
                else break;
            }
            var doc = document.documentElement;
            if (idx >= 0 && window.innerHeight + (window.scrollY || window.pageYOffset) >= doc.scrollHeight - 2) {
                // 맨 아래까지 내렸는데 마지막 절이 짧아 선을 못 넘은 경우
                var end = items[items.length - 1].el.getBoundingClientRect().top;
                if (end < window.innerHeight) idx = items.length - 1;
            }
            if (idx === current) return;
            current = idx;
            links.forEach(function (a, i) {
                a.classList.toggle('active', i === idx);
                a.classList.toggle('passed', i < idx);
                if (i === idx) a.setAttribute('aria-current', 'true');
                else a.removeAttribute('aria-current');
            });

            // 목차가 길어 오른쪽 칸 안에서 스크롤될 때 현재 항목이 보이도록
            if (idx >= 0 && toc.parentNode === rail && rail.scrollHeight > rail.clientHeight) {
                var a = links[idx];
                var top = a.getBoundingClientRect().top - rail.getBoundingClientRect().top + rail.scrollTop;
                if (top < rail.scrollTop + 40 || top + a.offsetHeight > rail.scrollTop + rail.clientHeight - 40) {
                    rail.scrollTop = top - rail.clientHeight / 2;
                }
            }
        }

        window.addEventListener('scroll', function () {
            if (!ticking) { ticking = true; requestAnimationFrame(spy); }
        }, { passive: true });
        window.addEventListener('resize', function () { current = -2; spy(); });
        spy();
    }

    /* 5-2. 인용구 → 콜아웃 */
    var CALLOUTS = [
        { re: /^(💡|팁|TIP)/i,        cls: 'tip',    icon: '💡' },
        { re: /^(⚠️|주의|경고)/,       cls: 'warn',   icon: '⚠️' },
        { re: /^(✅|체크|확인)/,       cls: 'check',  icon: '✅' },
        { re: /^(🅿️|주차)/,           cls: 'park',   icon: '🅿️' },
        { re: /^(🚇|🚉|교통|접근)/,    cls: 'transit',icon: '🚇' },
        { re: /^(📌|포인트|핵심)/,     cls: 'point',  icon: '📌' },
        { re: /^(🍽️|맛집)/,           cls: 'food',   icon: '🍽️' }
    ];

    function initCallouts(content) {
        $$('blockquote', content).forEach(function (q) {
            var text = q.textContent.trim();
            for (var i = 0; i < CALLOUTS.length; i++) {
                var m = text.match(CALLOUTS[i].re);
                if (!m) continue;
                q.classList.add('callout', 'callout-' + CALLOUTS[i].cls);
                q.dataset.icon = CALLOUTS[i].icon;
                // 이모지로 시작했다면 본문에서는 지운다 — 아이콘은 왼쪽에 따로 표시되므로
                if (/^[^\w\uAC00-\uD7A3]/.test(m[0])) stripPrefix(q, m[0].length);
                return;
            }
        });
    }

    function stripPrefix(root, length) {
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        var node = walker.nextNode();
        while (node && !node.nodeValue.trim()) node = walker.nextNode();
        if (!node) return;
        node.nodeValue = node.nodeValue.replace(/^\s*/, '').slice(length).replace(/^\s*/, ' ').trimStart();
    }

    /* 5-3. 코드 블록 — 언어 배지 + 복사 버튼 */
    function initCodeBlocks(content) {
        $$('pre', content).forEach(function (pre) {
            if (pre.parentElement.classList.contains('code-block')) return;
            var code = $('code', pre);
            var lang = '';
            if (code) {
                var m = (code.className || '').match(/language-([\w+#-]+)/);
                if (m) lang = m[1];
            }
            var wrap = document.createElement('div');
            wrap.className = 'code-block';
            pre.parentNode.insertBefore(wrap, pre);
            wrap.appendChild(pre);

            var bar = document.createElement('div');
            bar.className = 'code-bar';
            bar.innerHTML = '<span class="code-lang">' + (lang || 'code') + '</span>' +
                            '<button type="button" class="code-copy">복사</button>';
            wrap.insertBefore(bar, pre);

            $('.code-copy', bar).addEventListener('click', function () {
                var btn = this;
                var text = (code || pre).innerText;
                var done = function () {
                    btn.textContent = '복사됨!';
                    btn.classList.add('done');
                    setTimeout(function () { btn.textContent = '복사'; btn.classList.remove('done'); }, 1500);
                };
                if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done);
                else {
                    var ta = document.createElement('textarea');
                    ta.value = text;
                    document.body.appendChild(ta);
                    ta.select();
                    try { document.execCommand('copy'); } catch (e) { /* noop */ }
                    document.body.removeChild(ta);
                    done();
                }
            });
        });
    }

    /* 5-4. 표 — 가로 스크롤 래퍼 + 모바일 라벨 */
    function initTables(content) {
        $$('table', content).forEach(function (table) {
            if (table.parentElement.classList.contains('table-scroll')) return;
            var heads = $$('thead th', table).map(function (th) { return th.textContent.trim(); });
            if (heads.length) {
                $$('tbody tr', table).forEach(function (tr) {
                    $$('td', tr).forEach(function (td, i) {
                        if (heads[i]) td.setAttribute('data-label', heads[i]);
                    });
                });
            }
            var wrap = document.createElement('div');
            wrap.className = 'table-scroll';
            table.parentNode.insertBefore(wrap, table);
            wrap.appendChild(table);
        });
    }

    /* 5-5. 이미지 — 캡션 / 갤러리 / 라이트박스 */
    function isImageOnly(el) {
        if (!el || el.nodeType !== 1) return false;
        if (!/^(P|FIGURE|DIV)$/.test(el.tagName)) return false;
        var imgs = $$('img', el);
        return imgs.length === 1 && el.textContent.trim() === '';
    }

    /** 티스토리는 본문을 .contents_style 같은 div 로 한 번 더 감쌉니다.
     *  연속 이미지 묶기처럼 형제 관계를 보는 로직은 그 안쪽을 기준으로 해야 합니다. */
    function contentRoot(content) {
        if (content.__root) return content.__root;
        var node = content;
        while (node.children.length === 1 && node.firstElementChild.tagName === 'DIV') {
            node = node.firstElementChild;
        }
        content.__root = node;
        return node;
    }

    function initImages(content) {
        $$('img', content).forEach(function (img) {
            img.loading = 'lazy';
            img.decoding = 'async';
        });

        // 연속된 이미지 → 갤러리 그리드
        var root = contentRoot(content);
        var children = Array.prototype.slice.call(root.children);
        var i = 0;
        while (i < children.length) {
            if (!isImageOnly(children[i])) { i++; continue; }
            var run = [children[i]];
            var j = i + 1;
            while (j < children.length && isImageOnly(children[j])) { run.push(children[j]); j++; }
            if (run.length >= 2) {
                var gallery = document.createElement('div');
                gallery.className = 'img-gallery cols-' + Math.min(run.length, 3);
                run[0].parentNode.insertBefore(gallery, run[0]);
                run.forEach(function (el) { gallery.appendChild(el); });
            }
            i = j;
        }

        // alt 텍스트를 캡션으로
        $$('p > img, figure > img', content).forEach(function (img) {
            var alt = (img.getAttribute('alt') || '').trim();
            var host = img.closest('p, figure');
            if (!host || host.__captioned) return;
            host.__captioned = true;
            host.classList.add('img-block');
            if (alt && !$('figcaption', host)) {
                var cap = document.createElement('span');
                cap.className = 'img-caption';
                cap.textContent = alt;
                host.appendChild(cap);
            }
        });

        // 라이트박스
        content.addEventListener('click', function (e) {
            var img = e.target.closest('img');
            if (!img || !content.contains(img)) return;
            if (img.closest('a')) return;      // 링크된 이미지는 링크 우선
            openLightbox(img);
        });
    }

    var lightbox = null;
    function openLightbox(img) {
        if (!lightbox) {
            lightbox = document.createElement('div');
            lightbox.className = 'lightbox';
            lightbox.innerHTML = '<button class="lightbox-close" type="button" aria-label="닫기">×</button>' +
                                 '<img alt=""><p class="lightbox-caption"></p>';
            document.body.appendChild(lightbox);
            var close = function () {
                lightbox.classList.remove('open');
                document.body.classList.remove('nav-locked');
            };
            lightbox.addEventListener('click', function (e) {
                if (e.target === lightbox || e.target.classList.contains('lightbox-close')) close();
            });
            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') close();
            });
        }
        $('img', lightbox).src = img.currentSrc || img.src;
        var cap = (img.getAttribute('alt') || '').trim();
        $('.lightbox-caption', lightbox).textContent = cap;
        lightbox.classList.add('open');
        document.body.classList.add('nav-locked');
    }

    /* 5-6. 링크 / 체크리스트 / 읽는 시간 */
    function initMisc(content) {
        $$('a[href^="http"]', content).forEach(function (a) {
            if (a.hostname && a.hostname !== location.hostname) {
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.classList.add('external-link');
            }
        });

        // - [ ] / - [x] 체크리스트
        $$('li', content).forEach(function (li) {
            var input = li.firstElementChild;
            if (input && input.tagName === 'INPUT' && input.type === 'checkbox') {
                li.classList.add('task-item');
                input.disabled = true;
                li.parentElement.classList.add('task-list');
            }
        });

        var meta = $('.post-header .meta');
        if (meta && !$('.read-time', meta)) {
            var words = content.textContent.trim().length;
            var minutes = Math.max(1, Math.round(words / 500));
            var span = document.createElement('span');
            span.className = 'read-time';
            span.textContent = '⏱️ 약 ' + minutes + '분';
            meta.appendChild(span);
        }
    }

    /* 5-7. 링크 복사 버튼 */
    function initShare() {
        var btn = $('[data-share="link"]');
        if (!btn) return;
        btn.addEventListener('click', function () {
            var url = location.href;
            var done = function () {
                var old = btn.textContent;
                btn.textContent = '✅ 복사됨';
                setTimeout(function () { btn.textContent = old; }, 1500);
            };
            if (navigator.share) {
                navigator.share({ title: document.title, url: url }).catch(function () {});
            } else if (navigator.clipboard) {
                navigator.clipboard.writeText(url).then(done, done);
            } else {
                prompt('아래 주소를 복사하세요', url);
            }
        });
    }

    /* =====================================================================
     * 6. 러닝 코스 상세
     * ===================================================================== */

    /* 6-1. "코스 정보" 표 → 스펙 카드 */
    var SPEC_ICONS = {
        '장소': '📍', '위치': '📍', '거리': '📏', '시간': '⏱️', '소요': '⏱️',
        '주차': '🅿️', '교통': '🚇', '접근': '🚇', '난이도': '⛰️', '노면': '🛣️',
        '급수': '🚰', '화장실': '🚻', '편의점': '🏪', '조명': '💡', '추천': '⭐',
        '고도': '↗️', '코스': '🔁', '계절': '🍃', '샤워': '🚿'
    };

    function iconFor(label) {
        var keys = Object.keys(SPEC_ICONS);
        for (var i = 0; i < keys.length; i++) {
            if (label.indexOf(keys[i]) > -1) return SPEC_ICONS[keys[i]];
        }
        return '•';
    }

    function initSpecCard(content) {
        var heading = $$('h2, h3', content).filter(function (h) {
            return /코스\s*정보|기본\s*정보|가게\s*정보|제품\s*정보|스펙/.test(h.textContent);
        })[0];
        if (!heading) return;

        var node = heading.nextElementSibling;
        while (node && !/^(TABLE|DIV)$/.test(node.tagName)) node = node.nextElementSibling;
        var table = node && (node.tagName === 'TABLE' ? node : $('table', node));
        if (!table) return;

        var rows = $$('tbody tr', table);
        if (!rows.length) rows = $$('tr', table).slice(1);
        if (rows.length < 2) return;

        var card = document.createElement('div');
        card.className = 'spec-card';
        card.innerHTML = rows.map(function (tr) {
            var cells = $$('th, td', tr);
            if (cells.length < 2) return '';
            var rawLabel = cells[0].textContent.trim();
            var label = rawLabel.replace(/^[^가-힣A-Za-z]+/, '').trim() || rawLabel;
            var emoji = /^[^가-힣A-Za-z0-9]/.test(rawLabel)
                ? rawLabel.match(/^[^가-힣A-Za-z0-9]+/)[0].trim()
                : iconFor(label);
            var valueHtml = cells[1].innerHTML.trim();
            var stars = cells[1].textContent.match(/[★☆]{3,5}/);
            if (stars) {
                var filled = (stars[0].match(/★/g) || []).length;
                valueHtml = '<span class="spec-stars" aria-label="난이도 ' + filled + '/5">' +
                    '★★★★★'.split('').map(function (_, i) {
                        return '<i class="' + (i < filled ? 'on' : '') + '">★</i>';
                    }).join('') + '</span>' +
                    '<span class="spec-stars-note">' + cells[1].textContent.replace(/[★☆]/g, '').trim() + '</span>';
            }
            return '<div class="spec-item">' +
                   '<span class="spec-icon">' + emoji + '</span>' +
                   '<span class="spec-label">' + label + '</span>' +
                   '<span class="spec-value">' + valueHtml + '</span></div>';
        }).join('');

        var wrap = table.closest('.table-scroll') || table;
        wrap.parentNode.insertBefore(card, wrap);
        wrap.remove();
    }

    /* 6-2. 이 글에 해당하는 코스 찾기 */
    function normalizePath(url) {
        if (!url) return '';
        try {
            var u = new URL(url, location.origin);
            return decodeURIComponent(u.pathname).replace(/\/+$/, '');
        } catch (e) {
            return decodeURIComponent(String(url)).replace(/\/+$/, '');
        }
    }

    function matchCourse(data, explicitId) {
        if (explicitId) {
            var byId = data.courses.filter(function (c) { return c.id === explicitId; })[0];
            if (byId) return byId;
        }
        var here = normalizePath(location.pathname);
        var byLink = data.courses.filter(function (c) { return c.link && normalizePath(c.link) === here; })[0];
        if (byLink) return byLink;

        // 제목이 같은 코스
        var title = ($('.post-header h2') || {}).textContent;
        if (title) {
            title = title.trim();
            return data.courses.filter(function (c) {
                return c.title && (title.indexOf(c.title) > -1 || c.title.indexOf(title) > -1);
            })[0] || null;
        }
        return null;
    }

    /* 6-3. 본문 지도 */
    function renderCourseMap(container, course, geoBundle) {
        container.innerHTML =
            '<div class="course-map-inner">' +
            '  <canvas></canvas>' +
            '  <div class="course-map-legend">' +
            '    <span class="cm-title">🏃 ' + course.title + '</span>' +
            '    <span class="cm-stat">' + course.distance.toFixed(2) + ' km</span>' +
            (course.elevGain != null ? '    <span class="cm-stat">↗ ' + Math.round(course.elevGain) + ' m</span>' : '') +
            (course.duration ? '    <span class="cm-stat">⏱ ' + formatDuration(course.duration) + '</span>' : '') +
            '  </div>' +
            '  <div class="course-map-controls">' +
            '    <button type="button" data-act="in" aria-label="확대">+</button>' +
            '    <button type="button" data-act="out" aria-label="축소">−</button>' +
            '    <button type="button" data-act="fit" aria-label="전체보기">⟳</button>' +
            '  </div>' +
            '</div>';

        var canvas = $('canvas', container);
        var map = window.RunMapEngine.create(canvas);
        map.setGeo(geoBundle.geo, geoBundle.rivers, geoBundle.parks);
        map.setData({ courses: [course], restaurants: geoBundle.restaurants || [] });

        var fit = map.computeFit(course.bounds, 0.18);
        map.setHome(fit);
        map.setViewport(fit);
        course.animProgress = reduceMotion ? 1 : 0;
        map.requestFrame();

        $$('button', $('.course-map-controls', container)).forEach(function (b) {
            b.addEventListener('click', function () {
                var act = b.dataset.act;
                if (act === 'in') map.zoomCenter(0.72);
                else if (act === 'out') map.zoomCenter(1.38);
                else map.flyTo(map.home);
            });
        });

        // 드래그 팬
        var drag = null;
        canvas.addEventListener('mousedown', function (e) {
            drag = { x: e.clientX, y: e.clientY };
            map.setInteracting(true);
            canvas.classList.add('is-dragging');
        });
        window.addEventListener('mousemove', function (e) {
            if (!drag) return;
            map.panPx(e.clientX - drag.x, e.clientY - drag.y);
            drag = { x: e.clientX, y: e.clientY };
        });
        window.addEventListener('mouseup', function () {
            if (!drag) return;
            drag = null;
            map.setInteracting(false);
            canvas.classList.remove('is-dragging');
        });

        window.addEventListener('resize', function () { map.resize(); });
    }

    function formatDuration(sec) {
        var m = Math.round(sec / 60);
        return m >= 60 ? Math.floor(m / 60) + '시간 ' + (m % 60) + '분' : m + '분';
    }

    /* 6-4. 근처 맛집 / 근처 코스 */
    function renderNearby(content, data, course) {
        var util = window.RunMapUtil;
        var origin = course ? course.points[Math.floor(course.points.length / 2)] : null;

        var box = document.createElement('section');
        box.className = 'nearby-block reveal';

        if (origin) {
            var near = data.restaurants
                .map(function (r) { return { r: r, d: util.haversine(origin, { lat: r.lat, lon: r.lon }) }; })
                .filter(function (x) { return x.d <= 5; })
                .sort(function (a, b) { return a.d - b.d; })
                .slice(0, 6);

            if (!near.length) return null;
            box.innerHTML = '<h3 class="nearby-title">🍽️ 이 코스 근처 맛집</h3>' +
                '<p class="nearby-sub">코스 중간 지점 기준 5km 이내</p>' +
                '<div class="nearby-grid">' + near.map(function (x) {
                    return '<a class="nearby-card" href="' + (x.r.url || '#') + '">' +
                           '<span class="nearby-name">' + escapeHtml(x.r.title) + '</span>' +
                           '<span class="nearby-dist">' + x.d.toFixed(1) + 'km</span>' +
                           (x.r.desc ? '<span class="nearby-desc">' + escapeHtml(x.r.desc) + '</span>' : '') +
                           '</a>';
                }).join('') + '</div>';
        } else {
            // 맛집 글 → 근처 코스 추천
            var here = normalizePath(location.pathname);
            var me = data.restaurants.filter(function (r) { return r.url && normalizePath(r.url) === here; })[0];
            if (!me) return null;
            var courses = data.courses
                .map(function (c) {
                    var mid = c.points[Math.floor(c.points.length / 2)];
                    return { c: c, d: util.haversine({ lat: me.lat, lon: me.lon }, mid) };
                })
                .filter(function (x) { return x.d <= 5; })
                .sort(function (a, b) { return a.d - b.d; })
                .slice(0, 4);
            if (!courses.length) return null;
            box.innerHTML = '<h3 class="nearby-title">🏃 이 맛집 근처 러닝 코스</h3>' +
                '<p class="nearby-sub">달리고 나서 들르기 좋은 코스예요</p>' +
                '<div class="nearby-grid">' + courses.map(function (x) {
                    return '<a class="nearby-card" href="' + (x.c.link || '#') + '">' +
                           '<span class="nearby-name">' + escapeHtml(x.c.title) + '</span>' +
                           '<span class="nearby-dist">' + x.d.toFixed(1) + 'km · ' + x.c.distance.toFixed(1) + 'km 코스</span>' +
                           '</a>';
                }).join('') + '</div>';
        }
        content.appendChild(box);
        return box;
    }

    /* 6-5. 태그 기반 폴백 */
    function renderTagFallback(content) {
        var tags = $$('.post-tags a');
        if (!tags.length) return;
        var keyword = tags[0].textContent.replace(/^#/, '').trim();
        if (!keyword) return;
        var box = document.createElement('section');
        box.className = 'nearby-block reveal';
        box.innerHTML = '<h3 class="nearby-title">🔎 \'' + escapeHtml(keyword) + '\' 관련 글</h3>' +
            '<div class="nearby-grid">' +
            '<a class="nearby-card" href="/search/' + encodeURIComponent(keyword + ' 맛집') + '">' +
            '<span class="nearby-name">' + escapeHtml(keyword) + ' 맛집 검색</span></a>' +
            '<a class="nearby-card" href="/search/' + encodeURIComponent(keyword) + '">' +
            '<span class="nearby-name">' + escapeHtml(keyword) + ' 글 모두 보기</span></a></div>';
        content.appendChild(box);
    }

    /* 6-6. 포스트 초기화 */
    function initPost() {
        var content = $('.post-content');
        if (!content) {
            // 보호 글 등 본문이 없으면 미리 비워 둔 목차 칸도 거둔다
            $$('#tt-body-page .article-wrap').forEach(function (w) { w.classList.add('no-toc-rail'); });
            return;
        }

        contentRoot(content);   // 래퍼 구조를 건드리기 전에 본문 루트를 먼저 확정
        initToc(content);
        initCallouts(content);
        initCodeBlocks(content);
        initTables(content);
        initSpecCard(content);
        initImages(content);
        initMisc(content);
        initShare();

        if (!window.RunMapData) return;

        // 본문에 지정된 코스 id: <div class="course-map" data-course="id"> 또는 문단 [course:id]
        var explicit = $('.course-map', content);
        var explicitId = explicit ? explicit.dataset.course : '';
        if (!explicit) {
            $$('p', content).forEach(function (p) {
                var m = p.textContent.trim().match(/^\[course:([\w가-힣-]+)\]$/);
                if (m) {
                    explicit = document.createElement('div');
                    explicit.className = 'course-map';
                    explicitId = m[1];
                    p.parentNode.replaceChild(explicit, p);
                }
            });
        }

        window.RunMapData.load().then(function (data) {
            var course = matchCourse(data, explicitId);

            if (course) {
                var mount = explicit;
                if (!mount) {
                    mount = document.createElement('div');
                    mount.className = 'course-map';
                    var anchor = $('.spec-card', content);
                    if (anchor && anchor.nextSibling) anchor.parentNode.insertBefore(mount, anchor.nextSibling);
                    else content.insertBefore(mount, content.firstChild);
                }
                mount.classList.add('is-pending');
                loadGeoWhenVisible(mount, function (bundle) {
                    mount.classList.remove('is-pending');
                    bundle.restaurants = data.restaurants;
                    renderCourseMap(mount, course, bundle);
                });
            } else if (explicit) {
                explicit.remove();
            }

            var added = renderNearby(content, data, course);
            if (!added) renderTagFallback(content);
            initReveal(content);
        });
    }

    var geoBundlePromise = null;
    function loadGeoWhenVisible(el, cb) {
        var start = function () {
            if (!geoBundlePromise) {
                var base = window.RunMapUtil.skinPath;
                var j = function (n) {
                    return fetch(base + n, { credentials: 'same-origin' })
                        .then(function (r) { return r.ok ? r.json() : null; })
                        .catch(function () { return null; });
                };
                geoBundlePromise = Promise.all([j('korea.json'), j('rivers.json'), j('parks.json')])
                    .then(function (r) { return { geo: r[0], rivers: r[1], parks: r[2] }; });
            }
            geoBundlePromise.then(cb);
        };
        if (!window.IntersectionObserver) { start(); return; }
        var io = new IntersectionObserver(function (entries) {
            if (entries[0].isIntersecting) { io.disconnect(); start(); }
        }, { rootMargin: '300px' });
        io.observe(el);
    }

    /* =====================================================================
     * 부트
     * ===================================================================== */
    ready(function () {
        initChrome();
        initCategories();
        initReveal();
        initSidebarTabs();
        initListExcerpts();
        initPost();
    });
})();
