# 📂 gpx/

지도 데이터(`courses.json`)만 갱신할 때 쓰는 폴더입니다.
글까지 한 번에 만들려면 [`runs/`](../runs/README.md) 쪽을 쓰세요.

활동 파일(`.tcx` 또는 `.gpx`)을 이 폴더에 넣고 아래를 실행하세요.
애플 헬스 → RunGap → Dropbox 로 올라오는 건 `.tcx` 입니다.

```bash
node tools/build-courses.mjs
```

- `images/courses.json` 이 만들어집니다 → 티스토리 [스킨 편집 → 파일 업로드] 에 올리세요.
- `gpx/out/<아이디>.md` 에 글에 붙여넣을 표가 생깁니다.

## meta.json (선택)

글 주소나 제목을 직접 지정하고 싶을 때만 `gpx/meta.json` 을 만드세요.

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
