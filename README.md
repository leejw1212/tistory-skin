# Clean Gallery — 티스토리 갤러리형 스킨

DevOps·개발 블로그를 위한 **깔끔한 갤러리형 티스토리 스킨**입니다.
상단 검색바와 원형 카테고리 메뉴, 썸네일 갤러리, 개발자 친화 기능(코드 하이라이트·목차·다이어그램·커맨드 팔레트 등)을 담았고, **모든 기능을 스킨 편집 화면에서 켜고 끌 수 있습니다.**

![preview](preview560.jpg)

## ✨ 주요 기능

**레이아웃 / 탐색**
- 🔍 상단 **검색바** + ⭕ **원형 카테고리 메뉴**(카테고리별 아이콘 자동 매핑)
- 🖼️ 반응형 **썸네일 갤러리 그리드**, 🌙 **다크모드**(OS 자동 + 수동 토글)
- ⌘K **커맨드 팔레트** · 키보드 단축키(`/ j k g h t ?`) · 좌하단 **단축키 안내 버튼**

**글 읽기**
- 🎨 **코드 문법 강조**(highlight.js · HCL/YAML/Bash 등) + 복사 버튼 + 줄 번호
- 📑 **자동 목차(TOC)** + 제목 앵커 + 스크롤 추적, ⏱️ 읽는 시간·진행률 바
- 📊 **Mermaid 다이어그램**, ∑ **KaTeX 수식**, 💬 **콜아웃**(`[!NOTE]` 등)
- 🐙 본문의 **GitHub 저장소 링크를 카드로** 예쁘게 표시, 🖼️ 이미지 라이트박스
- 🔗 공유 버튼 · 🧩 관련 글 · 📚 시리즈(연재) 네비 · 🔎 JSON-LD SEO

**홈 프로필 모드**
- 🧑‍💻 홈을 **프로필 공간**으로: GitHub 카드(잔디 포함) + **자격증**(이름만 넣으면 로고 자동) + **기술스택 실제 로고 아이콘**

**수익**
- 💰 애드센스 광고 영역(`[##_revenue_list_*_##]`) 내장 + **자동광고** 삽입(`adClient`)

## 📁 파일 구성

```
.
├── index.xml          # 스킨 정보 파일 (필수)
├── skin.html          # 스킨 템플릿 (필수, 상단에 기능 on/off 설정 내장)
├── style.css          # 스타일 (필수)
├── images/
│   └── script.js      # 인터랙션 스크립트
├── preview256.jpg     # 미리보기 (사용 중 스킨, 256×192)
├── preview560.jpg     # 미리보기 (스킨 목록, 560×420)
├── preview1600.jpg    # 미리보기 (상세, 1600×1200)
└── preview.gif        # 미리보기 폴백 (112×84)
```

## 🚀 설치

### 방법 A. HTML 편집으로 붙여넣기
1. 티스토리 관리 → **꾸미기 → 스킨 편집 → html 편집**
2. **HTML 탭** ← `skin.html`, **CSS 탭** ← `style.css` 붙여넣기
3. **파일 업로드**에서 `images/script.js` 업로드 → **적용**

### 방법 B. 스킨 파일(zip) 등록
1. `index.xml`, `skin.html`, `style.css`, `images/script.js`, `preview*.jpg`, `preview.gif` 를 한 폴더에 넣고 zip 압축
2. 티스토리 관리 → **꾸미기 → 스킨 → 스킨 등록** 에서 zip 업로드

## ⚙️ 기능 켜고 끄기 (스킨 편집 화면에서)

`skin.html` 맨 위 **`window.CLEAN_SKIN`** 설정 블록에서 `true`/`false` 로 제어합니다.

