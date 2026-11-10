![privoxy 로 프록시 두 개 나눠 쓰기 — 사내 도메인은 사내 PC, 나머지는 외부 프록시](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/40-cover-privoxy.jpg)

서버가 IDC 에 있으면 곤란한 순간이 온다. 사내 API 를 부르려면 사내망 안에 있는 PC 를 프록시로 거쳐야 하고, 바깥 서버를 부르려면 회사가 정한 외부 프록시를 거쳐야 한다. 애플리케이션마다 `HTTP_PROXY` 를 바꿔 끼우는 건 답이 아니다. 목적지가 코드 안에서 정해지는 경우도 있으니까.

**프록시를 하나만 바라보게 두고, 그 앞단이 목적지를 보고 알아서 갈라 주면 된다.** 그 앞단을 privoxy 로 만든다.

> 📌 여기서 말하는 프록시는 **나가는 쪽을 대신하는** 포워드 프록시다. 받는 쪽을 대신하는 리버스 프록시와는 방향이 반대인데, 이름이 비슷해 헷갈리기 쉽다. 그 차이는 [nginx 처음 만지기](https://autops.run/nginx-basics/)에서 표로 정리했다.

| 목적지 | 거쳐 가는 곳 |
|---|---|
| `*.corp.example.com` (사내 도메인) | 사내망 PC 의 프록시 — `10.10.10.10:8118` |
| `*.intra.example.com` (사내 도메인) | 사내망 PC 의 프록시 — `10.10.10.10:8118` |
| 그 외 전부 | 회사 외부 프록시 — `proxy.example.com:3128` |

애플리케이션은 `http://127.0.0.1:8118` 하나만 바라본다.

> 📌 이 글의 IP 와 도메인은 전부 예시다. `10.10.10.10`, `corp.example.com` 자리에 각자의 값을 넣는다.

## privoxy 가 뭔가

privoxy 는 캐시하지 않는 HTTP 프록시다. 원래는 광고와 추적기를 걸러 내는 필터링 프록시로 알려져 있지만, 여기서 쓰는 건 그 기능이 아니라 **`forward` 지시자**다.

`forward` 는 "이 목적지로 가는 요청은 저 프록시에 넘겨라" 를 한 줄로 적게 해 준다. 목적지 패턴을 여러 개 적을 수 있으니, 규칙 몇 줄로 프록시 여러 개를 갈라 쓸 수 있다. squid 로도 되지만 `cache_peer` 와 ACL 을 엮어야 하고, 캐시가 필요 없는 일에 캐시 서버를 세우게 된다. privoxy 는 설정 파일 한 개에 세 줄이면 끝난다.

- 기본 포트는 **8118**
- 설정 파일은 데비안·우분투 기준 **`/etc/privoxy/config`**
- HTTP 도 HTTPS(CONNECT) 도 같은 규칙을 탄다

## 준비물

- IDC 서버 (여기서는 우분투 24.04) 와 sudo 권한
- 사내망 PC 에 이미 떠 있는 프록시의 주소와 포트
- 회사 외부 프록시의 주소와 포트
- 사내 도메인 목록 — 이게 제일 중요하다. 여기 빠진 도메인은 외부 프록시로 나가서 타임아웃이 난다

설정 자체는 10분이면 되고, 사내 도메인을 추려 내는 데 시간이 더 걸린다.

## 1. 설치한다

```bash
sudo apt-get install -y privoxy
privoxy --version
```

```
Privoxy version 3.0.34 (https://www.privoxy.org/)
```

## 2. 기본 프록시를 정한다

`/etc/privoxy/config` 맨 아래에 규칙을 붙인다. 먼저 "그 외 전부" 부터.

```
# 기본: 외부로 나가는 모든 요청은 회사 외부 프록시로
forward /   proxy.example.com:3128
```

`forward` 는 `forward 목적지패턴 부모프록시:포트` 꼴이다. `/` 는 모든 목적지를 뜻한다. 이 한 줄만 있으면 privoxy 는 그냥 외부 프록시 앞에 붙은 얇은 껍데기다.

## 3. 사내 도메인만 갈라낸다

그 아래에 사내 도메인 규칙을 **더 나중에** 적는다.

```
# 기본: 외부 프록시
forward /   proxy.example.com:3128

# 사내 도메인은 사내망 PC 의 프록시로
forward .corp.example.com/    10.10.10.10:8118
forward .intra.example.com/   10.10.10.10:8118
```

패턴 앞의 점이 핵심이다.

| 패턴 | 걸리는 것 | 안 걸리는 것 |
|---|---|---|
| `corp.example.com/` | `corp.example.com` 만 | `git.corp.example.com` |
| `.corp.example.com/` | `corp.example.com` 과 모든 하위 도메인 | `notcorp.example.com` |

`.corp.example.com/` 은 도메인 자신과 하위 도메인을 모두 잡되, 문자열만 비슷한 `notcorp.example.com` 은 잡지 않는다. 실제로 확인해 본 결과다.

```
www.google.com               -> 외부 프록시
corp.example.com             -> 사내 프록시
git.corp.example.com         -> 사내 프록시
intra.example.com            -> 사내 프록시
notcorp.example.com          -> 외부 프록시
```

> 📌 HTTPS 도 그대로 따라간다. privoxy 는 `CONNECT` 요청도 같은 `forward` 규칙으로 판단해서 해당 부모 프록시에 넘긴다. 부모 프록시 쪽 로그에 `CONNECT corp.example.com:443` 과 `CONNECT www.google.com:443` 이 각각 다른 프록시에 찍히는 것으로 확인했다.

## 4. 규칙 순서 — 마지막에 맞는 것이 이긴다

여기서 한 번 크게 헤맸다. 보기 좋으라고 구체적인 규칙을 위에, 포괄 규칙을 아래에 적었더니 **사내 도메인까지 전부 외부 프록시로 나갔다.**

```
forward .corp.example.com/  10.10.10.10:8118
forward /                   proxy.example.com:3128
```

이렇게 두고 확인하면 이렇게 된다.

```
corp.example.com     -> 외부 프록시
www.google.com       -> 외부 프록시
```

privoxy 의 `forward` 규칙은 **위에서부터 순서대로 검사하고, 마지막으로 맞은 규칙을 쓴다.** `/` 는 모든 요청에 맞으므로, 맨 아래에 두면 앞의 규칙을 전부 덮어 버린다.

**포괄 규칙(`/`)을 맨 위에, 구체적인 예외를 그 아래에 적는다.** 방화벽 규칙과 반대 감각이라 손이 먼저 반대로 간다.

> ⚠️ 이 순서 문제는 오류를 내지 않는다. 설정은 멀쩡히 뜨고, 요청만 조용히 엉뚱한 데로 나간다. 사내 API 만 타임아웃이 나는데 설정 파일은 맞아 보인다면 여기부터 본다.

## 5. 어떤 목적지는 프록시 없이 직접 보낸다

부모 프록시 자리에 점 하나(`.`)를 쓰면 "프록시를 거치지 말고 직접 연결하라" 가 된다. 서버 자신이 직접 닿을 수 있는 대역에 쓴다.

```
forward /                     proxy.example.com:3128
forward .corp.example.com/    10.10.10.10:8118
forward .direct.example.com/  .
```

이 규칙에 걸린 요청은 어느 부모 프록시 로그에도 남지 않는다. 대신 privoxy 가 스스로 DNS 를 찾고 붙는다. 못 붙으면 privoxy 가 502 페이지를 돌려주는데, 본문에 `No such domain` 처럼 이유가 적혀 있어서 어디서 막혔는지 바로 보인다.

## 6. 다른 장비에서 쓰게 연다

데비안·우분투 기본 설정은 루프백만 듣는다.

```
listen-address  127.0.0.1:8118
listen-address  [::1]:8118
```

같은 서버 안에서만 쓸 거면 그대로 두는 게 안전하다. 다른 장비도 이 프록시를 쓰게 하려면 주소를 열고, **반드시 접근 제어를 같이 건다.**

```
listen-address  0.0.0.0:8118

permit-access   10.20.0.0/16
```

`permit-access` 를 **한 줄이라도 쓰는 순간 기본값이 거부로 바뀐다.** 그래서 "나머지는 다 막는다" 를 따로 적을 필요가 없다.

> ⚠️ 습관대로 `deny-access 0.0.0.0/0` 을 뒤에 덧붙이면 안 된다. ACL 도 `forward` 와 마찬가지로 **마지막에 맞은 줄이 이기기 때문에**, 허용해 둔 대역까지 그 줄에 걸려 전부 막힌다. 실제로 그렇게 두고 붙어 보면 연결이 그냥 끊긴다.
>
> ``` curl -m 5 -x 127.0.0.1:8118 http://www.google.com/ curl: (56) Recv failure: Connection reset by peer
> ```

> ⚠️ `listen-address 0.0.0.0:8118` 만 열고 `permit-access` 를 빼면 그 네트워크의 누구나 이 서버를 통해 사내망과 외부망 양쪽으로 나갈 수 있는 열린 프록시가 된다. 두 줄은 한 세트다.

## 7. 필터링을 끌지 정한다

privoxy 는 기본 설정에 광고·추적기 차단 규칙이 들어 있다.

```
actionsfile match-all.action
actionsfile default.action
actionsfile user.action
filterfile default.filter
```

사람이 쓰는 웹 브라우징이면 그대로 두면 되고, **서버 대 서버 API 호출을 중계하는 용도라면 끄는 쪽이 낫다.** 응답 본문을 고치는 필터가 JSON 을 건드리는 사고를 피할 수 있고, 무엇보다 문제가 났을 때 원인을 좁히기 쉽다. 위 네 줄을 주석 처리하면 privoxy 는 순수한 라우팅 프록시가 된다.

## 8. 적용하고 클라이언트를 붙인다

설정을 고쳤으면 먼저 문법을 검사한다.

```bash
sudo privoxy --config-test /etc/privoxy/config
echo "exit=$?"
```

```
exit=0
```

아무것도 출력하지 않고 0 으로 끝나면 통과다. 그다음 재시작한다.

```bash
sudo systemctl restart privoxy
sudo systemctl status privoxy --no-pager
```

클라이언트는 이제 privoxy 하나만 가리키면 된다.

```bash
export HTTP_PROXY=http://127.0.0.1:8118
export HTTPS_PROXY=http://127.0.0.1:8118
export NO_PROXY=localhost,127.0.0.1
```

> 💡 `HTTPS_PROXY` 에도 `http://` 를 쓴다. `https://` 가 아니다. 프록시까지 가는 구간은 평문 HTTP 이고, 그 위에서 `CONNECT` 로 터널을 뚫는 구조다.

## 확인

### 규칙이 어떻게 적용되는지 물어본다

privoxy 는 자기 자신에게 물어볼 수 있는 페이지를 갖고 있다. 어떤 URL 이 어느 프록시로 나가는지 **요청을 실제로 보내지 않고** 알려 준다.

```bash
curl -s -x 127.0.0.1:8118 \
  "http://config.privoxy.org/show-url-info?url=https://git.corp.example.com/" \
  | sed -e 's/<!--.*-->//' -e 's/<[^>]*>//g' | grep -i "forwarded through"
```

```
forwarded through HTTP-proxy 10.10.10.10:8118
```

외부 주소로 바꿔 물으면 다른 답이 나온다.

```
forwarded through HTTP-proxy proxy.example.com:3128
```

**규칙을 고칠 때마다 이걸 먼저 돌린다.** 사내 도메인 하나, 외부 도메인 하나만 확인해도 순서 실수는 거의 다 걸린다.

### 실제로 나가는 것도 본다

```bash
curl -s -o /dev/null -w "%{http_code}\n" -x 127.0.0.1:8118 https://git.corp.example.com/
curl -s -o /dev/null -w "%{http_code}\n" -x 127.0.0.1:8118 https://www.google.com/
```

둘 다 200 이면 양쪽 길이 다 살아 있는 것이다. 한쪽만 실패하면 그 방향 규칙만 보면 된다.

### 로그로 확인한다

설정에 `debug 1` 을 켜면 요청마다 목적지가 남는다.

```
2026-09-09 03:18:25.971 7f7a065ff6c0 Request: www.google.com/
2026-09-09 03:18:25.978 7f7a065ff6c0 Request: corp.example.com/
2026-09-09 03:18:25.985 7f7a065ff6c0 Request: git.corp.example.com/
```

여기 찍히는데 응답이 안 오면 privoxy 는 제 일을 한 것이고, 문제는 부모 프록시 너머에 있다. **아예 안 찍히면 클라이언트가 프록시를 안 타고 있다** — `NO_PROXY` 나 애플리케이션 자체 설정을 본다.

## 정리

- `forward` 세 줄이면 목적지에 따라 프록시를 갈라 태울 수 있다. 애플리케이션은 프록시 하나만 알면 된다.
- **포괄 규칙(`/`)을 맨 위에 둔다.** 마지막에 맞은 규칙이 이기기 때문에, 아래에 두면 모든 예외를 조용히 덮는다. 이 글에서 유일하게 오류 없이 틀리는 지점이다.
- 고칠 때마다 `show-url-info` 로 물어본다. 요청을 보내지 않고 판정만 확인하니 사내망이 안 열려 있는 시간에도 검증할 수 있다.
- 밖으로 여는 순간 `permit-access` 는 선택이 아니다. 프록시 두 개를 한 번에 쓸 수 있는 문이 열리는 것이다. 그리고 여기서도 마지막 줄이 이긴다 — `deny-access` 를 뒤에 덧붙이지 않는다.
