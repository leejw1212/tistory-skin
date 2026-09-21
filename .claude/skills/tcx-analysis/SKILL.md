---
name: tcx-analysis
description: 애플 헬스(RunGap)가 Dropbox 에 올리는 TCX 활동 파일을 읽고 분석하거나, 러닝 자료(TCX·사진)를 어디서 어떻게 가져오는지 알아야 할 때 사용합니다. 러닝 기록에서 거리·페이스·심박·케이던스를 뽑거나, 쌓인 활동 중 글로 쓸 만한 러닝을 골라내거나, TCX 구조를 파악하거나, 구글 드라이브의 사진을 러닝 폴더로 넣을 때 씁니다. "오늘 러닝 분석해줘", "이번 달 얼마나 뛰었지", "TCX 파일 뭐가 들어있어", "러닝 사진 어디서 가져와" 같은 요청이 해당됩니다.
---

# TCX 활동 파일 분석

이 블로그의 러닝 기록은 **애플 헬스 → RunGap → Dropbox** 로 올라옵니다.
GPX 가 아니라 **TCX** 입니다. TCX 는 GPX 보다 정보가 많습니다.

## 파일이 있는 곳

```
Dropbox: /앱/RunGap/export/          (ns_path: ns:15065913523//export)
파일명:  2026-09-21_08-28-48_hk_1789946928.tcx
         └─ 현지시각(KST) ─┘  │    └─ 시작 시각의 유닉스 타임스탬프
                              └─ hk = HealthKit
```

파일명 앞의 날짜·시각은 **이미 한국 시간**입니다. 파일 안의 `<Time>` 은 UTC 입니다.

**사진은 Dropbox 가 아니라 구글 드라이브에 있습니다.**

```
구글 드라이브: 러닝기록  (fileId 1jbVrQCDX-cs3sz4NbR1whOHJThy2Fdty)
```

활동 파일과 사진의 **출처가 갈린다**는 게 이 파이프라인의 핵심 제약입니다.
Dropbox 는 사진을 내어주지 못하고(아래 참고), 구글 포토는 커넥터가 아예 없습니다.
드라이브에 TCX 를 같이 올려두면 한 곳에서 둘 다 가져올 수 있습니다.

## 먼저 이것부터 — 대부분은 글감이 아닙니다

RunGap 은 애플 헬스의 활동을 **전부** 내보냅니다. 걷기, 실내운동, 실수로 켠 1초짜리까지.

| 크기 | 정체 | 비율(600개 표본) |
| --- | --- | --- |
| **1KB 미만** | 트랙이 없는 기록 (실내운동 · GPS 미사용 · 오작동) | **71%** |
| 1~50KB | 아주 짧은 활동 | 3% |
| 50KB 이상 | GPS 가 찍힌 실제 활동 | 26% |

**1KB 미만은 열어볼 필요도 없습니다.** 크기로 먼저 거르세요.

## 분석 도구

```bash
node tools/tcx-report.mjs <폴더>                    # 요약 + 분류
node tools/tcx-report.mjs <폴더> --runs             # 러닝만
node tools/tcx-report.mjs <폴더> --since 2026-09-01 # 기간 지정
node tools/tcx-report.mjs <폴더> --json             # 기계가 읽을 형식
```

코드로 직접 다룰 때는 `tools/tcx-core.mjs`:

```js
import { parseTcx, deviceDistanceKm, heartRateSummary, classify } from './tools/tcx-core.mjs';

const p = parseTcx(readFileSync(file, 'utf8'));
classify(p).kind          // 'run' | 'walk' | 'cycling' | 'no-gps' | 'too-short'
deviceDistanceKm(p)       // { km, source: 'lap' | 'trackpoint' | 'gps' }
heartRateSummary(p)       // { avg, max }
```

## TCX 에 들어 있는 것

```
Activity[Sport]
  Id                                     활동 시작 시각
  Lap[StartTime]              ← 1km 마다 여러 개 (아래 참고)
    TotalTimeSeconds  DistanceMeters     ← 기기가 잰 값. GPS 계산보다 정확합니다
    MaximumSpeed  Calories
    AverageHeartRateBpm/Value  MaximumHeartRateBpm/Value
    Track
      Trackpoint (보통 1초 간격)
        Time                             UTC
        Position/LatitudeDegrees, LongitudeDegrees   ← 없을 수 있음
        AltitudeMeters  DistanceMeters   누적 거리
        HeartRateBpm/Value
        Extensions/TPX/RunCadence, Speed ← Speed 는 없을 수 있음
  Creator/Name                           ← 통째로 없을 수 있음
```

실측(2019-04-30 파일, 3.03km): 트랙포인트 944개 중 **939개만 Position 을 가집니다.**
출발 직후 GPS 가 잡히기 전 몇 개는 `<Time>` 과 심박만 있습니다. 그 점들은 건너뛰세요.

## 함정 — 미리 알아두면 시간을 아낍니다

**거리는 `DistanceMeters` 를 쓰세요.** GPS 좌표로 계산하면 실제보다 짧게 나옵니다.
애플워치는 가속도계·보폭을 함께 써서 터널이나 고층 건물 사이에서도 거리를 유지합니다.
`deviceDistanceKm()` 이 랩 → 트랙포인트 → GPS 순으로 알아서 고릅니다.

