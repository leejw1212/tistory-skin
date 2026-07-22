/* =========================================================================
   Clean Gallery skin — 원형 카테고리 메뉴 빌더
   티스토리 [##_category_list_##] 출력을 읽어 아이콘 원형 메뉴로 변환한다.
   ========================================================================= */
(function () {
	"use strict";

	/* DevOps 키워드 → 이모지 매핑 (위에서부터 먼저 매칭) */
	var ICONS = [
		[/(^|\b)(aws|amazon|ec2|s3|lambda)\b/i, "☁️"],
		[/(gcp|google\s?cloud|azure|oci|클라우드|cloud)/i, "☁️"],
		[/(kubernetes|k8s|kubectl|helm|쿠버네티스)/i, "☸️"],
		[/(docker|container|컨테이너|podman)/i, "🐳"],
		[/(terraform|iac|pulumi|infra|인프라)/i, "🏗️"],
		[/(ci\/?cd|jenkins|argo|pipeline|파이프라인|배포|deploy|actions)/i, "🚀"],
		[/(git|github|gitlab|형상관리|버전관리)/i, "🐙"],
		[/(linux|리눅스|ubuntu|centos|rocky|debian|unix)/i, "🐧"],
		[/(monitor|모니터|grafana|prometheus|observ|관측|metric)/i, "📊"],
		[/(network|네트워크|dns|nginx|proxy|load\s?balanc|lb|cdn)/i, "🌐"],
		[/(database|데이터베이스|\bdb\b|sql|mysql|postgre|redis|mongo|rds)/i, "🗄️"],
		[/(security|보안|vault|iam|인증|tls|ssl|cert)/i, "🔒"],
		[/(ansible|automation|자동화|chef|puppet|saltstack)/i, "🤖"],
		[/(python|파이썬)/i, "🐍"],
		[/(golang|\bgo\b)/i, "🐹"],
		[/(java|spring|스프링)/i, "☕"],
		[/(node|javascript|typescript|react|프론트|front)/i, "🟨"],
		[/(shell|bash|zsh|스크립트|script|command)/i, "💻"],
		[/(log|로그|elk|kibana|logstash|fluentd)/i, "📋"],
		[/(trouble|장애|이슈|issue|error|오류|debug|디버깅)/i, "🔧"],
		[/(study|공부|학습|\btil\b|정리|note|노트)/i, "📚"],
		[/(project|프로젝트|toy|사이드)/i, "📦"],
		[/(review|회고|생각|일상|diary|essay|후기)/i, "✍️"],
		[/(cka|ckad|cert|자격증|시험|exam)/i, "🎓"],
		[/(msa|micro|아키텍처|architecture|design)/i, "🧩"],
		[/(api|rest|graphql|grpc)/i, "🔌"],
		[/(data|데이터|kafka|spark|airflow|etl)/i, "🧪"],
		[/(ai|ml|머신러닝|딥러닝|llm|gpt)/i, "🧠"]
	];

	function pickIcon(name) {
		for (var i = 0; i < ICONS.length; i++) {
			if (ICONS[i][0].test(name)) return ICONS[i][1];
		}
		return null;
	}

	/* 라벨 끝의 "(12)" 개수 제거 */
	function cleanLabel(raw) {
		return (raw || "").replace(/\s*\(\s*[\d,]+\s*\)\s*$/, "").replace(/\s+/g, " ").trim();
	}

	function initial(name) {
		var s = name.trim();
		var ch = s.charAt(0);
		return ch ? ch.toUpperCase() : "#";
	}

	function esc(s) {
		return String(s).replace(/[&<>"']/g, function (c) {
			return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
		});
	}

	function circle(href, label, active) {
		var a = document.createElement("a");
		a.className = "cat-circle" + (active ? " is-active" : "");
		a.href = href;
		a.setAttribute("role", "listitem");
		a.title = label;
		var ic = pickIcon(label);
		a.innerHTML =
			'<span class="cat-ic' + (ic ? "" : " cat-ic-txt") + '">' +
				(ic ? ic : esc(initial(label))) +
			"</span>" +
			'<span class="cat-name">' + esc(label) + "</span>";
		return a;
	}

	function samePath(href) {
		try {
			var u = new URL(href, location.origin);
			if (u.pathname === "/" || u.pathname === "") return false;
			return decodeURIComponent(location.pathname).indexOf(decodeURIComponent(u.pathname)) === 0;
		} catch (e) { return false; }
	}

	function build() {
		var target = document.getElementById("catCircles");
		var source = document.getElementById("catSource");
		if (!target) return;

		var links = source ? source.querySelectorAll("a[href]") : [];
		var frag = document.createDocumentFragment();
		var seen = {};

		/* 홈(전체) 버튼 */
		var homeHref = target.getAttribute("data-home") || "/";
		var homeActive = location.pathname === "/" || samePathIsHome(homeHref);
		frag.appendChild(circle(homeHref, "전체", homeActive));
		frag.lastChild.querySelector(".cat-ic").textContent = "🏠";
		frag.lastChild.querySelector(".cat-ic").classList.remove("cat-ic-txt");

		for (var i = 0; i < links.length; i++) {
			var a = links[i];
			var href = a.getAttribute("href");
			if (!href || href === "#") continue;

			var label = cleanLabel(a.textContent);
			if (!label) continue;
			if (/^(전체|전체보기|분류\s*전체보기)$/.test(label)) continue; // 홈과 중복

			var key = href + "" + label;
			if (seen[key]) continue;
			seen[key] = true;

			frag.appendChild(circle(href, label, samePath(href)));
		}

		target.textContent = "";
		target.appendChild(frag);
		target.classList.add("is-ready");
		if (source) source.setAttribute("hidden", "hidden");
	}

	function samePathIsHome(homeHref) {
		try {
			var u = new URL(homeHref, location.origin);
			return decodeURIComponent(location.pathname) === decodeURIComponent(u.pathname);
		} catch (e) { return false; }
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", build);
	} else {
		build();
	}
})();