```js
window.CLEAN_SKIN = {
  darkToggle: true, commandPalette: true, shortcuts: true, terminalHeader: true,
  toc: true, readingBar: true, syntaxHighlight: true, codeLineNumbers: true, codeCopy: true,
  mermaid: true, katex: true, callouts: true, repoCard: true, readmeEmbed: true, lightbox: true,
  share: true, relatedPosts: true, seo: true, backToTop: true,
  githubCard: true, techBadges: true, homeProfile: true,

  adClient: "",                 // 애드센스 게시자 ID "ca-pub-XXXX" (자동광고)
  github: "",                   // GitHub 사용자명 (프로필 카드/잔디)
  techStack: ["Terraform", "Kubernetes", "OpenStack", "AWS", "Docker", "Ansible", "Linux", "Python"],
  certs: ["CKA", "CKAD", "Terraform Associate", "AWS SAA"],  // 이름만 → 발급기관 로고 자동
  series: [ /* { name:"연재명", posts:[ {title:"1편", url:"/1"} ] } */ ]
};
```

### 기능별 사용법
- **커맨드 팔레트**: `⌘K`(맥) / `Ctrl+K`(윈도우). 좌하단 **⌨ 단축키** 버튼 또는 `?` 로 도움말.
- **GitHub 저장소 카드**: 글 본문에 저장소 주소(`https://github.com/owner/repo`)를 **한 줄에 단독으로** 넣으면 카드로 바뀝니다(별·포크·언어 표시).
- **README 임베드**: 글 본문에 `.md` 파일 주소를 한 줄에 넣으면 그 내용이 게시물에 그대로 렌더됩니다. 예: `https://github.com/owner/repo/blob/main/README.md`
- **Mermaid**: 코드블록 언어를 `mermaid` 로 지정 후 `graph TD; A-->B;`
- **콜아웃**: 인용문 첫 줄 `[!NOTE]` `[!TIP]` `[!WARNING]` `[!DANGER]`
- **수식(KaTeX)**: `$O(n\log n)$`(인라인), `$$ ... $$`(블록)
- **자격증**: `certs` 에 이름만 (CKA·CKAD·CKS·KCNA / AWS SAA·SAP·… / Terraform·Vault Associate / AZ-* / GCP ACE·PCA / RHCSA·RHCE / LFCS·DCA …)
- **홈 프로필 모드**: `homeProfile: true` 면 홈이 게시글 대신 프로필/자격증/스택. 글은 상단 카테고리로.

### 색상/폭 커스터마이징
`style.css` 상단 `:root` 변수만 바꾸면 전체 톤이 바뀝니다.
```css
:root { --accent:#3b6ef5; --accent-sub:#eef3ff; --radius:16px; --maxw:1160px; }
```

## 💰 애드센스

| 위치 | 방식 |
|---|---|
| 홈/목록 상·하단 | `[##_revenue_list_upper_##]` / `[##_revenue_list_lower_##]` (티스토리 수익 관리) |
| 본문 | 티스토리 수익 관리 자동 삽입, 또는 `.ad--content` 에 광고단위 직접 삽입 |
| 전체 자동 | `adClient` 에 `ca-pub-...` 입력 → PC·모바일 자동광고 (AdSense에서 자동광고 ON 필요) |

> PC에서만 광고가 안 보이면 대개 브라우저 **광고 차단 확장** 또는 **ads.txt 미설정**이 원인입니다.

## 📜 라이선스 / 크레딧

- 이 스킨(HTML/CSS/JS)은 직접 작성한 창작물이며 **MIT License**(`LICENSE`)로 자유롭게 사용·수정·재배포할 수 있습니다.
- 골격은 티스토리 공식 스킨 [`tistory-theme-ray`](https://github.com/tistory/tistory-theme-ray)(MIT)의 치환자 구조를 참고했습니다.
- CDN으로 불러오는 오픈소스(스킨에 포함/재배포하지 않음):
  [Pretendard](https://github.com/orioncactus/pretendard)(OFL) ·
  [highlight.js](https://github.com/highlightjs/highlight.js)(BSD-3) ·
  [Mermaid](https://github.com/mermaid-js/mermaid)(MIT) ·
  [KaTeX](https://github.com/KaTeX/KaTeX)(MIT) ·
  [Devicon](https://github.com/devicons/devicon)(MIT) ·
  [Shields.io](https://shields.io)/[Simple Icons](https://github.com/simple-icons/simple-icons)(CC0)
- 브랜드 로고·자격증 명칭은 각 소유자의 상표입니다. 본인이 사용하는 기술/취득한 자격을 표시하는 용도로만 사용하세요.
