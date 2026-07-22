# Clean Gallery — 티스토리 갤러리형 스킨

DevOps 블로그를 위한 **깔끔한 갤러리형 티스토리 스킨**입니다.

- 🔍 상단 **검색바**
- ⭕ 검색바 아래 **원형 카테고리 메뉴** (카테고리별 DevOps 아이콘 자동 매핑)
- 🖼️ 반응형 **썸네일 갤러리 그리드**
- 📝 넓고 읽기 좋은 **본문 타이포그래피** (코드블록·표·인용구 스타일 포함)
- 🎨 **코드 문법 강조**(highlight.js · HCL/Terraform·YAML·Bash 등) + **복사 버튼**
- 📑 **본문 자동 목차(TOC)** + 제목 앵커 + 스크롤 위치 추적 (넓은 화면)
- ⏱️ **읽는 시간** 표시 + 상단 **읽기 진행률 바**
- 🖼️ **이미지 라이트박스**(클릭 확대) · 아키텍처 다이어그램에 유용
- 🔗 **공유 버튼**(X · 페이스북 · 링크복사)
- 🧩 **관련 글**(같은 카테고리) 자동 노출
- 🔎 **JSON-LD/OG** 등 검색·SNS 공유 최적화
- ⬆️ **맨 위로** 버튼
- 💰 **애드센스 광고 영역** 내장 (`[##_revenue_list_upper_##]` / `[##_revenue_list_lower_##]`)
- 🌙 **다크모드** — OS 자동 + 헤더 **수동 토글**(설정 저장)
- 📱 모바일 최적화 (카테고리 가로 스크롤)

> highlight.js·Pretendard는 CDN에서 불러오며 차단 시 자동으로 기본 스타일로 대체됩니다.
> 코드 문법 강조를 티스토리 내장 코드블록만 쓰고 싶다면 `skin.html` `<head>` 의 highlight.js `<link>`/`<script>` 두 줄을 지우면 됩니다.

## 기능 켜고 끄기 (스킨 편집 화면에서)

모든 기능은 `skin.html` **맨 위 `window.CLEAN_SKIN` 설정 블록**에서 `true`/`false` 로 켜고 끕니다.
티스토리 관리 → **꾸미기 → 스킨 편집 → html 편집** 에서 값만 바꾸고 **적용**하면 됩니다.