**랩은 보통 1km 자동 랩입니다 — 이걸 스플릿으로 쓰세요.**
3km 러닝이면 랩이 4개(1km·1km·1km·나머지 조각) 나옵니다.
기기가 끊어준 값이라 직접 보간한 것보다 정확합니다. `lapSplits()` 를 쓰세요.
랩이 1개뿐인 짧은 활동에서는 `null` 을 돌려주므로, 그때만 `gpx-core.mjs` 의 `splits()` 로 넘어갑니다.

**심박 평균은 시간 가중으로 내세요.** 랩마다 길이가 다릅니다.
5초짜리 마지막 조각 랩을 30분치와 똑같이 평균 내면 값이 틀어집니다.
(실측에서 단순평균 170 vs 가중평균 167) `heartRateSummary()` 가 처리합니다.

**`Sport="Running"` 을 믿지 마세요.** 걷기도 Running 으로 찍혀 나옵니다.
`classify()` 가 페이스(8분/km 초과면 걷기)로 한 번 더 걸러냅니다.

**`RunCadence` 는 한쪽 발 기준입니다.** 실제 걸음수는 2배입니다.
`cadenceSummary()` 가 2배로 돌려줍니다.

**날짜는 KST 로 변환하세요.** `<Time>` 이 UTC 라 그대로 자르면
오전 9시 이전 러닝이 전날로 기록됩니다. `localDateString(iso, 540)` 을 쓰세요.

**네임스페이스 접두사는 무시하세요.** 실측 파일은 접두사 대신 TPX 에 기본 xmlns 를 다시 선언합니다
(`<TPX xmlns="…/ActivityExtension/v2">`). 다른 기기는 `<ns3:TPX>` 로 씁니다.
`tcx-core.mjs` 의 파서는 접두사와 무관하게 태그 이름으로만 찾습니다.

**없을 수 있는 것들에 대비하세요.** 실측 파일에는 `<Creator>`(기기 이름)와 `<Speed>` 가 아예 없었습니다.
`RunCadence` 만 있고 `Speed` 는 없는 경우가 정상입니다.

> 파서는 실제 파일(`2019-04-30_10-19-02_hk_1556587142.tcx`, 3.03km · 랩 4개 · 트랙포인트 944개)로
> 검증했습니다. 랩 값 · 거리 · 시간 · 날짜가 원본과 정확히 일치합니다.

## 이 환경에서의 제약 — 원본 파일을 어떻게 손에 넣나

Dropbox 커넥터로 **목록과 메타데이터는 정상 조회**됩니다. 크기로 거르고 파일명으로 날짜를 읽는 데까지는
`list_folder` 만으로 충분합니다. 막히는 건 **원본 바이트를 받는 것 하나**입니다.

| 시도 | 결과 |
| --- | --- |
| `fetch` | XML 태그를 지우고 텍스트만 돌려줍니다. `Sport`, `StartTime` 같은 **속성은 아예 사라집니다** |
| `download_link` → `curl` | **403 `connect_rejected`** — `*.dl.dropboxusercontent.com` 이 조직 이그레스 정책에 막혀 있습니다 |

`download_link` 자체는 성공하고 URL 도 정상적으로 나옵니다. 그 URL 로 나가는 연결이 프록시에서 거부됩니다.
**우회하지 마세요.** 조직 정책 거부는 재시도 대상이 아닙니다.

**그래서 원본 TCX 는 이 세 가지 중 하나로 받습니다.**

1. **사용자가 스레드에 파일을 올린다** — 지금 당장 되고, 준비할 게 없습니다. 기본 경로입니다.
2. **구글 드라이브에 올려두고 커넥터로 받는다** — 사진과 같은 경로로 합칠 수 있습니다.
   `download_file_content` 가 `{id, title, mimeType, content}` JSON(base64)을 주고,
   `tools/drive-import.mjs` 가 사진이든 TCX 든 원래 파일로 되돌립니다.
3. **환경의 네트워크 정책에 Dropbox CDN 을 허용한다** — 근본 해결이지만 사용자가 환경 설정을
   바꿔야 합니다. claude.ai/code 의 환경 선택기에서 **Network access** 를 **Custom** 으로 두고
   **Allowed domains** 에 아래를 넣습니다. `download_link` 는 `ucc0204….dl.dropboxusercontent.com`
   처럼 **무작위 서브도메인**을 주므로 `*.` 가 반드시 있어야 합니다.

   ```
   *.dl.dropboxusercontent.com
   dl.dropboxusercontent.com
   ```

   **Also include default list of common package managers** 를 같이 체크해야 npm·GitHub 같은
   기본 허용목록이 유지됩니다. 바뀐 정책은 **그 뒤에 시작한 세션부터** 적용됩니다.
   ([문서](https://code.claude.com/docs/en/cloud-environments#allow-specific-domains))

## 글로 이어질 때

분석이 끝나 실제 글을 만들 거라면 러닝 폴더 하나에 **TCX 와 사진을 모아** `tools/build-post.mjs` 로 넘깁니다.

커넥터로 내려받은 JSON 은 그대로는 파일이 아닙니다. `drive-import.mjs` 가 되돌려 넣습니다.

```bash
# 드라이브에서 받은 것들(사진 · TCX)을 그 날짜만 골라 러닝 폴더로
node tools/drive-import.mjs runs/2026-09-21-여의도 --from <받은폴더> --day 2026-09-21

# 글 초안
node tools/build-post.mjs runs/2026-09-21-여의도
```

TCX 를 넣으면 심박·케이던스·칼로리까지 정보 표에 자동으로 들어갑니다.
사진은 순서를 맞출 필요가 없습니다 — 촬영 시각과 트랙 시각을 맞춰 제자리에 꽂힙니다.
