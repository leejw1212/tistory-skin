![nginx 를 앞에 세우는 이유 — 리버스 프록시가 실제로 해 주는 일](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/46-cover-nginx.jpg)

애플리케이션을 그냥 포트에 띄워도 돌아간다. 그런데 실제로 서비스를 올려 보면 거의 항상 그 앞에 nginx 를 하나 세우게 된다. **왜 그런가**를, 말이 아니라 직접 띄워서 확인한다.

이 블로그의 실제 구성이 예다. 서버는 한 대, 열린 포트는 80·443 둘뿐이다.

| 주소 | 가는 곳 |
|---|---|
| `autops.run` | 워드프레스 (컨테이너 `wordpress:80`) |
| `app.autops.run` | 대시보드 (컨테이너 `dashboard:5000`) |
| `www.autops.run` | `autops.run` 으로 301 |
| 옛 주소 `myhome.ddns.net` | 위 두 곳으로 301 |

**밖에서 보면 주소가 넷인데 안에는 서버가 한 대다.** 그 사이를 nginx 가 맡는다.

> 📌 대시보드는 혼자 쓰는 것이라 주소를 `app.autops.run` 으로 적었다. 실제로는 각자의 도메인 아래 서브도메인 하나를 쓰면 된다.

> 📌 `location` 이나 `proxy_pass` 를 처음 본다면 [nginx 처음 만지기](https://autops.run/nginx-basics/)를 먼저 읽는 편이 낫다. 설정 파일의 구조와 nginx 가 요청을 고르는 순서를 거기서 짚는다.

> 📌 이 글의 확인 결과는 nginx 1.24.0 을 실제로 띄우고 헤더를 그대로 돌려주는 백엔드를 붙여 얻은 것이다. 붙여 넣은 출력은 전부 그 실행 결과다.

## 포워드 프록시와 리버스 프록시

이름이 비슷해서 헷갈리는데, **누구를 대신하느냐**가 다르다.

| | 대신하는 쪽 | 아는 사람 |
|---|---|---|
| 포워드 프록시 | **클라이언트**를 대신해 나간다 | 클라이언트가 프록시를 설정한다 |
| 리버스 프록시 | **서버**를 대신해 받는다 | 클라이언트는 존재를 모른다 |

[privoxy 로 프록시를 갈라 태운 글](https://autops.run/privoxy-forward-by-domain/)이 앞의 것이다. 거기서는 애플리케이션이 "나는 프록시를 쓴다"를 알고 있었다. 리버스 프록시는 반대다. **브라우저는 그냥 `autops.run` 에 접속할 뿐, 뒤에 컨테이너가 둘인지 하나인지 모른다.**

## 1. 이름으로 나눈다

443 은 하나뿐인데 서비스는 둘이다. 이걸 가능하게 하는 게 `server_name` 이다.

```nginx
server {
    listen 443 ssl;
    server_name autops.run;
    location / { proxy_pass http://wordpress:80; }
}

server {
    listen 443 ssl;
    server_name app.autops.run;
    location / { proxy_pass http://dashboard:5000; }
}
```

같은 포트로 들어온 요청을 **`Host` 헤더를 보고** 갈라 보낸다. 서비스를 하나 더 올리고 싶으면 `server` 블록을 하나 더 쓰면 된다. 포트를 새로 열 필요도, 방화벽을 건드릴 필요도 없다.

> 💡 이게 리버스 프록시를 쓰는 가장 흔한 이유다. 포트를 열어 `:5000`, `:8080` 으로 접속하게 두면 주소가 지저분해지고, 인증서도 서비스마다 따로 붙여야 하고, 회사망처럼 표준 포트만 열린 곳에서는 아예 닿지 않는다.

> 📌 쿠버네티스의 Ingress 가 하는 일이 정확히 이것이다. `server_name` 대신 `rules[].host` 를 보고 뒤쪽 서비스로 넘기는데, 그 규칙을 받아 실제로 요청을 가르는 것도 결국 nginx 다. 사람이 설정 파일을 쓰는 대신 클러스터가 대신 써 주는 형태라고 보면 된다. [M1 맥에 kind 로 쿠버네티스 클러스터 세우기](https://autops.run/kind-kubernetes-on-mac/)에서 그 nginx 를 클러스터에 얹는 과정을 다뤘다.

## 2. TLS 를 한 자리에서 끝낸다

인증서를 애플리케이션마다 붙이지 않는다. nginx 가 바깥쪽 HTTPS 를 끝내고, 안쪽은 평문 HTTP 로 넘긴다.

```nginx
ssl_certificate     /etc/letsencrypt/live/autops.run/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/autops.run/privkey.pem;
```

인증서 하나로 서브도메인 여럿을 덮고, 갱신도 한 군데서만 하면 된다. 80 포트는 인증서 갱신용 경로만 남기고 나머지는 전부 HTTPS 로 올린다.

```nginx
server {
    listen 80;
    server_name autops.run www.autops.run app.autops.run;

    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$host$request_uri; }
}
```

## 3. 백엔드가 잃어버리는 것을 되돌려 준다

**여기가 가장 자주 사고 나는 지점이다.** 프록시를 거치면 백엔드가 보는 것이 바뀐다. 아무 설정 없이 넘기면 이렇게 된다.

```nginx
location /bare/ { proxy_pass http://127.0.0.1:5001/; }
```

```
$ curl -H "Host: autops.run" http://127.0.0.1:8080/bare/
request      : GET / HTTP/1.0
Host         : 127.0.0.1:5001
X-Real-IP    : (없음)
X-Forwarded-For  : (없음)
X-Forwarded-Proto: (없음)
```

**백엔드가 보는 `Host` 가 `127.0.0.1:5001` 이다.** 방문자가 요청한 `autops.run` 이 아니라 프록시가 접속한 주소다. 접속자 IP 도 프로토콜도 없다.

이러면 이런 것들이 조용히 망가진다.

- 워드프레스가 만드는 링크가 `http://127.0.0.1:5001/...` 이 된다
- 접속 IP 기반 차단·통계가 전부 프록시 하나로 보인다
- 앱이 "지금 HTTPS 인가"를 알 수 없어 무한 리다이렉트에 빠지기도 한다

넘겨 주면 제대로 보인다.

```nginx
location /full/ {
    proxy_pass http://127.0.0.1:5001/;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

```
$ curl -H "Host: autops.run" http://127.0.0.1:8080/full/
request      : GET / HTTP/1.0
Host         : autops.run
X-Real-IP    : 127.0.0.1
X-Forwarded-For  : 127.0.0.1
X-Forwarded-Proto: http
```

> ⚠️ `$proxy_add_x_forwarded_for` 는 **클라이언트가 보낸 값 뒤에 붙인다.** 그래서 방문자가 가짜를 넣어 보내면 그대로 남는다.
>
> ``` $ curl -H "X-Forwarded-For: 1.2.3.4" .../full/ X-Forwarded-For  : 1.2.3.4, 127.0.0.1
> ```
>
> **맨 앞 값을 접속자 IP 로 믿으면 안 된다.** 신뢰할 수 있는 건 우리 프록시가 마지막에 붙인 값뿐이다.

### 앞에 CDN 이 있으면 한 겹 더

Cloudflare 같은 것을 앞에 두면 `$remote_addr` 가 Cloudflare IP 가 된다. 그러면 IP 기준 제한이 방문자별이 아니라 CDN IP 별로 세어져 무력해진다. 신뢰할 대역을 지정하고 실제 IP 를 복원한다.

```nginx
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
# ... Cloudflare 대역 전체
real_ip_header CF-Connecting-IP;
```

`set_real_ip_from` 에 적힌 대역에서 온 요청만 그 헤더를 믿는다. **위조를 막는 것이 이 지시자의 요점이다.**

## 4. WebSocket 은 따로 손봐야 한다

프록시가 잘 되는데 WebSocket 만 안 되는 일이 흔하다. 원인은 위 출력에 이미 나와 있었다 — **`HTTP/1.0`**. nginx 는 백엔드로 넘길 때 기본이 HTTP/1.0 이고, 1.0 에는 업그레이드라는 개념이 없다.

업그레이드 헤더를 안 넘기면 이렇게 된다.

```
$ curl -i -H "Connection: Upgrade" -H "Upgrade: websocket" .../ws-plain/
HTTP/1.1 200 OK
Content-Type: text/plain; charset=utf-8
```

**101 이 아니라 200 이다.** 백엔드는 업그레이드 요청이 온 줄도 몰랐다. 세 줄을 더하면 달라진다.

```nginx
location = /api/terminal/ws {
    proxy_pass http://dashboard:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade    $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;   # 가만히 둔 세션이 끊기지 않게
    proxy_buffering off;        # 실시간 출력을 모아 두지 않게
}
```

```
$ curl -i -H "Connection: Upgrade" -H "Upgrade: websocket" .../ws-ok/
HTTP/1.1 101 Switching Protocols
Connection: upgrade
Upgrade: websocket
```

> 📌 `proxy_read_timeout` 을 안 늘리면 기본 60초라, 조용한 연결이 1분마다 끊긴다. `proxy_buffering off` 를 빼면 터미널 출력이 버퍼에 모였다가 한 번에 쏟아진다. 셋 중 하나만 빠져도 증상이 다 다르다.

## 5. 한 서비스가 죽어도 나머지는 산다

**실제로 한 번 크게 당한 자리다.** 백엔드를 이름으로 직접 쓰면 이렇게 된다.

```nginx
location /blog/ { proxy_pass http://wordpress:80/; }
```

이 이름을 **nginx 는 기동 시점에 해석한다.** 워드프레스 컨테이너가 안 떠 있으면 설정 검사부터 실패한다.

```
$ nginx -t
[emerg] host not found in upstream "wordpress" in .../hardcoded.conf:10
nginx: configuration file ... test failed
```

**nginx 자체가 못 뜬다.** 블로그 하나 죽었을 뿐인데 같은 nginx 를 쓰는 대시보드까지 같이 죽는다.

변수로 넘기면 해석 시점이 요청 때로 미뤄진다.

```nginx
resolver 127.0.0.11 valid=10s ipv6=off;   # 도커 내장 DNS
set $blog_upstream http://wordpress:80;

location /blog/ { proxy_pass $blog_upstream; }
```

```
$ nginx -t
nginx: configuration file ... test is successful

$ curl -o /dev/null -w "%{http_code}\n" .../app/    # 살아 있는 쪽
200
$ curl -o /dev/null -w "%{http_code}\n" .../blog/   # 죽어 있는 쪽
502
```

**살아 있는 서비스는 200 을 그대로 내고, 죽은 쪽만 502 다.** 장애가 한 서비스 안에 갇힌다.

> ⚠️ 변수로 바꾸면 nginx 는 `/etc/hosts` 가 아니라 `resolver` 로 이름을 찾는다. **`resolver` 를 빠뜨리면 전부 502 가 된다.** 변수와 `resolver` 는 한 세트로 같은 파일에 둔다. 이걸 빠뜨려서 실제로 전면 502 를 냈다.

## 6. 문 앞에서 거른다

애플리케이션까지 가기 전에 nginx 에서 막을 수 있는 것들이 있다.

```nginx
limit_req_zone $binary_remote_addr zone=blog_login:10m rate=12r/m;

location = /wp-login.php {
    limit_req zone=blog_login burst=5 nodelay;
    proxy_pass $blog_upstream$request_uri;
}

# 워드프레스가 쓰지 않는 XML-RPC — 스팸·무차별 대입 단골 진입점
location = /xmlrpc.php {
    deny all;
    access_log off;
}
```

애플리케이션 안에도 잠금이 있지만, **문 앞에서 한 번 거르면 그 요청이 PHP 까지 가지 않는다.** 부하가 백엔드에 닿기 전에 끝난다.

업로드 한도나 타임아웃도 여기서 잡는다. 이 값이 백엔드보다 작으면 **백엔드가 받을 수 있는 파일도 nginx 가 413 으로 먼저 거절한다.**

```nginx
client_max_body_size 80M;    # 워드프레스 PHP 한도 64M + 여유
proxy_read_timeout 300s;
```

## 7. 주소를 옮겨도 링크가 살아 있게

도메인을 바꿔도 옛 주소로 들어오는 사람과 검색엔진이 있다. 그걸 받아 넘기는 것도 앞단의 일이다.

```nginx
server {
    listen 443 ssl;
    server_name myhome.ddns.net;

    location ^~ /blog {
        rewrite ^/blog/?(.*)$ https://autops.run/$1 permanent;
    }
    location / { return 301 https://app.autops.run$request_uri; }
}
```

애플리케이션은 이런 게 있는지도 모른다. **주소 체계가 바뀌는 일을 앱 코드를 건드리지 않고 처리할 수 있다는 것이 리버스 프록시의 값어치 중 하나다.**

## 확인

설정을 고쳤으면 반영 전에 검사부터 한다.

```bash
nginx -t
```

```
nginx: configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

**통과하면 그때 다시 읽힌다.** 재시작이 아니라 reload 다 — 처리 중인 연결을 끊지 않는다.

```bash
nginx -s reload      # 또는 systemctl reload nginx
```

백엔드가 무엇을 받는지 의심스러우면 헤더를 직접 본다.

```bash
curl -s -H "Host: autops.run" -I https://autops.run/
```

`Host` 나 `X-Forwarded-Proto` 가 어긋나면 3장으로 돌아간다.

## 정리

- **한 대에 여러 서비스, 포트는 하나.** `server_name` 으로 이름을 보고 나눈다. 이게 리버스 프록시를 세우는 가장 큰 이유다.
- **백엔드는 프록시 뒤에서 눈이 먼다.** `Host`·`X-Real-IP`·`X-Forwarded-Proto` 를 넘겨 주지 않으면 링크가 깨지고 IP 기반 방어가 무력해진다.
- **`X-Forwarded-For` 의 맨 앞 값은 방문자가 적어 넣을 수 있다.** 믿을 것은 우리 프록시가 마지막에 붙인 값뿐이고, CDN 뒤라면 `set_real_ip_from` 으로 신뢰 대역을 못 박는다.
- **WebSocket 은 세 줄이 더 필요하다.** 기본이 HTTP/1.0 이라 업그레이드가 죽는다. 200 이 오면 백엔드는 업그레이드 요청을 본 적이 없다는 뜻이다.
- **백엔드 이름은 변수로 넘기고 `resolver` 를 같이 둔다.** 이름을 직접 쓰면 그 백엔드가 죽었을 때 nginx 가 아예 못 떠서 멀쩡한 서비스까지 같이 내려간다.
