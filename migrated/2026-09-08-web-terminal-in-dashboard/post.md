![대시보드에 웹 터미널 붙이기 — Flask · xterm.js, 그리고 회사망이 WebSocket 을 막을 때](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/20-terminal-screen.png)

서버에 뭔가 확인할 일이 생길 때마다 노트북을 열고 SSH 를 붙는 게 번거로웠다. 대시보드는 이미 폰에서도 열리는데, 거기서 `docker ps` 한 번 치자고 매번 터미널 앱을 찾는 게 아깝다.

그래서 대시보드 안에 터미널을 넣었다. 만들면서 세 번 막혔고, 그 세 번이 이 글의 대부분이다.

> 📌 이 글은 브라우저에서 서버 셸을 여는 이야기다. 터미널 앱에서 키로 접속하는 쪽은 [SSH 키로 비밀번호 없이 서버 접속하기](https://autops.run/ssh-key-login/)에 있다. 같은 대시보드에 달리기 기록이 저절로 쌓이게 만든 이야기는 [애플 건강 앱으로 달리기 자동 기록하기](https://autops.run/healthkit-running-automation/)에 있다.

![대시보드 사이드바에 '서버 → 터미널' 항목이 생겼고, 오른쪽에 검은 터미널 카드가 열려 있다. 상단 상태줄에 '연결됨 · 폴링 · 454ms / 망 38ms' 와 예측·폴링·지우기·재연결·잠금 버튼이 보인다](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/20-terminal-screen.png)

## 무엇을 만드는가

| 항목 | 결정 |
|---|---|
| 화면 | xterm.js 를 대시보드 페이지에 얹는다 |
| 전송 | WebSocket(flask-sock). 막히면 HTTP 롱폴링으로 자동 전환 |
| 셸이 도는 곳 | **호스트** — 컨테이너에서 전용 SSH 키로 들어간다 |
| 인증 | 기존 카카오 로그인 + 터미널 전용 패스코드 |

셸이 도는 곳을 고르는 게 첫 갈림길이었다. 후보는 셋이다.

- **컨테이너 안** — 가장 안전하지만 `python:3.12-slim` 안에는 파이썬밖에 없다. `docker compose` 도 없고 배포 디렉터리도 안 보인다. 할 수 있는 일이 거의 없다.
- **docker.sock 마운트** — 설정은 제일 쉽다. 그런데 docker 소켓은 사실상 호스트 root 다. 컨테이너가 뚫리면 호스트 전체가 넘어간다.
- **호스트로 SSH** — 컨테이너에 `openssh-client` 와 전용 키를 넣고 호스트로 들어간다. 키 하나가 어느 계정으로 들어가는지는 호스트의 `authorized_keys` 가 정하므로, **권한 범위를 그 계정으로 묶어 둘 수 있다.**

세 번째를 골랐다.

> ⚠️ 이건 혼자 쓰는 대시보드라서 성립하는 선택이다. 웹에서 셸이 열린다는 건 세션 하나가 곧 서버 하나라는 뜻이다. 여러 사람이 쓰는 서비스라면 이 글을 그대로 따라 하면 안 된다.

## 준비물

- Flask 앱과 nginx 리버스 프록시가 이미 돌고 있는 상태
- 호스트에 SSH 로 들어갈 수 있는 배포 계정
- 대략 두 시간. 막히는 부분까지 포함하면 반나절.

## 1. 의존성 — 두 줄

```
flask-sock>=0.7.0
```

`flask-sock` 은 Flask 라우트처럼 생긴 WebSocket 핸들러를 만들어 준다. 개발 서버(Werkzeug)에서도 그대로 돈다.

호스트로 나가려면 컨테이너에 ssh 클라이언트가 있어야 한다.

```dockerfile
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssh-client \
 && rm -rf /var/lib/apt/lists/*
```

## 2. PTY 를 띄우고 WebSocket 에 잇는다

핵심은 `pty.fork()` 다. 자식은 셸(여기서는 `ssh`)이 되고, 부모는 그 터미널의 파일 디스크립터를 쥐고 읽고 쓴다.

```python
def _terminal_spawn():
    cmd = _terminal_command()          # ssh -tt -i <키> user@host
    pid, fd = pty.fork()
    if pid == 0:
        os.environ["TERM"] = "xterm-256color"
        os.execvp(cmd[0], cmd)
        os._exit(1)
    return pid, fd
```

읽기는 별도 스레드에서 돌리고, 브라우저로는 **이진 프레임**으로 그대로 보낸다.

```python
data = os.read(fd, 65536)
ws.send(data)                          # 셸 출력 = 이진 프레임
ws.send(json.dumps({"t": "exit"}))     # 제어 메시지 = 텍스트 프레임
```

이렇게 나눈 이유가 있다. 출력을 문자열로 보내면 셸이 뱉은 JSON 비슷한 문장을 제어 메시지로 오해할 수 있고, UTF-8 이 읽기 경계에서 잘리면 글자가 깨진다. 이진 프레임으로 보내면 xterm.js 가 알아서 이어 붙인다.

창 크기는 반드시 PTY 에 전달한다. 이걸 빼면 `vim` 이나 `less` 가 깨진다.

```python
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
```

## 3. 문을 네 겹으로 잠근다

셸은 곧 서버 전체다. 그래서 하나라도 없으면 `/terminal` 이 404 가 되도록 했다.

1. `DASHBOARD_TERMINAL_ENABLED` 가 켜져 있어야 한다 — **기본은 꺼짐**
2. `DASHBOARD_TERMINAL_PASSCODE` 가 설정되어 있어야 한다 — 없으면 아예 안 열림
3. 카카오 로그인 + 터미널 전용 ID 목록에 들어 있어야 한다
4. 그 위에 패스코드를 한 번 더 넣는다 (기본 30분 유지)

![터미널 페이지의 잠금 화면. 자물쇠 아이콘 아래 '터미널 잠금 해제 — 로그인과 별개인 패스코드가 필요합니다' 와 패스코드 입력칸이 있다](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/21-terminal-unlock.png)

4번이 있는 이유는 세션 쿠키 하나가 셸이 되는 걸 막기 위해서다. 패스코드는 5회 틀리면 15분 잠기고, nginx 도 앞에서 분당 6회로 조인다. 열고 닫은 기록과 실패는 컨테이너 로그와 `/data/terminal.log` 양쪽에 JSON 한 줄씩 남는다.

```json
{"ts":"2026-09-08T11:28:41+00:00","event":"open","kakao_id":1,"transport":"http","target":"container"}
{"ts":"2026-09-08T11:28:41+00:00","event":"close","kakao_id":1,"transport":"http","seconds":20}
```

## 4. nginx — 여기서 한 번 걸린다

기존 프록시 설정을 그대로 두면 WebSocket 은 **연결조차 안 된다.** 기본 프록시는 HTTP/1.0 이라 Upgrade 가 죽기 때문이다. 그 경로만 따로 뺀다.

```nginx
location = /api/terminal/ws {
    proxy_pass http://dashboard:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade    $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_buffering off;
    proxy_read_timeout 3600s;      # 가만히 둔 세션이 끊기지 않게
}
```

앱에서 25초마다 ping 을 보내도록 해 두면 유휴 타임아웃에 걸리지 않는다.

```python
app.config["SOCK_SERVER_OPTIONS"] = {"ping_interval": 25}
```

## 5. 컨테이너에서 호스트로 나가는 길

compose 에 두 줄을 넣는다. 하나는 호스트로 가는 이름, 하나는 키를 읽기 전용으로 물리는 것.

```yaml
    volumes:
      - ./secrets:/run/secrets:ro
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

키는 배포할 때 **서버에서 만든다.** GitHub 에는 올라가지 않는다.

```bash
if [ ! -f "$TERMINAL_DIR/terminal_key" ]; then
  ssh-keygen -t ed25519 -N '' -C 'dashboard-terminal' -f "$TERMINAL_DIR/terminal_key"
fi
TERMINAL_PUB=$(cat "$TERMINAL_DIR/terminal_key.pub")
if ! grep -qF "$TERMINAL_PUB" ~/.ssh/authorized_keys; then
  echo "$TERMINAL_PUB" >> ~/.ssh/authorized_keys
fi
```

ssh 옵션은 이렇게 준다. `BatchMode=yes` 가 중요하다 — 키가 거부당했을 때 비밀번호를 물으며 매달려 있지 않고 바로 끝난다.

```
ssh -tt -i /run/secrets/terminal_key \
    -o StrictHostKeyChecking=accept-new \
    -o UserKnownHostsFile=/data/terminal_known_hosts \
    -o BatchMode=yes -o ServerAliveInterval=30 <계정>@host.docker.internal
```

## 막힘 ①: 배포는 성공인데 메뉴가 없다

값을 다 넣고 배포했는데 `/terminal` 이 404 였다. 배포 로그는 초록불이고, 앱도 멀쩡히 떠 있다.

원인은 GitHub Actions 였다. 워크플로가 `vars.DASHBOARD_TERMINAL_ENABLED` 로 읽는데 값을 **Secrets 탭**에 넣어 두었다. `vars` 로는 안 보이니 빈 문자열이 되고, 켜짐 플래그가 꺼져 있으니 터미널 준비 블록이 통째로 건너뛰어졌다.

진짜 문제는 그게 **로그에 아무 흔적도 안 남겼다**는 점이다. 켜지지도 않고, 왜 안 켜졌는지도 말하지 않는다. 그래서 상태를 한 줄 찍게 했다.

```bash
if [ -n "${DASHBOARD_TERMINAL_PASSCODE:-}" ]; then _pc=설정됨; else _pc=없음; fi
echo "▶ 터미널 설정: ENABLED='${DASHBOARD_TERMINAL_ENABLED:-(빈 값)}' → $TERMINAL_ON, PASSCODE=$_pc"
```

다음 배포에서 이렇게 찍혔다.

```
▶ 터미널 설정: ENABLED='***' → ***, PASSCODE=설정됨
▶ 터미널용 SSH 키 생성 (/home/…/dashboard-deploy/secrets/terminal_key)
▶ 터미널 키를 authorized_keys 에 등록
```

`ENABLED='***'` — 값이 별표로 가려져 나온다. GitHub 은 **시크릿 값만** 마스킹하니, 이 한 줄이 "Secrets 탭에 들어 있다"는 자백이었다.

> 💡 값이 `1` 인 시크릿을 만들면 그 뒤로 **모든 워크플로 로그에서 숫자 1이 가려진다.** 실제로 같은 로그에 `mariadb:***`, `Drone SSH version ***.8.2` 가 찍혔다. 켜고 끄는 플래그는 Secrets 가 아니라 Variables 에 둔다.

값을 어느 탭에 넣든 읽히게 고쳤다.

```yaml
DASHBOARD_TERMINAL_ENABLED: ${{ vars.DASHBOARD_TERMINAL_ENABLED || secrets.DASHBOARD_TERMINAL_ENABLED }}
```

## 막힘 ②: 회사망에서는 응답이 아예 없다

집과 휴대폰에서는 잘 되는데 회사에서 열면 아무 반응이 없었다. 오류도 없다. 같은 주소가 모바일 데이터로는 열리니 서버 문제가 아니다 — **회사망 프록시가 Upgrade 요청을 삼키는 것**이다.

이런 프록시는 흔하다. 그리고 삼켜지면 브라우저에 `onerror` 조차 오지 않아서, 화면은 영원히 "연결 중"에 머문다. 그래서 시간으로 끊고 다른 길로 넘어가게 했다.

```javascript
const guard = setTimeout(function () { fail('응답 없음'); }, 5000);
```

넘어갈 다른 길은 **HTTP 롱폴링**이다. SSE 가 아니라 롱폴링을 고른 이유는, 요청 하나가 응답 하나로 끝나야 중간에서 버퍼링을 하든 말든 화면이 안 멈추기 때문이다. 프록시 눈에는 그냥 평범한 XHR 이다.

![두 경로를 비교한 그림. 위쪽 '막힌 길'은 브라우저의 Upgrade 요청이 회사망 프록시에서 X 로 끊기고, 아래 '넘어간 길'은 브라우저부터 호스트 셸까지 평범한 XHR 로 이어지며 출력·입력 두 갈래로 나뉜다](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/23-transport-diagram.png)

서버는 셸마다 출력 버퍼(256KB)와 "지금까지 나온 총 바이트 수"를 들고 있고, 클라이언트는 **자기가 받은 지점부터** 달라고 한다.

```python
def pull(self, seq, timeout):
    """seq 이후의 출력을 기다렸다 돌려준다. (어디서부터인지, 바이트, 끝났는지)"""
    with self.cv:
        while True:
            start = max(seq, self.base)
            if start < self.base + len(self.buf):
                return start, bytes(self.buf[start - self.base:]), self.exited
            ...
            self.cv.wait(left)
```

응답에 "어디서부터"(`from`)를 같이 실어 보내는 게 요령이다. 끊겼다 다시 물어도 겹치는 앞부분만 잘라내면 되니, 재시도가 출력을 지우거나 두 번 쓰지 않는다.

## 막힘 ③: 폴링이 484ms — 절반은 내가 만든 것이었다

폴링으로는 붙는데 타이핑이 답답했다. 남은 지연이 망 때문인지 내 구조 때문인지 가르려고 상태줄에 두 숫자를 띄웠다 — 입력 왕복과, 작은 요청 하나가 갔다 오는 순수 망 왕복(`/api/version`).

```
(폴링 · 484ms)
```

처음 구조는 이랬다. 키를 누르면 대기 중이던 롱폴링을 `abort` 로 끊고, 입력을 실어 새 요청을 띄운다. 왕복을 아끼는 영리한 방법처럼 보였는데 정반대였다.

**HTTP/1.1 로 내려오는 프록시 뒤에서 요청 취소는 곧 연결 끊기다.** 글자 하나마다 TCP 와 TLS 를 새로 맺고 있었다. 왕복 한 번이면 될 일에 서너 번이 든 셈이다.

끊지 않는 구조로 바꿨다.

| | 하는 일 | 성질 |
|---|---|---|
| ① 출력 | 늘 올라가 대기하는 롱폴링(20초) | 절대 취소하지 않는다 — 연결이 계속 데워져 있다 |
| ② 입력 | 글자만 보내는 짧은 요청 | 기다리지 않고 즉시 반환 |

메아리는 **이미 올라가 대기 중인** ①이 받아 내려온다. 그래서 "입력이 서버에 닿는 시간 + 메아리가 내려오는 시간" = 정확히 한 왕복이고, 악수 비용이 없다. ②는 한 번에 하나만 띄워 순서가 섞이지 않게 한다.

고친 뒤 숫자는 이렇게 나왔다.

```
(폴링 · 442ms / 망 589ms)
```

입력 왕복이 순수 망 왕복보다 **빠르다.** 입력 요청은 데워진 연결을 재사용하고, 30초에 한 번 나가는 측정용 요청은 연결을 새로 맺기 때문이다. 전송 구조에서 짜낼 게 없다는 뜻이기도 했다 — 회사 프록시가 요청 하나당 0.5초를 먹고 있었다.

## 마지막 한 수 — 로컬 에코

여기서부터는 왕복을 줄이는 게 아니라 **기다리지 않는** 문제다.

원래 터미널은 내가 친 글자를 브라우저가 그리지 않는다. 셸이 되돌려준 것을 그린다 — 비밀번호처럼 일부러 안 보여주는 자리가 있기 때문이다. 그 순서를 뒤집는다. 먼저 그려 놓고, 진짜 메아리가 오면 걷어내고 진짜를 쓴 뒤, 아직 메아리가 안 온 나머지만 다시 그린다. mosh 가 위성 인터넷에서 쓰는 방법이다.

![로컬 에코가 없을 때와 있을 때를 비교한 그림. 없을 때는 0ms 에 키를 누르고 약 500ms 뒤에야 글자가 보이고, 있을 때는 0ms 에 밑줄 친 글자가 바로 그려진 뒤 약 500ms 에 진짜와 맞바뀐다](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/24-local-echo.png)

```javascript
let k = 0;
while (k < predicted.length && k < bytes.length && bytes[k] === predicted.charCodeAt(k)) k++;
erasePrediction();          // 그려 둔 예측을 걷어내고
term.write(bytes);          // 진짜를 쓴 뒤
predicted = predicted.slice(k);
drawPrediction(predicted);  // 아직 안 온 나머지만 다시 그린다
```

이 순서 덕분에 `ls` 를 쳤는데 `l` 만 도착한 순간에도 화면이 뒷걸음질치지 않는다.

짐작이 화면을 망치지 않도록 조건을 좁혔다.

- 눈에 보이는 **한 글자**일 때만 (제어문자·조합문자는 제외)
- 줄 끝에 닿기 전까지만 — 줄바꿈이 생기면 지우기가 어긋난다
- 커서 오른쪽이 비어 있을 때만 — 줄 가운데를 고치는 중이면 위험하다
- `vim`·`less` 같은 대체 화면 밖에서만 (`\x1b[?1049h` 로 감지)
- 연달아 두 번 빗나가면 메아리가 없는 자리로 보고 3초 쉰다

> 📌 "한 번 빗나가면 쉰다"로 만들었더니 프롬프트 조각이 끼어드는 정상 상황에서도 예측이 꺼졌다. 한 번쯤은 그냥 다른 출력이 먼저 온 것일 수 있어서, **연속 두 번**을 조건으로 바꿨다.

## 확인

이 기능은 눈으로 봐야 아는 게 많아서, 헤드리스 크로미움으로 실제 페이지를 몰았다. 회사망을 흉내 내려고 터미널 요청마다 250ms 를 얹은 채로 돌린다.

```python
def slow(route):
    time.sleep(0.25)
    route.continue_()
page.route("**/api/terminal/http/io", slow)
```

확인한 것들.

```
✅ 친 즉시 화면에 나타남
✅ 메아리 뒤에도 한 번만 보임 — 1번
✅ 명령 결과가 새 줄에 찍힘
✅ BADD → BAD
✅ 대체 화면임을 알아챔
✅ 대체 화면에서는 짐작하지 않음
✅ 예측이 꺼짐 / 메아리로는 나타남
```

처음엔 "화면에 글자가 보이는가"로 검사했더니 회차마다 결과가 흔들렸다. 메아리가 빨리 오면 예측 없이도 보이기 때문이다. **예측 상태 자체를 읽는 검사**로 바꾸니 3회 연속 같은 결과가 나왔다.

```javascript
window.__terminal = {
  get predicted() { return predicted; },
  get altScreen() { return altScreen; },
  get pausedFor() { return Math.max(0, predictPauseUntil - Date.now()); },
};
```

이 과정에서 실제 버그도 하나 잡았다. 대체 화면으로 넘어갈 때 이미 그려 둔 예측을 걷어내지 않고 버려서, 화면에 글자 자국이 남았다.

서버 쪽은 따로 잰다. 입력 요청이 즉시 돌아오는지, 메아리가 대기 중인 롱폴링으로 오는지.

```
입력 요청이 돌아오는 데      : 4ms
메아리가 롱폴링으로 오기까지 : 4ms
```

배포 뒤에는 로그로 확인한다.

```bash
docker logs dashboard-app | grep terminal
cat /data/terminal.log
```

## 정리

- **셸을 어디서 돌릴지가 첫 결정이다.** docker.sock 은 쉽지만 호스트 root 를 통째로 내준다. 전용 SSH 키는 한 단계 더 걸리는 대신 권한을 계정 하나로 묶는다.
- **조용히 꺼지는 기능은 고장보다 나쁘다.** 배포가 초록불인데 아무것도 없으면 디버깅할 실마리가 없다. 켜지든 안 켜지든 상태를 한 줄 찍게 해 두면 다음 배포가 스스로 답을 말해 준다.
- **요청을 취소하는 게 늘 이득은 아니다.** 프록시 뒤에서 abort 는 연결 끊기이고, 다시 맺는 값이 아낀 왕복보다 비쌌다. 연결은 데워 두고 요청을 나누는 쪽이 빨랐다.
- **왕복을 못 줄이면 기다리지 않으면 된다.** 로컬 에코는 망을 못 고치는 자리에서 체감을 바꾸는 거의 유일한 수단이다.
