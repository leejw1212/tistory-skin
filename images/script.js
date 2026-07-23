/* =========================================================================
   Clean Gallery skin — 인터랙션 스크립트 (설정 기반)
   기능 on/off 는 skin.html 상단 window.CLEAN_SKIN 에서 제어합니다.
   외부 라이브러리(highlight.js·mermaid·KaTeX)는 필요한 페이지에서만 동적 로드.
   각 기능은 try/catch 로 격리되어 하나가 실패해도 나머지는 동작합니다.
   ========================================================================= */
(function () {
	"use strict";

	/* ---------------------------------- 설정 ---------------------------------- */
	var DEFAULTS = {
		darkToggle: true, commandPalette: true, shortcuts: true, terminalHeader: true,
		toc: true, readingBar: true, syntaxHighlight: true, codeLineNumbers: true, codeCopy: true,
		mermaid: true, katex: true, callouts: true, lightbox: true, share: true,
		relatedPosts: true, seo: true, backToTop: true, githubCard: true, techBadges: true,
		homeProfile: false, adClient: "",
		github: "", techStack: [], series: [], certs: []
	};
	var CFG = {};
	(function () { var u = window.CLEAN_SKIN || {}, k; for (k in DEFAULTS) CFG[k] = DEFAULTS[k]; for (k in u) if (u.hasOwnProperty(k)) CFG[k] = u[k]; })();

	/* --------------------------------- helpers -------------------------------- */
	function qs(s, c) { return (c || document).querySelector(s); }
	function qsa(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
	function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
	function normPath(p) { try { p = decodeURIComponent(p); } catch (e) {} p = p.replace(/\/+$/, ""); return p === "" ? "/" : p; }
	function isHome() { return normPath(location.pathname) === "/" || (document.body && document.body.id === "tt-body-index"); }
	function isDark() { var t = document.documentElement.getAttribute("data-theme"); if (t) return t === "dark"; return window.matchMedia("(prefers-color-scheme: dark)").matches; }
	function loadCss(href) { return new Promise(function (res) { if (document.querySelector('link[href="' + href + '"]')) return res(); var l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; l.onload = res; l.onerror = res; document.head.appendChild(l); }); }
	function loadJs(src) { return new Promise(function (res) { if (document.querySelector('script[src="' + src + '"]')) return res(); var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = res; document.head.appendChild(s); }); }

	/* ===================================================================== 1) 카테고리 원형 메뉴 */
	var ICONS = [
		[/(devops|데브옵스)/i, "♾️"], [/(openstack|오픈스택|nova|neutron|keystone|cinder|glance)/i, "🌩️"],
		[/(terraform|테라폼|opentofu|(^|\b)iac(\b)|pulumi)/i, "🏗️"], [/(kubernetes|k8s|kubectl|helm|쿠버네티스|kustomize|istio)/i, "☸️"],
		[/(docker|container|컨테이너|podman|containerd)/i, "🐳"], [/(aws|amazon|ec2|s3|lambda|eks|ecs)/i, "☁️"],
		[/(gcp|google\s?cloud|azure|oci|클라우드|(^|\b)cloud\b|openshift)/i, "☁️"], [/(ci\/?cd|jenkins|argo|gitlab\s?ci|pipeline|파이프라인|배포|deploy|github\s?actions)/i, "🚀"],
		[/(github|gitlab|(^|\b)git(\b|hub)|형상|버전관리)/i, "🐙"], [/(ansible|automation|자동화|chef|puppet|salt)/i, "🤖"],
		[/(linux|리눅스|ubuntu|centos|rocky|debian|rhel|unix)/i, "🐧"], [/(mac\s?os|맥북|(^|\b)mac(\b|os))/i, "🍎"],
		[/(window|윈도우|wsl)/i, "🪟"], [/(monitor|모니터|grafana|prometheus|observ|관측|metric|alert|알람|loki)/i, "📊"],
		[/(network|네트워크|(^|\b)dns|nginx|proxy|load\s?balanc|(^|\b)lb\b|cdn|vpc)/i, "🌐"], [/(database|데이터베이스|(^|\b)db\b|sql|mysql|postgre|redis|mongo|rds|etcd)/i, "🗄️"],
		[/(security|보안|vault|(^|\b)iam|인증|tls|ssl|cert)/i, "🔒"], [/(python|파이썬)/i, "🐍"],
		[/(golang|(^|\b)go(lang)?\b)/i, "🐹"], [/(java|spring|스프링)/i, "☕"], [/(node|javascript|typescript|react|프론트|front)/i, "🟨"],
		[/(shell|bash|zsh|스크립트|(^|\b)script\b|command|(^|\b)cli\b)/i, "💻"], [/(log|로그|elk|kibana|logstash|fluentd|opensearch)/i, "📋"],
		[/(trouble|장애|이슈|(^|\b)issue|오류|(^|\b)error|debug|디버깅)/i, "🔧"], [/(study|공부|학습|(^|\b)til(\b|$)|정리|(^|\b)note|노트)/i, "📚"],
		[/(project|프로젝트|toy|사이드)/i, "📦"], [/(review|회고|생각|일상|diary|essay|후기)/i, "✍️"], [/(cka|ckad|cks|cert|자격증|시험|exam)/i, "🎓"],
		[/(msa|micro|아키텍처|architecture|design)/i, "🧩"], [/((^|\b)api(\b|s)|rest|graphql|grpc)/i, "🔌"],
		[/(kafka|spark|airflow|etl|(^|\b)data(\b|base)?)/i, "🧪"], [/((^|\b)ai(\b)|(^|\b)ml(\b)|머신러닝|딥러닝|llm|gpt)/i, "🧠"]
	];
	function pickIcon(n) { for (var i = 0; i < ICONS.length; i++) if (ICONS[i][0].test(n)) return ICONS[i][1]; return null; }
	function cleanLabel(r) { return (r || "").replace(/\s*\(\s*[\d,]+\s*\)\s*$/, "").replace(/\s+/g, " ").trim(); }
	function countOf(r) { var m = (r || "").match(/\(\s*([\d,]+)\s*\)\s*$/); return m ? parseInt(m[1].replace(/,/g, ""), 10) : null; }
	function initial(n) { var c = n.trim().charAt(0); return c ? c.toUpperCase() : "#"; }
	function isActive(href) { try { var u = new URL(href, location.origin), hp = normPath(u.pathname); if (hp === "/") return false; return normPath(location.pathname) === hp; } catch (e) { return false; } }
	function circle(href, label, active, forceIc) {
		var a = document.createElement("a");
		a.className = "cat-circle" + (active ? " is-active" : ""); a.href = href; a.title = label; a.setAttribute("role", "listitem");
		var ic = forceIc || pickIcon(label);
		a.innerHTML = '<span class="cat-ic' + (ic ? "" : " cat-ic-txt") + '">' + (ic ? ic : esc(initial(label))) + '</span><span class="cat-name">' + esc(label) + "</span>";
		return a;
	}
	function buildCategories() {
		var target = qs("#catCircles"), source = qs("#catSource");
		if (!target) return;
		var all = source ? qsa("a[href]", source) : [], links = [], i, h;
		for (i = 0; i < all.length; i++) { h = all[i].getAttribute("href") || ""; if (h.indexOf("/category") > -1) links.push(all[i]); }
		if (!links.length) for (i = 0; i < all.length; i++) { h = all[i].getAttribute("href") || ""; if (!h || h === "#") continue; if (/manage|admin|entry\/post|\/rss|guestbook|\/tag/i.test(h)) continue; links.push(all[i]); }
		var frag = document.createDocumentFragment(), seen = {};
		frag.appendChild(circle(target.getAttribute("data-home") || "/", "전체", normPath(location.pathname) === "/", "🏠"));
		for (i = 0; i < links.length; i++) {
			var a = links[i], href = a.getAttribute("href"), label = cleanLabel(a.textContent);
			if (!label || /^(전체|전체보기|분류\s*전체보기)$/.test(label) || countOf(a.textContent) === 0) continue;
			var key = href + "|" + label; if (seen[key]) continue; seen[key] = 1;
			frag.appendChild(circle(href, label, isActive(href)));
		}
		target.textContent = ""; target.appendChild(frag); target.classList.add("is-ready");
	}

	/* ===================================================================== 2) 다크 토글 */
	function initThemer() {
		var btn = qs("#themer"); if (!btn) return;
		if (!CFG.darkToggle) { btn.style.display = "none"; return; }
		btn.addEventListener("click", toggleTheme);
	}
	function toggleTheme() {
		var root = document.documentElement, cur = root.getAttribute("data-theme"), next;
		next = cur ? (cur === "dark" ? "light" : "dark") : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark");
		root.setAttribute("data-theme", next);
		try { localStorage.setItem("theme", next); } catch (e) {}
		document.dispatchEvent(new CustomEvent("skin:theme", { detail: next }));
	}

	/* ===================================================================== 3) 읽는 시간 + 진행률 */
	function initReading() {
		var content = qs(".post__content"); if (!content) return;
		var readEl = qs(".post__read");
		if (readEl) {
			var text = content.innerText || "";
			var cjk = (text.match(/[ㄱ-힝一-鿿]/g) || []).length, words = (text.trim().match(/[A-Za-z0-9]+/g) || []).length;
			readEl.textContent = "☕ 읽는 시간 " + Math.max(1, Math.round(cjk / 500 + words / 220)) + "분"; readEl.classList.add("is-on");
		}
		var bar = qs(".read-progress span");
		if (bar) {
			var upd = function () { var s = content.offsetTop, e = s + content.offsetHeight, y = window.pageYOffset + window.innerHeight * 0.25; bar.style.width = (Math.max(0, Math.min(1, (y - s) / Math.max(1, e - s))) * 100) + "%"; };
			window.addEventListener("scroll", upd, { passive: true }); window.addEventListener("resize", upd); upd();
		}
	}

	/* ===================================================================== 4) 목차 + 제목 앵커 */
	function slugify(s) { return (s.trim().toLowerCase().replace(/[^\w가-힣\s-]/g, "").replace(/\s+/g, "-").slice(0, 60)) || "section"; }
	function initToc() {
		var content = qs(".post__content"), toc = qs("#toc"); if (!content) { if (toc) toc.remove(); return; }
		var heads = qsa("h2, h3", content);
		if (heads.length < 2) { if (toc) toc.remove(); return; }
		var used = {}, items = [];
		heads.forEach(function (h) {
			var id = h.id; if (!id) { var b = slugify(h.textContent), c = b, n = 2; while (used[c] || document.getElementById(c)) { c = b + "-" + n; n++; } id = c; h.id = id; }
			used[id] = 1;
			var a = document.createElement("a"); a.href = "#" + id; a.className = "h-anchor"; a.textContent = "#"; a.setAttribute("aria-label", "이 섹션 링크"); h.appendChild(a);
			items.push({ id: id, text: h.textContent.replace(/#$/, "").trim(), lv: h.tagName === "H3" ? 3 : 2, el: h });
		});
		if (!toc) return;
		var html = '<p class="toc__title">CONTENTS</p>';
		items.forEach(function (it) { html += '<a href="#' + it.id + '" class="' + (it.lv === 3 ? "lv3" : "") + '" data-id="' + it.id + '">' + esc(it.text) + "</a>"; });
		toc.innerHTML = html; toc.classList.add("is-ready");
		toc.addEventListener("click", function (e) { var a = e.target.closest("a"); if (!a) return; var t = document.getElementById(a.getAttribute("data-id")); if (t) { e.preventDefault(); window.scrollTo({ top: t.getBoundingClientRect().top + window.pageYOffset - 76, behavior: "smooth" }); history.replaceState(null, "", "#" + a.getAttribute("data-id")); } });
		var links = qsa("a[data-id]", toc);
		var spy = function () { var pos = window.pageYOffset + 100, cur = items[0]; for (var i = 0; i < items.length; i++) if (items[i].el.offsetTop <= pos) cur = items[i]; links.forEach(function (l) { l.classList.toggle("is-current", l.getAttribute("data-id") === cur.id); }); };
		window.addEventListener("scroll", spy, { passive: true }); spy();
	}

	/* ===================================================================== 5) Mermaid 다이어그램 */
	var MERMAID_RE = /^\s*(graph |flowchart |sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart|C4Context)/;
	function collectMermaid(content) {
		var out = [];
		qsa("pre", content).forEach(function (pre) {
			var code = pre.querySelector("code") || pre;
			var lang = (pre.getAttribute("data-ke-language") || code.className || "").toLowerCase();
			var text = code.textContent;
			if (lang.indexOf("mermaid") > -1 || MERMAID_RE.test(text)) {
				var div = document.createElement("div"); div.className = "mermaid"; div.textContent = text.trim();
				pre.parentNode.replaceChild(div, pre); out.push(div);
			}
		});
		return out;
	}
	function initMermaid(content) {
		var nodes = collectMermaid(content); if (!nodes.length) return;
		loadJs("https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js").then(function () {
			if (typeof mermaid === "undefined") return;
			try {
				mermaid.initialize({ startOnLoad: false, securityLevel: "loose", theme: isDark() ? "dark" : "default", fontFamily: "inherit" });
				mermaid.run({ nodes: nodes });
			} catch (e) {}
		});
	}

	/* ===================================================================== 6) 코드: 하이라이트 + 줄번호 + 복사 */
	function registerHcl() {
		if (typeof hljs === "undefined" || hljs.getLanguage("hcl")) return;
		try {
			hljs.registerLanguage("hcl", function (hljs) {
				return { aliases: ["tf", "terraform"], keywords: { keyword: "resource variable provider module data output locals terraform for_each count depends_on lifecycle dynamic backend", literal: "true false null" },
					contains: [hljs.COMMENT("#", "$"), hljs.COMMENT("//", "$"), hljs.COMMENT("/\\*", "\\*/"), hljs.QUOTE_STRING_MODE, hljs.NUMBER_MODE, { className: "variable", begin: /\$\{/, end: /\}/ }, { className: "attr", begin: /[a-zA-Z_][\w-]*(?=\s*=)/ }] };
			});
		} catch (e) {}
	}
	function addLineNumbers(pre) {
		if (!CFG.codeLineNumbers || pre.querySelector(".code-gutter")) return;
		var code = pre.querySelector("code") || pre;
		var lines = code.textContent.replace(/\n$/, "").split("\n").length;
		if (lines < 2) return;
		var g = document.createElement("span"); g.className = "code-gutter"; g.setAttribute("aria-hidden", "true");
		var s = ""; for (var i = 1; i <= lines; i++) s += i + (i < lines ? "\n" : "");
		g.textContent = s; pre.insertBefore(g, pre.firstChild); pre.classList.add("has-ln");
	}
	function decorateCode() {
		qsa(".post__content pre").forEach(function (pre) {
			if (pre.classList.contains("mermaid")) return;
			var code = pre.querySelector("code");
			if (!code) { code = document.createElement("code"); code.textContent = pre.textContent; pre.textContent = ""; pre.appendChild(code); }
			addLineNumbers(pre);
			if (CFG.codeCopy && !pre.querySelector(".code-copy")) {
				pre.classList.add("has-copy");
				var btn = document.createElement("button"); btn.type = "button"; btn.className = "code-copy"; btn.textContent = "복사";
				btn.addEventListener("click", function () {
					var t = code.innerText, done = function () { btn.textContent = "복사됨!"; btn.classList.add("is-done"); setTimeout(function () { btn.textContent = "복사"; btn.classList.remove("is-done"); }, 1500); };
					if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, done);
					else { var ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} document.body.removeChild(ta); done(); }
				});
				pre.appendChild(btn);
			}
		});
	}
	function initHighlight() {
		var pres = qsa(".post__content pre code");
		if (!pres.length || !CFG.syntaxHighlight) { decorateCode(); return; }
		loadCss("https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css");
		loadJs("https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js").then(function () {
			if (typeof hljs !== "undefined") {
				registerHcl();
				qsa(".post__content pre code").forEach(function (code) {
					if (code.closest("pre") && code.closest("pre").classList.contains("mermaid")) return;
					if (code.dataset.highlighted || code.querySelector("span")) return;
					var pre = code.closest("pre"), lang = pre && (pre.getAttribute("data-ke-language") || pre.getAttribute("data-language"));
					if (lang) code.classList.add("language-" + lang.toLowerCase().replace("terraform", "hcl"));
					try { hljs.highlightElement(code); } catch (e) {}
				});
			}
			decorateCode();
		});
	}

	/* ===================================================================== 7) KaTeX 수식 */
	function hasMath(el) { return /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\])/.test(el.textContent); }
	function initKatex(content) {
		if (!hasMath(content)) return;
		loadCss("https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css");
		loadJs("https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js").then(function () {
			return loadJs("https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js");
		}).then(function () {
			if (typeof renderMathInElement === "undefined") return;
			try { renderMathInElement(content, { delimiters: [{ left: "$$", right: "$$", display: true }, { left: "\\[", right: "\\]", display: true }, { left: "$", right: "$", display: false }, { left: "\\(", right: "\\)", display: false }], throwOnError: false }); } catch (e) {}
		});
	}

	/* ===================================================================== 8) 콜아웃 박스 */
	var CALLOUTS = { NOTE: ["📝", "NOTE"], TIP: ["💡", "TIP"], IMPORTANT: ["❗", "IMPORTANT"], WARNING: ["⚠️", "WARNING"], DANGER: ["🔥", "DANGER"], CAUTION: ["🔥", "CAUTION"] };
	function initCallouts(content) {
		qsa("blockquote", content).forEach(function (bq) {
			var m = (bq.textContent || "").match(/^\s*\[!(\w+)\]/i); if (!m) return;
			var key = m[1].toUpperCase(), c = CALLOUTS[key]; if (!c) return;
			var first = bq.querySelector("p") || bq.firstElementChild || bq;
			if (first && first.innerHTML) first.innerHTML = first.innerHTML.replace(/^\s*\[!\w+\]\s*(<br\s*\/?>)?/i, "");
			else bq.innerHTML = bq.innerHTML.replace(/^\s*\[!\w+\]\s*/i, "");
			bq.classList.add("callout", "callout--" + key.toLowerCase());
			var head = document.createElement("div"); head.className = "callout__head"; head.innerHTML = '<span class="callout__ic">' + c[0] + '</span><span class="callout__title">' + c[1] + "</span>";
			bq.insertBefore(head, bq.firstChild);
		});
	}

	/* ===================================================================== 9) 라이트박스 */
	function initLightbox() {
		var imgs = qsa(".post__content img"); if (!imgs.length) return;
		var box = document.createElement("div"); box.className = "lightbox"; box.innerHTML = '<button type="button" class="lightbox__close" aria-label="닫기">&times;</button><img alt="">';
		document.body.appendChild(box);
		var big = box.querySelector("img"), close = function () { box.classList.remove("is-open"); };
		box.addEventListener("click", function (e) { if (e.target !== big) close(); });
		document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
		imgs.forEach(function (img) { img.addEventListener("click", function () { big.src = img.currentSrc || img.src; box.classList.add("is-open"); }); });
	}

	/* ===================================================================== 10) 공유 */
	function initShare() {
		var wrap = qs(".post__share"); if (!wrap) return;
		if (!CFG.share) { wrap.style.display = "none"; return; }
		wrap.addEventListener("click", function (e) {
			var btn = e.target.closest(".share-btn"); if (!btn) return;
			var type = btn.getAttribute("data-share"), url = location.href, tEl = qs(".post__title"), title = (tEl ? tEl.textContent : document.title).trim();
			if (type === "x") window.open("https://twitter.com/intent/tweet?text=" + encodeURIComponent(title) + "&url=" + encodeURIComponent(url), "_blank", "noopener");
			else if (type === "facebook") window.open("https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url), "_blank", "noopener");
			else if (type === "copy") { var done = function () { var o = btn.textContent; btn.textContent = "복사됨!"; btn.classList.add("is-done"); setTimeout(function () { btn.textContent = o; btn.classList.remove("is-done"); }, 1500); }; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, done); else done(); }
		});
	}

	/* ===================================================================== 11) 시리즈(연재) 네비 */
	function initSeries() {
		var content = qs(".post__content"); if (!content || !CFG.series || !CFG.series.length) return;
		var here = normPath(location.pathname), found = null, idx = -1;
		CFG.series.forEach(function (s) { (s.posts || []).forEach(function (p, i) { if (normPath(p.url) === here) { found = s; idx = i; } }); });
		if (!found) return;
		var box = document.createElement("div"); box.className = "series";
		var html = '<div class="series__head"><span class="series__ic">📚</span><strong>' + esc(found.name) + '</strong><span class="series__count">' + found.posts.length + '편 중 ' + (idx + 1) + '편</span></div><ol class="series__list">';
		found.posts.forEach(function (p, i) { html += '<li class="' + (i === idx ? "is-current" : "") + '"><a href="' + esc(p.url) + '">' + esc(p.title) + "</a></li>"; });
		html += "</ol>"; box.innerHTML = html;
		var article = qs(".post"); if (article && article.parentNode) article.parentNode.insertBefore(box, article.nextSibling);
	}

	/* ===================================================================== 12) 터미널 헤더 */
	function initTerminal() { if (CFG.terminalHeader) document.documentElement.classList.add("cfg-terminal"); }

	/* ===================================================================== 13) 홈 프로필 허브 / 위젯 */
	var DEVICON = {
		terraform: "terraform-plain colored", kubernetes: "kubernetes-plain colored", k8s: "kubernetes-plain colored",
		docker: "docker-plain colored", ansible: "ansible-plain colored", linux: "linux-plain colored",
		python: "python-plain colored", openstack: "openstack-plain colored",
		aws: "amazonwebservices-plain-wordmark colored", amazonwebservices: "amazonwebservices-plain-wordmark colored",
		gcp: "googlecloud-plain colored", googlecloud: "googlecloud-plain colored", azure: "azure-plain colored",
		go: "go-original-wordmark colored", golang: "go-original-wordmark colored",
		grafana: "grafana-original colored", prometheus: "prometheus-original colored", nginx: "nginx-original colored",
		redis: "redis-plain colored", postgresql: "postgresql-plain colored", postgres: "postgresql-plain colored",
		mysql: "mysql-plain colored", mongodb: "mongodb-plain colored", git: "git-plain colored",
		github: "github-original", gitlab: "gitlab-plain colored", jenkins: "jenkins-plain colored",
		helm: "helm-plain colored", bash: "bash-plain colored", shell: "bash-plain colored",
		java: "java-plain colored", spring: "spring-plain colored", javascript: "javascript-plain colored",
		js: "javascript-plain colored", typescript: "typescript-plain colored", ts: "typescript-plain colored",
		react: "react-original colored", nodejs: "nodejs-plain colored", node: "nodejs-plain colored",
		kafka: "apachekafka-original colored", elasticsearch: "elasticsearch-plain colored",
		vagrant: "vagrant-plain colored", vault: "vault-plain colored", argocd: "argocd-plain colored",
		redhat: "redhat-plain colored", googlecloudplatform: "googlecloud-plain colored"
	};

	/* 자격증 DB: 이름만 넣으면 발급기관 로고(mark)와 함께 표시 */
	var CERT_DB = {
		cka: { label: "CKA", desc: "Certified Kubernetes Administrator", issuer: "CNCF", icon: "kubernetes" },
		ckad: { label: "CKAD", desc: "Certified Kubernetes Application Developer", issuer: "CNCF", icon: "kubernetes" },
		cks: { label: "CKS", desc: "Certified Kubernetes Security Specialist", issuer: "CNCF", icon: "kubernetes" },
		kcna: { label: "KCNA", desc: "Kubernetes and Cloud Native Associate", issuer: "CNCF", icon: "kubernetes" },
		kcsa: { label: "KCSA", desc: "Kubernetes and Cloud Native Security Associate", issuer: "CNCF", icon: "kubernetes" },
		awsclf: { label: "AWS Cloud Practitioner", issuer: "AWS", icon: "aws" },
		awssaa: { label: "AWS SAA", desc: "Solutions Architect – Associate", issuer: "AWS", icon: "aws" },
		awssap: { label: "AWS SAP", desc: "Solutions Architect – Professional", issuer: "AWS", icon: "aws" },
		awssoa: { label: "AWS SOA", desc: "SysOps Administrator", issuer: "AWS", icon: "aws" },
		awsdva: { label: "AWS DVA", desc: "Developer – Associate", issuer: "AWS", icon: "aws" },
		awsdop: { label: "AWS DOP", desc: "DevOps Engineer – Professional", issuer: "AWS", icon: "aws" },
		awsscs: { label: "AWS SCS", desc: "Security – Specialty", issuer: "AWS", icon: "aws" },
		terraformassociate: { label: "Terraform Associate", issuer: "HashiCorp", icon: "terraform" },
		vaultassociate: { label: "Vault Associate", issuer: "HashiCorp", icon: "vault" },
		az900: { label: "AZ-900", desc: "Azure Fundamentals", issuer: "Microsoft", icon: "azure" },
		az104: { label: "AZ-104", desc: "Azure Administrator", issuer: "Microsoft", icon: "azure" },
		az305: { label: "AZ-305", desc: "Azure Solutions Architect", issuer: "Microsoft", icon: "azure" },
		az400: { label: "AZ-400", desc: "Azure DevOps Engineer", issuer: "Microsoft", icon: "azure" },
		gcpace: { label: "GCP ACE", desc: "Associate Cloud Engineer", issuer: "Google Cloud", icon: "gcp" },
		gcppca: { label: "GCP PCA", desc: "Professional Cloud Architect", issuer: "Google Cloud", icon: "gcp" },
		rhcsa: { label: "RHCSA", desc: "Red Hat Certified System Administrator", issuer: "Red Hat", icon: "redhat" },
		rhce: { label: "RHCE", desc: "Red Hat Certified Engineer", issuer: "Red Hat", icon: "redhat" },
		lfcs: { label: "LFCS", desc: "Linux Foundation Certified SysAdmin", issuer: "Linux Foundation", icon: "linux" },
		dca: { label: "DCA", desc: "Docker Certified Associate", issuer: "Docker", icon: "docker" },
		oscp: { label: "OSCP", desc: "Offensive Security Certified Professional", issuer: "OffSec", icon: "" }
	};
	function inferCertIcon(k) {
		if (/aws|saa|sap|soa|dva|dop|scs/.test(k)) return "aws";
		if (/kube|k8s|(^ck)|kcna|kcsa/.test(k)) return "kubernetes";
		if (/terraform|hashi/.test(k)) return "terraform";
		if (/vault/.test(k)) return "vault";
		if (/^az|azure/.test(k)) return "azure";
		if (/gcp|google/.test(k)) return "gcp";
		if (/rhc|redhat/.test(k)) return "redhat";
		if (/lfcs|linux/.test(k)) return "linux";
		if (/docker|dca/.test(k)) return "docker";
		return "";
	}
	function resolveCert(entry) {
		if (typeof entry === "string") entry = { name: entry };
		var raw = entry.name || "", key = raw.toLowerCase().replace(/[^a-z0-9]/g, ""), db = CERT_DB[key] || {};
		var name = entry.label || db.label || raw;
		var issuer = entry.issuer || db.issuer || "";
		var desc = entry.desc || db.desc || issuer || "";
		var icon = entry.icon || db.icon || inferCertIcon(key);
		return { name: name, issuer: issuer, desc: desc, icon: icon, img: entry.img || "", url: entry.url || "" };
	}
	/* 발급기관별 뱃지 색/로고 (shields.io 이미지로 실제 마크 렌더) */
	var ISSUER_BADGE = {
		kubernetes: { logo: "kubernetes", color: "326CE5" }, aws: { logo: "amazonwebservices", color: "232F3E" },
		terraform: { logo: "terraform", color: "844FBA" }, vault: { logo: "vault", color: "000000" },
		azure: { logo: "microsoftazure", color: "0078D4" }, gcp: { logo: "googlecloud", color: "4285F4" },
		redhat: { logo: "redhat", color: "EE0000" }, linux: { logo: "linux", color: "1793D1" },
		docker: { logo: "docker", color: "2496ED" }
	};
	var CERT_EMOJI = { kubernetes: "☸️", aws: "☁️", terraform: "🏗️", vault: "🔒", azure: "☁️", gcp: "☁️", redhat: "🎩", linux: "🐧", docker: "🐳" };
	function shieldFor(c) {
		var b = ISSUER_BADGE[c.icon]; if (!b) return "";
		var enc = function (s) { return encodeURIComponent(String(s).replace(/-/g, "--").replace(/ /g, "_")); };
		return "https://img.shields.io/badge/" + enc(c.name) + "-" + enc(c.issuer || "Certified") + "-" + b.color + "?style=for-the-badge&logo=" + b.logo + "&logoColor=white";
	}
	function certFallback(c) {
		return '<span class="cert"><span class="cert__ic">' + (CERT_EMOJI[c.icon] || "🎖️") + '</span><span class="cert__meta"><span class="cert__name">' + esc(c.name) + "</span>" + (c.desc ? '<span class="cert__issuer">' + esc(c.desc) + "</span>" : "") + "</span></span>";
	}
	function techIconsHtml(list) {
		var h = '<div class="hub-stack">';
		list.forEach(function (t) {
			var key = String(t).toLowerCase().replace(/[^a-z0-9]/g, ""), cls = DEVICON[key];
			var icon = cls ? '<i class="devicon-' + cls + '"></i>' : '<span class="hub-stack__emoji">' + (pickIcon(String(t)) || esc(initial(String(t)))) + "</span>";
			h += '<div class="hub-stack__item"><span class="hub-stack__ic">' + icon + '</span><span class="hub-stack__label">' + esc(t) + "</span></div>";
		});
		return h + "</div>";
	}
	function certsHtml(list) {
		var h = '<div class="hub-certs">';
		list.forEach(function (entry) {
			var c = resolveCert(entry);
			var open = c.url ? '<a class="cert-badge" href="' + esc(c.url) + '" target="_blank" rel="noopener">' : '<span class="cert-badge">';
			var close = c.url ? "</a>" : "</span>";
			if (c.img) { h += open + '<img class="cert__img" src="' + esc(c.img) + '" alt="' + esc(c.name) + '" loading="lazy">' + close; return; }
			var shield = shieldFor(c);
			if (shield) {
				/* 실제 뱃지 이미지 + 로드 실패 시 이모지 대체 */
				h += open + '<img class="cert__shield" src="' + esc(shield) + '" alt="' + esc(c.name) + " " + esc(c.issuer) + '" loading="lazy" ' +
					'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'inline-flex\'">' +
					'<span class="cert__fb" style="display:none"><span class="cert__ic">' + (CERT_EMOJI[c.icon] || "🎖️") + '</span><span class="cert__meta"><span class="cert__name">' + esc(c.name) + "</span>" + (c.desc ? '<span class="cert__issuer">' + esc(c.desc) + "</span>" : "") + "</span></span>" + close;
			} else {
				h += open + '<span class="cert__fb" style="display:inline-flex"><span class="cert__ic">🎖️</span><span class="cert__meta"><span class="cert__name">' + esc(c.name) + "</span>" + (c.desc ? '<span class="cert__issuer">' + esc(c.desc) + "</span>" : "") + "</span></span>" + close;
			}
		});
		return h + "</div>";
	}
	function githubCardHtml(u) {
		return '<a class="ghcard__link" href="https://github.com/' + encodeURIComponent(u) + '" target="_blank" rel="noopener">' +
			'<img class="ghcard__avatar" src="https://github.com/' + encodeURIComponent(u) + '.png" alt="" width="64" height="64" loading="lazy">' +
			'<span class="ghcard__meta"><strong class="ghcard__name">@' + esc(u) + '</strong><span class="ghcard__stats" id="ghstats">GitHub 프로필 →</span></span></a>' +
			'<a class="ghcard__chart" href="https://github.com/' + encodeURIComponent(u) + '" target="_blank" rel="noopener" aria-label="contribution graph">' +
			'<img src="https://ghchart.rshah.org/4f46e5/' + encodeURIComponent(u) + '" alt="" loading="lazy" onerror="this.parentNode.style.display=\'none\'"></a>';
	}
	function fillGithubStats(u) {
		try {
			fetch("https://api.github.com/users/" + encodeURIComponent(u)).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
				if (!d) return; var st = qs("#ghstats"); if (!st) return;
				st.textContent = "레포 " + (d.public_repos || 0) + " · 팔로워 " + (d.followers || 0) + (d.bio ? " · " + d.bio : "");
			}).catch(function () {});
		} catch (e) {}
	}
	function initHome() {
		if (!isHome()) return;
		var hub = qs("#profileHub"); if (!hub) return;

		var ex = qs(".home-extra"); if (ex) ex.setAttribute("hidden", "hidden");   /* 구 스트립 미사용 */

		var certsN = (CFG.certs && CFG.certs.length), stackN = (CFG.techStack && CFG.techStack.length);
		if (stackN) loadCss("https://cdn.jsdelivr.net/gh/devicons/devicon@latest/devicon.min.css");

		var html = "";
		if (CFG.githubCard && CFG.github) html += '<div class="hub-github">' + githubCardHtml(CFG.github) + "</div>";
		if (certsN) html += '<section class="hub-block"><p class="hub-title">CERTIFICATIONS</p>' + certsHtml(CFG.certs) + "</section>";
		if (stackN) html += '<section class="hub-block"><p class="hub-title">TECH STACK</p>' + techIconsHtml(CFG.techStack) + "</section>";
		if (!html) return;

		/* homeProfile: 게시글 대신 프로필만. false: 프로필을 글 목록 위에 얹기 */
		if (CFG.homeProfile) {
			var g = qs(".gallery"); if (g) g.style.display = "none";
			var lh = qs(".list-head"); if (lh) lh.style.display = "none";
			html += '<p class="hub-posts">— 글은 위쪽 카테고리 메뉴에서 볼 수 있어요 —</p>';
		}

		hub.innerHTML = html; hub.removeAttribute("hidden");
		if (CFG.githubCard && CFG.github) fillGithubStats(CFG.github);
	}

	/* ===================================================================== +) 애드센스 자동광고 */
	function initAdsense() {
		var id = String(CFG.adClient || "").trim();
		if (!id) return;
		if (document.querySelector('script[src*="adsbygoogle.js"]')) return;   /* 티스토리 등에서 이미 로드 시 중복 방지 */
		var s = document.createElement("script");
		s.async = true;
		s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(id);
		s.crossOrigin = "anonymous";
		document.head.appendChild(s);
	}

	/* ===================================================================== 14) 맨 위로 */
	function initToTop() {
		var btn = qs(".to-top"); if (!btn) return;
		if (!CFG.backToTop) { btn.remove(); return; }
		var on = function () { if (window.pageYOffset > 480) btn.removeAttribute("hidden"); else btn.setAttribute("hidden", "hidden"); };
		btn.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
		window.addEventListener("scroll", on, { passive: true }); on();
	}

	/* ===================================================================== 15) SEO JSON-LD */
	function toIso(s) { if (!s) return null; var d = s.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/); if (!d) return null; var iso = d[1] + "-" + ("0" + d[2]).slice(-2) + "-" + ("0" + d[3]).slice(-2); var t = s.match(/(\d{1,2}):(\d{2})/); if (t) iso += "T" + ("0" + t[1]).slice(-2) + ":" + t[2] + ":00"; return iso; }
	function initSeo() {
		var titleEl = qs(".post__title"); if (!qs(".post") || !titleEl) return;
		var img = qs(".post__content img"), timeEl = qs(".post__meta time"), authorEl = qs(".post__author"), content = qs(".post__content");
		var data = { "@context": "https://schema.org", "@type": "BlogPosting", "headline": titleEl.textContent.trim().slice(0, 110), "mainEntityOfPage": { "@type": "WebPage", "@id": location.href }, "url": location.href };
		if (content) { var de = content.textContent.trim().replace(/\s+/g, " ").slice(0, 160); if (de) data.description = de; }
		if (img) data.image = img.currentSrc || img.src;
		if (authorEl && authorEl.textContent.trim()) data.author = { "@type": "Person", "name": authorEl.textContent.trim() };
		if (timeEl) { var iso = toIso(timeEl.getAttribute("datetime") || timeEl.textContent); if (iso) data.datePublished = iso; }
		var s = document.createElement("script"); s.type = "application/ld+json"; s.textContent = JSON.stringify(data); document.head.appendChild(s);
	}

	/* ===================================================================== 16) 커맨드 팔레트 (⌘K) */
	var palette = null;
	function paletteItems() {
		var items = [{ label: "홈", href: "/", ic: "🏠" }];
		qsa(".site-nav a").forEach(function (a) { items.push({ label: a.textContent.trim(), href: a.getAttribute("href"), ic: "🔗" }); });
		var src = qs("#catSource");
		if (src) qsa("a[href]", src).forEach(function (a) { var h = a.getAttribute("href") || ""; if (h.indexOf("/category") < 0) return; var l = cleanLabel(a.textContent); if (!l || countOf(a.textContent) === 0 || /전체보기/.test(l)) return; items.push({ label: l, href: h, ic: pickIcon(l) || "📁" }); });
		return items;
	}
	function buildPalette() {
		palette = document.createElement("div"); palette.className = "cmdk"; palette.setAttribute("hidden", "hidden");
		palette.innerHTML = '<div class="cmdk__backdrop"></div><div class="cmdk__panel" role="dialog" aria-label="빠른 이동"><div class="cmdk__bar"><span class="cmdk__ic">⌘</span><input class="cmdk__input" type="text" placeholder="검색하거나 이동…" aria-label="검색"></div><ul class="cmdk__list"></ul><div class="cmdk__hint">↑↓ 선택 · Enter 이동 · Esc 닫기</div></div>';
		document.body.appendChild(palette);
		var input = qs(".cmdk__input", palette), list = qs(".cmdk__list", palette), all = paletteItems(), sel = 0, view = [];
		function render(q) {
			q = (q || "").trim().toLowerCase();
			view = all.filter(function (it) { return !q || it.label.toLowerCase().indexOf(q) > -1; });
			var html = "";
			if (q) html += '<li class="cmdk__item is-search" data-search="1"><span class="cmdk__i">🔍</span>‘' + esc(q) + '’ 검색</li>';
			view.forEach(function (it, i) { html += '<li class="cmdk__item" data-i="' + i + '"><span class="cmdk__i">' + (it.ic || "•") + "</span>" + esc(it.label) + "</li>"; });
			list.innerHTML = html || '<li class="cmdk__empty">결과 없음</li>';
			sel = 0; mark();
		}
		function rows() { return qsa(".cmdk__item", list); }
		function mark() { rows().forEach(function (r, i) { r.classList.toggle("is-sel", i === sel); }); var el = rows()[sel]; if (el) el.scrollIntoView({ block: "nearest" }); }
		function go() {
			var r = rows()[sel]; if (!r) return;
			if (r.getAttribute("data-search")) { location.href = "/search/" + encodeURIComponent(input.value.trim()); return; }
			var i = r.getAttribute("data-i"); if (i != null && view[i]) location.href = view[i].href;
		}
		input.addEventListener("input", function () { render(input.value); });
		list.addEventListener("click", function (e) { var r = e.target.closest(".cmdk__item"); if (!r) return; sel = rows().indexOf(r); go(); });
		palette.addEventListener("click", function (e) { if (e.target.classList.contains("cmdk__backdrop")) closePalette(); });
		palette.addEventListener("keydown", function (e) {
			if (e.key === "Escape") { closePalette(); }
			else if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(rows().length - 1, sel + 1); mark(); }
			else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
			else if (e.key === "Enter") { e.preventDefault(); go(); }
		});
		palette._render = render;
		render("");
	}
	function openPalette() { if (!palette) buildPalette(); palette._render(""); palette.removeAttribute("hidden"); var i = qs(".cmdk__input", palette); i.value = ""; setTimeout(function () { i.focus(); }, 20); }
	function closePalette() { if (palette) palette.setAttribute("hidden", "hidden"); }

	/* ===================================================================== 17) 키보드 단축키 */
	function typing(e) { var t = e.target, n = t.tagName; return t.isContentEditable || n === "INPUT" || n === "TEXTAREA" || n === "SELECT"; }
	function initShortcuts() {
		var gTimer = null, gPrev = false;
		document.addEventListener("keydown", function (e) {
			if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) { if (CFG.commandPalette) { e.preventDefault(); openPalette(); } return; }
			if (!CFG.shortcuts || typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
			if (e.key === "/") { e.preventDefault(); var s = qs(".search__input"); if (s) s.focus(); }
			else if (e.key === "t") { if (CFG.darkToggle) toggleTheme(); }
			else if (e.key === "?") { toggleHelp(); }
			else if (e.key === "g") { gPrev = true; clearTimeout(gTimer); gTimer = setTimeout(function () { gPrev = false; }, 800); }
			else if (e.key === "h" && gPrev) { gPrev = false; location.href = "/"; }
			else if (e.key === "j") { moveCard(1, e); }
			else if (e.key === "k") { moveCard(-1, e); }
		});
	}
	var cardIdx = -1;
	function moveCard(dir, e) {
		var post = qs(".post");
		if (post) { var link = qs(dir > 0 ? ".post-nav__item--next" : ".post-nav__item--prev"); if (link) { e.preventDefault(); location.href = link.getAttribute("href"); } return; }
		var cards = qsa(".card"); if (!cards.length) return; e.preventDefault();
		cardIdx = Math.max(0, Math.min(cards.length - 1, cardIdx + dir));
		cards.forEach(function (c, i) { c.classList.toggle("kbd-focus", i === cardIdx); });
		var el = cards[cardIdx]; if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); var a = qs(".card__link", el); if (a) a.focus({ preventScroll: true }); }
	}
	var helpBox = null;
	function toggleHelp() {
		if (helpBox) { helpBox.remove(); helpBox = null; return; }
		var rows = "";
		if (CFG.commandPalette) rows += '<li><button type="button" class="kbd-help__open">커맨드 팔레트 열기</button><span class="keys"><kbd>⌘</kbd><kbd>K</kbd></span></li>';
		if (CFG.shortcuts) rows +=
			'<li><span>검색창 포커스</span><span class="keys"><kbd>/</kbd></span></li>' +
			'<li><span>라이트 / 다크 전환</span><span class="keys"><kbd>T</kbd></span></li>' +
			'<li><span>홈으로 이동</span><span class="keys"><kbd>G</kbd><kbd>H</kbd></span></li>' +
			'<li><span>이전 / 다음 글·카드</span><span class="keys"><kbd>J</kbd><kbd>K</kbd></span></li>' +
			'<li><span>이 안내 열기 / 닫기</span><span class="keys"><kbd>?</kbd></span></li>';
		if (!rows) return;
		helpBox = document.createElement("div"); helpBox.className = "kbd-help";
		helpBox.innerHTML = '<div class="kbd-help__head"><strong>사용법 · 단축키</strong><button type="button" class="kbd-help__x" aria-label="닫기">✕</button></div><ul>' + rows + "</ul>";
		document.body.appendChild(helpBox);
		helpBox.querySelector(".kbd-help__x").addEventListener("click", toggleHelp);
		var open = helpBox.querySelector(".kbd-help__open");
		if (open) open.addEventListener("click", function () { toggleHelp(); openPalette(); });
	}
	function initHelpButton() {
		var btn = qs("#kbdBtn"); if (!btn) return;
		if (!CFG.shortcuts && !CFG.commandPalette) { btn.remove(); return; }
		btn.addEventListener("click", toggleHelp);
	}
	document.addEventListener("keydown", function (e) { if (e.key === "Escape" && helpBox) toggleHelp(); });

	/* --------------------------------- 실행 ---------------------------------- */
	function run(on, fn) { if (!on) return; try { fn(); } catch (e) { if (window.console) console.warn("[skin]", e); } }
	function init() {
		run(true, buildCategories);
		run(true, initTerminal);
		run(true, initThemer);
		run(CFG.readingBar, initReading);
		run(CFG.toc, initToc);
		run(CFG.relatedPosts === false, function () { var r = qs(".related"); if (r) r.style.display = "none"; });

		var content = qs(".post__content");
		if (content) {
			run(CFG.mermaid, function () { initMermaid(content); });
			run(true, initHighlight);            /* 하이라이트 off 여도 코드 복사/줄번호 처리 위해 */
			run(CFG.katex, function () { initKatex(content); });
			run(CFG.callouts, function () { initCallouts(content); });
			run(CFG.lightbox, initLightbox);
			run(true, initShare);
			run(CFG.series && CFG.series.length, initSeries);
			run(CFG.seo, initSeo);
		}
		run(true, initHome);
		run(true, initAdsense);
		run(true, initToTop);
		run(CFG.commandPalette || CFG.shortcuts, initShortcuts);
		run(true, initHelpButton);
	}
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
