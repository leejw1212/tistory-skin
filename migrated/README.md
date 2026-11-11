# 📦 migrated/ — 워드프레스(autops.run) → 티스토리 이전 글

워드프레스 `dashboard-songhee/wordpress/wp-content/seed/` 의 글 40편을 티스토리 붙여넣기용으로 바꾼 것입니다.
이전하지 않는 글 14편:
- 원래 티스토리에서 옮겨 왔던 10편 (Jenkins 분산 빌드·백업 복구·Pipeline·AWS CodeBuild·아티팩트+AWX, 배포 롤백, SSH 키, iTerm2, 맥 자잘한 문제, M1 에뮬레이터) — 티스토리에 원본이 있습니다.
- 블로그 스킨 패치 노트, 비공개 메이플 로그 소개 2편.
- 대시보드에 웹 터미널 붙이기 — 서버 셸 접속 경로와 잠금 규칙이 드러나서 제외.
- Black Duck 스캔 방식 — 조회수가 없어 제외.

```
migrated/
  <날짜-slug>/post.md     티스토리 마크다운 모드에 그대로 붙여넣는 본문
  <날짜-slug>/meta.json   제목 · 카테고리 · 태그 · 요약 · 원래 워드프레스 주소 · 발행 예정일 · 티스토리 주소(발행 후 기입)
  images/                 본문 사진과 커버 (jsDelivr 로 불러옴)
```

## 바꾼 것

- 머리말(front matter)은 빼고 `meta.json` 으로 옮겼습니다. 제목·태그는 거기서 복사합니다.
- 사진 주소 `images/…` → `https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/…`
  **사진이 `main` 에 있어야 보입니다.**
- 워드프레스 커버를 본문 맨 위 사진으로 넣었습니다 → 티스토리 대표 이미지로 지정하면 됩니다.
- 콜아웃 `> [!TIP]` `[!WARNING]` `[!NOTE]` → 스킨이 알아보는 `> 💡` `> ⚠️` `> 📌`
- 문단 중간 줄바꿈을 한 줄로 이었습니다 (티스토리에서 줄이 끊겨 보이지 않게).
- 글끼리 링크 `/slug/` → `https://autops.run/slug/`. 워드프레스에 301 리다이렉트를 걸면 티스토리 글로 넘어갑니다.
  다 옮긴 뒤 티스토리 주소로 한 번에 바꿀 예정입니다.
- 원래 워드프레스에서도 비어 있던 사진 10장(도메인 글 5장, DDNS 글 4장, 건강 앱 글 1장) 자리는 뺐습니다.

## 발행 순서

1. `post.md` 전체를 티스토리 **글쓰기 → 마크다운 모드**에 붙여넣습니다.
2. 제목·태그는 `meta.json` 에서, 카테고리는 `기술 > <하위>`, 맨 위 사진을 대표 이미지로 지정합니다.
3. 발행 후 글 주소를 `meta.json` 의 `tistory_url` 과 아래 표에 적습니다.
4. 워드프레스 글은 그 주소로 301 리다이렉트합니다 (중복 콘텐츠 방지).

하루 2편, 쓴 순서대로 올립니다 (앞 글을 가리키는 링크가 먼저 생기도록). 11-12 ~ 12-01.

