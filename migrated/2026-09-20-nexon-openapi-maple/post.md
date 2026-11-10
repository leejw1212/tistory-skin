![메이플 오픈API 는 complete_flag 가 아니라 clear_flag 를 준다 — 문서만 보고는 모르는 여섯 가지](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/114-cover-maple-openapi.jpg)

집 서버에서 돌아가는 대시보드에 [웹 터미널을 붙인](https://autops.run/web-terminal-in-dashboard/) 김에, 같은 Flask 앱에 화면을 하나 더 얹었다. 캐릭터 이름을 넣으면 장비·스탯·심볼·주간 보스를 보여 주는 페이지다. 도메인은 [Cloudflare CNAME 으로 붙인](https://autops.run/domain-cloudflare-nginx/) 서브도메인 하나를 더 파서 `maple.autops.run` 으로 뺐다. (지금은 서비스를 내렸다 — 아래 응답 형태와 함정은 넥슨 오픈API 를 쓰는 누구에게나 그대로다.)

API 자체는 평범한 REST 다. 키를 헤더에 넣고 JSON 을 받으면 된다. **막힌 자리는 전부 문서와 실제 응답이 어긋나는 곳이었다.** 그 여섯 자리를 정리한다.

> 📌 여기 적은 응답 모양은 2026년 9월에 **KMS(한국 서버) 실제 응답**을 보고 확인한 것이다. 넥슨이 필드를 바꾸면 달라질 수 있다. 확인은 아래 2번에 적은 방법으로 한다.

## 한 문장으로 먼저

| 함정 | 문서·라이브러리 | 실제 |
|---|---|---|
| 데이터 없음 | — | 오류가 아니라 **200** 에 `date` 만 |
| 보스 완료 여부 | `complete_flag` | **`clear_flag`** |
| 보스 난이도 | "보스 난이도" (값 없음) | **`normal`·`chaos`** 영문 |
| 키의 범위 | — | 범위를 **안 나눈다**. 스케줄러만 예외 |
| 캐릭터 이미지 크기 | `width`·`height` | **배경** 크기. 키우면 캐릭터가 작아 보인다 |
| 심볼 만렙까지 | — | **현재 레벨 필요치만** 준다 |

## 준비물

- 넥슨 오픈API 키. `openapi.nexon.com` 에서 로그인하고 애플리케이션을 등록하면 나온다.
- 아무 서버 쪽 언어. 여기서는 Flask 를 썼다.
- **키를 브라우저로 내보내지 않을 자리.** 키는 서버에만 둔다. 이유는 4번에서 다룬다.

10분이면 첫 응답까지 본다. 나머지 시간은 전부 아래 여섯 가지에 썼다.

## 기본 흐름 — 이름으로는 아무것도 못 한다

모든 조회가 `ocid` 라는 식별자를 받는다. 이름으로 부를 수 있는 건 `/id` 하나뿐이다.

```bash
curl -s 'https://open.api.nexon.com/maplestory/v1/id?character_name=아이언맨' \
     -H "x-nxopen-api-key: $NEXON_API_KEY"
```

```json
{"ocid":"6a3d...생략...f1c2"}
```

이 `ocid` 로 나머지를 부른다. 한 번 조회할 때 우리 서버는 **열두 번** 나간다 — `/id`, `/character/basic`, 그리고 나머지 여덟 군데에 5·6차 스킬 둘. 서로 기다릴 이유가 없으니 한꺼번에 던진다.

```python
MAPLE_SECTIONS = (
    ("stat", "/character/stat"),
    ("union", "/user/union"),
    ("equipment", "/character/item-equipment"),
    ("hexamatrix", "/character/hexamatrix"),
    ("hexamatrix_stat", "/character/hexamatrix-stat"),
    ("ability", "/character/ability"),
    ("hyper_stat", "/character/hyper-stat"),
    ("symbol", "/character/symbol-equipment"),
)

with ThreadPoolExecutor(max_workers=len(MAPLE_SECTIONS) + 2) as pool:
    jobs = {k: pool.submit(_maple_get, p, {"ocid": ocid}) for k, p in MAPLE_SECTIONS}
    for k, job in jobs.items():
        data, e = job.result()
        out[k] = None if _maple_is_empty(data) else data
```

**하나가 실패해도 나머지는 보여 준다.** 유니온을 안 한 캐릭터, 심볼이 없는 캐릭터가 흔하다. 하나 때문에 화면 전체를 못 띄우면 안 된다.

> 💡 호출량은 이 열두 번이 기준이 된다. 조회 한 번에 열두 번이므로, 같은 이름을 다시 물었을 때 또 나가면 금방 한도에 닿는다. 캐시는 선택이 아니다.

## 1. 데이터가 없으면 오류가 아니라 200 이 온다

넥슨은 하루 단위로 데이터를 올린다. 오늘 만든 캐릭터, 아직 반영 안 된 캐릭터는 **오류가 아니라 200 에 빈 몸통**으로 온다.

```json
{"date":"2026-09-19T00:00+09:00"}
```

그대로 화면에 넘기면 이름도 레벨도 없는 **빈 카드**가 뜬다. 느린 건지 없는 건지 보는 사람은 알 수 없다. 서버에서 걸러 낸다.

```python
def _maple_is_empty(payload):
    """넥슨이 '그 날짜 데이터는 없다' 는 뜻으로 주는 빈 응답인가."""
    if not isinstance(payload, dict):
        return True
    for key, value in payload.items():
        if key == "date" or value is None:
            continue
        if isinstance(value, (list, dict)) and not value:
            continue
        return False
    return True
```

`date` 말고는 전부 비었거나 `null` 이면 빈 응답으로 본다. 걸리면 화면에 이유를 적는다 — "넥슨은 하루 단위로 올리고, 전일 데이터는 다음 날 오전 2시부터 나옵니다."

> ⚠️ `if not data:` 로는 안 걸린다. `{"date": ...}` 는 파이썬에서 참이다. **키가 있는지가 아니라 값이 들어 있는지**를 봐야 한다.

## 2. 문서에는 complete_flag, 응답에는 clear_flag

주간 보스 현황은 `/scheduler/character-state` 로 온다. 넥슨이 내는 **공식 파이썬 라이브러리**(`maplestory-openapi`) 의 DTO 에는 이렇게 적혀 있다.

```python
class SchedulerBossContent(BaseModel):
    """
    Attributes:
        content_name (str): 보스 명
        difficulty (str): 보스 난이도
        cycle (str): 보스 초기화 주기
        list_order_no (int): 리스트 순서
        registration_flag (str): 인게임 스케줄러 등록 여부 (true/false)
        complete_flag (str): 완료 여부 (true/false)
    """
```

이걸 보고 `b["complete_flag"] == "true"` 로 썼더니 **잡은 보스가 0 마리로 나왔다.** 오류도 안 나고 화면만 비었다. 실제 응답을 찍어 보니 필드 이름이 달랐다.

```json
{
  "content_name": "더스크",
  "difficulty": "chaos",
  "cycle": "bossWeekly",
  "clear_flag": "true"
}
```

`complete_flag` 가 아니라 **`clear_flag`** 다. `cycle` 도 `weekly` 가 아니라 `bossWeekly` 다. 지금은 둘 다 받아 둔다.

```javascript
const done = bosses.filter(
  (b) => String(b.clear_flag || b.complete_flag).toLowerCase() === 'true');
```

> ⚠️ **필드 이름은 문서가 아니라 응답을 보고 맞춘다.** 이런 어긋남은 오류를 내지 않아서, 화면이 조용히 비는 것으로만 드러난다. 새 엔드포인트를 붙일 때는 응답을 한 번 통째로 찍어 보는 편이 빠르다.
>
> ```bash curl -s "$BASE/scheduler/character-state?ocid=$OCID" \ -H "x-nxopen-api-key: $KEY" | python3 -m json.tool | head -40
> ```

## 3. 난이도는 한글이 아니라 영문으로 온다

`difficulty (str): 보스 난이도` — 값이 무엇인지는 안 적혀 있다. 게임 화면이 한글이니 한글로 오겠거니 하고 `'카오스'` 로 맞췄다. 안 걸렸다.

실제로 오는 값은 **`easy`·`normal`·`hard`·`chaos`·`extreme`** 이다.

```javascript
const BOSS_DIFF_KO = {
  easy: '이지', normal: '노멀', hard: '하드', chaos: '카오스', extreme: '익스트림'
};
```

이름 쪽도 마찬가지로 길다. 표에는 `대적자` 라고 적었는데 게임은 `최초의 대적자` 를 보낸다. `찬란한 흉성`, `감시자 칼로스`, `선택받은 세렌` 도 그렇다. 띄어쓰기를 지우고 맞추되, 그래도 다른 것만 따로 이어 둔다.

```javascript
const BOSS_ALIAS = {
  '검은마법사': '검마', '가디언엔젤슬라임': '가엔슬',
  '최초의대적자': '대적자', '찬란한흉성': '흉성',
};
```

> 📌 이것도 오류를 안 낸다. 못 찾은 보스를 조용히 건너뛰면 **합계만 작아진다.** 그래서 못 찾은 것은 개수가 아니라 이름을 적어 화면에 내보냈다 — `값이 없어 합계에서 빠진 보스: chaos 더스크`. 이 한 줄 덕분에 표에 카오스 더스크 칸이 없다는 걸 바로 찾았다. 게임에 하드 더스크는 없는데 그 값을 '하드' 칸에 적어 두었던 것이다.

## 4. 키는 데이터 범위를 나누지 않는다 — 딱 한 군데만 빼고

처음에는 방문자마다 자기 키를 넣게 만들었다. 그런데 **내 키로 내 계정에 없는 캐릭터를 넣어도 정보가 그대로 나왔다.** 캐릭터 조회는 이름만 알면 누구 것이든 나오는 공개 정보라, 키는 "누가 부르는가" 를 셀 뿐 "무엇을 볼 수 있는가" 를 나누지 않는다.

그래서 키 입력을 걷어 내고 서버 키 하나로 모두에게 서비스한다. 키는 브라우저로 절대 내보내지 않는다. 그림도 마찬가지라, `<img>` 가 넥슨 주소를 직접 못 부를 때만 서버를 거치게 했다 — 주소에 키를 실으면 접근 로그와 Referer 에 그대로 남는다.

**예외가 하나 있다.** 주간 보스 현황(`/scheduler/character-state`)은 계정의 진행도라, 키를 발급한 계정의 캐릭터가 아니면 내용이 비어서 온다.

> 📌 이건 **관찰한 동작이고 문서에서 확인하지 못했다.** 빈 응답은 두 가지 뜻이라 (계정이 다르거나, 게임 안 스케줄러에 아무것도 등록하지 않았거나) 화면에 둘 다 적어 두었다.

그래서 이 한 자리만 방문자 키를 받는다. 받는 방식이 중요하다.

- **주소가 아니라 헤더로** 받는다(`X-Nexon-Key`). 주소에 실으면 로그에 남는다.
- 브라우저의 `localStorage` 에만 둔다. 서버는 그 요청에만 쓰고 적어 두지 않는다.
- 화면에는 통째로 안 보인다(`test…6789`). 화면을 찍어 올리는 일이 흔하다.

그리고 **캐시 칸을 키별로 갈라야 한다.** 이게 진짜 함정이다.

```python
query = urlencode(sorted(params.items()))
key = f"{path}?{query}" if query else path
if api_key:
    key += "#" + hashlib.sha256(api_key.encode("utf-8")).hexdigest()[:16]
```

> ⚠️ 칸을 안 가르면 **먼저 물어본 사람의 스케줄러가 다음 사람에게 그대로 나간다.** 캐시 칸 이름이 `ocid` 뿐이면, A 가 자기 키로 받아 둔 응답을 키 없는 B 가 그대로 받는다. 칸 이름에 키 원문을 쓰지는 않는다 — 지문만 쓴다.

## 5. 캐릭터 이미지의 width 는 배경 크기다

`/character/basic` 이 주는 `character_image` 를 카드에 넣었더니 캐릭터가 상자의 3할도 못 채웠다. 96×96 판 위에 캐릭터를 그린 그림이라 여백이 많다.

공식 라이브러리의 **한국 서버용 옵션 클래스에는 크기 항목이 아예 없다.**

```python
class CharacterImageOption(BaseCharacterImageOption):
    action: CharacterImageAction = CharacterImageAction.Stand1
    emotion: CharacterImageEmotion = CharacterImageEmotion.Default
    wmotion: CharacterImageWeaponMotion = CharacterImageWeaponMotion.Default
    action_frame: int = 0
    emotion_frame: int = 0
```

해외 서버용 클래스에는 `width`·`height` 가 있는데, 설명을 보면 키워도 소용없다는 걸 알 수 있다.

```python
width(int): Horizontal length (corresponding to the background size, 96 (default) ~ 1000)
```

**배경 크기**다. 캐릭터 자체는 그대로라 판을 키울수록 상대적으로 작아진다. API 로는 확대할 수 없다.

도트 그림이니 CSS 로 키우면 된다.

```html
<div class="w-32 h-32 rounded-xl overflow-hidden grid place-items-center">
  <img src="..." class="w-full h-full object-contain"
       style="image-rendering: pixelated; transform: scale(2.2);" />
</div>
```

`image-rendering: pixelated` 가 있어야 확대해도 뭉개지지 않는다. 남는 판은 상자가 자른다. 1.8·2.2·2.6 을 나란히 그려 보고 2.2 로 정했다 — 2.6 은 발이 바닥에 닿았다.

## 6. API 가 안 주는 값은 표로 채우되, API 로 검산한다

심볼 탭에 "만렙까지 몇 개, 메소 얼마" 를 넣으려는데 응답에는 **지금 레벨의 필요치 하나만** 온다.

```json
{
  "symbol_name": "아케인심볼 : 소멸의 여로",
  "symbol_level": 5,
  "symbol_growth_count": 10,
  "symbol_require_growth_count": 36
}
```

그 위 레벨들은 직접 알아야 한다. 알려진 값을 늘어놓고 차분을 보니 2차식이었다. 아케인은 **n레벨 → n+1레벨에 `n² + 11` 개**다. 1→2 가 12, 19→20 이 372, 1→20 을 다 더하면 2,679 개로 널리 쓰이는 값과 같다.

여기서 그대로 믿고 끝냈으면 틀린 숫자를 내보냈을 것이다. **넥슨이 현재 레벨의 필요치를 같이 주니, 볼 때마다 내 규칙과 맞춰 볼 수 있다.**

```javascript
const mismatch = list.filter((x) => {
  const kind = symbolKind(x.symbol_name);
  if (!kind || x.symbol_level >= SYMBOL_SPEC[kind].max) return false;
  return Number(x.symbol_require_growth_count) !== symbolNeed(x.symbol_level, kind);
});
```

어긋나면 합계를 내지 않고 어긋난 자리를 적는다. 실제로 걸렸다.

```
필요 성장치 규칙이 게임과 어긋납니다(세르니움 Lv.7: 게임 581 vs 계산 60,
아르크스 Lv.6: 게임 444 vs 계산 47, 아르테리아 Lv.5: 게임 325 vs 계산 36).
패치로 바뀐 듯하여 합계를 내지 않았습니다.
```

**어센틱심볼은 규칙이 달랐다.** 아케인 공식을 그대로 쓴 내 잘못이었다. 화면이 찍어 준 세 값으로 다시 2차식을 풀면 `9n² + 20n` 이 나온다.

```
f(5) = 9(25) + 100 = 325   ✅
f(6) = 9(36) + 120 = 444   ✅
f(7) = 9(49) + 140 = 581   ✅
```

| | 공식 | 1→2 | 총 필요 개수 |
|---|---|---|---|
| 아케인 (→20) | `n² + 11` | 12 | 2,679개 |
| 어센틱 (→11) | `9n² + 20n` | 29 | **4,565개** |

잘못된 공식으로는 어센틱이 495개로 나왔다. **9배 넘게 틀린 값이 조용히 나갈 뻔했다.**

> 💡 API 가 안 주는 값을 표로 채울 때, **그 표의 일부를 API 가 검산해 주는지** 먼저 찾아본다. 여기서는 "현재 레벨의 필요치" 가 그 자리였다. 검산할 자리가 있으면 틀린 값이 화면까지 가지 않는다.
>
> 검산할 자리가 아예 없는 값도 있다. 보스 결정석 값은 넥슨이 주지 않아 표로만 채웠는데, 그럴 때는 **모르는 값을 0 으로 세지 않는 것**이 차선이다. 0 으로 더하면 합계가 조용히 작아지고, `값 미등록` 으로 두면 눈에 띈다.

## 덤 — 남의 이미지 서버는 데이터센터 IP 를 막는다

보스 그림은 넥슨이 주지 않아 위키 이미지를 쓰려 했다. 그 서버는 Referer 를 보고 막는데, 제대로 달아도 서버에서는 **403** 이었다.

```json
{"boss":"림보","why":"403 Forbidden"}
```

브라우저인 척도 해 봤다 — 진짜 크롬 User-Agent, `Accept`, `Sec-Fetch-*` 까지. 그래도 막혔다. **집에서는 되는데 서버에서만 안 되는 것**으로 보아 데이터센터 IP 를 막는 쪽이었다. 되받이를 더 손봐서 뚫을 문제가 아니라 길이 막힌 것이다.

그래서 길을 바꿨다. 이미지를 받아서 저장소에 넣고 서버가 그것만 내준다. `static/boss/림보.webp` 처럼 이름 그대로 두고, **폴더를 훑어서** 어떤 보스에 그림이 있는지 알아낸다. 파일을 넣으면 나오고 빼면 안 나온다 — 코드는 안 고친다.

여기서 한 번 더 걸렸다. 그림에 일주일 캐시를 걸어 두었는데(`max-age=604800`), **파일을 고쳐도 주소가 그대로라 브라우저가 옛 그림을 계속 썼다.** 대적자 자리에 칼로스가 일주일간 남아 있었다. 주소에 판 번호를 달아 해결한다.

```python
st = os.stat(path)
tag = f"{fn}:{st.st_mtime_ns}:{st.st_size}"
out[name] = hashlib.sha1(tag.encode("utf-8")).hexdigest()[:8]
```

```
/api/maple/boss-image?boss=대적자&v=e4a0857d
```

파일이 바뀌면 번호가 바뀌고, 번호가 바뀌면 주소가 바뀌어 새로 받아 간다. 번호는 주소를 가르는 데만 쓰고 서버는 보지 않는다 — 옛 주소로 와도 지금 파일을 내준다.

## 확인

붙인 뒤에 이 셋을 본다.

**첫째, 빈 응답이 걸리는가.** 오늘 만든 캐릭터 이름을 넣어 본다. 빈 카드가 아니라 안내 문구가 나와야 한다.

**둘째, 같은 이름을 두 번 물었을 때 넥슨으로 또 나가는가.** 나가면 안 된다. 캐시 적중은 로그나 호출량 화면으로 확인한다.

**셋째, 화면이 조용히 비는 곳이 없는가.** 필드 이름이 어긋나면 오류가 아니라 빈 화면으로만 드러난다. 값이 0 이거나 목록이 비면 **"없는 것"인지 "못 찾은 것"인지** 화면이 구분해 주어야 한다. 우리는 못 찾은 것을 이름까지 적어 내보낸다.

```
값이 없어 합계에서 빠진 보스: 하드 힐라 (표에 없는 보스)
하드 더스크 (표에 있는 난이도: 노멀·카오스)
```

앞은 표에 아예 없는 보스고, 뒤는 보스는 있는데 그 난이도만 없는 것이다. 고쳐야 할 자리가 서로 다르니 구분해서 적는다.

## 정리

- **필드 이름과 값은 문서가 아니라 응답을 보고 맞춘다.** 공식 라이브러리 DTO 도 틀릴 수 있다(`complete_flag` → `clear_flag`). 새 엔드포인트는 응답을 한 번 통째로 찍어 보고 시작한다.
- **못 찾은 것을 조용히 건너뛰지 않는다.** 개수만 세면 합계가 조용히 작아진다. 이름을 적어 내보내면 표의 어느 칸이 비었는지가 바로 드러난다.
- **API 가 검산해 줄 수 있는 자리를 찾는다.** 직접 채운 표나 공식이 있다면, 응답의 어떤 값과 맞춰 볼 수 있는지 먼저 본다. 어긋나면 합계를 내지 말고 어긋난 자리를 적는다. 9배 틀린 값이 화면까지 가지 않는다.
- **키가 여럿이면 캐시 칸도 여럿이다.** 방문자 키를 받는 순간, 칸을 안 가르면 남의 데이터가 다음 사람에게 나간다.
