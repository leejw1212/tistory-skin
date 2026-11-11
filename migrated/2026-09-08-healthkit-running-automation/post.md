![애플 건강 앱으로 달리기 자동 기록하기 — RunGap과 Dropbox 웹훅으로](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/45-cover-healthkit.jpg)

매일 달린다. 애플워치로 뛰면 런데이 앱이 기록하고, 그 기록은 애플 건강 앱에도 쌓인다. 문제는 그다음이다 — 이 기록을 내 개인 대시보드로 자동으로 넘길 방법이 없다.

> 📌 여기서 말하는 대시보드는 집 서버에 올려 둔 개인용 화면이다.

## 목표

뛰고 나면 아무것도 안 해도 대시보드에 거리·시간·심박·페이스가 쌓이게 만드는 것. 최종 흐름은 이렇다.

> 애플워치 → 런데이 → 애플 건강 → RunGap(자동 감시) → Dropbox(자동 업로드) → 내 서버(웹훅) → 대시보드

여기까지 오는 데 세 번 방향을 바꿨다. 그 과정을 순서대로 남긴다.

## 왜 이렇게 돌아가야 하나

애플은 HealthKit 데이터를 서버에서 조회하는 API를 제공하지 않는다. 온디바이스 전용이다. 런데이도 공개 API가 없다. 그러니 **서버가 당겨오는 방법은 아예 없고, 아이폰 쪽에서 뭔가가 데이터를 읽어서 밀어줘야 한다.** 이 제약이 아래 모든 시도의 출발점이다.

## 1차 시도: iOS 단축어 — 포기

가장 먼저 해본 건 단축어 자동화였다. "운동이 종료되면" 트리거로 건강 데이터를 읽어서 서버로 POST하는 방식이다. 이론상 되지만, 실제로 만들어 보니 막히는 지점이 계속 나왔다.

- 단축어에 "운동 찾기"라는 별도 작업이 없는 iOS 버전이 있었다. "건강 샘플 찾기"의 유형을 "운동"으로 바꿔야 하는데, 그 유형 자체가 안 보이는 경우도 있었다.
- 유형을 "걷기+달리기 거리"로 두면 그날 걸었던 다른 거리까지 섞였다. 방금 끝난 운동 하나만 골라내려면 시작 시각 기준으로 앞뒤 몇 시간을 잘라서, 그 구간의 거리·심박 샘플을 따로 모으고 통계를 계산해야 했다 — 액션이 대여섯 개로 늘어난다.
- 헤더에 `Bearer ` 접두사(공백 포함)를 빠뜨려 인증이 계속 실패했다.
- 본문 JSON에 "새로운 필드 추가"만 하고 실제 값을 매핑하지 않아 빈 값이 그대로 나갔다.

> 📌 Apple 기본 단축어 액션만으로 완결된 운동(Workout) 객체 하나를 깔끔하게 가져오는 방법은 마땅치 않다. 되긴 하지만, 여러 건강 샘플 조회를 시간 구간으로 엮어서 재구성해야 하는데 이게 GUI로 만들기엔 너무 손이 많이 간다.

되긴 하는데 사람이 계속 개입해야 하고 iOS 버전마다 메뉴가 달라 재현이 어려웠다. 완전 자동화라는 목표에 안 맞아서 접었다.

## 2차 시도: 스트라바 — 애초에 못 씀

단축어 대신 다른 앱의 공개 API를 찾아봤다. 스트라바는 활동 업로드 시 실시간 웹훅을 보내주는 정식 개발자 API가 있다. 이거면 폰에서 뭘 조립할 필요 없이 서버끼리 주고받으면 된다 — 라고 생각했는데, 스트라바가 **2025년 3월에 한국 서비스를 완전히 철수**했다. 정식 경로로는 가입도, 앱 설치도 안 된다. 우회 설치 방법이 있긴 하지만 정상적인 기반으로 쓸 게 못 된다. 여기서 접었다.

## 3차 시도: RunGap + Dropbox — 이걸로 결정

애플 건강에서 다른 서비스로 자동으로 내보내 주는 전용 앱을 찾아보니 **RunGap**이 있었다. HealthKit을 계속 지켜보다가 새 운동이 생기면 지정한 곳으로 자동으로 파일을 올려주는 유료 앱이다. 업로드 대상으로 Dropbox를 고르면, **Dropbox는 진짜 개발자 웹훅 API가 있다** — 새 파일이 올라오면 내 서버로 바로 알려준다.

이러면 아이폰 쪽에서 조립할 게 없다. RunGap 하나 설정해 두면 끝이고, 나머지는 전부 서버 코드다.

### 준비물

- RunGap (유료, 앱스토어)
- Dropbox 계정 (무료 2GB로 충분 — TCX 파일 하나가 몇 KB 수준)
- Dropbox 개발자 계정 (가입 필요 없이 기존 계정으로 앱만 등록하면 됨)

### 1. RunGap 설정

