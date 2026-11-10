![ip netns 로 라우터 만들기 — "Network is unreachable" 에서 ARP·TTL 까지, 리눅스 한 대로](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/127-cover-netns.jpg)

컴퓨터 한 대만 있어도 "PC 두 대와 그 사이의 라우터" 를 만들어 볼 수 있다. 리눅스의 **네트워크 네임스페이스** 기능을 쓰면 된다. 이 글에서는 그렇게 만든 작은 네트워크로 라우팅의 기본을 하나씩 확인한다.

| 확인하는 것 | 이걸 모르면 생기는 일 |
|---|---|
| 같은 네트워크 안에서는 ARP 로 상대를 찾는다 | 캡처에 섞인 ARP 가 뭔지, `ip neigh` 가 뭔지 모른다 |
| 다른 네트워크로 가려면 게이트웨이가 필요하다 | `Network is unreachable` 앞에서 막힌다 |
| 라우터는 전달 기능(`ip_forward`)을 켜야 한다 | 길을 다 넣었는데도 패킷이 사라진다 |
| 돌아오는 길도 있어야 한다 | 요청은 도착하는데 답이 안 온다 |
| 라우터를 지나면 MAC 은 바뀌고 IP 는 그대로다 | 캡처를 봐도 무슨 일이 일어난 건지 못 읽는다 |
| 서브넷 마스크가 "같은 동네" 를 정한다 | 마스크 한 글자 실수로 반나절을 날린다 |

