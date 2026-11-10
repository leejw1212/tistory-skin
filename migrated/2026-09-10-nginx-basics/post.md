![nginx 처음 만지기 — 리버스 프록시가 무엇이고 설정은 어떻게 생겼나](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/47-cover-nginx-basics.jpg)

앱을 하나 띄웠다. 잘 돌아간다. 그런데 주소가 이렇다.

```
http://192.168.0.10:5000
```

남한테 알려주기도 뭣하고, 도메인을 붙이고 싶고, HTTPS 도 걸고 싶다. 서비스를 하나 더 올리면 `:5001`, `:5002` 로 늘어난다. **여기서 앞에 세우는 것이 nginx 다.**

이 글은 `location` 이나 `proxy_pass` 를 처음 보는 사람을 위한 것이다. 실제로 띄워 확인한 결과를 붙여 가며 짚는다.

> 📌 이미 nginx 를 쓰고 있는데 WebSocket 이 안 되거나 접속 IP 가 전부 같게 찍힌다면, 이 글보다 [nginx 를 앞에 세우는 이유](https://autops.run/nginx-reverse-proxy/)가 맞다. 이 글은 그 앞 단계다.

## 리버스 프록시가 뭔가

프록시는 **중간에서 대신 해 주는 것**이다. 누구를 대신하느냐로 둘이 갈린다.

| | 대신하는 쪽 | 설정하는 사람 |
|---|---|---|
| 포워드 프록시 | **나가는 나**를 대신한다 | 내가 내 브라우저에 설정한다 |
| 리버스 프록시 | **받는 서버**를 대신한다 | 서버 운영자가 설정한다 |

회사에서 인터넷 나갈 때 거치는 프록시가 앞의 것이다. 내가 설정하고, 내가 그 존재를 안다.

**리버스 프록시는 반대다.** 방문자는 그냥 `example.com` 에 접속할 뿐, 그 뒤에 서버가 몇 대인지 어떤 포트를 쓰는지 모른다. 그걸 알 필요가 없게 만드는 것이 리버스 프록시가 하는 일이다.

```
방문자 ──▶ nginx ──▶ 내 앱 (:5000)
        (443)      (밖에서 안 보임)
```

앱의 포트는 이제 밖으로 열지 않는다. **밖에서 들어오는 문은 nginx 하나뿐이다.**

## 설정 파일은 어디 있고 어떻게 생겼나

데비안·우분투 기준이다.

| 경로 | 무엇 |
|---|---|
| `/etc/nginx/nginx.conf` | 전체 기본 설정 |
| `/etc/nginx/conf.d/*.conf` | **여기에 내 설정을 넣는다** |
| `/var/log/nginx/access.log` | 들어온 요청 기록 |
| `/var/log/nginx/error.log` | 잘못된 것 기록 |

구조는 세 겹으로 중첩된다. 이것만 알면 남의 설정도 읽힌다.

```nginx
http {                          # 웹 전체에 걸리는 설정

    server {                    # 주소(도메인) 하나를 맡는 단위
        listen 443 ssl;
        server_name example.com;

        location / {            # 그 주소 안에서 경로별 처리
            proxy_pass http://127.0.0.1:5000;
        }
    }
}
```

- **`http`** — 맨 바깥. 로그 형식, 압축 같은 공통 설정
- **`server`** — 주소 하나를 맡는다. 도메인이 늘면 이 블록이 는다
- **`location`** — 경로별 처리. `/`, `/api/`, `/static/` 처럼 나눈다

`conf.d/*.conf` 에 파일을 만들 때는 **`server` 블록부터 쓴다.** `http` 는 이미 열려 있고, 그 안으로 자동으로 들어간다.

## 가장 작은 리버스 프록시

이게 전부다.

```nginx
server {
    listen 80;
    server_name example.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
    }
}
```

**80 으로 들어온 것을 5000 으로 넘긴다.** 방문자는 `:5000` 을 볼 일이 없다.

실제로 띄워서 백엔드가 무엇을 받는지 보면 이렇다.

```
$ curl -s http://127.0.0.1:8080/
request : GET / HTTP/1.0
Host    : 127.0.0.1:5001
```

> ⚠️ 여기서 벌써 이상한 게 보인다. **백엔드가 보는 `Host` 가 방문자가 요청한 이름이 아니라 프록시가 접속한 주소다.** 이대로 두면 앱이 만드는 링크가 내부 주소로 나가는 등 조용히 망가진다. 고치는 법은 [실전 글의 3장](https://autops.run/nginx-reverse-proxy/)에 있다. 지금은 "이런 게 있다"만 알아 둔다.

## server 블록이 여럿일 때 — 무엇이 고르나

포트는 하나인데 도메인은 여럿이다. nginx 는 **요청의 `Host` 헤더**를 보고 고른다.

```nginx
server { listen 80; server_name blog.example.com; ... }
server { listen 80; server_name dash.example.com; ... }
```

띄워서 `Host` 를 바꿔 가며 불러 보면 이렇다.

```
Host: blog.example.com     → 블로그
Host: dash.example.com     → 대시보드
Host: 전혀.모르는.이름       → 블로그
```

**세 번째 줄이 중요하다.** 어느 `server_name` 에도 안 맞으면 nginx 는 거절하지 않고 **맨 위 블록**으로 보낸다.

> ⚠️ 그래서 도메인을 아직 안 붙인 IP 로 접속해도 첫 번째 사이트가 나온다. 관리자 페이지가 맨 위에 있으면 의도치 않게 노출된다. 명시적으로 받고 싶으면 `listen 80 default_server;` 를 붙인 블록을 따로 두고 거기서 444 나 안내 페이지로 처리한다.

## location 은 어떻게 고르나

`location` 이 여러 개면 **위에서부터가 아니다.** 정해진 우선순위가 있고, 이게 입문에서 가장 헷갈린다. 다섯 개를 두고 실제로 확인했다.

```nginx
location = /a.png  { ... }   # = : 완전 일치
location ^~ /img/  { ... }   # ^~: 접두사, 정규식보다 먼저
location ~ \.png$  { ... }   # ~ : 정규식
location /files/   { ... }   # 그냥 접두사
location /         { ... }   # 전부
```

```
/a.png             → 1. =  완전 일치
/img/logo.png      → 2. ^~ 접두사 (정규식을 이긴다)
/files/pic.png     → 3. ~  정규식
/files/doc.txt     → 4. 일반 접두사
/hello             → 5. /  아무것도 안 걸릴 때
```

**`/files/pic.png` 를 보면 안다.** `/files/` 라는 접두사가 있는데도 정규식 `~ \.png$` 가 이겼다. 순서는 이렇다.

1. `=` 완전 일치 — 있으면 즉시 결정
2. `^~` 접두사 — 가장 길게 맞는 것을 찾고, 여기 걸리면 정규식은 안 본다
3. `~` / `~*` 정규식 — **설정에 적힌 순서대로** 먼저 맞는 것
4. 일반 접두사 중 가장 길게 맞는 것

> 💡 정규식만 순서를 탄다. 나머지는 파일에 적은 순서와 상관없다. **정적 파일 경로처럼 정규식에 걸리면 곤란한 자리는 `^~` 로 못 박는다.**

## proxy_pass 의 슬래시 하나

**입문에서 백이면 백 걸리는 자리다.** 끝에 `/` 가 있느냐 없느냐로 백엔드가 받는 경로가 달라진다.

```nginx
location /app/  { proxy_pass http://127.0.0.1:5001;  }   # 슬래시 없음
location /app2/ { proxy_pass http://127.0.0.1:5001/; }   # 슬래시 있음
```

같은 `/hello` 를 붙여 불러 보면 이렇게 갈린다.

```
$ curl http://127.0.0.1:8082/app/hello
request : GET /app/hello HTTP/1.0     ← 경로가 그대로 간다

$ curl http://127.0.0.1:8082/app2/hello
request : GET /hello HTTP/1.0         ← /app2/ 가 잘려 나간다
```

| 쓴 모양 | 백엔드가 받는 경로 | 언제 |
|---|---|---|
| `proxy_pass http://host;` | `/app/hello` (그대로) | 앱이 `/app/` 을 자기 주소로 아는 경우 |
| `proxy_pass http://host/;` | `/hello` (접두사 제거) | 앱이 루트 기준으로 도는 경우 |

**404 가 나는데 설정은 맞아 보인다면 여기부터 본다.** 앱 로그에 찍힌 경로를 보면 어느 쪽인지 바로 안다.

## 고쳤으면 검사하고 reload

설정을 고친 뒤 바로 재시작하지 않는다. **먼저 검사한다.**

```bash
sudo nginx -t
```

```
nginx: configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

통과했으면 그때 다시 읽힌다.

```bash
sudo nginx -s reload      # 또는 systemctl reload nginx
```

> 💡 `restart` 가 아니라 `reload` 를 쓴다. **처리 중인 연결을 끊지 않고** 새 설정을 적용한다. 검사 없이 재시작했다가 문법 오류로 nginx 가 아예 안 뜨면, 고치는 동안 사이트 전체가 내려간다.

## 안 될 때 어디를 보나

증상별로 볼 곳이 다르다.

| 증상 | 먼저 볼 곳 |
|---|---|
| `502 Bad Gateway` | 백엔드가 죽었거나 주소가 틀렸다. `error.log` |
| `404` 인데 설정은 맞아 보임 | `proxy_pass` 의 슬래시 (위 장) |
| 엉뚱한 사이트가 나옴 | `server_name` 이 안 맞아 첫 블록으로 갔다 |
| 설정을 고쳤는데 그대로 | `nginx -t` 후 `reload` 를 안 했다 |
| `413` | `client_max_body_size` 가 작다 |

로그는 실시간으로 흘려 보면서 요청을 넣어 본다.

```bash
sudo tail -f /var/log/nginx/error.log
```

## 다음

여기까지가 구조다. 실제로 서비스를 올리면 그다음에 만나는 것들이 있다 — 백엔드가 접속자 IP 를 못 보는 문제, WebSocket 이 안 되는 문제, 백엔드 하나가 죽으면 nginx 가 통째로 안 뜨는 문제.

전부 [nginx 를 앞에 세우는 이유](https://autops.run/nginx-reverse-proxy/)에 실제 설정과 확인 결과로 정리해 두었다.

## 정리

- **리버스 프록시는 서버를 대신해 받는다.** 방문자는 뒤에 뭐가 있는지 모르고, 앱의 포트는 밖으로 열지 않는다.
- **`http` → `server` → `location` 세 겹.** `conf.d/*.conf` 에는 `server` 부터 쓴다.
- **`server` 는 `Host` 로 고르고, 안 맞으면 맨 위 블록으로 간다.** 관리자 페이지가 맨 위에 있으면 곤란하다.
- **`location` 은 적힌 순서가 아니라 우선순위로 고른다.** `=` → `^~` → 정규식 → 접두사. 정규식만 순서를 탄다.
- **`proxy_pass` 끝의 슬래시 하나로 경로가 잘리고 안 잘린다.** 404 의 단골 원인이다.
- **고쳤으면 `nginx -t` 부터.** 통과한 뒤에 `reload` 한다.
