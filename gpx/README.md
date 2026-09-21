# 📂 gpx/

지도 데이터(`courses.json`)만 갱신할 때 쓰는 폴더입니다.
글까지 한 번에 만들려면 [`runs/`](../runs/README.md) 쪽을 쓰세요.

활동 파일(`.tcx` 또는 `.gpx`)을 이 폴더에 넣고 아래를 실행하세요.
애플 헬스 → RunGap → Dropbox 로 올라오는 건 `.tcx` 입니다.

```bash
node tools/build-courses.mjs
```

- `images/courses.json` 이 만들어집니다.
- `gpx/out/<아이디>.md` 에 글에 붙여넣을 표가 생깁니다.
- 예시 파일(`sample*`)은 빠집니다. 예시로 시험만 하려면 `--with-sample` 을 주세요.
- **여기 넣은 활동 원본은 커밋되지 않습니다.** 집 근처 좌표와 심박이 그대로 들어 있어서
  `.gitignore` 로 막아뒀습니다. 지도에 나가는 건 `courses.json` 의 단순화된 경로뿐입니다.

## 글을 먼저 발행하세요 — 업로드를 한 번만 하려면

지도 데이터에는 글 주소가 들어갑니다. 그래서 순서가 이렇습니다.

```bash
node tools/build-courses.mjs                    # 1. 지도 데이터 만들기
#                                                 2. 티스토리에 글 발행 → 번호 확인
node tools/link-course.mjs 여의도 213 --title "여의도 한강 4K"   # 3. 번호·이름 넣기
#                                                 4. courses.json 한 번만 업로드
```

`link-course.mjs` 는 아무 인자 없이 실행하면 코스 목록과 연결 상태를 보여줍니다.
코스는 아이디 전체를 적지 않아도 되고, 글 주소는 `213` · `/213` · 전체 URL 아무거나 됩니다.
정한 이름과 주소는 `gpx/meta.json` 에도 같이 적히므로 **다시 빌드해도 남습니다.**

## meta.json (선택)

`link-course.mjs` 가 알아서 적어주지만, 직접 손으로 적어도 됩니다.

```json
{
  "courses": {
    "여의도-한강-5k": {
      "title": "여의도 한강공원 5K",
      "link": "/12",
      "date": "2026-09-14"
    }
  },
  "restaurants": [
    {
      "title": "여의도 ○○버거",
      "url": "/13",
      "lat": 37.5265,
      "lon": 126.9315,
      "desc": "러닝 후 단백질 충전"
    }
  ]
}
```

`link` 를 비워 둬도 됩니다. 그러면 지도에서 코스를 눌렀을 때 제목으로 블로그 내 검색이 열립니다.
한 번 빌드한 뒤 `images/courses.json` 에서 직접 `link` 를 채워 넣어도, 다시 빌드할 때 그 값이 유지됩니다.

## 활동 파일은 어디서 받나요

| 앱 | 경로 | 형식 |
| --- | --- | --- |
| **애플 워치 (건강 앱)** | **RunGap** → Dropbox `/앱/RunGap/export/` 자동 업로드 | **TCX** |
| 가민 커넥트 | 활동 상세 → 우측 톱니 → 내보내기 | TCX · GPX |
| 스트라바 | 활동 페이지 → `...` → Export GPX | GPX |
| 삼성 헬스 | 웹 → 데이터 다운로드 | GPX |

걷기·실내운동 파일은 빌드할 때 자동으로 걸러집니다.
