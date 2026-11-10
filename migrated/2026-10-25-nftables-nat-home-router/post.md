![nftables masquerade 로 공유기 만들기 — 포트포워딩·conntrack, 그리고 NAT 는 방화벽이 아니다](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/128-cover-nftables-nat.jpg)

집에서 쓰는 노트북의 주소는 보통 `192.168.0.x` 같은 사설 주소다. 그런데 이 주소로는 인터넷의 어떤 서버도 답장을 보낼 수 없다. 그런데도 인터넷이 잘 되는 것은 **공유기**가 중간에서 주소를 바꿔 주기 때문이다. 이 글에서는 그 공유기를 리눅스 한 대 안에 직접 만들어 본다.

| 확인하는 것 | 공유기의 어떤 기능인가 |
|---|---|
| 사설 주소로는 인터넷에서 답장이 못 온다 | NAT 가 필요한 이유 |
| 나가는 패킷의 출발지를 공인 IP 로 바꾼다 | SNAT (masquerade) |
| 바꾼 내용을 표에 적어 두고 답장을 되돌려 준다 | conntrack (연결 추적) |
| 밖에서 공인 IP:포트로 오면 집 안 서버로 넘긴다 | 포트포워딩 (DNAT) |
| NAT 만 있으면 밖에서 집 안으로 그냥 들어온다 | NAT 는 방화벽이 아니다 |
| 기본은 막고 필요한 것만 연다 | 방화벽 (forward 정책) |