출력은 모두 실습용 Ubuntu 24.04 가상 머신에서 실제로 실행한 결과다. 패킷 캡처 (`tcpdump`) 를 처음 본다면 [tcpdump 로 TCP 3-way handshake 보기](https://autops.run/tcpdump-tcp-handshake/)를 먼저 읽으면 출력이 더 잘 읽힌다.

## 먼저 알아 둘 말

| 말 | 쉽게 말하면 |
|---|---|
| **서브넷** | 같은 동네. `10.0.1.0/24` 는 "10.0.1.로 시작하는 주소 256개" 라는 뜻이다 |
| **서브넷 마스크** (`/24`) | 주소의 앞 몇 자리가 동네 이름인지 정한다. `/24` 면 앞 세 덩어리(10.0.1)가 동네 이름 |
| **라우터** | 서로 다른 동네를 잇는 장치. 집 공유기가 대표적인 라우터다 |
| **게이트웨이** | "우리 동네 밖으로 나가려면 이리로" 하는 출구. 보통 라우터의 주소다 |
| **MAC 주소** | 랜카드마다 붙은 고유 번호. 같은 동네 안에서 상대를 찾을 때 쓴다 |
| **ARP** | "이 IP 가진 사람, MAC 주소 좀 알려 줘" 라고 동네에 외치는 방법 |
| **TTL** | 패킷의 수명. 라우터를 하나 지날 때마다 1씩 줄고, 0 이 되면 버려진다 |

## 네임스페이스 — 컴퓨터 한 대를 여러 대처럼

**네트워크 네임스페이스**는 한 리눅스 안에 **서로 완전히 분리된 네트워크 공간**을 만드는 기능이다. 아파트 한 동 안의 각 세대라고 생각하면 된다.

- 공간마다 **랜카드, IP 주소, 라우팅 표, ARP 표가 따로** 있다.
- 한 공간에서는 다른 공간의 장치나 주소가 보이지 않는다.
- CPU·메모리·디스크는 함께 쓴다. 그래서 공간 하나에 메모리가 거의 들지 않는다.

Docker 컨테이너가 저마다 IP 를 갖는 것도 이 기능 덕분이다. 패킷을 다루는 코드도 실제 서버와 똑같은 리눅스 커널 코드라서, 여기서 본 동작은 진짜 장비에서도 그대로다.

## 만들 네트워크

```
 [pca] 10.0.1.10 ── 10.0.1.0/24 ── [rtr] ── 10.0.2.0/24 ── 10.0.2.10 [pcb]
                         r-eth0: 10.0.1.1   r-eth1: 10.0.2.1
```

- `pca`, `pcb` — 가상 PC 두 대. 서로 **다른 동네**에 있다.
- `rtr` — 두 동네를 잇는 라우터. 동네마다 하나씩, 랜카드가 두 개다.
- 가상 랜선 두 가닥 — `a-eth0 ↔ r-eth0`, `b-eth0 ↔ r-eth1`.

> 📌 `10.0.x.x` 주소는 이 실습 안에서만 쓰는 사설 주소다. 집 네트워크와 겹치지 않으니 그대로 따라 쳐도 된다.

## 준비물

- 리눅스 한 대. 가상 머신이어도 된다. 여기서는 Ubuntu 24.04 를 썼다
- `iproute2`(`ip` 명령), `tcpdump`, `traceroute`

```bash
sudo apt install -y iproute2 tcpdump traceroute
```

걸리는 시간은 40분 정도다. 시작하기 전에 관리자 셸로 들어간다.

```bash
sudo -i
```

> 💡 이 실습은 명령마다 관리자 권한이 필요하다. `sudo -i` 로 관리자(root) 셸에 들어가면 매번 `sudo` 를 붙이지 않아도 된다. 프롬프트가 `#` 로 바뀌면 들어간 것이다. 실습이 끝나면 `exit` 로 나온다.

## 1. 가상 PC 세 대와 랜선을 만든다

공간 세 개를 만든다.

```bash
ip netns add pca
ip netns add rtr
ip netns add pcb
ip netns list
```

```
pcb (id: 2)
rtr (id: 1)
pca (id: 0)
```

가상 랜선(**veth**) 두 가닥을 만든다. veth 는 늘 **양쪽 끝이 한 쌍**으로 생긴다. 한쪽에 넣은 패킷이 반대쪽으로 나온다.

```bash
ip link add a-eth0 type veth peer name r-eth0
ip link add b-eth0 type veth peer name r-eth1
```

랜선 끝을 각 공간에 꽂는다.

```bash
ip link set a-eth0 netns pca
ip link set r-eth0 netns rtr
ip link set b-eth0 netns pcb
ip link set r-eth1 netns rtr
```

각 랜카드에 주소를 붙이고 켠다. `ip -n pca …` 는 "pca 공간 안에서 실행하라" 는 뜻이다.

```bash
ip -n pca addr add 10.0.1.10/24 dev a-eth0
ip -n rtr addr add 10.0.1.1/24  dev r-eth0
ip -n rtr addr add 10.0.2.1/24  dev r-eth1
ip -n pcb addr add 10.0.2.10/24 dev b-eth0

for n in pca rtr pcb; do ip -n $n link set lo up; done
ip -n pca link set a-eth0 up
ip -n rtr link set r-eth0 up
ip -n rtr link set r-eth1 up
ip -n pcb link set b-eth0 up
```

> 📌 `lo` 는 컴퓨터가 자기 자신과 이야기할 때 쓰는 장치다. 새 공간에서는 이것도 꺼진 채로 시작해서 함께 켜 준다.

공간마다 주소를 확인한다.

```bash
for n in pca rtr pcb; do echo "--- $n"; ip -n $n -br addr; done
```

```
--- pca
lo               UNKNOWN        127.0.0.1/8 ::1/128
a-eth0@if3       UP             10.0.1.10/24 fe80::f054:ebff:fe92:4dba/64
--- rtr
lo               UNKNOWN        127.0.0.1/8 ::1/128
r-eth0@if4       UP             10.0.1.1/24 fe80::1c88:83ff:fec0:f7e/64
r-eth1@if6       UP             10.0.2.1/24 fe80::683e:4aff:fe7b:f5e8/64
--- pcb
lo               UNKNOWN        127.0.0.1/8 ::1/128
b-eth0@if5       UP             10.0.2.10/24 fe80::a89a:7aff:fe58:9359/64
```

`fe80::` 로 시작하는 것은 IPv6 주소가 자동으로 붙은 것이라 무시해도 된다.

이번에는 **본체**(공간 밖)에서 장치 목록을 본다.

```bash
ip -br link
```

방금 만든 랜선 네 개가 하나도 보이지 않는다. 각 공간으로 옮겨 가서 본체에서는 안 보이는 것이다. 공간들이 정말 **분리된 컴퓨터**라는 증거다.

## 2. 같은 동네끼리는 ARP 로 찾는다

pca 의 ARP 표(`ip neigh`)를 본다. 아직 아무와도 이야기한 적이 없어서 **비어 있다.**

```bash
ip netns exec pca ip neigh
```

`ip netns exec 공간이름 명령` 은 "그 공간 안에서 이 명령을 실행하라" 는 뜻이다. `ip -n` 은 `ip` 명령 전용 줄임이고, `ping`·`tcpdump` 같은 다른 프로그램은 이렇게 쓴다.

라우터 쪽에 녹화를 걸어 두고, pca 에서 라우터로 ping 을 보낸다.

```bash
ip netns exec rtr tcpdump -i r-eth0 -nn -e -c 4 'arp or icmp' &
ip netns exec pca ping -c 1 10.0.1.1
```

`-e` 는 MAC 주소까지 보여 달라는 옵션이다. 결과는 이렇다(시각은 뺐다).

```
f2:54:eb:92:4d:ba > ff:ff:ff:ff:ff:ff, ethertype ARP (0x0806), length 42: Request who-has 10.0.1.1 tell 10.0.1.10, length 28
1e:88:83:c0:0f:7e > f2:54:eb:92:4d:ba, ethertype ARP (0x0806), length 42: Reply 10.0.1.1 is-at 1e:88:83:c0:0f:7e, length 28
f2:54:eb:92:4d:ba > 1e:88:83:c0:0f:7e, ethertype IPv4 (0x0800), length 98: 10.0.1.10 > 10.0.1.1: ICMP echo request, id 3471, seq 1, length 64
1e:88:83:c0:0f:7e > f2:54:eb:92:4d:ba, ethertype IPv4 (0x0800), length 98: 10.0.1.1 > 10.0.1.10: ICMP echo reply, id 3471, seq 1, length 64
```

| 줄 | 무슨 일 |
|---|---|
| 1 | pca 가 **동네 전체**(`ff:ff:ff:ff:ff:ff`)에 외친다. "10.0.1.1 가진 사람? 10.0.1.10 한테 알려 줘" |
| 2 | 라우터가 **pca 에게만** 답한다. "10.0.1.1 은 나야. 내 MAC 은 `1e:88:…`" |
| 3 | 이제 MAC 을 알았으니 ping 요청을 라우터에게 보낸다 |
| 4 | 라우터가 ping 에 답한다 |

ping 은 IP 주소로 보냈지만, 실제 랜선 위에서는 **MAC 주소를 알아야 보낼 수 있다.** 그래서 ping 보다 ARP 가 먼저 오간다. 알아낸 MAC 은 ARP 표에 저장된다.

```bash
ip netns exec pca ip neigh
```

```
10.0.1.1 dev a-eth0 lladdr 1e:88:83:c0:0f:7e REACHABLE
```

다음부터는 외치지 않고 이 표를 보고 바로 보낸다. 표의 기록은 한동안 쓰이지 않으면 지워지고, 그러면 다시 ARP 로 물어본다.

> 📌 `ff:ff:ff:ff:ff:ff` 는 **브로드캐스트** 주소다. "동네 모두에게" 라는 뜻이다. 외침은 같은 동네 안에서만 들리고, 라우터를 넘어가지 않는다.

## 3. 다른 동네로는 못 간다 — Network is unreachable

이번에는 pca 에서 다른 동네의 pcb 로 ping 을 보낸다. 먼저 pca 가 아는 길을 본다.

```bash
ip netns exec pca ip route
ip netns exec pca ping -c 1 10.0.2.10
```

```
10.0.1.0/24 dev a-eth0 proto kernel scope link src 10.0.1.10
ping: connect: Network is unreachable
```

**라우팅 표**(`ip route`)가 이 공간이 아는 길의 전부다. 한 줄밖에 없고, 뜻은 "10.0.1.x 는 a-eth0 랜선에 바로 있다" 다. 10.0.2.10 으로 가는 길은 어디에도 없다.

그래서 ping 은 **패킷을 내보내지도 못하고** 그 자리에서 실패한다. 이것이 `Network is unreachable` 이다. 상대가 꺼져 있다는 뜻이 아니라 **"어디로 보내야 할지 모르겠다"** 는 뜻이다.

## 4. 하나씩 이어 가며 어디서 막히는지 본다

라우팅이 되려면 세 가지가 다 있어야 한다. 하나씩 넣으면서 무엇이 빠지면 어떻게 되는지 본다. 매 단계 확인은 같은 명령으로 한다.

```bash
ip netns exec pca ping -c 2 -W 1 10.0.2.10
```

### 4-1. pca 에 게이트웨이를 넣는다

"모르는 곳은 전부 라우터(10.0.1.1)에게 맡겨라" 라는 길을 넣는다. 이것을 **기본 경로**(default route), 그 라우터를 **게이트웨이**라고 부른다.

```bash
ip -n pca route add default via 10.0.1.1
ip netns exec pca ip route
```

```
default via 10.0.1.1 dev a-eth0
10.0.1.0/24 dev a-eth0 proto kernel scope link src 10.0.1.10
```

이제 ping 을 보낸다. 그동안 pcb 쪽에서 무엇이 도착하는지 녹화한다.

```bash
ip netns exec pcb timeout 5 tcpdump -i b-eth0 -nn icmp &
ip netns exec pca ping -c 2 -W 1 10.0.2.10
```

```
2 packets transmitted, 0 received, 100% packet loss, time 1012ms
```

pcb 쪽 녹화에는 **아무것도 없다**(`0 packets captured`). 이번에는 `unreachable` 이 아니다. 패킷은 라우터까지 갔다. 그런데 라우터가 넘겨주지 않았다.

```bash
ip netns exec rtr sysctl net.ipv4.ip_forward
```

```
net.ipv4.ip_forward = 0
```

리눅스는 기본적으로 **남의 패킷을 다른 랜선으로 넘겨주지 않는다.** 자기에게 온 패킷만 받는다. 라우터로 쓰려면 이 전달 기능을 켜야 한다.

### 4-2. 라우터의 전달 기능을 켠다

```bash
ip netns exec rtr sysctl -w net.ipv4.ip_forward=1
ip netns exec pcb timeout 5 tcpdump -i b-eth0 -nn icmp &
ip netns exec pca ping -c 2 -W 1 10.0.2.10
```

ping 은 여전히 실패한다.

```
2 packets transmitted, 0 received, 100% packet loss, time 1044ms
```

그런데 이번에는 pcb 쪽 녹화에 **요청이 도착해 있다.**

```
IP 10.0.1.10 > 10.0.2.10: ICMP echo request, id 3502, seq 1, length 64
IP 10.0.1.10 > 10.0.2.10: ICMP echo request, id 3502, seq 2, length 64
```

요청은 왔는데 답장이 안 나갔다. pcb 의 길을 보면 이유가 보인다.

```bash
ip netns exec pcb ip route
ip netns exec pcb ping -c 1 10.0.1.10
```

```
10.0.2.0/24 dev b-eth0 proto kernel scope link src 10.0.2.10
ping: connect: Network is unreachable
```

pcb 는 10.0.1.10 으로 **돌아가는 길을 모른다.** 편지는 받았는데 답장 보낼 주소로 가는 길을 모르는 셈이다.

> ⚠️ **통신은 가는 길과 오는 길이 둘 다 있어야 된다.** 한쪽만 고치고 "요청이 도착하는데 왜 안 되지?" 하고 막히는 일이 실무에서 정말 흔하다. 이럴 때는 받는 쪽에서 tcpdump 를 걸어 "도착은 하는지" 부터 확인하면 금방 갈린다.

### 4-3. pcb 에도 게이트웨이를 넣는다

```bash
ip -n pcb route add default via 10.0.2.1
ip netns exec pca ping -c 3 -W 1 10.0.2.10
```

```
64 bytes from 10.0.2.10: icmp_seq=1 ttl=63 time=0.040 ms
64 bytes from 10.0.2.10: icmp_seq=2 ttl=63 time=0.042 ms
64 bytes from 10.0.2.10: icmp_seq=3 ttl=63 time=0.043 ms

--- 10.0.2.10 ping statistics ---
3 packets transmitted, 3 received, 0% packet loss, time 2047ms
```

드디어 된다. 세 단계를 표로 모으면 이렇다.

| 단계 | 넣은 것 | ping | pcb 에 요청이 도착했나 |
|---|---|---|---|
| 처음 | 없음 | `Network is unreachable` | 아니오 (보내지도 못함) |
| 4-1 | pca 게이트웨이 | 100% 손실 | 아니오 (라우터가 안 넘김) |
| 4-2 | 라우터 `ip_forward=1` | 100% 손실 | **예** (답장 길이 없음) |
| 4-3 | pcb 게이트웨이 | **성공** | 예 |

`ttl=63` 도 눈여겨본다. 리눅스는 TTL 64 로 보내는데, 라우터를 하나 지나며 1이 줄었다.

## 5. 라우터를 지나면 무엇이 바뀌나

라우터의 **양쪽 랜카드**에 동시에 녹화를 걸고 ping 을 한 번 보낸다.

```bash
ip netns exec rtr tcpdump -i r-eth0 -nn -e -v -c 2 icmp &
ip netns exec rtr tcpdump -i r-eth1 -nn -e -v -c 2 icmp &
ip netns exec pca ping -c 1 10.0.2.10
```

같은 ping 요청이 라우터에 **들어올 때**(r-eth0)와 **나갈 때**(r-eth1)의 모습이다. 필요한 부분만 남겼다.

```
r-eth0  f2:54:eb:92:4d:ba > 1e:88:83:c0:0f:7e ... ttl 64 ... 10.0.1.10 > 10.0.2.10: ICMP echo request
r-eth1  6a:3e:4a:7b:f5:e8 > aa:9a:7a:58:93:59 ... ttl 63 ... 10.0.1.10 > 10.0.2.10: ICMP echo request
```

MAC 주소의 주인은 각 공간에서 `ip -br link` 로 확인할 수 있다.

| | 들어올 때 (r-eth0) | 나갈 때 (r-eth1) |
|---|---|---|
| 보낸 MAC → 받는 MAC | pca(`f2:54…`) → 라우터(`1e:88…`) | 라우터(`6a:3e…`) → pcb(`aa:9a…`) |
| 보낸 IP → 받는 IP | 10.0.1.10 → 10.0.2.10 | 10.0.1.10 → 10.0.2.10 (**그대로**) |
| TTL | 64 | **63** |

- **IP 주소는 출발지와 최종 목적지**라서 끝까지 그대로다.
- **MAC 주소는 "이번 구간에서 누가 누구에게"** 라서 라우터를 지날 때마다 새로 쓴다.
- **TTL 은 라우터를 지날 때마다 1씩 준다.** 길을 잘못 만들어 패킷이 영원히 빙빙 도는 것을 막는 안전장치다.

> 💡 택배에 빗대면 쉽다. 송장(IP)에는 처음 보낸 사람과 최종 받는 사람이 적혀 있고 끝까지 그대로다. 그 대신 택배는 구간마다 다른 트럭(MAC)을 갈아탄다. 물류센터(라우터)는 송장을 보고 다음 트럭을 정한다.

## 6. traceroute 로 거쳐 가는 길을 본다

```bash
ip netns exec pca traceroute -n 10.0.2.10
```

```
traceroute to 10.0.2.10 (10.0.2.10), 30 hops max, 60 byte packets
 1  10.0.1.1  0.029 ms  0.005 ms  0.004 ms
 2  10.0.2.10  0.010 ms  0.006 ms  0.004 ms
```

1번이 라우터, 2번이 목적지다. traceroute 는 TTL 을 일부러 1, 2, 3… 으로 보낸다. TTL 1 짜리는 첫 라우터에서 수명이 다해 버려지고, 라우터가 "여기서 버렸다" 고 알려 준다. 그 알림을 모아 경로를 그린다. 5단계에서 본 TTL 감소를 거꾸로 이용하는 셈이다.

세 공간의 라우팅 표를 마지막으로 한눈에 본다.

```bash
for n in pca rtr pcb; do echo "--- $n"; ip -n $n route; done
```

```
--- pca
default via 10.0.1.1 dev a-eth0
10.0.1.0/24 dev a-eth0 proto kernel scope link src 10.0.1.10
--- rtr
10.0.1.0/24 dev r-eth0 proto kernel scope link src 10.0.1.1
10.0.2.0/24 dev r-eth1 proto kernel scope link src 10.0.2.1
--- pcb
default via 10.0.2.1 dev b-eth0
10.0.2.0/24 dev b-eth0 proto kernel scope link src 10.0.2.10
```

라우터에는 기본 경로가 없다. 두 동네 모두에 직접 연결돼 있어서 따로 알려 줄 길이 없다.

## 7. 마스크를 틀리게 넣어 본다

마지막으로 흔한 실수를 일부러 해 본다. pca 의 마스크를 `/24` 대신 `/16` 으로 넣는다.

```bash
ip -n pca addr del 10.0.1.10/24 dev a-eth0
ip -n pca addr add 10.0.1.10/16 dev a-eth0
ip -n pca route add default via 10.0.1.1
ip netns exec pca ip route
```

```
default via 10.0.1.1 dev a-eth0
10.0.0.0/16 dev a-eth0 proto kernel scope link src 10.0.1.10
```

> 📌 주소를 지우면 그 주소에 딸린 기본 경로도 같이 사라진다. 그래서 다시 넣었다.

게이트웨이까지 제대로 넣었다. 그런데 `/16` 이면 "10.0.x.x 전체" 가 같은 동네가 된다. 10.0.2.10 으로 갈 때 어느 길을 쓰는지 물어본다.

```bash
ip netns exec pca ip route get 10.0.2.10
```

```
10.0.2.10 dev a-eth0 src 10.0.1.10 uid 0
```

`via 10.0.1.1` 이 없다. **라우터에 맡기지 않고 직접 찾아가려 한다.** ping 을 보내면서 라우터 쪽에서 녹화해 본다.

```bash
ip netns exec rtr timeout 6 tcpdump -i r-eth0 -nn 'arp or icmp' &
ip netns exec pca ping -c 2 -W 1 10.0.2.10
ip netns exec pca ip neigh
```

```
2 packets transmitted, 0 received, 100% packet loss, time 1034ms
```

```
ARP, Request who-has 10.0.2.10 tell 10.0.1.10, length 28
ARP, Request who-has 10.0.2.10 tell 10.0.1.10, length 28
ARP, Request who-has 10.0.2.10 tell 10.0.1.10, length 28
```

```
10.0.2.10 dev a-eth0 INCOMPLETE
```

같은 동네라고 착각했으니 ARP 로 "10.0.2.10 누구?" 하고 외친다. 하지만 pcb 는 다른 랜선에 있어서 그 외침을 듣지 못한다. `INCOMPLETE` 는 "물어봤는데 아직 답이 없다" 는 뜻이다. 몇 초 기다렸다가 다시 보면 포기한 상태로 바뀐다.

```bash
sleep 3; ip netns exec pca ip neigh
```

```
10.0.2.10 dev a-eth0 FAILED
```
**게이트웨이를 아무리 잘 넣어도, 마스크가 틀리면 게이트웨이를 쓰지 않는다.**

원래대로 되돌린다.

```bash
ip -n pca addr del 10.0.1.10/16 dev a-eth0
ip -n pca addr add 10.0.1.10/24 dev a-eth0
ip -n pca route add default via 10.0.1.1
ip netns exec pca ip route get 10.0.2.10
```

```
10.0.2.10 via 10.0.1.1 dev a-eth0 src 10.0.1.10 uid 0
```

`via 10.0.1.1`, 라우터를 거치는 길로 돌아왔다.

## 정리하기

공간을 지우면 그 안의 랜선, 주소, 라우팅이 한 번에 사라진다.

```bash
for n in pca rtr pcb; do ip netns del $n; done
ip netns list
exit
```

`ip netns list` 가 아무것도 안 보여 주면 깨끗해진 것이다. 컴퓨터를 재부팅해도 사라지니, 마음껏 망가뜨리고 1단계부터 다시 만들어 봐도 된다.

## 확인

처음부터 다시 만들었다면 아래가 모두 맞아야 한다.

- 4-3 이후 `ip netns exec pca ping -c 1 10.0.2.10` 결과에 `ttl=63`, `0% packet loss`
- `ip netns exec rtr sysctl net.ipv4.ip_forward` 결과가 `= 1`
- `ip netns exec pca traceroute -n 10.0.2.10` 결과가 두 줄 (`10.0.1.1`, `10.0.2.10`)
- `ip netns exec pca ip route get 10.0.2.10` 결과에 `via 10.0.1.1`

## 정리

- **같은 동네면 ARP 로 직접, 다른 동네면 게이트웨이로.** 어느 동네인지는 서브넷 마스크가 정한다. 마스크가 틀리면 게이트웨이가 있어도 안 쓴다.
- **라우팅에는 세 가지가 다 필요하다.** 보내는 쪽의 길, 라우터의 전달 기능(`ip_forward`), 받는 쪽의 돌아오는 길. 막혔을 때 받는 쪽에서 tcpdump 를 걸면 어디서 끊겼는지 보인다.
- **라우터를 지나면 MAC 은 바뀌고, IP 는 그대로고, TTL 은 1 줄어든다.**

### 오류로 원인 찾기

| 증상 | 뜻 | 볼 곳 |
|---|---|---|
| `Network is unreachable` | 보낼 길이 없다. 패킷이 나가지도 않았다 | 보내는 쪽 `ip route`, 게이트웨이 |
| 100% 손실, 받는 쪽에 아무것도 안 옴 | 중간에서 안 넘겨줬다 | 라우터 `ip_forward`, 방화벽 |
| 100% 손실, 받는 쪽에 요청은 옴 | 답장 길이 없다 | 받는 쪽 `ip route` |
| ARP 표에 `FAILED` | 같은 동네라고 착각했거나 상대가 꺼졌다 | 서브넷 마스크, 상대 장비 |

다음 실습에서는 이 라우터 위에 nftables 로 NAT 와 방화벽을 얹는다. 집 공유기가 사설 주소로 인터넷에 나가게 해 주는 일을 그대로 재현해 본다.
