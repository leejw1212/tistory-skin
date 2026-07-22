# Clean Gallery — 티스토리 갤러리형 스킨

DevOps 블로그를 위한 **깔끔한 갤러리형 티스토리 스킨**입니다.

- 🔍 상단 **검색바**
- ⭕ 검색바 아래 **원형 카테고리 메뉴** (카테고리별 DevOps 아이콘 자동 매핑)
- 🖼️ 반응형 **썸네일 갤러리 그리드**
- 📝 넓고 읽기 좋은 **본문 타이포그래피** (코드블록·표·인용구 스타일 포함)
- 🌙 **다크모드** 자동 지원 (`prefers-color-scheme`)
- 📱 모바일 최적화 (카테고리 가로 스크롤)

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
