/* =========================================================================
   Clean Gallery skin — 인터랙션 스크립트
   1) 원형 카테고리 메뉴 (DevOps 아이콘 자동 매핑)
   2) 라이트/다크 수동 토글
   3) 읽는 시간 + 상단 진행률 바
   4) 본문 목차(TOC) + 제목 앵커 + 스크롤 추적
   5) 코드 문법 강조(highlight.js) + 코드 복사 버튼
   6) 이미지 라이트박스
   7) 공유 버튼 (X · 페이스북 · 링크복사)
   8) 맨 위로 버튼
   각 기능은 독립적으로 try/catch 처리되어 하나가 실패해도 나머지는 동작합니다.
   ========================================================================= */
(function () {
	"use strict";

	function esc(s) {
		return String(s).replace(/[&<>"']/g, function (c) {
			return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
		});
	}
	function curPath() { try { return decodeURIComponent(location.pathname); } catch (e) { return location.pathname; } }

	/* =====================================================================
	   1) 원형 카테고리 메뉴
	   ===================================================================== */
	var ICONS = [
		[/(devops|데브옵스)/i, "♾️"],
		[/(openstack|오픈스택|nova|neutron|keystone|cinder|glance)/i, "🌩️"],
		[/(terraform|테라폼|opentofu|(^|\b)iac(\b)|pulumi)/i, "🏗️"],
		[/(kubernetes|k8s|kubectl|helm|쿠버네티스|kustomize|istio)/i, "☸️"],
		[/(docker|container|컨테이너|podman|containerd)/i, "🐳"],
		[/(aws|amazon|ec2|s3|lambda|eks|ecs)/i, "☁️"],
		[/(gcp|google\s?cloud|azure|oci|클라우드|(^|\b)cloud\b|openshift)/i, "☁️"],
		[/(ci\/?cd|jenkins|argo|gitlab\s?ci|pipeline|파이프라인|배포|deploy|github\s?actions)/i, "🚀"],
		[/(github|gitlab|(^|\b)git(\b|hub)|형상|버전관리)/i, "🐙"],
		[/(ansible|automation|자동화|chef|puppet|salt)/i, "🤖"],
		[/(linux|리눅스|ubuntu|centos|rocky|debian|rhel|unix)/i, "🐧"],
		[/(mac\s?os|맥북|(^|\b)mac(\b|os))/i, "🍎"],
		[/(window|윈도우|wsl)/i, "🪟"],
		[/(monitor|모니터|grafana|prometheus|observ|관측|metric|alert|알람|loki)/i, "📊"],
		[/(network|네트워크|(^|\b)dns|nginx|proxy|load\s?balanc|(^|\b)lb\b|cdn|vpc)/i, "🌐"],
		[/(database|데이터베이스|(^|\b)db\b|sql|mysql|postgre|redis|mongo|rds|etcd)/i, "🗄️"],
		[/(security|보안|vault|(^|\b)iam|인증|tls|ssl|cert)/i, "🔒"],
		[/(python|파이썬)/i, "🐍"],
		[/(golang|(^|\b)go(lang)?\b)/i, "🐹"],
		[/(java|spring|스프링)/i, "☕"],
		[/(node|javascript|typescript|react|프론트|front)/i, "🟨"],
		[/(shell|bash|zsh|스크립트|(^|\b)script\b|command|(^|\b)cli\b)/i, "💻"],
		[/(log|로그|elk|kibana|logstash|fluentd|opensearch)/i, "📋"],
		[/(trouble|장애|이슈|(^|\b)issue|오류|(^|\b)error|debug|디버깅)/i, "🔧"],
		[/(study|공부|학습|(^|\b)til(\b|$)|정리|(^|\b)note|노트)/i, "📚"],
		[/(project|프로젝트|toy|사이드)/i, "📦"],
		[/(review|회고|생각|일상|diary|essay|후기)/i, "✍️"],
		[/(cka|ckad|cks|cert|자격증|시험|exam)/i, "🎓"],
		[/(msa|micro|아키텍처|architecture|design)/i, "🧩"],
		[/((^|\b)api(\b|s)|rest|graphql|grpc)/i, "🔌"],
		[/(kafka|spark|airflow|etl|(^|\b)data(\b|base)?)/i, "🧪"],
		[/((^|\b)ai(\b)|(^|\b)ml(\b)|머신러닝|딥러닝|llm|gpt)/i, "🧠"]
	];
	function pickIcon(n) { for (var i = 0; i < ICONS.length; i++) { if (ICONS[i][0].test(n)) return ICONS[i][1]; } return null; }
	function cleanLabel(raw) { return (raw || "").replace(/\s*\(\s*[\d,]+\s*\)\s*$/, "").replace(/\s+/g, " ").trim(); }
	function countOf(raw) { var m = (raw || "").match(/\(\s*([\d,]+)\s*\)\s*$/); return m ? parseInt(m[1].replace(/,/g, ""), 10) : null; }
	function initial(n) { var c = n.trim().charAt(0); return c ? c.toUpperCase() : "#"; }
	function normPath(p) {
		try { p = decodeURIComponent(p); } catch (e) {}
		p = p.replace(/\/+$/, "");
		return p === "" ? "/" : p;
	}
	function isActive(href) {
		try {
			var u = new URL(href, location.origin);
			var hp = normPath(u.pathname);
			if (hp === "/") return false;
			/* 부모/자식 혼동 방지: 현재 주소와 '정확히' 같을 때만 활성 */
			return normPath(location.pathname) === hp;
		} catch (e) { return false; }
	}
	function circle(href, label, active, forceIc) {
		var a = document.createElement("a");
		a.className = "cat-circle" + (active ? " is-active" : "");
		a.href = href; a.title = label; a.setAttribute("role", "listitem");
		var ic = forceIc || pickIcon(label);
		a.innerHTML = '<span class="cat-ic' + (ic ? "" : " cat-ic-txt") + '">' + (ic ? ic : esc(initial(label))) +
			'</span><span class="cat-name">' + esc(label) + "</span>";
		return a;
	}
	function buildCategories() {
		var target = document.getElementById("catCircles");
		var source = document.getElementById("catSource");
		if (!target) return;
		var all = source ? source.querySelectorAll("a[href]") : [];
		var links = [], i, h;
		for (i = 0; i < all.length; i++) { h = all[i].getAttribute("href") || ""; if (h.indexOf("/category") > -1) links.push(all[i]); }
		if (!links.length) {
			for (i = 0; i < all.length; i++) {
				h = all[i].getAttribute("href") || "";
				if (!h || h === "#") continue;
				if (/manage|admin|entry\/post|\/rss|guestbook|\/tag/i.test(h)) continue;
				links.push(all[i]);
			}
		}
		var frag = document.createDocumentFragment(), seen = {};
		frag.appendChild(circle(target.getAttribute("data-home") || "/", "전체", normPath(location.pathname) === "/", "🏠"));
		for (i = 0; i < links.length; i++) {
			var a = links[i], href = a.getAttribute("href"), raw = a.textContent, label = cleanLabel(raw);
			if (!label) continue;
			if (/^(전체|전체보기|분류\s*전체보기)$/.test(label)) continue;
			if (countOf(raw) === 0) continue;
			var key = href + "|" + label;
			if (seen[key]) continue;
			seen[key] = true;
			frag.appendChild(circle(href, label, isActive(href)));
		}
		target.textContent = "";
		target.appendChild(frag);
		target.classList.add("is-ready");
	}

	/* =====================================================================
	   2) 라이트/다크 수동 토글
	   ===================================================================== */
	function initThemer() {
		var btn = document.getElementById("themer");
		if (!btn) return;
		btn.addEventListener("click", function () {
			var root = document.documentElement, cur = root.getAttribute("data-theme"), next;
			if (cur) next = cur === "dark" ? "light" : "dark";
			else next = window.matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark";
			root.setAttribute("data-theme", next);
			try { localStorage.setItem("theme", next); } catch (e) {}
		});
	}

	/* =====================================================================
	   3) 읽는 시간 + 상단 진행률 바
	   ===================================================================== */
	function initReading() {
		var content = document.querySelector(".post__content");
		if (!content) return;
		var readEl = document.querySelector(".post__read");
		if (readEl) {
			var text = content.innerText || "";
			var cjk = (text.match(/[ㄱ-힝一-鿿]/g) || []).length;
			var words = (text.trim().match(/[A-Za-z0-9]+/g) || []).length;
			var min = Math.max(1, Math.round(cjk / 500 + words / 220));
			readEl.textContent = "☕ 읽는 시간 " + min + "분";
			readEl.classList.add("is-on");
		}
		var bar = document.querySelector(".read-progress span");
		if (bar) {
			var update = function () {
				var start = content.offsetTop, end = start + content.offsetHeight;
				var y = window.pageYOffset + window.innerHeight * 0.25;
				var pct = (y - start) / Math.max(1, end - start);
				bar.style.width = (Math.max(0, Math.min(1, pct)) * 100) + "%";
			};
			window.addEventListener("scroll", update, { passive: true });
			window.addEventListener("resize", update);
			update();
		}
	}

	/* =====================================================================
	   4) 목차(TOC) + 제목 앵커 + 스크롤 추적
	   ===================================================================== */
	function slugify(s) {
		return (s.trim().toLowerCase().replace(/[^\w가-힣\s-]/g, "").replace(/\s+/g, "-").slice(0, 60)) || "section";
	}
	function initToc() {
		var content = document.querySelector(".post__content");
		var toc = document.getElementById("toc");
		if (!content) { if (toc) toc.remove(); return; }
		var heads = content.querySelectorAll("h2, h3");
		if (heads.length < 2) { if (toc) toc.remove(); return; }

		var used = {}, items = [];
		Array.prototype.forEach.call(heads, function (h) {
			var id = h.id;
			if (!id) { var base = slugify(h.textContent), cand = base, n = 2; while (used[cand] || document.getElementById(cand)) { cand = base + "-" + n; n++; } id = cand; h.id = id; }
			used[id] = 1;
			var a = document.createElement("a");
			a.href = "#" + id; a.className = "h-anchor"; a.textContent = "#"; a.setAttribute("aria-label", "이 섹션 링크");
			h.appendChild(a);
			items.push({ id: id, text: h.textContent.replace(/#$/, "").trim(), lv: h.tagName === "H3" ? 3 : 2, el: h });
		});

		if (!toc) return;
		var html = '<p class="toc__title">CONTENTS</p>';
		items.forEach(function (it) { html += '<a href="#' + it.id + '" class="' + (it.lv === 3 ? "lv3" : "") + '" data-id="' + it.id + '">' + esc(it.text) + "</a>"; });
		toc.innerHTML = html;
		toc.classList.add("is-ready");

		toc.addEventListener("click", function (e) {
			var a = e.target.closest("a"); if (!a) return;
			var t = document.getElementById(a.getAttribute("data-id"));
			if (t) { e.preventDefault(); window.scrollTo({ top: t.getBoundingClientRect().top + window.pageYOffset - 76, behavior: "smooth" }); history.replaceState(null, "", "#" + a.getAttribute("data-id")); }
		});

		var links = toc.querySelectorAll("a[data-id]");
		var spy = function () {
			var pos = window.pageYOffset + 100, cur = items[0];
			for (var i = 0; i < items.length; i++) { if (items[i].el.offsetTop <= pos) cur = items[i]; }
			Array.prototype.forEach.call(links, function (l) { l.classList.toggle("is-current", l.getAttribute("data-id") === cur.id); });
		};
		window.addEventListener("scroll", spy, { passive: true });
		spy();
	}

	/* =====================================================================
	   5) 코드 문법 강조 + 복사 버튼
	   ===================================================================== */
	function registerHcl() {
		if (typeof hljs === "undefined" || hljs.getLanguage("hcl")) return;
		try {
			hljs.registerLanguage("hcl", function (hljs) {
				return {
					aliases: ["tf", "terraform"],
					keywords: {
						keyword: "resource variable provider module data output locals terraform for_each count depends_on lifecycle dynamic backend",
						literal: "true false null"
					},
					contains: [
						hljs.COMMENT("#", "$"), hljs.COMMENT("//", "$"), hljs.COMMENT("/\\*", "\\*/"),
						hljs.QUOTE_STRING_MODE, hljs.NUMBER_MODE,
						{ className: "variable", begin: /\$\{/, end: /\}/ },
						{ className: "attr", begin: /[a-zA-Z_][\w-]*(?=\s*=)/ }
					]
				};
			});
		} catch (e) {}
	}
	function initHighlight() {
		if (typeof hljs === "undefined") return;
		registerHcl();
		var pres = document.querySelectorAll(".post__content pre");
		Array.prototype.forEach.call(pres, function (pre) {
			var code = pre.querySelector("code");
			if (!code) { code = document.createElement("code"); code.textContent = pre.textContent; pre.textContent = ""; pre.appendChild(code); }
			if (code.dataset.highlighted || code.querySelector("span")) return;
			var lang = pre.getAttribute("data-ke-language") || pre.getAttribute("data-language");
			if (lang) { code.classList.add("language-" + lang.toLowerCase().replace("terraform", "hcl")); }
			try { hljs.highlightElement(code); } catch (e) {}
		});
	}
	function initCodeCopy() {
		var pres = document.querySelectorAll(".post__content pre");
		Array.prototype.forEach.call(pres, function (pre) {
			if (pre.querySelector(".code-copy")) return;
			pre.classList.add("has-copy");
			var btn = document.createElement("button");
			btn.type = "button"; btn.className = "code-copy"; btn.textContent = "복사";
			btn.addEventListener("click", function () {
				var code = pre.querySelector("code") || pre, text = code.innerText;
				var done = function () { btn.textContent = "복사됨!"; btn.classList.add("is-done"); setTimeout(function () { btn.textContent = "복사"; btn.classList.remove("is-done"); }, 1500); };
				if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done);
				else { var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} document.body.removeChild(ta); done(); }
			});
			pre.appendChild(btn);
		});
	}

	/* =====================================================================
	   6) 이미지 라이트박스
	   ===================================================================== */
	function initLightbox() {
		var imgs = document.querySelectorAll(".post__content img");
		if (!imgs.length) return;
		var box = document.createElement("div");
		box.className = "lightbox";
		box.innerHTML = '<button type="button" class="lightbox__close" aria-label="닫기">&times;</button><img alt="">';
		document.body.appendChild(box);
		var big = box.querySelector("img");
		var close = function () { box.classList.remove("is-open"); };
		box.addEventListener("click", function (e) { if (e.target !== big) close(); });
		document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
		Array.prototype.forEach.call(imgs, function (img) {
			img.addEventListener("click", function () { big.src = img.currentSrc || img.src; box.classList.add("is-open"); });
		});
	}

	/* =====================================================================
	   7) 공유 버튼
	   ===================================================================== */
	function initShare() {
		var wrap = document.querySelector(".post__share");
		if (!wrap) return;
		wrap.addEventListener("click", function (e) {
			var btn = e.target.closest(".share-btn"); if (!btn) return;
			var type = btn.getAttribute("data-share"), url = location.href;
			var titleEl = document.querySelector(".post__title");
			var title = (titleEl ? titleEl.textContent : document.title).trim();
			if (type === "x") window.open("https://twitter.com/intent/tweet?text=" + encodeURIComponent(title) + "&url=" + encodeURIComponent(url), "_blank", "noopener");
			else if (type === "facebook") window.open("https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url), "_blank", "noopener");
			else if (type === "copy") {
				var done = function () { var o = btn.textContent; btn.textContent = "복사됨!"; btn.classList.add("is-done"); setTimeout(function () { btn.textContent = o; btn.classList.remove("is-done"); }, 1500); };
				if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, done); else done();
			}
		});
	}

	/* =====================================================================
	   +) SEO: 게시글 JSON-LD (BlogPosting) 구조화 데이터
	   ===================================================================== */
	function toIsoDate(s) {
		if (!s) return null;
		var d = s.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
		if (!d) return null;
		var iso = d[1] + "-" + ("0" + d[2]).slice(-2) + "-" + ("0" + d[3]).slice(-2);
		var t = s.match(/(\d{1,2}):(\d{2})/);
		if (t) iso += "T" + ("0" + t[1]).slice(-2) + ":" + t[2] + ":00";
		return iso;
	}
	function initSeo() {
		var titleEl = document.querySelector(".post__title");
		if (!document.querySelector(".post") || !titleEl) return;
		var img = document.querySelector(".post__content img");
		var timeEl = document.querySelector(".post__meta time");
		var authorEl = document.querySelector(".post__author");
		var contentEl = document.querySelector(".post__content");
		var data = {
			"@context": "https://schema.org",
			"@type": "BlogPosting",
			"headline": titleEl.textContent.trim().slice(0, 110),
			"mainEntityOfPage": { "@type": "WebPage", "@id": location.href },
			"url": location.href
		};
		if (contentEl) { var desc = contentEl.textContent.trim().replace(/\s+/g, " ").slice(0, 160); if (desc) data.description = desc; }
		if (img) data.image = img.currentSrc || img.src;
		if (authorEl && authorEl.textContent.trim()) data.author = { "@type": "Person", "name": authorEl.textContent.trim() };
		if (timeEl) { var iso = toIsoDate(timeEl.getAttribute("datetime") || timeEl.textContent); if (iso) data.datePublished = iso; }
		var s = document.createElement("script");
		s.type = "application/ld+json";
		s.textContent = JSON.stringify(data);
		document.head.appendChild(s);
	}

	/* =====================================================================
	   8) 맨 위로
	   ===================================================================== */
	function initToTop() {
		var btn = document.querySelector(".to-top");
		if (!btn) return;
		var onScroll = function () { if (window.pageYOffset > 480) btn.removeAttribute("hidden"); else btn.setAttribute("hidden", "hidden"); };
		btn.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
		window.addEventListener("scroll", onScroll, { passive: true });
		onScroll();
	}

	/* --------------------------------------------------------------------- */
	function run(fn) { try { fn(); } catch (e) { if (window.console) console.warn("[skin]", e); } }
	function init() {
		run(buildCategories);
		run(initThemer);
		run(initReading);
		run(initHighlight);
		run(initToc);
		run(initCodeCopy);
		run(initLightbox);
		run(initShare);
		run(initSeo);
		run(initToTop);
	}
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
	else init();
})();
