![집 서버에 도메인 붙이기 — 가비아 · Cloudflare · nginx 설정 순서대로](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/44-cover-domain.jpg)

집 미니 PC 한 대에 블로그와 대시보드가 올라가 있다. 여기에 도메인을 붙여 이렇게 나누는 것이 목표다.

| 주소 | 가는 곳 |
|---|---|
| `autops.run` | 워드프레스 블로그 |
| `app.autops.run` | 대시보드 |
| `www.autops.run` | `autops.run` 으로 넘김 |
| 옛 주소 `myhome.ddns.net` | 위 두 곳으로 넘김 |

전부 서버 한 대, 포트 80·443 두 개로 처리한다.

> 📌 공개 블로그 주소만 그대로 적고, **혼자 쓰는 대시보드 주소와 집 서버를 가리키는 DDNS 이름·IP 는 예시 값으로 바꿔** 적었다 — `app.autops.run`, `myhome.ddns.net`, `203.0.113.9`. 각자의 값으로 바꿔 읽으면 된다.

## 준비물

- 도메인 등록 기관 계정 (여기서는 가비아)
- Cloudflare 계정 — 무료 요금제로 충분하다
- 공인 IP 로 열려 있는 서버, 그리고 그 앞의 nginx
- DDNS 를 이미 쓰고 있다면 그대로 둔다 — 그 위에 얹는 방식이다. 아직 없다면 [No-IP 와 TP-Link 로 DDNS 걸기](https://autops.run/noip-ddns-tplink/)를 먼저 한다

소요 시간은 설정 20분 남짓, 그리고 DNS 전파를 기다리는 시간이 따로 붙는다.

> 📌 주소가 붙은 다음 그 위에 무엇을 올렸는지는 [블로그 스킨 패치 노트](https://autops.run/theme-patch-notes-2-3/)에 있다 — 지금 읽고 있는 이 블로그를 굴리는 테마를 며칠 쓰면서 손본 기록이다.

## 1. 가비아에서 도메인 구매

가비아에서 원하는 이름을 검색해 결제한다. 결제가 끝나면 **My가비아 → 서비스 관리 → 도메인** 목록에 나타난다.

여기서는 `autops.run` 을 골랐다. 이 단계에서는 DNS 설정을 건드리지 않는다. 곧 관리 주체를 Cloudflare 로 넘길 것이기 때문이다.

## 2. Cloudflare 에 도메인 등록

[dash.cloudflare.com](https://dash.cloudflare.com) 에 로그인하고 **Add a site** 에 방금 산 도메인을 입력한다. 요금제는 **Free** 를 고른다.

Cloudflare 가 기존 DNS 레코드를 자동으로 읽어 온다. 가비아 기본 파킹 레코드가 딸려 오는데, 쓰지 않을 것이므로 다음 단계에서 지운다.

## 3. DNS 레코드 넣기

이 글에서 가장 중요한 단계다. **DNS** 탭에서 가져온 레코드를 모두 지우고 아래 세 줄만 남긴다.

| Type | Name | Content | Proxy status |
|---|---|---|---|
| CNAME | `autops.run` | `myhome.ddns.net` | DNS only |
| CNAME | `dash` | `myhome.ddns.net` | DNS only |
| CNAME | `www` | `autops.run` | DNS only |

**IP 를 한 군데도 적지 않는 것이 요령이다.** ISP 가 IP 를 바꿔도 DDNS 가 갱신하고 Cloudflare 가 그걸 따라가므로, 손댈 일이 없다.

> 📌 **루트 도메인에 CNAME 을 적었는데 왜 되나?** 원래 DNS 규격에서는 루트 도메인(zone apex)에 CNAME 을 둘 수 없다. 루트에는 `SOA` 와 `NS` 가 반드시 있어야 하는데, CNAME 은 "이 이름의 모든 레코드는 저쪽을 보라"는 뜻이라 둘이 공존할 수 없기 때문이다. Cloudflare 는 **CNAME 평탄화(CNAME flattening)** 로 이 문제를 우회한다. 설정에는 CNAME 을 적어 두되, 실제 질의가 오면 대상 이름을 대신 풀어서 A 레코드처럼 응답한다. 그래서 규격을 어기지 않으면서 원하는 결과를 얻는다. 이 기능이 없으면 루트에는 A 레코드로 IP 를 직접 적어야 하고, IP 가 바뀌는 순간 사이트가 죽는다.

### 주황 구름은 일단 끈다

Proxy status 를 켜면(주황 구름) 트래픽이 Cloudflare 를 거쳐 집 IP 가 감춰지고 DDoS 방어도 붙는다. 하지만 처음부터 켜면 문제를 세 개 떠안는다.

> ⚠️ **SSL/TLS 모드가 `Flexible` 이면 무한 리다이렉트에 빠진다.** Cloudflare 가 원 서버에 HTTP(80)로 붙는데 nginx 는 80 을 443 으로 돌리기 때문이다. 켤 거라면 반드시 `Full` 이상으로 두어야 한다.

- **업로드가 100MB 에서 잘린다.** 무료 요금제의 요청 본문 상한이다. 큰 파일을 받는 서비스가 있다면 그쪽은 켜면 안 된다.
- **접속 IP 가 전부 Cloudflare IP 로 보인다.** nginx 의 로그인 속도 제한이 방문자별이 아니라 Cloudflare IP 별로 세어져 무력해진다. `set_real_ip_from` 과 `real_ip_header CF-Connecting-IP` 로 실제 IP 를 복원해야 한다.

회색 구름으로 전부 동작시킨 뒤, 안정되면 필요한 레코드만 켜는 편이 안전하다.

## 4. 가비아에서 네임서버 변경

레코드를 저장하면 Cloudflare 가 네임서버 두 개를 알려준다.

```
katelyn.ns.cloudflare.com
noah.ns.cloudflare.com
```

**My가비아 → 서비스 관리 → 도메인 → 네임서버 설정**에서 "타사 네임서버 사용"을 고르고 이 두 주소를 넣는다.

저장하는 순간부터 `autops.run` 의 DNS 관리 주체가 가비아에서 Cloudflare 로 넘어간다.

## 5. `dig` 로 전파 확인

가비아가 "설정 완료"라고 표시해도 그것은 **접수됐다**는 뜻이다. 실제로 전파됐는지는 직접 물어봐야 한다.

```bash
dig +short autops.run
dig +short app.autops.run
dig +short NS autops.run
```

아직 전파되지 않았다면 새 도메인만 조용하다.

```
$ dig +short autops.run
$ dig +short myhome.ddns.net
203.0.113.9
```

기존 DDNS 는 응답하는데 새 도메인은 빈 줄이다 — 레지스트리에 위임이 아직 반영되지 않은 것이다. 보통 10분에서 몇 시간, 늦으면 하루까지 걸린다.

전파가 끝나면 세 이름이 모두 같은 IP 를 뱉는다.

```
$ dig +short autops.run
203.0.113.9
$ dig +short app.autops.run
myhome.ddns.net.
203.0.113.9
$ dig +short NS autops.run
noah.ns.cloudflare.com.
katelyn.ns.cloudflare.com.
```

Cloudflare 대시보드 상단이 **Active** 로 바뀌면 위임이 끝난 것이다.

## 6. nginx — 이름 하나로 서비스 둘 나누기

포트는 80·443 두 개뿐이고 서비스는 둘이다. `server_name` 으로 나눈다.

```nginx
# 블로그 — 루트
server {
    listen 443 ssl;
    http2 on;
    server_name autops.run;

    ssl_certificate     /etc/letsencrypt/live/autops.run/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/autops.run/privkey.pem;

    location / {
        proxy_pass http://wordpress:80;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# 대시보드 — 서브도메인
server {
    listen 443 ssl;
    http2 on;
    server_name app.autops.run;

    client_max_body_size 300M;   # 큰 파일을 받는 앱이라 넉넉히

    location / {
        proxy_pass http://dashboard:5000;
        proxy_set_header Host $host;
    }
}
```

`proxy_set_header Host $host` 를 빠뜨리면 뒤쪽 앱이 자기 주소를 컨테이너 이름으로 착각해서, 앱이 만드는 링크와 리다이렉트가 전부 어긋난다.

> 💡 업스트림 이름을 `proxy_pass http://wordpress:80` 처럼 직접 쓰면 nginx 가 **기동 시점에** 그 이름을 찾는다. 블로그 컨테이너가 떠 있지 않으면 nginx 자체가 못 떠서 대시보드까지 같이 죽는다. 변수로 쓰면 요청 시점에 찾으므로 블로그만 502 가 되고 대시보드는 산다. 다만 변수를 쓰는 순간 `/etc/hosts` 가 아니라 `resolver` 를 보게 되므로, `resolver` 를 반드시 함께 적어야 한다. 안 적으면 전부 502 다.
> ```nginx resolver 127.0.0.11 valid=10s ipv6=off;   # 도커 내장 DNS set $blog_upstream http://wordpress:80; proxy_pass $blog_upstream$request_uri;
> ```

## 7. 옛 주소 살려 두기

주소를 바꾸면 북마크와 검색엔진에 남은 링크가 죽는다. 301 로 넘겨 준다.

```nginx
server {
    listen 443 ssl;
    server_name myhome.ddns.net;

    # 옛 블로그 글: /blog/글 → https://autops.run/글
    location ^~ /blog {
        rewrite ^/blog/?(.*)$ https://autops.run/$1 permanent;
    }

    # 나머지는 대시보드로
    location / {
        return 301 https://app.autops.run$request_uri;
    }
}
```

`rewrite` 로 경로를 다시 조립하는 것이 요령이다. `return 301` 만 쓰면 `/blog` 라는 접두어가 그대로 붙어 따라간다.

이 블록을 두면 옛 주소로 오는 OAuth 콜백 같은 것도 쿼리 문자열까지 그대로 살아서 넘어간다. `$request_uri` 가 경로와 쿼리를 함께 담기 때문이다.

## 8. 인증서는 한 장으로

도메인이 셋이라고 인증서를 셋 받을 필요는 없다. **SAN 인증서** 한 장에 묶는다.

```bash
certbot certonly --webroot -w /var/www/certbot \
  --cert-name autops.run \
  -d autops.run -d www.autops.run -d app.autops.run \
  --agree-tos --email me@example.com
```

`--cert-name` 을 주면 도메인이 늘어도 인증서 폴더 이름이 안 바뀐다. nginx 설정에 경로를 박아 두는 입장에서는 이게 편하다.

여기에 닭과 달걀 문제가 하나 있다. **nginx 는 인증서가 없으면 못 뜨는데, 인증서를 받으려면 nginx 가 떠서 ACME 챌린지에 응답해야 한다.** 순서는 이렇게 푼다.

1. 자체 서명 더미 인증서를 만든다
2. 그걸로 nginx 를 띄운다
3. certbot 으로 진짜 인증서를 받는다
4. 더미를 지우고 nginx 를 리로드한다

## 확인

여기까지 하면 아래가 전부 통해야 한다.

```bash
curl -I https://autops.run/            # 200, 블로그
curl -I https://app.autops.run/       # 200, 대시보드
curl -I https://www.autops.run/        # 301 → https://autops.run/
curl -I http://autops.run/             # 301 → https
curl -I https://myhome.ddns.net/       # 301 → https://app.autops.run/
```

## 정리

핵심은 세 가지다.

- **루트 도메인에는 CNAME 을 쓸 수 없다.** 동적 IP 를 쓰는 집 서버에 도메인을 붙이려는 순간 바로 부딪히는 벽이고, Cloudflare 의 CNAME 평탄화가 이걸 우회해 준다.
- **IP 를 어디에도 적지 않는다.** DDNS → Cloudflare 로 이어지는 이름 사슬만 만들어 두면 IP 가 바뀌어도 손댈 일이 없다.
- **옛 주소를 반드시 살려 둔다.** 301 몇 줄이면 되는데, 안 해 두면 그동안 쌓은 링크가 조용히 죽는다.
