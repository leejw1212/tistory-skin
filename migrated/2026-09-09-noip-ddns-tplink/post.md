![TP-Link 공유기 DDNS 설정 — No-IP 로 집 서버에 고정 주소 만들기](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/43-cover-ddns.jpg)

집에 서버를 두면 첫 번째 벽이 주소다. 가정용 회선의 공인 IP 는 언제든 바뀐다. 재부팅 한 번, 회선 점검 한 번이면 어제 적어 둔 IP 가 남의 것이 된다.

**DDNS 는 이름 하나를 받아 두고, 공유기가 IP 가 바뀔 때마다 그 이름을 갱신하게 하는 것이다.** 그러면 IP 를 몰라도 이름으로 찾아갈 수 있다.

| | |
|---|---|
| 받는 것 | `내이름.ddns.net` 같은 호스트 이름 하나 |
| 갱신하는 주체 | TP-Link 공유기 (별도 프로그램 없이) |
| 비용 | 무료 (조건 있음 — 5장에서 다룬다) |
| 걸리는 시간 | 20분 남짓 |

## 준비물

- No-IP 계정 (무료)
- DDNS 기능이 있는 TP-Link 공유기 — 관리자 페이지 접속 권한
- **공유기가 공인 IP 를 받고 있을 것** — 이게 전제다. 0장에서 먼저 확인한다