```js
window.CLEAN_SKIN = {
  darkToggle:      true,   // 라이트/다크 토글 버튼
  commandPalette:  true,   // ⌘K / Ctrl+K 커맨드 팔레트
  shortcuts:       true,   // 키보드 단축키 ( / , j , k , g h , t , ? )
  terminalHeader:  true,   // 헤더 터미널풍 프롬프트
  toc:             true,   // 본문 자동 목차
  readingBar:      true,   // 읽는 시간 + 진행률 바
  syntaxHighlight: true,   // 코드 문법 강조(highlight.js)
  codeLineNumbers: true,   // 코드 줄 번호
  codeCopy:        true,   // 코드 복사 버튼
  mermaid:         true,   // ```mermaid 다이어그램
  katex:           true,   // $수식$ 렌더
  callouts:        true,   // > [!NOTE] 콜아웃 박스
  lightbox:        true,   // 이미지 클릭 확대
  share:           true,   // 공유 버튼
  relatedPosts:    true,   // 관련 글
  seo:             true,   // JSON-LD 구조화 데이터
  backToTop:       true,   // 맨 위로 버튼
  githubCard:      true,   // GitHub 프로필/잔디 카드
  techBadges:      true,   // 기술스택 배지(일반 모드)
  homeProfile:     true,   // 홈을 '프로필 공간'으로 (게시글 대신 GitHub·자격증·스택 아이콘)

  github: "본인_깃허브_아이디",
  techStack: ["Terraform", "Kubernetes", "OpenStack", "AWS", "Docker"],
  certs: ["CKA", "CKAD", "Terraform Associate", "AWS SAA"],  // 이름만 넣으면 발급기관 로고 자동
  series: [
    // { name: "Terraform 입문", posts: [
    //   { title: "1. 설치", url: "/1" }, { title: "2. 변수", url: "/2" } ] }
  ]
};
```

### 개발자 블로그 기능 사용법
- **단축키 안내**: 화면 좌하단 **⌨ 단축키** 버튼(또는 `?`) → 사용법 패널.
- **커맨드 팔레트**: `⌘K`(맥) / `Ctrl+K`(윈도우) → 검색·카테고리 이동.
- **홈 프로필 공간(`homeProfile`)**: 켜면 홈이 게시글 대신 **GitHub 카드 + 자격증 + 기술스택(실제 로고 아이콘)** 을 보여줍니다. 글은 상단 **카테고리 원형 메뉴**로 봅니다. (실제 기술 아이콘은 devicon CDN 사용)
- **자격증**: `certs` 에 **이름만** 넣으면 발급기관 로고가 자동으로 붙습니다.
  내장 지원: `CKA` `CKAD` `CKS` `KCNA` `KCSA` · `AWS SAA/SAP/SOA/DVA/DOP/SCS/Cloud Practitioner` · `Terraform Associate` `Vault Associate` · `AZ-900/104/305/400` · `GCP ACE/PCA` · `RHCSA` `RHCE` · `LFCS` · `DCA` 등. 목록에 없어도 이름으로 표시되고, 키워드로 로고를 추정합니다.
- **Mermaid 다이어그램**: 글에서 코드블록 언어를 `mermaid` 로 지정하고 `graph TD; A-->B;` 처럼 작성.
- **콜아웃**: 인용문 첫 줄에 `[!NOTE]` `[!TIP]` `[!WARNING]` `[!DANGER]` 중 하나.
- **수식(KaTeX)**: `$O(n\log n)$`(인라인), `$$ ... $$`(블록).
- **GitHub 카드/기술배지**: 홈 하단에 표시. `github` 아이디와 `techStack` 를 본인 것으로 변경.
- **시리즈(연재)**: `series` 배열에 글 목록을 넣으면 해당 글에서 연재 네비가 뜹니다.

> Mermaid·KaTeX·highlight.js 는 필요한 글에서만 CDN으로 불러오며, 차단되면 자동으로 건너뜁니다.

## 애드센스 광고

스킨에 티스토리 공식 광고 치환자를 넣어 두었습니다.

| 위치 | 치환자 |
|---|---|
| 홈/목록 상단 | `[##_revenue_list_upper_##]` |
| 홈/목록 하단 | `[##_revenue_list_lower_##]` |
| 본문 상단·중간·하단 | 티스토리 **수익 관리**가 자동 삽입 |

- **켜는 법**: 티스토리 관리 → **수익 → 애드센스 관리(또는 광고)** 에서 애드센스 계정 연결 후, 홈/본문 광고를 ON.
- 위 상단/하단 슬롯은 광고가 없을 땐 자동으로 빈 공간이 사라집니다.
- 본문 하단에 직접 만든 광고단위를 넣고 싶으면 `skin.html` 의 `<div class="ad ad--content"></div>` 안에 애드센스 `<ins>` 코드를 붙여넣으세요.
- ⚠️ 광고는 애드센스 **사이트 검토 승인 후** 및 연결 직후 **수 시간~수일** 뒤부터 노출됩니다. 슬롯을 넣었는데 바로 안 보이는 건 정상일 수 있어요.

## 파일 구성

```
.
├── index.xml         # 스킨 정보 파일 (필수)
├── skin.html         # 스킨 HTML 템플릿 (필수)
├── style.css         # 스타일 (필수)
└── images/
    └── script.js     # 원형 카테고리 메뉴 생성 스크립트
```

## 설치 방법

### 방법 A. 티스토리 관리자에서 직접 편집
1. 티스토리 관리 → **꾸미기 → 스킨 편집 → html 편집**
2. `skin.html`, `style.css` 내용을 각각 붙여넣기
3. **파일 업로드** 탭에서 `images/script.js` 업로드
   (업로드한 파일은 `./images/script.js` 경로로 참조됩니다)
4. 적용

### 방법 B. 스킨 파일 업로드(zip)
1. 아래 파일들을 하나의 폴더에 넣고 zip으로 압축
   - `index.xml`, `skin.html`, `style.css`, `images/script.js`
   - (권장) `preview.jpg` 미리보기 이미지 추가
2. 티스토리 관리 → **꾸미기 → 스킨 → 스킨 등록**에서 zip 업로드

## 카테고리 원형 메뉴 동작 방식

`[##_category_list_##]` 가 출력하는 카테고리 목록을 `images/script.js` 가 읽어
각 카테고리를 **아이콘 원 + 이름** 형태로 바꿔줍니다.

카테고리 이름에 아래 키워드가 포함되면 자동으로 어울리는 아이콘이 붙습니다.

| 키워드 예시 | 아이콘 |
|---|---|
| AWS / Cloud / Azure / GCP | ☁️ |
| Kubernetes / k8s / Helm | ☸️ |
| Docker / Container | 🐳 |
| Terraform / IaC / Infra | 🏗️ |
| CI/CD / Jenkins / Deploy | 🚀 |
| Git / GitHub | 🐙 |
| Linux / Ubuntu | 🐧 |
| Monitoring / Grafana | 📊 |
| Network / Nginx / DNS | 🌐 |
| Database / SQL / Redis | 🗄️ |
| Security / Vault / IAM | 🔒 |
| 그 외 | 이름 첫 글자 |

> 매핑 규칙은 `images/script.js` 상단의 `ICONS` 배열에서 자유롭게 수정할 수 있습니다.

## 색상 커스터마이징

`style.css` 상단 `:root` 의 CSS 변수만 바꾸면 전체 톤이 변경됩니다.

```css
:root {
  --accent:     #3b6ef5;  /* 포인트 색상 */
  --accent-sub: #eef3ff;  /* 포인트 배경(연한색) */
  --radius:     16px;     /* 카드 모서리 둥글기 */
  --maxw:       1160px;   /* 전체 최대 폭 */
}
```

## 참고

- 티스토리 공식 스킨 가이드: https://tistory.github.io/document-tistory-skin/
- 골격은 티스토리 공식 반응형 스킨(`tistory-theme-ray`)의 치환자 구조를 기반으로 합니다.
