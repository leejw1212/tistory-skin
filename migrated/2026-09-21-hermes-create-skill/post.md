![Hermes 스킬 만들기 — SKILL.md 한 장으로 에이전트에게 절차를 가르치는 법](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/117-cover-hermes-skill.jpg)

에이전트에게 같은 절차를 두 번 설명했다면 그게 스킬로 만들 신호다. "배포는 이 순서로 한다", "파드가 죽으면 이것부터 본다" — 어제 한 설명을 오늘 또 하고 있다면, 그 설명을 **파일 한 장으로 적어 두면 된다.** 그 파일이 스킬이다.

이 글은 [Hermes 에이전트](https://autops.run/hermes-agent-setup/)에서 **스킬을 처음 만들어 보는 사람**을 위한 것이다. 스킬이 무엇인지부터 시작해서, 가장 쉬운 길(`/learn`)과 직접 쓰는 길(SKILL.md)을 차례로 따라간다.

> ⚠️ **이 글은 공식 저장소 문서를 근거로 정리한 것이고, 직접 스킬을 만들어 확인하지는 못했다.** 글을 쓴 환경에서 설치 주소로 나가는 통신이 막혀 있다.
>
> ``` $ curl -fsSL https://hermes-agent.nousresearch.com/install.sh curl: (56) CONNECT tunnel failed, response 403
> ```
>
> 형식·필드 이름·명령은 [Skills System 문서](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/skills.md) 에서 그대로 옮겼다. 버전이 오르면 달라질 수 있으니 각자 환경에서 `hermes skills list` 로 한 번 확인하고 쓰기 바란다.

## 스킬은 '절차', 기억은 '사실'

먼저 헷갈리는 것부터 가른다. Hermes 에는 정보를 남기는 자리가 여럿인데, 무엇을 어디에 둘지가 처음에 잘 안 잡힌다.

| 남길 것 | 어디에 | 예 |
|---|---|---|
| **사실** — 짧고 늘 참인 것 | 기억 (`MEMORY.md`) | "스테이징은 SSH 포트가 2222 다" |
| **절차** — 여러 단계짜리 일 | **스킬** (`SKILL.md`) | "무중단 배포는 이 다섯 단계로 한다" |
| **지난 대화** | 세션 DB | "지난달 그 장애 때 뭐였지" |

가르는 기준은 단순하다. **한 줄로 끝나면 기억, 순서가 있으면 스킬이다.**

기억에는 한도가 있다는 것도 이유가 된다. `MEMORY.md` 는 2,200자, `USER.md` 는 1,375자뿐이라 긴 절차를 넣을 자리가 없다. 자세한 것은 [Hermes 에이전트는 무엇을 기억하나](https://autops.run/hermes-memory-and-growth/)에 정리해 두었다.

> 📌 **스킬을 많이 만들어도 매 턴 비용이 그만큼 늘지는 않는다.** 시스템 프롬프트에는 스킬의 **이름과 한 줄 설명만** 들어가고, 본문은 에이전트가 필요하다고 판단할 때만 읽는다. 왜 그렇게 되어 있는지는 [채팅 한 줄을 받으면 안에서 무엇을 하나](https://autops.run/hermes-inside-a-turn/) 에서 소스로 따라가 봤다.

## 준비물

| 항목 | 비고 |
|---|---|
| 돌아가는 Hermes 에이전트 | 설치는 [이 글](https://autops.run/hermes-agent-setup/) |
| 텍스트 편집기 | SKILL.md 는 그냥 마크다운 파일이다 |
| 스킬로 만들 절차 하나 | **이미 한 번 해 본 일**이 가장 좋다 |

마지막 줄이 중요하다. 해 보지 않은 일을 상상해서 적으면 틀린 절차가 남고, 에이전트는 그걸 곧이곧대로 따른다.

## 1. 가장 쉬운 길 — `/learn`

직접 파일을 쓰기 전에, 에이전트에게 시키는 방법을 먼저 안다. 방금 어떤 일을 끝냈다면 대화창에 이렇게 친다.

```text
/learn 방금 스테이징 배포한 순서
```

그러면 에이전트가 **방금 대화를 되짚어** 절차를 뽑고 `SKILL.md` 로 저장한다. 가리킬 수 있는 대상은 대화만이 아니다.

```text
/learn ~/projects/acme-sdk 의 REST 클라이언트, 인증과 페이지네이션 위주로
/learn https://docs.example.com/api/quickstart
/learn 경비 청구: 포털 열고 New > Expense, 영수증 첨부, 제출
```

마지막 줄처럼 **그냥 설명을 적어 줘도 된다.** 파일도 URL 도 아닌 내 말이 그대로 스킬이 된다.

같은 주제로 `/learn` 을 또 돌리면 비슷한 스킬을 새로 만들지 않고 **기존 스킬에 접어 넣는다.** 중복이 쌓이지 않는다는 뜻이다.

> 💡 처음이라면 `/learn` 으로 하나 만들어 보고 **그 파일을 열어 보는 것**이 가장 빠른 학습이다. 에이전트가 어떤 형식으로 쓰는지 보고 나면 직접 쓰는 게 쉬워진다. 파일은 `~/.hermes/skills/` 아래에 있다.

## 2. 직접 쓰기 — 폴더 하나, 파일 하나

자동 생성이 늘 맞는 건 아니다. 회사의 배포 절차처럼 **내가 정확히 아는 것**은 직접 쓰는 편이 낫다. 만드는 것은 폴더 하나와 파일 하나가 전부다.

```bash
mkdir -p ~/.hermes/skills/k8s/pod-triage
```

경로가 두 겹인 것에 뜻이 있다. 앞의 `k8s` 는 **분류**고 뒤의 `pod-triage` 가 **스킬 이름**이다. 분류는 나중에 스킬이 수십 개가 됐을 때 찾기 위한 것이다.

그 안에 `SKILL.md` 를 만든다. 아래가 통째로 하나의 완성된 스킬이다.

````markdown
---
name: pod-triage
description: 파드가 재시작될 때 원인을 순서대로 확인한다
version: 1.0.0
metadata:
  hermes:
    tags: [kubernetes, 장애대응]
    category: k8s
---

# 파드 재시작 원인 확인

## When to Use
파드가 `CrashLoopBackOff` 이거나 `RESTARTS` 수가 늘어날 때. 사용자가
"파드가 죽었다", "왜 재시작됐냐" 고 물을 때.

## Procedure
1. 상태부터 본다. 어느 파드가 몇 번 죽었는지 확인한다.
   ```bash
   kubectl get pods -n <네임스페이스>
   ```
2. 죽은 이유를 파드 자신에게 묻는다. `Last State` 와 `Reason` 을 본다.
   ```bash
   kubectl describe pod <파드> -n <네임스페이스>
   ```
3. 죽기 **직전** 로그를 본다. 지금 로그가 아니라 이전 컨테이너의 로그다.
   ```bash
   kubectl logs <파드> -n <네임스페이스> --previous
   ```
4. 클러스터가 남긴 사건을 본다.
   ```bash
   kubectl get events -n <네임스페이스> --sort-by=.lastTimestamp | tail -20
   ```

## Pitfalls
- `--previous` 를 빼면 **새로 뜬 컨테이너의 로그**가 나온다. 죽은 이유는 거기 없다.
- `Reason: OOMKilled` 면 애플리케이션 오류가 아니라 메모리 한도 문제다.
  로그를 아무리 봐도 안 나온다. `resources.limits.memory` 를 본다.
- 이벤트는 기본 한 시간쯤 지나면 사라진다. 오래된 장애는 이벤트로 못 쫓는다.

## Verification
원인을 한 문장으로 말할 수 있으면 됐다 — "메모리 한도 초과로 OOMKilled".
말할 수 없으면 아직 2번이나 3번에서 놓친 것이 있다.
````

이게 전부다. **평범한 마크다운 파일**이고, 위쪽 `---` 사이가 머리말이다.

### 본문의 네 꼭지

제목을 마음대로 붙여도 동작은 하지만, 공식 문서가 권하는 네 꼭지를 그대로 쓰는 편이 낫다. 에이전트가 찾기 쉬운 자리에 필요한 것이 있게 된다.

| 꼭지 | 적는 것 | 빠뜨리면 |
|---|---|---|
| **When to Use** | 이 스킬을 언제 쓰나 | 스킬이 있는데도 안 불린다 |
| **Procedure** | 순서대로, 실제 명령까지 | 에이전트가 자기 방식으로 한다 |
| **Pitfalls** | 실제로 겪은 함정 | 같은 실수를 또 한다 |
| **Verification** | 무엇을 보면 됐다고 아나 | "된 것 같다" 로 끝난다 |

**Pitfalls 가 이 파일의 값어치를 거의 다 정한다.** 나머지 세 꼭지는 공식 문서를 읽어도 알 수 있는 것이지만, 함정은 겪어 본 사람만 안다. 위 예시의 `--previous` 한 줄이 그런 것이다.

## 3. 머리말 — 꼭 필요한 두 줄과 나머지

머리말에 넣을 수 있는 것은 많지만, **반드시 있어야 하는 것은 둘뿐**이다.

```markdown
---
name: pod-triage                                  # 필수
description: 파드가 재시작될 때 원인을 순서대로 확인한다   # 필수, 60자 이내
---
```

나머지는 필요할 때만 넣는다.

| 필드 | 하는 일 |
|---|---|
| `version` | `1.0.0` 같은 판 번호 |
| `platforms` | `[macos]`, `[linux]`, `[windows]` — 그 환경에서만 보이게 |
| `metadata.hermes.tags` | 분류용 꼬리표 여러 개 |
| `metadata.hermes.category` | 분류 하나 |
| `metadata.hermes.requires_toolsets` | 그 도구가 **있을 때만** 보이게 |
| `metadata.hermes.fallback_for_toolsets` | 그 도구가 **없을 때만** 보이게 |

> ⚠️ **`description` 이 이 파일에서 가장 중요한 한 줄이다.** 평소 에이전트가 보는 것은 스킬 본문이 아니라 **이름과 이 한 줄뿐**이다. 여기서 "내 상황이다" 싶어야 본문을 펼친다.
>
> 그래서 **60자 제한**이 걸려 있고, 그 안에 *언제 쓰는 것인지*가 들어가야 한다.
>
> ``` 나쁨: 쿠버네티스 관련 유용한 도구 모음 좋음: 파드가 재시작될 때 원인을 순서대로 확인한다
> ```
>
> 앞쪽은 언제 꺼내야 할지 알 수 없다. **스킬을 만들었는데 안 불린다면 십중팔구 이 줄이 모호한 것이다.**

### 비밀 값은 머리말에 적지 않는다

API 키가 필요한 스킬이라면 **값을 적는 게 아니라 이름을 선언한다.**

```yaml
required_environment_variables:
  - name: TENOR_API_KEY
    prompt: Tenor API 키
    help: https://developers.google.com/tenor 에서 발급
    required_for: full functionality
```

이렇게 두면 값이 없을 때 CLI 가 안전하게 물어보고, **메신저 대화창에서는 절대 비밀을 묻지 않는다.** `SKILL.md` 에 키를 직접 박으면 스킬을 남에게 공유하는 순간 같이 나간다.

## 4. 써 보기

스킬은 **설치하는 순간 슬래시 명령이 된다.** 폴더 이름이 곧 명령 이름이다.

```text
/pod-triage                            ← 스킬을 읽고 무엇을 할지 묻는다
/pod-triage linkcard 네임스페이스 좀 봐줘   ← 읽고 바로 시킨다
```

목록으로도 확인한다.

```bash
hermes skills list
```

만든 스킬이 목록에 보이는데도 평소 대화에서 안 불린다면, 앞에서 말한 `description` 을 고친다. 슬래시 명령으로 직접 부르는 건 언제나 되지만, **알아서 불리게 하는 것이 스킬을 만드는 이유**다.

### 늘 같이 쓰는 스킬은 묶는다

스킬 서넛을 매번 같이 부르게 되면 묶어서 한 명령으로 만들 수 있다. `~/.hermes/skill-bundles/backend-dev.yaml` 처럼 파일을 하나 둔다.

```yaml
name: backend-dev
description: 백엔드 작업 — 리뷰, 테스트, PR 까지
skills:
  - github-code-review
  - test-driven-development
  - github-pr-workflow
instruction: |
  실패하는 테스트를 먼저 쓰고 구현한다.
```

`/backend-dev 인증 미들웨어 리팩터링해줘` 한 줄로 셋이 한꺼번에 실린다. `instruction` 은 묶음을 부를 때마다 앞에 붙는 말이라, 스킬을 고치지 않고도 "우리 팀은 이렇게 한다"를 얹을 수 있다.

## 5. 고치기

한 번 쓴 스킬은 계속 고치게 된다. 절차가 바뀌거나, 새 함정을 만나거나.

**파일을 직접 고쳐도 된다.** `~/.hermes/skills/k8s/pod-triage/SKILL.md` 를 열어 고치면 그만이다. 에이전트에게 시킬 수도 있다 — "pod-triage 스킬에 이 함정 하나 추가해 줘" 라고 하면 `skill_manage` 도구로 고친다.

에이전트가 스킬을 멋대로 고치는 게 불안하면 **승인 게이트**를 켠다.

```yaml
# ~/.hermes/config.yaml
skills:
  write_approval: true     # 기본은 false — 바로 저장
```

켜면 저장이 파일로 바로 가지 않고 대기열에 선다.

```text
/skills pending          ← 대기 중인 변경 목록
/skills diff <id>        ← 무엇이 어떻게 바뀌는지
/skills approve <id>     ← 반영
/skills reject <id>      ← 버림
```

> 📌 처음 한 달쯤은 켜 두고 보는 것을 권한다. 에이전트가 무엇을 스킬로 남길 만하다고 판단하는지 감이 잡히면 그때 풀어도 늦지 않다.

## 6. 자료가 크면 쪼갠다

책이나 두꺼운 문서를 통째로 스킬에 넣으려 하면 파일 하나가 감당이 안 된다. 그럴 때는 **얇은 `SKILL.md` + 딸린 파일들**로 나눈다.

```text
~/.hermes/skills/k8s/pod-triage/
├── SKILL.md          # 핵심 절차와 목차 (필수)
├── references/       # 주제별 문서 — 결정표, 사례, 제품별 특이사항
├── templates/        # 결과물 서식
├── scripts/          # 절차에서 불러 쓰는 스크립트
├── examples/         # 예시 출력
└── assets/           # 그림, 설정 파일 같은 딸린 것들
```

이렇게 나누는 이유는 **읽는 순서가 3단이기 때문**이다.

```text
0단계  목록    → 이름과 한 줄 설명만        (평소)
1단계  본문    → SKILL.md 전체              (관련 있어 보일 때)
2단계  참조    → references/ 중 필요한 하나  (거기까지 필요할 때)
```

책 한 권을 넣어 둬도 **질문 하나의 비용은 읽은 만큼만** 든다. `SKILL.md` 에 모든 것을 욱여넣으면 이 단계가 무너져서, 한 번 불릴 때마다 책 한 권이 통째로 실린다.

> 📌 `references/` 파일이 60개를 넘으면 경고가 뜬다. 막지는 않지만 **스킬 하나가 너무 많은 일을 하고 있다는 신호**다. 그럴 때는 스킬을 둘로 나눈다.

## 7. 만든 뒤 — 한 달 뒤에 사라지지 않게

Hermes 에는 안 쓰는 스킬을 치우는 큐레이터가 있다. 문서 기준으로 30일 안 쓰면 `stale`, 90일 안 쓰면 보관소로 옮긴다(버전에 따라 다르니 `hermes curator status` 로 확인한다). 분기에 한 번 쓰는 절차라면 그 사이에 치워진다.

```bash
hermes curator pin pod-triage     # 자동 정리에서 제외
hermes curator status             # 지금 무엇이 안 쓰이고 있나
```

만든 스킬이 실제로 쓰이고 있는지, 에이전트가 그 사이 무엇을 더 배웠는지는 [hermes journey](https://autops.run/hermes-journey/)에서 시간순으로 볼 수 있다. 만들고 점검하고 치우는 일을 한 달 주기로 묶은 것은 [Hermes 에이전트 운영법](https://autops.run/hermes-operating-routine/)에 있다.

> 💡 **큐레이터는 삭제하지 않는다.** 최악이 `~/.hermes/skills/.archive/` 로 옮기는 것이고 `hermes curator restore` 로 되살릴 수 있다. 그래도 일 년에 한 번 쓰는 중요한 절차에는 핀을 박아 두는 편이 마음 편하다.

## 막히는 자리

| 증상 | 볼 곳 |
|---|---|
| 목록에 안 나온다 | 폴더 안에 `SKILL.md` 가 있나. `name` 과 `description` 이 있나 |
| 슬래시로는 되는데 알아서 안 불린다 | **`description`.** 언제 쓰는지가 그 한 줄에 있나 |
| 엉뚱할 때 불린다 | 반대 경우다. `description` 이 너무 넓다 |
| 고쳤는데 그대로다 | 새 세션에서 본다 (`/new`). 스킬 목록은 세션 시작 때 실린다 |
| 어느 환경에서만 안 보인다 | `platforms`, `requires_toolsets` 가 걸러 내고 있나 |
| 며칠 뒤 사라졌다 | 큐레이터가 보관했다. `hermes curator list-archived` |

## 정리

- **한 줄로 끝나면 기억, 순서가 있으면 스킬.** 기억은 2,200자뿐이라 절차를 넣을 자리가 아니다.
- **스킬은 폴더 하나와 `SKILL.md` 한 장이다.** 필수 항목은 `name` 과 `description` 둘뿐이다.
- **`description` 60자가 스킬의 운명을 정한다.** 평소 에이전트에게 보이는 것이 그 한 줄뿐이라, 모호하면 만들어 두고도 안 불린다.
- **Pitfalls 가 값어치다.** 절차는 문서에도 있지만 함정은 겪은 사람만 안다.
- **자료가 크면 `references/` 로 쪼갠다.** 읽는 순서가 3단이라, 쪼개 두면 쓴 만큼만 비용이 든다.
- **처음에는 `/learn` 으로 하나 만들어 파일을 열어 본다.** 형식을 눈으로 보는 것이 설명을 읽는 것보다 빠르다.

## 참고

- [Skills System](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/skills.md) — `SKILL.md` 형식, `/learn`, `skill_manage`, 승인 게이트
- [Curator](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/curator.md) — 안 쓰는 스킬 보관과 되살리기
- [Hermes Agent 저장소](https://github.com/NousResearch/hermes-agent)
