![Black Duck 스캔 방식 — Detector·Signature·Snippet, 조회가 아니라 식별이다](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/42-cover-blackduck.jpg)

[앞 글](https://autops.run/cve-lookup-sources/)에서 CVE 를 어디서 조회할지 정리했다. 그런데 사내에 Black Duck 같은 상용 SCA 가 이미 있으면 질문이 하나 더 생긴다. **이건 그 API 들과 뭐가 다른가?**

근본이 다르다.

| | 하는 일 |
|---|---|
| OSV · NVD API | **조회.** "express 4.17.1 에 뭐 있어?" 라고 물어본다. 이름과 버전을 이미 알고 있어야 한다 |
| Black Duck | **식별.** "이 디렉터리에 뭐가 들어 있어?" 를 먼저 알아낸다 |

이 차이가 실무에서 갈리는 지점은 하나다. **매니페스트에 안 적힌 것.** `package.json` 에는 없는데 `vendor/` 아래 통째로 복사해 둔 라이브러리, 빌드 산출물에 정적 링크된 라이브러리, 누가 붙여넣은 코드 조각 — 조회형은 물어볼 이름 자체가 없어서 못 찾는다.

> 📌 이 글은 공개 문서를 근거로 정리한 것이다. 라이선스가 필요한 도구라 **글을 쓴 환경에서 실제로 스캔을 돌려 보지는 못했다.** 명령 형태는 문서 기준이고, 옵션 이름은 쓰는 버전에서 한 번 확인한다.

## 검사 방식 네 가지

클라이언트는 `Detect` 하나다(예전 이름은 Synopsys Detect). 그 안에서 스캐너 여러 개를 골라 켜는 구조다.

| 방식 | 무엇을 보나 | 기본 |
|---|---|---|
| **Detector** (패키지 매니저) | `mvn`·`gradle`·`npm` 등을 **실제로 실행**해 직접·전이 의존성 트리를 뽑는다 | **켜짐** |
| **Signature Scan** | 파일·디렉터리의 **해시와 레이아웃**으로 대조한다. 언어를 가리지 않는다 | **켜짐** |
| **Binary Analysis** | 컴파일된 바이너리·펌웨어를 **소스 없이** 분석한다 | 꺼짐 |
| **Snippet** | 복붙된 **코드 조각** 단위로 매칭한다 | 꺼짐 |
| **Container Scan** | 컨테이너 이미지를 **레이어별로** 본다 | 꺼짐 |

### Detector 와 Signature 는 한 쌍이다

기본으로 둘 다 도는 데는 이유가 있다.

- **Detector 는 "선언된 것"** 을 본다. 패키지 매니저를 직접 돌려서 전이 의존성까지 정확히 뽑는다. 대신 빌드 환경이 있어야 한다.
- **Signature 는 "실제로 들어 있는 것"** 을 본다. 파일 해시로 대조하니 선언 여부와 무관하고 언어도 안 가린다. 대신 오탐이 는다.

`package.json` 에 없는 `vendor/jquery-1.12.4/` 는 Signature 만 잡는다. 반대로 transitive 의존성 트리는 Detector 라야 정확하다. **둘 중 하나만 켜면 각각의 사각지대가 그대로 남는다.**

### Snippet 은 2단계로 돈다

Signature 스캔을 먼저 돌리고, **매칭되지 않은 파일**에 대해서만 조각 매칭을 추가로 돌린다. 슬라이딩 윈도우로 만든 codeprint 를 쓰기 때문에, 원본에서 조금 고친 코드도 fuzzy 하게 잡힌다.

라이선스 감사에는 이게 필요하다. 하지만 **보내는 양과 도는 시간이 크게 늘어난다.** 매 커밋마다 켤 것은 아니다.

## 무엇이 서버로 나가나

사내 보안 검토에서 제일 먼저 나오는 질문이다.

- **Signature Scan** — 파일의 **SHA-1 과 clean SHA-1**, 그리고 경로·크기 같은 메타데이터. 소스 코드 자체는 보내지 않는다.
- **Snippet** — 원본이 아니라 **codeprint**. 파일 후보의 codeprint 를 만들어 KB 매칭 서비스로 보낸다.

즉 **어느 쪽이든 원본 소스가 그대로 나가지는 않는다.** 다만 "해시만 나간다" 와 "아무것도 나가지 않는다" 는 다르다. 경로와 디렉터리 구조는 함께 나가므로, 사내 규정상 그것도 민감하다면 온프레미스 구축이 논의 대상이 된다.

> 💡 검토 자리에서 이 질문이 나오면 스캐너별로 따로 답해야 한다. "Black Duck 은 소스를 안 보냅니다" 로 뭉뚱그리면 Snippet 을 켰을 때 설명이 달라진다.

## 취약점 판정 — BDSA

컴포넌트를 식별한 다음, 취약점은 KnowledgeBase 와 **BDSA(Black Duck Security Advisory)** 로 판정한다. BDSA 는 자체 연구조직(CyRC)이 큐레이션하는 별도 피드다.

- **같은 CVE 라도 NVD 분석보다 먼저 나오는 경우가 많다.** NVD 항목이 아예 안 생기는 것도 있다.
- **영향 버전을 교차 검증한다.** NVD 는 제3자가 제출한 데이터를 검증하지 않아서 버전 범위가 실제와 어긋나는 경우가 있다.
- 수정 버전·패치·워크어라운드 같은 **조치 정보**가 붙는다.

이건 [앞 글](https://autops.run/cve-lookup-sources/)에서 다룬 NVD 의 2026년 4월 방침 변경과 바로 이어진다. NVD 가 전수 분석을 접었으니, 큐레이션된 상용 피드의 값어치가 그만큼 올라간 것은 사실이다.

> 📌 다만 이 비교는 Black Duck 자신이 마케팅으로 내세우는 것이기도 하다. 지적 자체는 맞지만, **"그래서 BDSA 만 보면 된다" 로 읽지는 않는다.** 아래에서 다시 다룬다.

## 어디에 뭘 켜나

**커버리지와 오탐은 정비례한다.** Detector + Signature + Snippet 을 다 켜면 가장 많이 찾지만, 오탐률이 가장 높고 가장 오래 걸린다. 그래서 단계를 나눈다.

| 단계 | 켜는 것 | 이유 |
|---|---|---|
| CI 게이트 (매 빌드) | Detector | 빠르고 정확하다. 빌드를 막아도 억울하지 않다 |
| 정기 전수 점검 (주/월) | Detector + Signature | 선언되지 않은 것까지 훑는다 |
| 릴리스 전 · 라이선스 감사 | + Snippet, Binary | 오래 걸려도 되는 자리 |

**CI 에 Signature 와 Snippet 을 넣지 않는다.** 오탐으로 빌드가 막히기 시작하면 개발자들이 게이트를 무력화할 방법부터 찾는다. 그게 스캐너를 없애는 것보다 나쁘다.

### 컨테이너 이미지는 다르게 켠다

이미지 안에는 빌드 환경이 없다. `mvn` 도 `npm` 도 없으니 Detector 가 돌 자리가 없다. 그래서 컨테이너를 스캔할 때는 **Detector 를 빼는 것이 보통이다.**

```bash
docker save myimage:1.0 -o myimage.tar
./detect.sh --detect.tools=CONTAINER_SCAN --detect.container.scan.file.path=./myimage.tar
```

반대로 Signature 가 오탐을 너무 뿜으면 `SIGNATURE_SCAN` 쪽을 뺀다. **어느 쪽을 빼는지는 이미지 성격에 따라 갈리므로, 한 번은 둘 다 켜고 결과를 비교해 본다.**

### 빌드 환경이 없는 곳에서 도는 buildless

패키지 매니저 실행 파일이 없는 환경에서는 `--detect.accuracy.required=NONE` 으로 낮은 정확도를 감수하고 돌릴 수 있다. buildless 도커 이미지가 이 설정을 기본으로 갖고 있다.

> ⚠️ buildless 로 떨어지면 `requirements.txt` 나 `package.json` 을 **그냥 파싱하는 저정확도 fallback** 이 쓰인다. lock 파일 기준의 실제 해석 결과가 아니다. 초록불이 떠도 "빌드해서 확인한 트리" 가 아니라는 걸 알고 봐야 한다.

## Black Duck 이 있는데 OSV·KEV 를 또 보나

본다. 하는 일이 겹치지 않는다.

- **Black Duck 은 "무엇이 들어 있고, 무엇에 걸리는가" 까지 답한다.** 식별과 판정.
- **KEV 와 EPSS 는 "그중 뭘 먼저 고치나" 에 답한다.** 우선순위.

BDSA 가 심각도를 주긴 하지만, **심각도와 시급성은 다르다.** CVSS 9.8 인데 실제 악용 정황이 없는 것과, CVSS 6.5 인데 KEV 에 올라 있는 것 중 먼저 고칠 것은 후자다. 그 판단은 Black Duck 밖에 있다.

그리고 하나 더 — **상용 도구 하나에 판정을 몰아 두면 그 도구의 사각지대가 그대로 우리 사각지대가 된다.** 공개 소스로 교차 확인할 수 있는 길을 열어 두는 편이 낫다. 스캐너 결과 중 의심스러운 건은 `api.osv.dev` 나 배포판 트래커에서 한 번 더 본다.

## 오탐을 다루는 자세

Signature 스캔의 오탐은 **버그가 아니라 원리의 결과다.** 파일 해시로 대조하니 비슷한 파일이 걸린다. 그러니 없애려 들기보다 줄이는 쪽으로 간다.

- 스캔 대상에서 테스트 픽스처, 샘플 데이터, 빌드 산출물 디렉터리를 제외한다.
- 컨테이너에서는 배포판이 backport 한 패키지를 확인한다 — 버전 숫자만 보면 안 고쳐진 것처럼 보인다. ([앞 글에서 다룬 문제](https://autops.run/cve-lookup-sources/)와 같다.)
- 한 번 오탐으로 판정한 컴포넌트는 도구 안에서 기록으로 남긴다. 다음 스캔에서 같은 것을 또 조사하지 않도록.

**오탐을 방치하면 진짜가 그 안에 묻힌다.** 경보 500건 중 3건이 진짜인 상태는 경보가 0건인 것과 실질적으로 같다.

## 정리

- **조회형과 식별형은 다른 도구다.** OSV·NVD 는 이름과 버전을 알아야 묻고, Black Duck 은 파일에서 컴포넌트를 알아낸다. 매니페스트 밖의 코드는 후자만 찾는다.
- **Detector 와 Signature 는 한 쌍으로 켠다.** 선언된 것과 실제 들어 있는 것은 다르고, 각각 다른 스캐너가 답한다.
- **서버로 나가는 것은 해시와 codeprint 다.** 원본 소스가 아니다. 다만 스캐너별로 나가는 것이 다르니 검토 자리에서는 따로 답한다.
- **CI 에는 Detector 만.** Signature·Snippet 의 오탐으로 빌드를 막으면 게이트가 먼저 무력화된다.
- **우선순위는 여전히 KEV·EPSS 가 답한다.** BDSA 의 심각도는 시급성이 아니다.

## 참고

- [Black Duck SCA 제품 문서](https://www.blackduck.com/software-composition-analysis-tools/black-duck-sca.html)
- [Detect — Container Scan](https://docs.blackduck.com/r/detect/latest/black-duck-detect/container-scan.html)
- [Understanding Component Scanning](https://abb.app.blackduck.com/2026_1_1/doc/static/en-us/help/ComponentDiscovery/Component_scanning_overview.html)
- [About snippet matching](https://abb.app.blackduck.com/2026_1_1/doc/static/en-us/help/ComponentDiscovery/Snippets.html)
- [Signature scanner 와 Binary scanner 의 차이](https://community.blackduck.com/s/article/Differences-between-binary-scan-via-Signature-scanner-or-Binary-scanner)
- [Scanning Best Practices (PDF)](https://abb.app.blackduck.com/doc/pdfs/scanning_best_practices.pdf)
- [BDSA 와 NVD 의 버전 정확도 비교](https://www.blackduck.com/blog/comparing-bdsa-with-nvd-version-accuracy.html)