> 📌 이 글은 이름 하나를 만들어 IP 를 따라가게 만드는 데까지다. 그 위에 진짜 도메인(`example.com`)을 얹는 것은 [집 서버에 도메인 붙이기](https://autops.run/domain-cloudflare-nginx/)에서 이어서 다룬다.

## 0. 먼저 확인한다 — 우리 집이 되는 환경인가

**여기서 안 되면 뒤의 모든 단계가 무의미하다.** 그런데 대부분의 가이드가 이걸 맨 뒤에 두거나 아예 빼놓는다.

공유기 관리 페이지에서 **WAN IP** 를 본다. 이 값이 아래 대역이면 공인 IP 가 아니다.

| 보이는 WAN IP | 뜻 |
|---|---|
| `100.64.x.x` ~ `100.127.x.x` | **CGNAT.** 통신사가 IP 를 여러 가입자와 공유 중 |
| `192.168.x.x`, `10.x.x.x`, `172.16~31.x.x` | 위에 공유기가 하나 더 있다 (이중 NAT) |
| 그 외 | 공인 IP — 진행해도 된다 |

확인은 두 값을 견줘 보는 것으로도 된다.

```bash
curl -s https://api.ipify.org; echo
```

여기서 나온 IP 와 공유기 WAN IP 가 **다르면** 중간에 NAT 이 하나 더 있는 것이다.

> ⚠️ CGNAT 환경에서는 DDNS 를 걸어도 밖에서 들어올 수 없다. 이름은 갱신되지만 그 IP 는 나만의 것이 아니고, 통신사 상위 장비에 포트가 열려 있지 않다. **공유기에서 포트포워딩을 아무리 해도 소용없다.** 통신사에 공인 IP 를 요청하는 것이 정공법이다.

이중 NAT 이라면 앞단 장비를 브리지 모드로 바꾸거나, 앞단에서 TP-Link 로 DMZ·포트포워딩을 걸어 준다.

## 1. No-IP 에 호스트 이름 만들기

[noip.com](https://www.noip.com/) 에서 무료로 가입하고 호스트 이름을 하나 만든다. 무료 계정에서 고를 수 있는 도메인이 여럿 있다.

```
ddns.net      hopto.org     zapto.org     sytes.net
myftp.org     myddns.me     bounceme.net  redirectme.net   ...
```

무엇을 골라도 동작은 같다. 짧고 기억하기 쉬운 쪽이 낫다.

> 📌 **무료 계정은 호스트 이름 하나다.** 서비스를 여러 개 돌려도 이름 하나로 충분한 경우가 많다 — 포트로 나누거나, 나중에 진짜 도메인을 얹어 서브도메인으로 나누면 된다.

## 2. DDNS Key 를 만든다 — 계정 비밀번호를 공유기에 넣지 않는다

여기가 오래된 가이드와 갈리는 지점이다. 예전 방식은 **No-IP 계정 아이디와 비밀번호를 공유기에 그대로 넣는 것**이었다. 지금은 그럴 필요가 없다.

No-IP 계정의 **DNS Records** 에서 `Generate DDNS Key` 를 눌러 호스트 이름 전용 자격 증명을 만든다.

- 계정 로그인 정보와 **분리된 자격 증명**이다
- 유출되더라도 **그 호스트 이름을 갱신하는 것 말고는 못 한다**. 계정 자체는 안전하다

> ⚠️ **비밀번호는 생성 직후 한 번만 보여 준다.** 창을 닫으면 다시 볼 수 없고 복구도 안 된다. 그 자리에서 복사해 안전한 곳에 둔다.

공유기가 호스트 이름을 따로 묻는다면 여기서 만든 이름을 넣고, DDNS Key 를 그룹으로 쓰는 방식이라면 호스트 칸에 `all.ddnskey.com` 을 넣는다.

## 3. TP-Link 공유기에 넣는다

관리자 페이지에서 **Advanced → Network → Dynamic DNS** 로 간다.

| 칸 | 넣을 값 |
|---|---|
| Service Provider | `No-IP` |
| Username | DDNS Key 의 username |
| Password | DDNS Key 의 password |
| Domain Name | 1장에서 만든 호스트 이름 |

넣고 **Login and Save** 를 누르면 상태가 바뀐다. `Succeed` 나 그에 준하는 표시가 뜨면 첫 갱신이 성공한 것이다.

> 💡 TP-Link 는 자체 DDNS(`이름.tplinkdns.com`)도 제공한다. 공유기 안에서 등록까지 끝나 더 간단하다. 다만 **공유기를 다른 제조사로 바꾸면 그 이름을 못 가져간다.** No-IP 쪽이 이식성이 있다.

## 4. 포트포워딩을 건다

DDNS 는 **이름이 IP 를 따라가게** 할 뿐이다. 밖에서 들어온 요청을 집 안의 어느 장비로 보낼지는 따로 정해야 한다.

TP-Link 에서는 **Advanced → NAT Forwarding → Virtual Servers** 다.

| 칸 | 예 |
|---|---|
| External Port | `443` |
| Internal IP | 서버의 사설 IP (`192.168.0.x`) |
| Internal Port | `443` |
| Protocol | `TCP` |

> ⚠️ 서버의 사설 IP 는 **고정해 둔다.** DHCP 로 받으면 재부팅 후 주소가 바뀌어 포트포워딩이 엉뚱한 장비를 가리킨다. 공유기의 DHCP 예약(Address Reservation) 기능을 쓰거나 서버에 고정 IP 를 준다.

> 📌 국내 통신사 중에는 가정용 회선에서 80 포트로 들어오는 요청을 막는 곳이 있다. 80 만 안 되고 443 은 되는 경우가 흔하니, 잘 안 되면 포트를 바꿔 확인해 본다.

## 5. 무료 계정은 30일마다 확인해야 한다

**무료로 쓰다가 어느 날 갑자기 접속이 안 되는 이유의 대부분이 이것이다.**

- 무료 호스트 이름은 **30일마다 확인(confirm)** 해야 유지된다
- 23일이 지나면 확인 기간에 들어가고, **7일 안에** 확인해야 한다
- 놓치면 14일간 Redemption 상태가 되고, 그 뒤에는 삭제된다. 삭제되면 **아무나 그 이름을 가져갈 수 있다**

확인 안내는 메일로 온다. **그 메일이 스팸함으로 가면 그대로 잃는다.**

> 💡 No-IP 발신 주소를 메일 허용 목록에 넣어 둔다. 그리고 캘린더에 3주 간격 반복 일정을 하나 만들어 두면 잊지 않는다. 유료(Enhanced)로 올리면 이 확인 절차가 없어진다 — 서비스가 중요해졌다면 그쪽이 맞다.

## 확인

### 이름이 우리 집 IP 를 가리키나

```bash
dig +short 내이름.ddns.net
curl -s https://api.ipify.org; echo
```

두 값이 같으면 갱신이 제대로 된 것이다. 나오는 모양은 이렇다 (주소와 IP 는 예시).

```
$ dig +short myhome.ddns.net
203.0.113.9
```

`dig` 가 없으면 이것으로도 된다.

```bash
getent hosts 내이름.ddns.net
```

### 갱신을 손으로 해 본다

공유기가 갱신에 실패하는 것 같으면 업데이트 API 를 직접 불러 본다. No-IP 는 DynDNS 호환 프로토콜을 쓴다.

```bash
curl -s -u "DDNS_KEY_USERNAME:DDNS_KEY_PASSWORD" \
  "https://dynupdate.no-ip.com/nic/update?hostname=내이름.ddns.net"
```

`myip` 파라미터를 빼면 요청을 보낸 쪽의 IP 로 갱신된다. **집 안에서 실행해야 의미가 있다.**

돌아오는 한 단어가 곧 진단이다.

| 응답 | 뜻 | 할 일 |
|---|---|---|
| `good <IP>` | 갱신 성공 | 없음 |
| `nochg <IP>` | 이미 같은 IP | 정상이다. 실패가 아니다 |
| `nohost` | 그 계정에 없는 호스트 이름 | 이름 오타, 또는 이미 삭제됨 (5장) |
| `badauth` | 아이디·비밀번호 틀림 | DDNS Key 를 다시 확인 |
| `badagent` | 클라이언트가 차단됨 | 공유기 펌웨어 업데이트 |
| `abuse` | 계정이 남용으로 차단됨 | 너무 잦은 갱신. No-IP 에 문의 |
| `911` | No-IP 쪽 장애 | 기다린다. 재시도를 몰아치지 않는다 |

> ⚠️ 자격 증명을 URL 안에 넣는 형태(`https://user:pass@...`)로도 되지만, 그렇게 하면 **셸 히스토리에 비밀번호가 그대로 남는다.** 위처럼 `-u` 를 쓰거나 환경변수로 넘긴다.

### 밖에서 들어와 본다

**같은 집 안(와이파이)에서 테스트하면 안 된다.** 공유기가 내부 요청을 밖으로 돌려보내지 못해(헤어핀 NAT 미지원) 멀쩡한 설정도 실패로 보인다.

**휴대폰의 와이파이를 끄고 셀룰러로** 접속해 본다. 이게 가장 확실하다.

## 그다음

여기까지 하면 `내이름.ddns.net` 으로 집 서버에 닿는다. 여기서 멈춰도 되지만, 진짜 도메인을 얹고 싶다면 이 이름이 그 토대가 된다 — 도메인의 CNAME 이 이 DDNS 이름을 가리키게 두면 **IP 를 어디에도 적지 않고** 이름 사슬만으로 연결된다. 그 과정은 [집 서버에 도메인 붙이기](https://autops.run/domain-cloudflare-nginx/)에 있다.

## 정리

- **CGNAT 확인이 0번이다.** WAN IP 가 `100.64.x.x` 대역이면 DDNS 를 걸어도 밖에서 못 들어온다. 다른 단계를 시작하기 전에 이것부터 본다.
- **계정 비밀번호를 공유기에 넣지 않는다.** DDNS Key 를 발급해 쓰면 유출돼도 피해가 그 호스트 이름 하나로 막힌다. 비밀번호는 발급 때 한 번만 보여 준다.
- **DDNS 와 포트포워딩은 별개다.** 이름이 IP 를 따라가는 것과, 들어온 요청을 어느 장비로 보내는가는 다른 설정이다. 둘 다 해야 닿는다.
- **무료 계정은 30일마다 확인한다.** 잘 되던 게 갑자기 끊겼다면 여기부터 본다.
- **테스트는 밖에서 한다.** 집 와이파이에서의 실패는 설정 문제가 아닐 수 있다.

## 참고

- [No-IP — 무료 계정 제한](https://www.noip.com/support/knowledgebase/free-enhanced-limitations) · [호스트 이름 확인 주기](https://www.noip.com/support/knowledgebase/confirm-my-hostname-free-account-support-question-day)
- [No-IP — DDNS Key 사용법](https://www.noip.com/support/knowledgebase/how-to-setup-and-use-a-ddns-key)
- [No-IP — 업데이트 요청 URL과 커스텀 설정](https://www.noip.com/support/knowledgebase/ddns-settings-request-url) · [응답 코드](https://www.noip.com/integrate/response)
- [TP-Link — No-IP DDNS 설정 (blue UI)](https://www.tp-link.com/us/support/faq/1103/)
- [No-IP — TP-Link 공유기 설정 안내](https://www.noip.com/support/knowledgebase/setting-ddns-tp-link-router)