RunGap 안에서 **Apple Health**를 소스로, **Dropbox**를 대상으로 연결한다. 내보내기 형식은 **TCX**로 맞춘다. GPS 트랙과 랩(Lap) 단위 통계, 트랙포인트별 심박수까지 담기는 형식이라 거리·시간·심박을 전부 뽑아낼 수 있다. 자동 공유(Auto Sharing)를 켜면 운동이 끝날 때마다 Dropbox에 파일이 쌓인다.

### 2. Dropbox 앱 등록

RunGap이 파일을 올리는 것과는 별개로, **내 서버용 Dropbox 앱을 하나 더 등록**해야 한다. RunGap은 자기 앱 권한으로만 파일을 쓰기 때문에, 그 파일을 읽으려면 내 쪽에서도 정식으로 등록된 앱이 있어야 한다.

1. [dropbox.com/developers/apps](https://www.dropbox.com/developers/apps) → **Create app**
2. **Scoped access** → **Full Dropbox** 선택 (RunGap이 만든 폴더까지 읽으려면 앱 전용 폴더 권한으로는 부족하다)
3. **Permissions** 탭에서 `files.metadata.read`, `files.content.read` 체크 → Submit
4. **Settings** 탭에서 **App key** / **App secret** 확인해 둔다

> ⚠️ **OAuth 2** 섹션에 **Redirect URI**도 미리 등록해야 한다. 이걸 빠뜨리면 나중에 계정 연결 버튼을 눌렀을 때 이런 에러를 본다.
> ``` Invalid redirect_uri: "https://dash.example.com/auth/dropbox/callback" It must exactly match one of the redirect URIs you've pre-configured for your app (including the path).
> ``` 정확히 서버가 쓰는 콜백 주소(`https://<도메인>/auth/dropbox/callback`)를 한 글자도 안 틀리게 등록해야 한다.

### 3. 서버 — OAuth, 웹훅, TCX 파서

앱 코드 쪽에서 세 가지가 필요하다.

**OAuth 연동.** Dropbox 계정을 한 번 인증해서 장기 접근용 refresh token을 받아 둔다. `token_access_type=offline`을 안 주면 access token만 오고 refresh token이 안 와서, 매번 새로 로그인해야 하는 상태가 된다.

```python
params = urlencode({
    "client_id": DROPBOX_APP_KEY,
    "redirect_uri": _dropbox_redirect_uri(),
    "response_type": "code",
    "token_access_type": "offline",
    "state": state,
})
return redirect(f"{DROPBOX_AUTH_URL}?{params}")
```

**웹훅 수신.** Dropbox는 웹훅 URL을 등록할 때 GET으로 challenge 검증부터 한다. 받은 값을 그대로 돌려주면 등록이 확정된다.

```python
@app.route("/webhooks/dropbox", methods=["GET", "POST"])
def dropbox_webhook():
    if request.method == "GET":
        resp = Response(request.args.get("challenge", ""), mimetype="text/plain")
        resp.headers["X-Content-Type-Options"] = "nosniff"
        return resp

    sig = request.headers.get("X-Dropbox-Signature", "")
    body = request.get_data()
    if not hmac.compare_digest(
        sig, hmac.new(DROPBOX_APP_SECRET.encode(), body, hashlib.sha256).hexdigest()
    ):
        return "", 403
    # ... 새 파일 목록을 가져와 처리
```

실제 POST 알림은 "누구 계정에 변화가 있었다"만 알려주고 내용은 안 담고 온다. 알림을 받으면 `files/list_folder/continue`로 그 이후 바뀐 파일 목록을 직접 가져와야 한다.

**TCX 파싱.** TCX는 XML이다. `Lap` 단위로 거리·시간·칼로리를 더하고, `Trackpoint`를 순회하며 심박수 최저·평균·최고와 케이던스를 뽑는다.

```python
for lap in laps:
    dur_s += num(lap.find("{*}TotalTimeSeconds").text)
    dist_m += num(lap.find("{*}DistanceMeters").text)
    for tp in lap.findall(".//{*}Trackpoint"):
        hr = tp.find("{*}HeartRateBpm/{*}Value")
        if hr is not None:
            hr_vals.append(num(hr.text))
```

타임스탬프는 UTC로 오기 때문에 KST로 변환해서 저장해야 날짜가 안 어긋난다.

> 💡 `{*}태그` 문법은 파이썬 `xml.etree.ElementTree`가 3.8부터 지원하는 네임스페이스 와일드카드다. TCX 파일마다 네임스페이스 선언이 조금씩 달라서, 이렇게 안 하면 태그를 못 찾는 경우가 생긴다.

### 4. 웹훅 등록 + 계정 연결

Dropbox 앱 콘솔의 **Webhooks** 항목에 `https://<도메인>/webhooks/dropbox`를 등록하면 위에서 만든 GET 핸들러가 바로 검증에 응답한다. 그다음 대시보드의 "Dropbox 연결하기" 버튼으로 OAuth를 한 번 완료하면 끝이다.

## 배포하면서 겪은 것

여기까지 코드는 다 맞았는데, 실제로 서버에 올리는 과정에서 세 가지가 더 걸렸다. 배포는 GitHub Actions로 완전 자동화돼 있어서, 새 환경변수 하나를 추가하는 게 생각보다 손이 많이 갔다.

**① 시크릿이 컨테이너까지 갈 길이 없었다.** 앱 코드에는 `DROPBOX_APP_KEY`/`DROPBOX_APP_SECRET`을 읽는 부분만 있고, 그 값을 GitHub Secret에서 컨테이너 환경변수까지 실어 나르는 배선이 없었다. 이 저장소는 `compose.yml`에 각 환경변수를 명시적으로 나열해 두는 방식이라, 새 키를 쓰려면 세 군데에 똑같이 추가해야 한다.

```yaml
# compose.yml
environment:
  DROPBOX_APP_KEY: ${DROPBOX_APP_KEY:-}
  DROPBOX_APP_SECRET: ${DROPBOX_APP_SECRET:-}
```

```yaml
# deploy.yml — SSH 스텝의 env 블록
DROPBOX_APP_KEY: ${{ secrets.DROPBOX_APP_KEY }}
DROPBOX_APP_SECRET: ${{ secrets.DROPBOX_APP_SECRET }}
```

`envs:` 허용 목록과 서버에 쓰는 `.env` 파일 생성부에도 같은 이름을 추가해야 한다. 하나라도 빠지면 GitHub Secret에 값을 넣어도 컨테이너까지 조용히 전달이 안 된다.

**② 웹훅이 로그인 화면으로 튕겼다.** 라우트를 로그인 필요 없는 공개 엔드포인트 목록에 넣었는데도 계속 `302 → /login`이 났다. 원인은 배포 자체가 안 된 것이었다 — 이 저장소의 배포는 `main` 브랜치 push에만 반응하는데, 코드는 작업 브랜치에만 있었다. 병합해서 push하니 바로 풀렸다.

**③ `invalid_client: Invalid client_id or client_secret`.** 앞선 문제를 고치고 나니 새 에러가 났다. 서버 SSH 권한이 없어서 셸로 들어가 값을 볼 수 없었다. 대신 로그인 세션 뒤에 숨긴 임시 진단 엔드포인트를 하나 만들어, 컨테이너에 실제로 도착한 값의 **길이와 앞 두 글자만** 노출했다.

```json
{
  "DROPBOX_APP_KEY": {"set": true, "len": 15, "prefix": "9c"},
  "DROPBOX_APP_SECRET": {"set": false, "len": 0, "prefix": ""}
}
```

App key는 정상 도착, App secret은 완전히 빈 값. 배포 스크립트를 다시 따라가 봐도 로직은 App key와 완전히 대칭이라 스크립트 문제는 아니었다. 남은 건 하나 — **GitHub Secret 이름 자체가 틀렸다.** `DROPBOX_APP_SECRET`을 `DROPBOX_APP_SECERT`로 등록해 둔 것이다. 워크플로우는 정확한 이름만 찾기 때문에, 오타 난 이름은 존재하지 않는 시크릿과 같다 — 조용히 빈 문자열이 된다.

> 💡 셸 접근 없이 배포 파이프라인을 디버깅할 때, **값 자체가 아니라 길이와 존재 여부만 보여주는 엔드포인트**를 임시로 하나 두면 안전하게 원인을 좁힐 수 있다. 이름 오타처럼 코드로는 안 보이는 문제가 이렇게 잡힌다. 원인을 찾으면 바로 지운다 — 로그인 뒤에 있어도 정보를 흘리는 자리는 오래 둘 이유가 없다.

## 확인

이름을 고치고 재배포한 뒤, 대시보드의 "Dropbox 연결하기"를 다시 눌러 계정 연결까지 마쳤다. 그 뒤로는 뛰고 나면:

1. RunGap이 새 운동을 감지해 TCX로 Dropbox에 올린다
2. Dropbox가 웹훅으로 서버에 알린다
3. 서버가 파일을 받아 파싱해 저장한다
4. 대시보드를 열면 거리·페이스·심박이 이미 들어와 있다

## 정리

- **플랫폼이 API를 안 주면, 그 데이터를 이미 다루는 다른 서비스를 거쳐 간다.** HealthKit은 못 뚫어도, HealthKit → 다른 곳으로 이미 내보내 주는 전용 앱(RunGap)과 그 다른 곳의 정식 API(Dropbox 웹훅)를 이으면 된다.
- **"서비스가 그 나라에서 철수했다"도 실전에서 마주치는 흔한 벽이다.** 기술적으로 맞는 설계라도 접근 자체가 막히면 다른 경로를 찾아야 한다.
- **자동화가 사람 손을 계속 타면 자동화가 아니다.** 단축어로 되긴 했지만 매번 확인하고 고쳐야 했다 — 그건 반자동이지 완전 자동이 아니다.
- **파이프라인이 길면, 값이 실제로 어디까지 왔는지 직접 찍어 보는 게 가장 빠르다.** 코드를 아무리 다시 읽어도 오타 하나는 안 보인다.
