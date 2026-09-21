# 📂 gpx/

러닝 앱에서 내려받은 `.gpx` 파일을 이 폴더에 넣고 아래를 실행하세요.

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

## GPX 파일은 어디서 받나요

| 앱 | 경로 |
| --- | --- |
| 가민 커넥트 | 활동 상세 → 우측 톱니 → **GPX 내보내기** |
| 스트라바 | 활동 페이지 → `...` → **Export GPX** |
| 나이키 런 클럽 | 앱에서는 불가 → [runkeeper/NRC 변환 사이트](https://www.nikerunclubtogpx.com/) 이용 |
| 애플 워치 (건강 앱) | **RunGap**, **HealthFit** 등의 앱으로 내보내기 |
| 삼성 헬스 | 웹 → 데이터 다운로드 → 활동 GPX |