[ip netns 로 라우터 만들기](https://autops.run/ip-netns-routing/)에서 만든 "PC — 라우터 — PC" 구조를 그대로 쓴다. 네임스페이스와 라우팅이 처음이면 그 글을 먼저 보고 오면 쉽다. 출력은 모두 실습용 Ubuntu 24.04 가상 머신에서 실제로 실행한 결과다.

## 먼저 알아 둘 말

| 말 | 쉽게 말하면 |
|---|---|
| **사설 IP** | 집·회사 안에서만 쓰는 주소. `192.168.x.x`, `10.x.x.x` 등. 인터넷에서는 길이 없다 |
| **공인 IP** | 인터넷에서 통하는 주소. 통신사가 공유기에 하나 준다 |
| **NAT** | 패킷의 주소를 바꿔 쓰는 것 (Network Address Translation) |
| **SNAT / masquerade** | 출발지(Source) 주소를 바꾼다. 나갈 때 사설 → 공인 |
| **DNAT / 포트포워딩** | 목적지(Destination) 주소를 바꾼다. 들어올 때 공인 → 사설 |
| **conntrack** | 공유기가 "누가 누구와 연결 중인지" 적어 두는 표 |
| **nftables** | 리눅스의 방화벽·NAT 도구. 명령은 `nft` |

> 📌 `203.0.113.x` 는 문서와 실습용으로 정해 둔 주소 범위다. 실제 인터넷 어디에도 쓰이지 않으니 공인 IP 역할로 안심하고 쓸 수 있다.

## 만들 네트워크

```
 [pc] 192.168.10.10 ── 집 LAN ── [rtr = 공유기] ── 인터넷 ── 203.0.113.100 [inet]
                    r-lan: 192.168.10.1   r-wan: 203.0.113.1           웹 서버
```

- `pc` — 집 안의 컴퓨터. 사설 주소를 쓴다.
- `rtr` — 공유기. 집 쪽(`r-lan`)과 인터넷 쪽(`r-wan`) 랜카드가 하나씩 있다. `203.0.113.1` 이 이 집의 공인 IP 다.
- `inet` — 인터넷 어딘가의 웹 서버. **사설 주소로 가는 길을 모른다.** 진짜 인터넷과 같다.

## 준비물

- 리눅스 한 대 (여기서는 Ubuntu 24.04 가상 머신)
- `iproute2`, `nftables`, `conntrack`, `tcpdump`, `curl`, `python3`

```bash
sudo apt install -y iproute2 nftables conntrack tcpdump curl python3
```

걸리는 시간은 40분 정도다. 관리자 셸에서 시작한다. 끝나면 `exit` 로 나온다.

```bash
sudo -i
```

## 1. 네트워크를 만든다

2주 차와 같은 방법으로 공간 세 개와 랜선 두 가닥을 만든다.

```bash
ip netns add pc; ip netns add rtr; ip netns add inet
ip link add pc-eth0 type veth peer name r-lan
ip link add inet-eth0 type veth peer name r-wan
ip link set pc-eth0 netns pc;     ip link set r-lan netns rtr
ip link set inet-eth0 netns inet; ip link set r-wan netns rtr

ip -n pc   addr add 192.168.10.10/24 dev pc-eth0
ip -n rtr  addr add 192.168.10.1/24  dev r-lan
ip -n rtr  addr add 203.0.113.1/24   dev r-wan
ip -n inet addr add 203.0.113.100/24 dev inet-eth0

for n in pc rtr inet; do ip -n $n link set lo up; done
ip -n pc link set pc-eth0 up;  ip -n rtr link set r-lan up
ip -n rtr link set r-wan up;   ip -n inet link set inet-eth0 up
```

pc 의 게이트웨이를 공유기로 잡고, 공유기의 전달 기능을 켠다.

```bash
ip -n pc route add default via 192.168.10.1
ip netns exec rtr sysctl -w net.ipv4.ip_forward=1
```

인터넷 쪽에 웹 서버를 하나 띄운다. 파이썬에 들어 있는 간단한 웹 서버다.

```bash
ip netns exec inet sh -c 'cd /tmp && python3 -m http.server 80 --bind 203.0.113.100 > /tmp/inet-http.log 2>&1 &'
```

각 공간이 아는 길을 확인한다.

```bash
for n in pc rtr inet; do echo "--- $n"; ip -n $n route; done
```

```
--- pc
default via 192.168.10.1 dev pc-eth0
192.168.10.0/24 dev pc-eth0 proto kernel scope link src 192.168.10.10
--- rtr
192.168.10.0/24 dev r-lan proto kernel scope link src 192.168.10.1
203.0.113.0/24 dev r-wan proto kernel scope link src 203.0.113.1
--- inet
203.0.113.0/24 dev inet-eth0 proto kernel scope link src 203.0.113.100
```

`inet` 에는 `192.168.10.x` 로 가는 길이 없다. 진짜 인터넷의 서버들도 마찬가지다.

## 2. NAT 없이 나가 본다 — 답장이 못 온다

웹 서버 쪽에 녹화를 걸고, pc 에서 웹 서버에 접속한다.

```bash
ip netns exec inet timeout 6 tcpdump -i inet-eth0 -nn -c 4 'tcp port 80' &
ip netns exec pc curl -sS -m 4 http://203.0.113.100/
```

```
curl: (28) Connection timed out after 4002 milliseconds
```

웹 서버 쪽 녹화에는 요청이 **도착해 있다.** 뒷부분은 줄였다.

```
13:06:45.986549 IP 192.168.10.10.42460 > 203.0.113.100.80: Flags [S], seq 1492983472, …
13:06:47.029877 IP 192.168.10.10.42460 > 203.0.113.100.80: Flags [S], seq 1492983472, …
13:06:48.053909 IP 192.168.10.10.42460 > 203.0.113.100.80: Flags [S], seq 1492983472, …
13:06:49.077900 IP 192.168.10.10.42460 > 203.0.113.100.80: Flags [S], seq 1492983472, …
```

같은 SYN 이 네 번 왔다. 답장이 한 번도 돌아가지 못해서 pc 가 계속 다시 보낸 것이다. 웹 서버에게 `192.168.10.10` 으로 가는 길을 물어보면 이유가 보인다.

```bash
ip netns exec inet ip route get 192.168.10.10
```

```
RTNETLINK answers: Network is unreachable
```

**요청은 갔는데 답장 보낼 길이 없다.** 사설 주소는 인터넷에서 길이 없는 주소이기 때문이다. 집 공유기가 NAT 를 하는 이유가 바로 이것이다.

> 📌 사설 주소는 전 세계 모든 집과 회사가 겹쳐서 쓴다. 우리 집에도, 옆집에도 `192.168.10.10` 이 있을 수 있다. 그러니 인터넷은 이 주소로 가는 길을 만들 수가 없다.

## 3. masquerade 로 출발지를 바꾼다 (SNAT)

공유기에 "인터넷 쪽으로 나가는 패킷은 출발지를 내 공인 IP 로 바꿔라" 라는 규칙을 넣는다.

```bash
ip netns exec rtr nft add table ip nat
ip netns exec rtr nft add chain ip nat postrouting '{ type nat hook postrouting priority srcnat; policy accept; }'
ip netns exec rtr nft add rule ip nat postrouting oifname r-wan counter masquerade
ip netns exec rtr nft list ruleset
```

```
table ip nat {
	chain postrouting {
		type nat hook postrouting priority srcnat; policy accept;
		oifname "r-wan" counter packets 0 bytes 0 masquerade
	}
}
```

세 줄의 뜻은 이렇다.

1. `nat` 라는 규칙 묶음(table)을 만든다.
2. 그 안에 **패킷이 공유기를 막 나가기 직전**(`postrouting`)에 검사하는 목록(chain)을 만든다.
3. 나가는 랜카드가 `r-wan`(인터넷 쪽)이면 `masquerade` 한다. "나가는 랜카드의 주소로 출발지를 바꿔라" 는 뜻이다.

이번에는 공유기의 **양쪽**에서 녹화하면서 다시 접속한다.

```bash
ip netns exec rtr  timeout 6 tcpdump -i r-lan     -nn -c 3 'tcp port 80' &
ip netns exec inet timeout 6 tcpdump -i inet-eth0 -nn -c 3 'tcp port 80' &
ip netns exec pc curl -sS -o /dev/null -w 'http_code=%{http_code}\n' http://203.0.113.100/
```

```
http_code=200
```

드디어 된다. 같은 연결의 첫 세 패킷(3-way handshake)이 공유기 양쪽에서 이렇게 보인다.

```
집 쪽 (r-lan)
IP 192.168.10.10.55666 > 203.0.113.100.80: Flags [S], seq 3897098878, …
IP 203.0.113.100.80 > 192.168.10.10.55666: Flags [S.], seq 3009650718, ack 3897098879, …
IP 192.168.10.10.55666 > 203.0.113.100.80: Flags [.], ack 1, …

인터넷 쪽 (inet-eth0)
IP 203.0.113.1.55666 > 203.0.113.100.80: Flags [S], seq 3897098878, …
IP 203.0.113.100.80 > 203.0.113.1.55666: Flags [S.], seq 3009650718, ack 3897098879, …
IP 203.0.113.1.55666 > 203.0.113.100.80: Flags [.], ack 1, …
```

- 집 쪽에서는 출발지가 `192.168.10.10`, 인터넷 쪽에서는 **`203.0.113.1`** 이다. 같은 SYN 인 것은 `seq 3897098878` 이 같은 것으로 알 수 있다.
- 웹 서버는 공유기의 공인 IP 하고만 이야기한다. 답장도 `203.0.113.1` 로 보낸다.
- 공유기는 그 답장의 목적지를 다시 `192.168.10.10` 으로 바꿔 pc 에게 넘긴다.

웹 서버의 접속 기록에도 공유기 주소가 남는다.

```bash
tail -1 /tmp/inet-http.log
```

```
203.0.113.1 - - [18/Oct/2026 13:06:53] "GET / HTTP/1.1" 200 -
```

웹 서버 입장에서는 pc 가 있는지조차 모른다. 집 안의 컴퓨터가 몇 대든, 밖에서는 모두 공인 IP 하나로 보인다.

## 4. conntrack — 공유기의 기억

답장이 오면 공유기는 그게 누구에게 갈 것인지 어떻게 알까. **conntrack 표**에 적어 뒀다.

```bash
ip netns exec rtr conntrack -L
```

```
tcp      6 117 TIME_WAIT src=192.168.10.10 dst=203.0.113.100 sport=55666 dport=80 src=203.0.113.100 dst=203.0.113.1 sport=80 dport=55666 [ASSURED] mark=0 use=1
conntrack v1.4.8 (conntrack-tools): 1 flow entries have been shown.
```

한 줄에 주소가 두 묶음 있다.

| 묶음 | 뜻 |
|---|---|
| 앞 `src=192.168.10.10 dst=203.0.113.100 sport=55666 dport=80` | pc 가 보낸 원래 모습 |
| 뒤 `src=203.0.113.100 dst=203.0.113.1 sport=80 dport=55666` | 답장이 돌아올 모습 |

답장이 뒤쪽 모습으로 오면, 공유기는 이 줄을 찾아 앞쪽의 pc 에게 되돌려 준다. `TIME_WAIT` 는 연결이 막 끝났다는 뜻이고, `117` 은 이 줄이 지워지기까지 남은 초다.

NAT 규칙의 카운터도 본다.

```bash
ip netns exec rtr nft list ruleset | grep counter
```

```
		oifname "r-wan" counter packets 1 bytes 60 masquerade
```

연결 하나에 패킷이 열 개쯤 오갔는데 카운터는 **1** 이다. NAT 규칙은 **연결의 첫 패킷만** 본다. 나머지는 conntrack 표를 보고 같은 방식으로 바꾼다.

## 5. 포트포워딩 — 밖에서 집 안 서버로 (DNAT)

이번에는 반대 방향이다. pc 에 웹 서버를 하나 띄우고, 인터넷에서 접속하게 만든다.

```bash
ip netns exec pc sh -c 'mkdir -p /tmp/pcweb && cd /tmp/pcweb && echo "hello from pc" > index.html && python3 -m http.server 8080 > /tmp/pc-http.log 2>&1 &'
```

인터넷에서 보이는 것은 공유기의 공인 IP 뿐이다. 거기의 8080번으로 접속해 본다.

```bash
ip netns exec inet curl -sS -m 3 http://203.0.113.1:8080/
```

```
curl: (7) Failed to connect to 203.0.113.1 port 8080 after 0 ms: Couldn't connect to server
```

공유기 자신은 8080번에서 기다리는 프로그램이 없다. 그래서 곧바로 거절(RST)한다. [tcpdump 로 TCP 3-way handshake 보기](https://autops.run/tcpdump-tcp-handshake/)에서 본 `Connection refused` 와 같은 상황이다.

공유기에 "공인 IP 의 8080번으로 오면 pc 의 8080번으로 넘겨라" 라는 규칙을 넣는다.

```bash
ip netns exec rtr nft add chain ip nat prerouting '{ type nat hook prerouting priority dstnat; policy accept; }'
ip netns exec rtr nft add rule ip nat prerouting iifname r-wan ip daddr 203.0.113.1 tcp dport 8080 counter dnat to 192.168.10.10:8080
```

이번에는 **패킷이 공유기에 막 들어온 직후**(`prerouting`)에 목적지를 바꾼다. 목적지를 먼저 바꿔야 공유기가 "이건 pc 에게 보낼 패킷이구나" 하고 길을 정할 수 있다.

```bash
ip netns exec inet curl -sS -m 3 http://203.0.113.1:8080/
tail -1 /tmp/pc-http.log
```

```
hello from pc
```

```
203.0.113.100 - - [18/Oct/2026 13:08:01] "GET / HTTP/1.1" 200 -
```

pc 의 웹 서버가 답했다. pc 의 기록에는 접속한 쪽의 **진짜 주소** `203.0.113.100` 이 남는다. 들어올 때는 목적지만 바꾸고 출발지는 그대로 두기 때문이다.

> ⚠️ 규칙에서 `ip daddr 203.0.113.1` 을 빼면, 공유기 주소가 아닌 곳으로 가는 8080번 접속까지 이 규칙에 걸린다. 처음 실습할 때 이걸 빼먹어서, 카운터가 예상보다 훨씬 많이 올라갔다. 포트포워딩은 **어느 주소의 어느 포트인지 좁게** 지정한다.

## 6. NAT 는 방화벽이 아니다

흔히 "공유기 뒤에 있으니 밖에서 못 들어온다" 고 생각한다. 정말 그런지 시험해 본다.

같은 통신사 망 안에 있는 누군가가 "192.168.10.x 로 가는 길은 저 공유기" 라고 직접 길을 잡았다고 하자. 인터넷 전체에서는 안 되지만, 공유기 바로 바깥의 같은 망에서는 이런 일이 가능하다.

```bash
ip -n inet route add 192.168.10.0/24 via 203.0.113.1
ip netns exec inet ping -c 2 -W 1 192.168.10.10
ip netns exec inet curl -sS -m 3 http://192.168.10.10:8080/
```

```
64 bytes from 192.168.10.10: icmp_seq=1 ttl=63 time=0.041 ms
64 bytes from 192.168.10.10: icmp_seq=2 ttl=63 time=0.056 ms
2 packets transmitted, 2 received, 0% packet loss, time 1057ms
```

```
hello from pc
```

포트포워딩을 거치지 않고 **집 안의 pc 에 그대로 들어갔다.** NAT 는 주소를 바꿔 줄 뿐, 아무것도 막지 않는다. 공유기는 그저 길을 아는 라우터라서, 길만 알면 그대로 넘겨준다.

실제 공유기가 안전한 것은 NAT 와 함께 **방화벽이 켜져 있기 때문**이다. 다음 단계에서 그 방화벽을 만든다.

## 7. 방화벽 — 기본은 막고 필요한 것만 연다

공유기를 지나가는 패킷(`forward`)을 검사하는 규칙을 파일로 만든다. 규칙이 여러 줄일 때는 파일로 한 번에 넣는 편이 읽기 쉽다.

```bash
cat > /tmp/fw.nft <<'NFT'
table inet filter {
	chain forward {
		type filter hook forward priority filter; policy drop;
		ct state established,related accept
		iifname "r-lan" oifname "r-wan" accept
		ct status dnat accept
		counter drop
	}
}
NFT
ip netns exec rtr nft -f /tmp/fw.nft
```

규칙은 **위에서부터 차례로** 검사하고, 처음 맞는 줄에서 결정된다.

| 줄 | 뜻 |
|---|---|
| `policy drop` | 아래 어느 줄에도 안 맞으면 **버린다**. 기본은 차단 |
| `ct state established,related accept` | 이미 허용한 연결의 나머지 패킷과 답장은 통과 |
| `iifname "r-lan" oifname "r-wan" accept` | 집 안에서 인터넷으로 **새로 나가는** 연결은 허용 |
| `ct status dnat accept` | 포트포워딩 규칙으로 들어온 연결은 허용 |
| `counter drop` | 나머지는 개수를 세고 버린다 |

> 💡 `ct` 로 시작하는 줄은 conntrack 표를 보고 판단한다. "답장인지", "포트포워딩된 연결인지" 를 패킷 하나만 봐서는 알 수 없는데, 공유기가 연결을 기억하고 있어서 가능하다. 이렇게 연결 상태를 보는 방화벽을 **상태 기반 방화벽**(stateful firewall)이라고 부른다.

방금 시험을 그대로 다시 해 본다.

```bash
ip netns exec inet ping -c 2 -W 1 192.168.10.10
ip netns exec inet curl -sS -m 3 http://192.168.10.10:8080/
```

```
2 packets transmitted, 0 received, 100% packet loss, time 1005ms
```

```
curl: (28) Connection timed out after 3002 milliseconds
```

직접 들어오는 길은 막혔다. 버리기만 하고 거절 답장도 안 보내서 `refused` 가 아니라 `timed out` 이 된다. 이제 열어 둔 길이 여전히 되는지 본다.

```bash
ip netns exec inet curl -sS -m 3 http://203.0.113.1:8080/
ip netns exec pc curl -sS -o /dev/null -w 'http_code=%{http_code}\n' http://203.0.113.100/
ip netns exec pc ping -c 1 -W 1 203.0.113.100
```

```
hello from pc
```

```
http_code=200
```

```
64 bytes from 203.0.113.100: icmp_seq=1 ttl=63 time=0.044 ms
```

| 시험 | 방화벽 전 | 방화벽 후 |
|---|---|---|
| 인터넷 → pc 직접 ping | 통과 | **차단** |
| 인터넷 → pc:8080 직접 접속 | 통과 | **차단** |
| 인터넷 → 공인 IP:8080 (포트포워딩) | 통과 | 통과 |
| pc → 인터넷 웹·ping | 통과 | 통과 |

카운터로 무엇이 얼마나 걸렸는지 본다.

```bash
ip netns exec rtr nft list ruleset | grep counter
```

```
		oifname "r-wan" counter packets 3 bytes 204 masquerade
		iifname "r-wan" ip daddr 203.0.113.1 tcp dport 8080 counter packets 2 bytes 120 dnat to 192.168.10.10:8080
		counter packets 5 bytes 348 drop
```

- masquerade 3 — pc 가 밖으로 낸 연결 세 개(웹 두 번, ping 한 번)
- dnat 2 — 포트포워딩으로 들어온 연결 두 개
- drop 5 — 직접 ping 2개, 직접 접속 SYN 3개(재전송 포함)

## 8. 정리하기

```bash
pkill -f http.server
for n in pc rtr inet; do ip netns del $n; done
ip netns list
exit
```

`ip netns list` 가 아무것도 안 보여 주면 깨끗해진 것이다.

## 확인

처음부터 다시 했다면 아래가 모두 맞아야 한다.

- masquerade 전에는 pc → 웹 서버가 `(28) timed out`, 후에는 `http_code=200`
- 웹 서버 로그의 접속 주소가 `203.0.113.1`
- `conntrack -L` 에 주소 묶음이 두 개인 줄이 보인다
- 포트포워딩 후 `curl http://203.0.113.1:8080/` 이 `hello from pc`
- 방화벽 후 인터넷 → pc 직접 접속은 실패, 포트포워딩과 pc → 인터넷은 성공

## 정리

- **SNAT(masquerade)** 는 나가는 패킷의 출발지를 공인 IP 로 바꾼다. 사설 주소로 인터넷을 쓸 수 있는 이유다.
- **DNAT(포트포워딩)** 는 들어오는 패킷의 목적지를 집 안 서버로 바꾼다. 대상은 좁게 잡는다.
- **conntrack** 이 연결마다 바꾼 내용을 기억해서 답장을 제자리로 돌려준다. NAT 규칙은 연결의 첫 패킷만 본다.
- **NAT 는 방화벽이 아니다.** 지켜 주는 것은 "기본은 차단, 답장과 허용한 것만 통과" 라는 방화벽 정책이다.

### nftables 에서 각 기능이 걸리는 자리

| 하는 일 | chain 의 hook | 언제 |
|---|---|---|
| 포트포워딩 (DNAT) | `prerouting` | 패킷이 공유기에 막 들어왔을 때 |
| 방화벽 (지나가는 패킷) | `forward` | 공유기를 거쳐 다른 랜선으로 넘어갈 때 |
| masquerade (SNAT) | `postrouting` | 패킷이 공유기를 막 나갈 때 |

다음 실습에서는 같은 공유기를 **OPNsense** 라는 방화벽 전용 운영체제로 다시 만든다. 웹 화면에서 누르는 버튼 하나하나가 오늘 손으로 쓴 규칙의 어느 줄에 해당하는지 비교해 본다.
