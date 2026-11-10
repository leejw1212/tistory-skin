![kind 의 CNI 를 kindnet 에서 Calico 로 바꾸기 — 기본 IP 풀이 집 공유기와 겹친다](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/79-cover-calico-cni.jpg)

[M1 맥에 kind 로 쿠버네티스 클러스터 세우기](https://autops.run/kind-kubernetes-on-mac/)에서 만든 실습 클러스터의 **네트워크 플러그인을 Calico 로 바꾼다.**

바꾸는 과정에서 두 가지를 확인하게 된다. 하나는 인터넷에 널리 퍼진 이야기가 지금은 사실이 아니라는 것이고, 다른 하나는 공식 문서를 그대로 따라 하면 집 네트워크와 충돌한다는 것이다. 둘 다 실제로 확인한 내용이다.

## 무엇을 하는가

| | 바꾸기 전 | 바꾼 뒤 |
|---|---|---|
| 네트워크 플러그인 | kindnet (kind 기본) | **Calico v3.32.2** |
| 파드 IP 대역 | 10.244.0.0/16 | 10.244.0.0/16 (그대로 유지) |
| 표준 NetworkPolicy | 동작함 | 동작함 |
| 명시적 `Deny` 규칙 | 불가 | **가능** |
| 클러스터 전역 정책 | 불가 | **가능** |
| 노드 3대 메모리 합 | 약 1.25GB | 약 3.0GB |

## 그 전에 — CNI 가 무엇인가

처음 보는 말이면 여기부터 읽는다. 이미 아는 내용이면 건너뛴다.

쿠버네티스는 **파드끼리 통신하는 방법을 직접 만들지 않는다.** 대신 "이런 일을 해 주는 프로그램을 꽂아라" 하고 규격만 정해 두었다. 그 규격이 **CNI** (Container Network Interface, 컨테이너 네트워크 인터페이스)이고, 규격에 맞춰 만든 프로그램을 **CNI 플러그인**이라고 부른다.

CNI 플러그인이 하는 일은 크게 셋이다.

1. **파드가 뜰 때 IP 를 하나 준다.**
2. **다른 노드에 있는 파드끼리도 통신이 되게 길을 놓는다.**
3. (플러그인에 따라) **NetworkPolicy 를 읽어서 실제로 막아 준다.**

kind 는 기본으로 `kindnet` 이라는 아주 단순한 플러그인을 깔아 준다. Calico 는 실무에서 가장 널리 쓰이는 플러그인 중 하나다.

> 📌 CNI 플러그인이 아예 없으면 어떻게 되는지는 뒤에서 직접 보게 된다. 노드가 `NotReady` 에서 멈추고 파드가 하나도 안 뜬다. 고장이 아니라, 네트워크를 만들어 줄 주체가 없어서 쿠버네티스가 기다리는 상태다.

## 준비물

- kind 로 만든 클러스터 하나. 없으면 [앞 글](https://autops.run/kind-kubernetes-on-mac/)을 먼저 본다
- **클러스터를 지웠다 다시 만들 각오.** 이유는 3단계에서 설명한다
- 걸리는 시간 15분 안팎

## 1. 먼저 확인한다 — kindnet 은 정말 NetworkPolicy 를 무시하는가

"kindnet 은 NetworkPolicy 를 지원하지 않는다" 는 말이 많이 돌아다닌다. **그래서 Calico 로 바꾼다**는 식의 글도 흔하다. 정말 그런지 재 보고 시작한다.

> 📌 **NetworkPolicy 가 무엇인가.** 기본적으로 쿠버네티스 안의 파드는 **서로 전부 통신할 수 있다.** NetworkPolicy 는 거기에 제한을 거는 규칙이다. "이 파드에는 저 파드만 접근할 수 있다" 같은 것을 적어 둔다.
>
> 중요한 점이 하나 있다. NetworkPolicy 는 **쿠버네티스가 직접 막아 주지 않는다.** 규칙을 저장해 둘 뿐이고, 실제로 막는 일은 CNI 플러그인이 한다. 그래서 플러그인이 그 기능을 구현하지 않았으면 **규칙을 만들어도 아무 일도 일어나지 않는다.** 오류도 안 난다. 그냥 조용히 무시된다. 이게 위험한 부분이다.

실험 대상을 만든다. 요청을 받는 `web`, 허용할 클라이언트, 막을 클라이언트 셋이다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: client-allowed
  namespace: netpol-demo
  labels: { role: allowed }     # ← 이 라벨로 허용 여부를 가른다
spec:
  containers:
    - name: busybox
      image: busybox:1.36
      command: ["sleep", "36000"]
```

`role: blocked` 라벨만 다른 `client-blocked` 도 똑같이 하나 만든다. `web` 은 `registry.k8s.io/e2e-test-images/agnhost:2.47` 을 쓴다. 쿠버네티스가 테스트에 쓰는 공식 이미지라 arm64 맥에서도 그대로 돈다.

정책은 이렇게 쓴다.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: web-allow-only-allowed
  namespace: netpol-demo
spec:
  podSelector:
    matchLabels: { app: web }   # 이 파드로 들어오는 트래픽에 대해
  policyTypes: [Ingress]
  ingress:
    - from:
        - podSelector:
            matchLabels: { role: allowed }   # role=allowed 에서 온 것만 허용
```

확인하는 명령은 이것이다. 클라이언트 파드 안에서 `web` 으로 요청을 보내 본다.

```bash
kubectl exec -n netpol-demo client-blocked -- \
  wget -T 4 -qO- http://web:8080/hostname
```

결과다.

```
정책 없는 상태
  client-allowed → 연결됨
  client-blocked → 연결됨

정책 적용 후 (kindnet)
  client-allowed → 연결됨
  client-blocked → 차단됨      ← 막혔다
```

**막힌다.** 확인한 kindnet 은 `kindest/kindnetd:v20260820-69b56db7` 이고, 정책을 지우면 다시 뚫리고 다시 걸면 다시 막힌다. 다섯 번 반복해도 같았다. 우연이 아니라 실제로 동작하는 것이다.

> ⚠️ 다만 **즉시 막히지는 않는다.** 정책을 다시 적용한 직후 몇 초 동안은 여전히 연결됐고, 그 뒤에 막혔다. 정책을 걸자마자 확인하고 "안 되네" 하고 넘어가면 잘못 판단하게 된다. 몇 초 기다렸다가 다시 본다.

그러니 **"kindnet 이라서 NetworkPolicy 가 안 된다" 는 이유로 Calico 를 깔 필요는 없다.** 예전에는 맞는 말이었지만 지금은 아니다.

## 2. 그러면 왜 Calico 로 바꾸나

이유는 따로 있다. 표준 NetworkPolicy 자체에 **표현할 수 없는 것**이 있다.

**첫째, 허용만 쓸 수 있고 차단은 못 쓴다.** 표준 NetworkPolicy 는 "허용 목록" 방식이다. 무엇을 허용할지 적으면 적지 않은 나머지가 자동으로 막힌다. 그래서 "이것 하나만 콕 집어 막고 나머지는 다 열어 둬" 를 적을 방법이 없다.

**둘째, 네임스페이스 하나에만 적용된다.** 클러스터 전체에 같은 규칙을 걸려면 네임스페이스마다 똑같은 정책을 하나씩 만들어야 한다. 네임스페이스가 새로 생기면 거기에도 또 만들어야 한다. 빠뜨리면 그 네임스페이스만 무방비가 된다.

Calico 는 자체 규격인 `GlobalNetworkPolicy` 로 이 둘을 다 해결한다. 6단계에서 직접 확인한다.

여기에 더해, **Calico 는 실무에서 실제로 만나는 플러그인**이다. 관리형 쿠버네티스든 직접 구축한 클러스터든 Calico 를 쓰는 곳이 많다. 실습 클러스터를 실무와 같은 플러그인으로 맞춰 두면 배운 것이 그대로 이어진다.

## 3. kind 에서 CNI 를 바꾸는 법 — 클러스터를 다시 만든다

돌고 있는 클러스터에서 플러그인만 갈아끼우고 싶지만, **kind 에서는 클러스터를 다시 만드는 쪽이 맞다.** kind 는 CNI 를 클러스터 만들 때 정하기 때문이다.

이미 돌고 있는 클러스터에는 kindnet 이 남긴 것들이 그대로 있다. 노드 안을 직접 들여다보면 이렇게 생겼다.

```bash
docker exec lab-control-plane ls /etc/cni/net.d/
```

```
10-kindnet.conflist
```

이 파일이 "파드에 네트워크를 어떻게 붙일지" 를 적어 둔 설정이다. 여기에 더해 이미 떠 있는 파드들은 kindnet 이 나눠 준 IP 를 물고 있다. 이 상태에서 Calico 를 얹으면 설정 파일이 둘이 되고 IP 출처도 둘이 된다. **정리하는 것보다 다시 만드는 쪽이 빠르고 확실하다.** 실습 클러스터라 다시 만드는 데 20초면 된다.

설정 파일에 `networking` 항목을 더한다.

```yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: lab

networking:
  # 기본 CNI(kindnet) 를 설치하지 않는다
  disableDefaultCNI: true
  # 파드에 나눠 줄 IP 대역
  podSubnet: "10.244.0.0/16"

nodes:
  - role: control-plane
    image: kindest/node:v1.37.0
    labels:
      ingress-ready: "true"
    extraPortMappings:
      - containerPort: 80
        hostPort: 80
        protocol: TCP
      - containerPort: 443
        hostPort: 443
        protocol: TCP
  - role: worker
    image: kindest/node:v1.37.0
  - role: worker
    image: kindest/node:v1.37.0
```

다시 만든다.

```bash
kind delete cluster --name lab
kind create cluster --config cluster/kind-config.yaml
```

출력을 앞 글과 견줘 보면 **`Installing CNI 🔌` 줄이 사라진 것**이 보인다.

```
 ✓ Preparing nodes 📦 📦 📦
 ✓ Writing configuration 📜
 ✓ Starting control-plane 🕹️
 ✓ Installing StorageClass 💾
 ✓ Joining worker nodes 🚜
```

그리고 지금 노드를 보면 전부 `NotReady` 다.

```bash
kubectl get nodes
```

```
NAME                STATUS     ROLES           AGE   VERSION
lab-control-plane   NotReady   control-plane   15s   v1.37.0
lab-worker          NotReady   <none>          1s    v1.37.0
lab-worker2         NotReady   <none>          1s    v1.37.0
```

**정상이다.** 파드에 IP 를 줄 플러그인이 없으니 kubelet 이 "아직 준비 안 됐다" 고 보고하는 것이다. CoreDNS 도 `Pending` 으로 멈춰 있다.

```bash
kubectl get pods -n kube-system
```

```
coredns-559f6c778d-5qk95     0/1   Pending
coredns-559f6c778d-kj4bf     0/1   Pending
etcd-lab-control-plane       1/1   Running
```

여기서 당황하지 않아도 된다. 다음 단계에서 풀린다.

## 4. Calico 설치 — 여기서 기본값을 그대로 쓰면 안 된다

Calico 는 `tigera-operator` 라는 관리자 프로그램을 먼저 깔고, 그 다음에 "이렇게 설치해 줘" 하는 설정을 던지는 방식이다.

```bash
kubectl apply --server-side -f \
  https://raw.githubusercontent.com/projectcalico/calico/v3.32.2/manifests/tigera-operator.yaml
```

> 📌 `--server-side` 를 붙인 이유가 있다. 보통 `kubectl apply` 는 적용한 설정 전체를 어노테이션에 적어 두는데, Calico 처럼 정의가 큰 경우 **크기 제한(약 262KB)에 걸려 실패**한다. `--server-side` 는 그 방식을 쓰지 않아 제한에 걸리지 않는다.

이제 설치 설정을 준다. **이 부분이 이 글에서 가장 중요하다.**

Calico 공식 문서는 IP 대역으로 `192.168.0.0/16` 을 쓴다. 그대로 복사해 붙이기 쉬운데, **가정에서는 그러면 안 된다.**

내 맥의 주소를 보자.

```bash
ipconfig getifaddr en0
```

```
192.168.0.104
```

**집 공유기가 쓰는 대역이 정확히 `192.168.0.x` 다.** Calico 기본값을 그대로 뒀다면 파드에게 나눠 주는 IP 와 집 네트워크 주소가 겹친다. 겹치면 파드가 집 안의 다른 기기로 가려던 트래픽을 클러스터 안으로 잘못 보내는 일이 생긴다.

> ⚠️ `192.168.0.0/16` 은 `192.168.0.0` 부터 `192.168.255.255` 까지 **6만 5천여 개 주소 전부**를 뜻한다. 가정용 공유기가 흔히 쓰는 `192.168.0.x` 와 `192.168.1.x` 가 통째로 이 안에 들어간다. 회사 네트워크도 마찬가지인 경우가 많다. **기본값이니까 안전하겠지 하고 넘어가면 안 되는 자리다.**

그래서 3단계에서 `podSubnet` 으로 잡아 둔 `10.244.0.0/16` 을 그대로 쓴다.

```yaml
apiVersion: operator.tigera.io/v1
kind: Installation
metadata:
  name: default
spec:
  calicoNetwork:
    ipPools:
      - name: default-ipv4-ippool
        cidr: 10.244.0.0/16        # ← 기본값 192.168.0.0/16 을 쓰지 않는다
        blockSize: 26
        encapsulation: VXLANCrossSubnet
        natOutgoing: Enabled
        nodeSelector: all()
---
apiVersion: operator.tigera.io/v1
kind: APIServer
metadata:
  name: default
spec: {}
```

> 📌 나머지 항목이 뜻하는 것.
> - `blockSize: 26` — 노드마다 주소를 덩어리로 잘라 준다. `/26` 은 64개씩이다.
> - `encapsulation` — 노드끼리 다른 네트워크에 있으면 패킷을 한 번 감싸서 보내야 한다. `VXLANCrossSubnet` 은 **다른 네트워크일 때만** 감싼다. kind 는 모든 노드가 같은 도커 네트워크에 있어서 실제로는 안 감싼다.
> - `natOutgoing` — 파드가 클러스터 밖으로 나갈 때 주소를 노드 IP 로 바꿔 준다.
> - `APIServer` — Calico 전용 기능을 `kubectl` 로 다루려면 필요하다. 6단계에서 쓴다.

적용하고 기다린다. 노드가 `Ready` 로 바뀌면 끝난 것이다.

```bash
kubectl apply -f manifests/calico/installation.yaml
kubectl wait --namespace calico-system --for=condition=ready pod \
  --selector=k8s-app=calico-node --timeout=420s
```

## 5. 바뀌었는지 확인한다

세 가지를 본다.

**노드가 살아났는가.**

```bash
kubectl get nodes
```

```
NAME                STATUS   ROLES           AGE     VERSION
lab-control-plane   Ready    control-plane   3m18s   v1.37.0
lab-worker          Ready    <none>          3m4s    v1.37.0
lab-worker2         Ready    <none>          3m4s    v1.37.0
```

**노드 안의 설정 파일이 바뀌었는가.** 3단계에서 `10-kindnet.conflist` 였던 자리다.

```bash
docker exec lab-control-plane ls /etc/cni/net.d/
```

```
10-calico.conflist
calico-kubeconfig
```

kindnet 것은 사라지고 Calico 것이 들어왔다.

**IP 대역이 의도대로인가.** 여기가 4단계에서 조심한 부분의 결과다.

```bash
kubectl get ippools.crd.projectcalico.org \
  -o custom-columns='NAME:.metadata.name,CIDR:.spec.cidr'
```

```
NAME                  CIDR
default-ipv4-ippool   10.244.0.0/16
```

실제 파드 IP 도 확인한다.

```bash
kubectl get pods -n netpol-demo -o wide
```

```
NAME                   IP               NODE
client-allowed         10.244.120.131   lab-worker
client-blocked         10.244.120.132   lab-worker
web-7dd65d594c-qqd8h   10.244.120.130   lab-worker
```

`192.168.` 이 아니라 `10.244.` 로 나온다. 집 네트워크와 겹치지 않는다.

## 6. Calico 에서만 되는 것

2단계에서 말한 두 가지를 실제로 써 본다.

```yaml
apiVersion: projectcalico.org/v3
kind: GlobalNetworkPolicy
metadata:
  name: deny-blocked-to-web
  # namespace 가 없다. 클러스터 전체에 적용된다는 뜻이다.
spec:
  order: 100
  selector: app == 'web'
  types: [Ingress]
  ingress:
    - action: Deny                      # ← 표준 NetworkPolicy 에는 없는 것
      source:
        selector: role == 'blocked'
    - action: Allow                     # 나머지는 전부 허용
```

표준 NetworkPolicy 와 견주면 차이가 보인다. `action: Deny` 로 **무엇을 막을지** 직접 적었고, `metadata` 에 `namespace` 가 없다.

적용하고 확인한다.

```bash
kubectl get globalnetworkpolicies.projectcalico.org
```

```
NAME                  NAMESPACE   ORDER
deny-blocked-to-web   <none>      100
```

```
client-allowed → 연결됨
client-blocked → 차단됨
```

**클러스터 전역이라는 말을 확인해 본다.** 두 번째 네임스페이스 `netpol-demo2` 를 만들고 같은 구성을 올리되, **거기에는 정책을 하나도 만들지 않는다.**

```bash
kubectl get networkpolicy -n netpol-demo2 --no-headers | wc -l
```

```
0
```

정책이 없는데 결과는 이렇다.

```
netpol-demo2 에서
  client-allowed → 연결됨
  client-blocked → 차단됨
```

**아까 만든 정책 하나가 새 네임스페이스까지 덮었다.** 표준 NetworkPolicy 였다면 `netpol-demo2` 에도 정책을 따로 만들어야 했고, 만들기 전까지 그 네임스페이스는 아무 제한 없이 열려 있었을 것이다.

## 7. 비용

공짜는 아니다. 같은 구성(시스템 파드 + ingress-nginx + 샘플 앱 3개)에서 노드 컨테이너의 메모리를 재 봤다.

| | kindnet | Calico |
|---|---|---|
| control-plane | 833 MiB | **1,396 MiB** |
| worker | 212 MiB | **798 MiB** |
| worker2 | 204 MiB | **822 MiB** |
| 합계 | 약 1.25 GB | **약 3.0 GB** |
| 전체 파드 수 | 17 | 26 |

**메모리가 2.4배로 늘었다.** Calico 가 노드마다 `calico-node` 를 띄우고, 여기에 `typha`, `kube-controllers`, `apiserver`, CSI 드라이버까지 함께 돌기 때문이다. 디스크도 노드 이미지 4.8GB → 5.5GB, 볼륨 3.0GB → 5.0GB 로 늘었다.

16GB 맥이라면 감당되지만, **8GB 장비에서는 빠듯하다.** 단순히 파드 IP 와 기본 NetworkPolicy 만 필요하다면 kindnet 을 그대로 두는 편이 낫다.

## 정리

- **"kindnet 은 NetworkPolicy 를 지원하지 않는다" 는 말은 지금은 틀렸다.** 직접 재 보면 막아 준다. 다만 정책을 건 직후 몇 초는 아직 뚫려 있으니, 바로 확인하고 판단하면 안 된다.
- **Calico 로 바꾸는 이유는 따로 있다.** 표준 NetworkPolicy 로는 "이것만 막기" 와 "클러스터 전체에 한 번에 걸기" 를 표현할 수 없다. Calico 의 `GlobalNetworkPolicy` 가 그 자리를 메운다.
- **Calico 문서의 기본 IP 풀 `192.168.0.0/16` 을 그대로 쓰지 않는다.** 가정용 공유기 대역이 통째로 그 안에 들어간다. `ipconfig getifaddr en0` 로 내 주소부터 확인하고, 겹치면 `10.244.0.0/16` 처럼 다른 대역을 쓴다.
- **kind 에서 CNI 교체는 클러스터를 다시 만드는 것이다.** 돌고 있는 클러스터에 얹으면 설정 파일과 IP 출처가 이중이 된다. 20초면 다시 만든다.
- **가볍지 않다.** 메모리가 1.25GB 에서 3.0GB 로 늘었다. 필요 없으면 안 바꾸는 것도 선택이다.
