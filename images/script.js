/* =========================================================================
   Clean Gallery skin — 인터랙션 스크립트
   1) 원형 카테고리 메뉴 빌더 (DevOps 아이콘 자동 매핑)
   2) 맨 위로 버튼
   3) 코드블록 복사 버튼
   ========================================================================= */
(function () {
	"use strict";

	/* ---------------------------------------------------------------------
	   1) 원형 카테고리 메뉴
	   --------------------------------------------------------------------- */

	/* 카테고리 이름 키워드 → 이모지 (위에서부터 먼저 매칭 · DevOps 우선) */
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

	function pickIcon(n) {
		for (var i = 0; i < ICONS.length; i++) { if (ICONS[i][0].test(n)) return ICONS[i][1]; }
		return null;
	}
	function cleanLabel(raw) { return (raw || "").replace(/\s*\(\s*[\d,]+\s*\)\s*$/, "").replace(/\s+/g, " ").trim(); }
	function countOf(raw) { var m = (raw || "").match(/\(\s*([\d,]+)\s*\)\s*$/); return m ? parseInt(m[1].replace(/,/g, ""), 10) : null; }
	function initial(n) { var c = n.trim().charAt(0); return c ? c.toUpperCase() : "#"; }
	function esc(s) {
		return String(s).replace(/[&<>"']/g, function (c) {
			return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
		});
	}
	function curPath() { try { return decodeURIComponent(location.pathname); } catch (e) { return location.pathname; } }
	function isActive(href) {
		try {
			var u = new URL(href, location.origin);
			if (u.pathname === "/" || u.pathname === "") return false;
			return curPath().indexOf(decodeURIComponent(u.pathname)) === 0;
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
		for (i = 0; i < all.length; i++) {
			h = all[i].getAttribute("href") || "";
			if (h.indexOf("/category") > -1) links.push(all[i]);        /* 카테고리 링크만 */
		}
		if (!links.length) {                                            /* 폴백: 관리성 링크 제외 */
			for (i = 0; i < all.length; i++) {
				h = all[i].getAttribute("href") || "";
				if (!h || h === "#") continue;
				if (/manage|admin|entry\/post|\/rss|guestbook|\/tag/i.test(h)) continue;
				links.push(all[i]);
			}
		}

		var frag = document.createDocumentFragment();
		var seen = {};
		frag.appendChild(circle(target.getAttribute("data-home") || "/", "전체", curPath() === "/", "🏠"));

		for (i = 0; i < links.length; i++) {
			var a = links[i], href = a.getAttribute("href"), raw = a.textContent;
			var label = cleanLabel(raw);
			if (!label) continue;
			if (/^(전체|전체보기|분류\s*전체보기)$/.test(label)) continue;
			if (countOf(raw) === 0) continue;                           /* 빈 카테고리 숨김 */
			var key = href + "|" + label;
			if (seen[key]) continue;
			seen[key] = true;
			frag.appendChild(circle(href, label, isActive(href)));
		}

		target.textContent = "";
		target.appendChild(frag);
		target.classList.add("is-ready");
	}

	/* ---------------------------------------------------------------------
	   2) 맨 위로 버튼
	   --------------------------------------------------------------------- */
	function initToTop() {
		var btn = document.querySelector(".to-top");
		if (!btn) return;
		function onScroll() {
			if (window.pageYOffset > 480) btn.removeAttribute("hidden");
			else btn.setAttribute("hidden", "hidden");
		}
		btn.addEventListener("click", function () {
			window.scrollTo({ top: 0, behavior: "smooth" });
		});
		window.addEventListener("scroll", onScroll, { passive: true });
		onScroll();
	}

	/* ---------------------------------------------------------------------
	   3) 코드블록 복사 버튼
	   --------------------------------------------------------------------- */
	function initCodeCopy() {
		var pres = document.querySelectorAll(".post__content pre");
		Array.prototype.forEach.call(pres, function (pre) {
			if (pre.querySelector(".code-copy")) return;
			pre.classList.add("has-copy");
			var btn = document.createElement("button");
			btn.type = "button";
			btn.className = "code-copy";
			btn.textContent = "복사";
			btn.addEventListener("click", function () {
				var code = pre.querySelector("code") || pre;
				var text = code.innerText;
				var done = function () {
					btn.textContent = "복사됨!";
					btn.classList.add("is-done");
					setTimeout(function () { btn.textContent = "복사"; btn.classList.remove("is-done"); }, 1500);
				};
				if (navigator.clipboard && navigator.clipboard.writeText) {
					navigator.clipboard.writeText(text).then(done, done);
				} else {
					var ta = document.createElement("textarea");
					ta.value = text; document.body.appendChild(ta); ta.select();
					try { document.execCommand("copy"); } catch (e) {}
					document.body.removeChild(ta); done();
				}
			});
			pre.appendChild(btn);
		});
	}

	function init() {
		buildCategories();
		initToTop();
		initCodeCopy();
	}
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
	else init();
})();