| # | 예정일 | 카테고리 | 글 | 티스토리 주소 |
|---|---|---|---|---|
| 1 | 11-12 | 서버·네트워크 | [집 서버에 도메인 붙이기](2026-09-07-domain-cloudflare-nginx/post.md) | |
| 2 | 11-12 | 개발환경·홈랩 | [애플 건강 앱으로 달리기 자동 기록하기](2026-09-08-healthkit-running-automation/post.md) | |
| 3 | 11-13 | 보안 | [NVD·OSV 차이와 KEV·EPSS](2026-09-09-cve-lookup-sources/post.md) | |
| 4 | 11-13 | 서버·네트워크 | [TP-Link 공유기 DDNS 설정](2026-09-09-noip-ddns-tplink/post.md) | |
| 5 | 11-14 | 서버·네트워크 | [privoxy 로 프록시 두 개 나눠 쓰기](2026-09-09-privoxy-forward-by-domain/post.md) | |
| 6 | 11-14 | 서버·네트워크 | [Fluentd 처음 배우기](2026-09-10-fluentd-basics/post.md) | |
| 7 | 11-15 | 서버·네트워크 | [nginx 처음 만지기](2026-09-10-nginx-basics/post.md) | |
| 8 | 11-15 | 서버·네트워크 | [nginx 를 앞에 세우는 이유](2026-09-10-nginx-reverse-proxy/post.md) | |
| 9 | 11-16 | 서버·네트워크 | [RabbitMQ 가 발행을 막을 때](2026-09-10-rabbitmq-disk-alarm/post.md) | |
| 10 | 11-16 | AI·에이전트 | [Hermes 에이전트 리눅스에 올리기](2026-09-11-hermes-agent-setup/post.md) | |
| 11 | 11-17 | AI·에이전트 | [Hermes 에이전트에 MCP 붙이기](2026-09-12-hermes-mcp-playwright-confluence/post.md) | |
| 12 | 11-17 | 쿠버네티스 | [kind 의 CNI 를 kindnet 에서 Calico 로 바꾸기](2026-09-13-kind-cni-calico/post.md) | |
| 13 | 11-18 | 쿠버네티스 | [M1 맥에 kind 로 쿠버네티스 클러스터 세우기](2026-09-13-kind-kubernetes-on-mac/post.md) | |
| 14 | 11-18 | 쿠버네티스 | [파드가 죽으면 데이터도 사라진다](2026-09-14-statefulset-pvc-basics/post.md) | |
| 15 | 11-19 | 쿠버네티스 | [StatefulSet 은 뒷번호부터 지운다](2026-09-14-statefulset-scale-down-order/post.md) | |
| 16 | 11-19 | 쿠버네티스 | [kind 클러스터에 ArgoCD 올리기](2026-09-15-argocd-on-kind/post.md) | |
| 17 | 11-20 | AI·에이전트 | [Hermes 에이전트는 무엇을 기억하나](2026-09-15-hermes-memory-and-growth/post.md) | |
| 18 | 11-20 | 쿠버네티스 | [쿠버네티스에 첫 서비스 두 개 올리기](2026-09-16-microservices-first-deploy/post.md) | |
| 19 | 11-21 | 쿠버네티스 | [마이크로서비스를 쿠버네티스에 올려 본다](2026-09-16-microservices-on-k8s-intro/post.md) | |
| 20 | 11-21 | 쿠버네티스 | [RabbitMQ 로 사용자를 기다리게 하지 않는다](2026-09-17-microservices-rabbitmq-queue/post.md) | |
| 21 | 11-22 | 쿠버네티스 | [평균은 0.4초인데 왜 7초를 기다릴까](2026-09-17-microservices-tail-latency/post.md) | |
| 22 | 11-22 | 쿠버네티스 | [Fluentd 로 흩어진 쿠버네티스 로그를 한곳에](2026-09-18-microservices-fluentd-logs/post.md) | |
| 23 | 11-23 | 쿠버네티스 | [RabbitMQ 재시도와 DLQ 를 플러그인 없이](2026-09-18-microservices-retry-dlq/post.md) | |
| 24 | 11-23 | 쿠버네티스 | [Fluentd 로그를 OpenSearch 에 쌓기](2026-09-19-microservices-opensearch-logs/post.md) | |
| 25 | 11-24 | 쿠버네티스 | [X-Request-ID 로 요청 하나를 끝까지 추적하기](2026-09-19-microservices-request-tracing/post.md) | |
| 26 | 11-24 | AI·에이전트 | [AI 에이전트는 채팅 한 줄을 받으면 안에서 무엇을 하나](2026-09-20-hermes-inside-a-turn/post.md) | |
| 27 | 11-25 | 쿠버네티스 | [OpenSearch Dashboards 로 병목 찾기](2026-09-20-microservices-find-bottleneck/post.md) | |
| 28 | 11-25 | 개발환경·홈랩 | [메이플 오픈API 는 complete_flag 가 아니라 clear_flag 를 준다](2026-09-20-nexon-openapi-maple/post.md) | |
| 29 | 11-26 | AI·에이전트 | [Hermes 스킬 만들기](2026-09-21-hermes-create-skill/post.md) | |
| 30 | 11-26 | 보안 | [NoopHostnameVerifier 가 안 먹는다](2026-09-21-httpclient5-hostname-verification/post.md) | |
| 31 | 11-27 | AI·에이전트 | [hermes journey](2026-09-22-hermes-journey/post.md) | |
| 32 | 11-27 | AI·에이전트 | [Hermes 에이전트 운영법](2026-09-23-hermes-operating-routine/post.md) | |
| 33 | 11-28 | AI·에이전트 | [mcp-server-kubernetes 로 Hermes·Claude 에 kind 클러스터 붙이기](2026-10-04-kubernetes-mcp-server/post.md) | |
| 34 | 11-28 | 서버·네트워크 | [OpenStack 볼륨 마운트하기](2026-10-05-openstack-volume-mount/post.md) | |
| 35 | 11-29 | 서버·네트워크 | [tcpdump 로 TCP 3-way handshake 보기](2026-10-19-tcpdump-tcp-handshake/post.md) | |
| 36 | 11-29 | 서버·네트워크 | [ip netns 로 라우터 만들기](2026-10-22-ip-netns-routing/post.md) | |
| 37 | 11-30 | 서버·네트워크 | [nftables masquerade 로 공유기 만들기](2026-10-25-nftables-nat-home-router/post.md) | |
| 38 | 11-30 | AI·에이전트 | [Claude Code 웹(클라우드 세션) 사용법](2026-10-28-claude-code-cloud-session/post.md) | |
| 39 | 12-01 | AI·에이전트 | [Claude Code 클라우드 세션에 Proxmox 붙이기](2026-10-28-claude-code-proxmox-mcp/post.md) | |
| 40 | 12-01 | AI·에이전트 | [Claude Code MCP 사용법](2026-10-31-claude-code-mcp-basics/post.md) | |
