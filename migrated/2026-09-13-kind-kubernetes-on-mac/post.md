![M1 맥에 kind 로 쿠버네티스 클러스터 세우기 — ingress-nginx 가 localhost 로 안 열리는 이유](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/78-cover-kind-cluster.jpg)

쿠버네티스를 공부하려면 만질 클러스터가 하나 있어야 한다. 클라우드에 만들면 돈이 나가고, 지웠다 다시 만들기도 번거롭다. **맥북 한 대에 통째로 올리는 방법**을 쓴다. 도구는 `kind` 다.

다 만들고 나면 브라우저에서 `http://localhost` 를 열었을 때 클러스터 안의 애플리케이션이 응답한다. 여기까지 오는 길에 **한 번 크게 막히는 자리**가 있는데, 오류 메시지가 안 뜨고 조용히 안 되는 종류라 원인 찾기가 고약하다. 그 대목이 이 글의 절반이다.

## 이 글에서 만드는 것

| 항목 | 값 |
|---|---|
| 도구 | kind v0.33.0 |
| 쿠버네티스 | v1.37.0 (`kindest/node:v1.37.0`) |
| 노드 | control-plane 1대 + worker 2대 |
| 네트워크 플러그인 | kindnet (kind 기본) |
| 저장소 | `standard` (기본값으로 이미 들어있음) |
| 외부 접속 | ingress-nginx `controller-v1.15.1` |
| 접근 주소 | 맥에서 `http://localhost` |

유휴 상태에서 메모리 약 1.25GB, 디스크 8GB 정도를 쓴다.

## 미리 알아 둘 말

처음이면 여기부터 읽는다. 이미 아는 내용이면 건너뛴다.

**클러스터** — 쿠버네티스가 관리하는 컴퓨터들의 묶음이다.

**노드** — 그 묶음에 속한 컴퓨터 한 대. 두 종류가 있다.
- **control-plane(컨트롤 플레인)** — 지휘하는 쪽. "어느 애플리케이션을 어디에 띄울지" 를 정하고 전체 상태를 관리한다. 관리자 역할이라 **일반 애플리케이션은 여기에 안 띄우는 것이 기본**이다.
- **worker(워커)** — 실제로 애플리케이션이 도는 쪽.

**파드(Pod)** — 쿠버네티스가 다루는 가장 작은 단위. 컨테이너 한 개(혹은 몇 개)를 감싼 것이라고 보면 된다. 애플리케이션은 파드로 뜬다.

**매니페스트** — "이런 상태를 원한다" 를 적은 YAML 파일. 쿠버네티스는 명령을 받아 실행하는 게 아니라, **원하는 상태를 적어 주면 그렇게 되도록 알아서 맞춘다.** 이 글에서 YAML 을 계속 쓰는 이유다.

**kind** — 노드를 **도커 컨테이너로** 흉내 내서 클러스터를 만들어 주는 도구다. 진짜 서버 3대 대신 컨테이너 3개를 띄우고, 그 안에서 쿠버네티스를 돌린다. 이름은 Kubernetes IN Docker 의 줄임말이다.

> 📌 **왜 kind 인가.** 로컬에 쿠버네티스를 올리는 도구는 여럿이다(minikube, k3d 등). kind 를 고른 이유는 **정식 쿠버네티스를 그대로** 올리기 때문이다.
>
> k3s 같은 경량 배포판은 가볍게 쓰라고 일부를 단순화하고 편의 기능을 미리 넣어 둔다. 빠르게 띄우기엔 좋지만, 공부가 목적이면 그 편의가 오히려 실제 클러스터와 다른 모습을 보여 준다. kind 는 실제 운영 클러스터를 만들 때 쓰는 `kubeadm` 이라는 도구로 설치하므로, 회사에서 만나는 클러스터와 구조가 같다.
>
> 대신 k3s 라면 이미 들어있을 것들을 직접 넣어야 하는데, **그 과정이 곧 실습**이다.

## 준비물

- Apple Silicon 맥 (이 글은 M1 / 16GB / macOS 14.8.3 기준)
- 도커를 돌릴 수단 — Docker Desktop 이든 Colima 든
- 디스크 여유 **10GB 이상**
- 걸리는 시간 15분 안팎. 대부분 이미지 내려받는 시간이다

> 💡 Docker Desktop 이 이미 깔려 있다면 그대로 쓰는 편이 낫다. Colima 로 갈아타면 Docker Desktop 을 지우기 전까지 가상 머신이 두 개가 되어 디스크를 오히려 더 먹는다.

## 1. 설치하고 버전을 맞춘다

kind 를 설치한다.

```bash
brew install kind
```

```
kind v0.33.0 go1.27.0 darwin/arm64
```

여기서 한 번 걸린다. `kubectl` 의 버전을 확인해 보자.

> 📌 **`kubectl` 이 무엇인가.** 클러스터에 명령을 보내는 프로그램이다. 내 맥에서 돌면서 클러스터의 **API 서버**(control-plane 에서 돌며 모든 요청을 받는 창구)와 통신한다. 앞으로 치는 `kubectl ...` 은 전부 "클러스터야, 이렇게 해 줘" 라는 뜻이다.

```bash
kubectl version --client
```

```
Client Version: v1.31.3
```

kind v0.33.0 이 만드는 클러스터는 쿠버네티스 **v1.37.0** 인데, 내 `kubectl` 은 **v1.31.3** 이었다. 가운데 숫자가 6 차이 난다.

> ⚠️ **버전 스큐(skew)가 무엇인가.** 쿠버네티스 버전은 `v1.37.0` 처럼 세 자리다. 가운데 숫자(37)를 **마이너 버전**이라고 부르고, 기능이 추가되거나 바뀌는 단위다.
>
> 쿠버네티스는 `kubectl` 과 클러스터 사이의 마이너 버전 차이를 **±1 까지만** 정상 동작을 보장한다. 그 밖은 "될 수도 있다" 수준이라, 평소엔 멀쩡하다가 특정 명령에서 엉뚱하게 터진다. 6 차이는 한참 벗어난다.

맞춰 준다.

```bash
brew upgrade kubernetes-cli
```

```
kubernetes-cli 1.31.3 -> 1.37.0
```

> 📌 kind 가 쓸 쿠버네티스 버전은 이렇게 미리 확인할 수 있다.
>
> ```bash strings $(which kind) | grep -oE 'kindest/node:v1\.[0-9]+\.[0-9]+' | sort -u
> ```
>
> 뒤에 나올 설정 파일에 `image:` 로 버전을 못 박아 두면, 나중에 kind 를 업그레이드해도 클러스터 버전이 멋대로 따라 바뀌지 않는다.

## 2. 클러스터를 설정 파일로 정의한다

kind 는 `kind create cluster` 한 줄로도 클러스터를 만들어 준다. 하지만 **설정 파일로 두면** 언제든 똑같은 클러스터를 다시 만들 수 있고, 왜 그렇게 했는지가 파일에 주석으로 남는다.

`cluster/kind-config.yaml` 을 이렇게 쓴다.

```yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: lab

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

세 가지를 의도했다. 하나씩 보자.

### 워커를 2대 둔다

노드가 하나뿐이면 쿠버네티스가 "어디에 띄울지" 고를 대상이 하나밖에 없다. 그러면 **파드를 어느 노드에 보낼지 조종하는 기능들**(nodeSelector, affinity, taint/toleration 등)을 실습해도 결과가 늘 똑같아서 배울 게 없다.

워커를 2대 두면 "이 파드가 어느 노드로 갔는지" 가 눈에 보인다. kind 는 노드가 도커 컨테이너라 2대를 더 띄워도 메모리 400MB 수준이다.

### 맥의 80/443 포트를 control-plane 노드에 연결한다

`extraPortMappings` 가 그 설정이다. 맥의 80번 포트로 들어온 요청을 control-plane 노드 컨테이너의 80번 포트로 넘긴다.

> 📌 **왜 이게 필요한가.** 클라우드에서는 `LoadBalancer` 라는 것을 만들면 클라우드 업체가 진짜 공인 IP 를 하나 붙여 준다. 하지만 내 맥에는 그렇게 해 줄 주체가 없다.
>
> 그래서 kind 에서는 이 포트 매핑이 **바깥에서 클러스터로 들어오는 유일한 통로**다. 이 점이 3단계에서 막히는 문제의 원인이 되므로 기억해 둔다.

### control-plane 에 `ingress-ready` 라벨을 붙인다

**라벨(label)** 은 쿠버네티스 객체에 붙이는 이름표다. `키=값` 형태로 아무거나 붙일 수 있고, 나중에 "이 이름표가 붙은 것" 을 골라내는 데 쓴다.

여기서는 나중에 "Ingress 컨트롤러는 이 이름표가 붙은 노드에만 떠라" 고 지정하는 데 쓸 것이다. 3단계에서 이유가 나온다.

### 만든다

```bash
kind create cluster --config cluster/kind-config.yaml
```

```
Creating cluster "lab" ...
 ✓ Ensuring node image (kindest/node:v1.37.0) 🖼️
 ✓ Preparing nodes 📦 📦 📦
 ✓ Writing configuration 📜
 ✓ Starting control-plane 🕹️
 ✓ Installing CNI 🔌
 ✓ Installing StorageClass 💾
 ✓ Joining worker nodes 🚜
Set kubectl context to "kind-lab"
```

1분 25초 걸렸다. 대부분 노드 이미지를 내려받는 시간이라, 두 번째부터는 훨씬 빠르다.

잘 떴는지 본다.

```bash
kubectl get nodes
```

```
NAME                STATUS   ROLES           AGE   VERSION
lab-control-plane   Ready    control-plane   37s   v1.37.0
lab-worker          Ready    <none>          22s   v1.37.0
lab-worker2         Ready    <none>          22s   v1.37.0
```

`STATUS` 가 셋 다 `Ready` 면 성공이다. `ROLES` 를 보면 어느 것이 지휘하는 쪽인지 알 수 있다. 워커는 `<none>` 으로 나오는데, 역할 표시가 없을 뿐 정상이다.

### 딸려 온 것들

위 출력에 `Installing CNI`, `Installing StorageClass` 가 있었다. kind 가 알아서 넣어 준 것들이다.

**CNI** 는 파드에 IP 를 주고 파드끼리 통신하게 해 주는 네트워크 플러그인이다. kind 는 `kindnet` 이라는 단순한 것을 넣어 준다.

> 📌 이걸 실무에서 많이 쓰는 Calico 로 바꾸는 과정과, 그때 만나는 IP 대역 충돌 문제는 [kind 의 CNI 를 kindnet 에서 Calico 로 바꾸기](https://autops.run/kind-cni-kindnet-to-calico/)에 따로 정리했다.

**StorageClass** 는 "파드가 저장 공간을 달라고 하면 어떻게 만들어 줄지" 를 정해 둔 것이다.

```bash
kubectl get storageclass
```

```
NAME                 PROVISIONER             RECLAIMPOLICY   VOLUMEBINDINGMODE
standard (default)   rancher.io/local-path   Delete          WaitForFirstConsumer
```

`(default)` 가 붙어 있으니, 파드가 저장 공간을 요청하면 이게 알아서 처리한다. 데이터를 저장하는 실습을 바로 시작할 수 있다는 뜻이다.

> 📌 이 저장 공간을 실제로 써서 **파드가 죽어도 데이터가 남게** 만드는 방법은 [파드가 죽으면 데이터도 사라진다 — StatefulSet 과 PVC 로 남기는 법](https://autops.run/statefulset-pvc-basics/)에 정리했다. 위 출력의 `WaitForFirstConsumer` 가 무슨 뜻인지도 거기서 다룬다.

## 3. Ingress 컨트롤러 — 여기서 막힌다

지금 상태로는 **클러스터 밖에서 안으로 들어갈 방법이 없다.** 그 통로를 만든다.

> 📌 **Ingress 가 무엇인가.** "`example.com/api` 로 온 요청은 이 서비스로, `/blog` 로 온 요청은 저 서비스로 보내라" 같은 **규칙**이다. 규칙일 뿐이라 그 자체로는 아무 일도 하지 않는다.
>
> 실제로 요청을 받아 규칙대로 넘겨 주는 프로그램이 따로 필요한데, 그것을 **Ingress 컨트롤러**라고 한다. 여기서는 nginx 로 만든 `ingress-nginx` 를 쓴다.
>
> 결국 리버스 프록시다. 그 개념 자체는 [nginx 를 앞에 세우는 이유 — 리버스 프록시가 실제로 해 주는 일](https://autops.run/nginx-reverse-proxy/)에 정리해 두었다. ingress-nginx 는 그 nginx 를 쿠버네티스가 대신 조종하는 형태다.

ingress-nginx 는 kind 전용 설치 파일을 따로 준다. 버전을 고정해서 받는다.

```bash
curl -sSL https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.15.1/deploy/static/provider/kind/deploy.yaml \
  -o manifests/ingress-nginx/deploy.yaml
```

> 💡 주소에 `main` 대신 `controller-v1.15.1` 을 넣었다. `main` 은 계속 바뀌므로 어제 되던 게 오늘 안 될 수 있다. **버전을 박아 두면 언제 다시 받아도 같은 파일**이다.

바로 적용하지 말고 **열어서 읽어 본다.** 남이 만든 설치 파일은 내 환경을 모른다.

```bash
grep -n 'ingress-ready' manifests/ingress-nginx/deploy.yaml
```

```
(아무것도 안 나온다)
```

예상과 달랐다. 예전 이 파일은 `ingress-ready=true` 라벨이 붙은 노드에만 컨트롤러를 띄우도록 돼 있었다. 그래서 인터넷의 안내 글 대부분이 kind 설정에 그 라벨을 붙이라고 말한다. **v1.15.1 에는 그 지정이 없다.**

대신 이렇게 생겼다.

```yaml
ports:
- containerPort: 80
  hostPort: 80        # 파드가 뜬 "그 노드의" 80 을 점유한다
- containerPort: 443
  hostPort: 443
...
nodeSelector:
  kubernetes.io/os: linux    # 이게 전부다
tolerations:
- effect: NoSchedule
  key: node-role.kubernetes.io/control-plane
  operator: Equal
```

### 무엇이 문제인가

두 가지를 겹쳐 보면 문제가 드러난다.

**첫째, `hostPort` 는 파드가 뜬 노드의 포트를 연다.** 컨트롤러 파드가 어느 노드에 뜨든, **그 노드의** 80번 포트가 열린다.

**둘째, 이 파드는 아무 노드에나 갈 수 있다.** `nodeSelector` 가 `kubernetes.io/os: linux` 뿐이라 세 노드 모두 조건을 만족한다.

> 📌 **taint 와 toleration.** control-plane 노드에는 기본적으로 **taint(얼룩)** 가 발라져 있다. "여기엔 아무 파드나 오지 마라" 는 표시다. 그래서 보통 애플리케이션은 control-plane 에 안 뜬다.
>
> 그 표시를 무시해도 좋다는 허가증이 **toleration(용인)** 이다. 위 YAML 에 toleration 이 달려 있으므로, 이 컨트롤러는 control-plane 에도 갈 수 있다. 즉 **세 노드 전부 후보**다.

그런데 2단계에서 나는 맥의 80/443 을 **control-plane 노드에만** 연결해 뒀다.

정리하면 이렇다.

| 컨트롤러가 뜬 노드 | 80번 포트가 열리는 곳 | 맥에서 `http://localhost` |
|---|---|---|
| `lab-control-plane` | control-plane 컨테이너 | **닿는다** |
| `lab-worker` | worker 컨테이너 | 닿지 않는다 |
| `lab-worker2` | worker2 컨테이너 | 닿지 않는다 |

**어디에 뜨느냐는 그때그때 다르다.** 클러스터를 다시 만들면 결과가 바뀔 수 있어서, "어제는 됐는데 오늘은 안 된다" 가 나오는 종류의 문제다.

> ⚠️ 이 상태에서 증상은 오류 메시지가 아니라 **침묵**이다. `curl http://localhost` 가 그냥 연결을 못 하는데, 파드도 서비스도 전부 정상으로 보여서 어디가 잘못됐는지 알기 어렵다.
>
> 이럴 때는 `kubectl get pods -n ingress-nginx -o wide` 로 **컨트롤러가 어느 노드에 있는지**부터 본다. `-o wide` 를 붙여야 노드 이름이 나온다.

### 해결 — 노드를 고정한다

2단계에서 control-plane 에 붙여 둔 `ingress-ready` 라벨이 여기서 쓰인다. "이 이름표가 붙은 노드에만 떠라" 고 지정하면 된다.

받아 온 파일을 직접 고쳐도 되지만, 그러면 나중에 버전을 올릴 때 내가 고친 부분을 다시 찾아 넣어야 한다. **원본은 그대로 두고 바뀔 부분만 따로 적는 방법**을 쓴다. `kustomize` 라는 도구가 그 일을 해 준다. `kubectl` 에 이미 포함돼 있다.

바꿀 내용만 적은 파일 `manifests/ingress-nginx/pin-to-control-plane.yaml` 이다.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ingress-nginx-controller
  namespace: ingress-nginx
spec:
  template:
    spec:
      nodeSelector:
        kubernetes.io/os: linux
        ingress-ready: "true"     # ← 이 줄을 더한다
```

둘을 합치라고 알려 주는 파일 `manifests/ingress-nginx/kustomization.yaml` 이다.

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - deploy.yaml              # 받아 온 원본

patches:
  - path: pin-to-control-plane.yaml    # 덧씌울 내용
    target:
      kind: Deployment
      name: ingress-nginx-controller
```

적용하기 전에 **합쳐진 결과가 의도대로인지 먼저 본다.** `kubectl kustomize` 는 합치기만 하고 클러스터에는 보내지 않는다.

```bash
kubectl kustomize manifests/ingress-nginx | grep -A3 nodeSelector | head -4
```

```
      nodeSelector:
        ingress-ready: "true"
        kubernetes.io/os: linux
```

두 줄이 됐다. 적용한다. `-k` 는 "이 디렉터리의 kustomization 을 써라" 는 뜻이다.

```bash
kubectl apply -k manifests/ingress-nginx
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=180s
```

```
pod/ingress-nginx-controller-575c4d8bc6-mbgz5 condition met
```

> 💡 `kubectl wait` 는 조건이 만족될 때까지 **기다렸다가** 끝난다. 파드가 뜨는 데 시간이 걸리므로, `get` 을 여러 번 치는 대신 이걸 쓰면 편하다.

의도한 자리에 떴는지 확인한다. **이게 이 단계의 핵심이다.**

```bash
kubectl get pods -n ingress-nginx -o wide
```

```
NAME                                       READY   STATUS    NODE
ingress-nginx-controller-575c4d8bc6-mbgz5  1/1     Running   lab-control-plane
```

맨 오른쪽이 `lab-control-plane` 이다. 포트를 연결해 둔 그 노드다.

### EXTERNAL-IP 가 pending 인 건 정상이다

```bash
kubectl get svc -n ingress-nginx
```

```
NAME                       TYPE           EXTERNAL-IP   PORT(S)
ingress-nginx-controller   LoadBalancer   <pending>     80:31596/TCP,443:32121/TCP
```

`<pending>` 을 보고 설치가 덜 끝난 줄 알기 쉽다. **고장이 아니다.**

`LoadBalancer` 는 원래 클라우드 업체가 공인 IP 를 붙여 주는 방식인데, 내 맥에는 그럴 주체가 없어서 **영원히 `pending`** 이다. 우리 트래픽은 이 서비스가 아니라 2단계에서 만든 포트 매핑으로 들어온다. 여기서 시간을 버리는 사람이 많다.

## 4. 확인 — 끝에서 끝까지

이제 진짜로 이어졌는지 본다. 확인할 경로는 이렇다.

```
브라우저(맥) :80
  → kind 포트 매핑 (control-plane 컨테이너 :80)
    → ingress-nginx (hostPort :80)
      → Ingress 규칙
        → Service
          → Pod (워커에 분산)
```

시험용 애플리케이션을 올린다. `agnhost` 는 쿠버네티스가 자체 테스트에 쓰는 공식 이미지다. arm64 맥에서 그대로 돌고, `/hostname` 으로 요청하면 **처리한 파드 이름**을 돌려준다. 어느 파드가 응답했는지 눈으로 볼 수 있다.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: echo
  labels: { app: echo }
spec:
  replicas: 3                      # 파드를 3개 띄운다
  selector:
    matchLabels: { app: echo }
  template:
    metadata:
      labels: { app: echo }
    spec:
      topologySpreadConstraints:   # 파드를 노드에 고르게 흩뿌린다
        - maxSkew: 1
          topologyKey: kubernetes.io/hostname
          whenUnsatisfiable: ScheduleAnyway
          labelSelector:
            matchLabels: { app: echo }
      containers:
        - name: agnhost
          image: registry.k8s.io/e2e-test-images/agnhost:2.47
          args: ["netexec", "--http-port=8080"]
          ports:
            - containerPort: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: echo
spec:
  selector: { app: echo }          # app=echo 라벨이 붙은 파드들에게 넘긴다
  ports:
    - port: 80
      targetPort: 8080
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: echo
spec:
  ingressClassName: nginx
  rules:
    - host: localhost              # localhost 로 온 요청을
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: echo         # echo 서비스로 보낸다
                port: { number: 80 }
```

> 📌 **Deployment 와 Service 의 역할.**
> - **Deployment** 는 "이 파드를 3개 유지해 줘" 를 맡는다. 하나가 죽으면 알아서 새로 띄운다.
> - **Service** 는 파드들 앞에 서는 **고정된 주소**다. 파드는 죽고 살아나며 IP 가 계속 바뀌는데, 서비스 이름(`echo`)은 그대로라 그걸로 부르면 된다. 요청이 오면 뒤의 파드들에게 나눠 준다.

```bash
kubectl apply -f manifests/smoke-test/echo.yaml
kubectl get pods -l app=echo -o wide
```

```
NAME                    READY   STATUS    NODE
echo-557947968f-6mppk   1/1     Running   lab-worker
echo-557947968f-nlxwv   1/1     Running   lab-worker2
echo-557947968f-wd8nq   1/1     Running   lab-worker
```

워커 2대에 나뉘었다. **control-plane 에는 하나도 안 갔다** — 앞에서 말한 taint 가 발라져 있고, 이 파드에는 그걸 무시할 toleration 이 없기 때문이다. 워커를 2대 둔 값이 여기서 나온다.

이제 맥에서 직접 요청해 본다. 30번 보내고 어느 파드가 몇 번 답했는지 센다.

```bash
for i in $(seq 1 30); do curl -s http://localhost/hostname; echo; done | sort | uniq -c
```

```
   9 echo-557947968f-6mppk
  10 echo-557947968f-nlxwv
  11 echo-557947968f-wd8nq
```

세 파드가 9번, 10번, 11번씩 답했다. 맥에서 시작한 요청이 노드 컨테이너를 지나 워커의 파드까지 닿았고, Service 가 고르게 나눠 주고 있다는 뜻이다. 구성 끝이다.

## 5. 실제로 드는 비용

유휴 상태 기준이다.

```bash
docker stats --no-stream $(docker ps -q --filter "label=io.x-k8s.kind.cluster=lab")
```

```
NAME                CPU %     MEM USAGE
lab-control-plane   14.80%    833.2MiB
lab-worker           1.75%    212.3MiB
lab-worker2          1.81%    204.0MiB
```

메모리 합이 약 1.25GB 다. 16GB 맥에서는 부담이 아니다.

디스크는 노드 이미지 4.8GB, 볼륨 3.0GB 로 **8GB 가까이** 쓴다. **이쪽을 미리 봐 두는 편이 낫다.** 나는 여유가 27GB 뿐이라 정리부터 하고 시작했다.

> 💡 다 쓰고 치울 때는 클러스터만 지우면 노드 컨테이너와 볼륨이 함께 사라진다.
>
> ```bash kind delete cluster --name lab
> ```
>
> 노드 이미지 4.8GB 는 남는다. 다시 만들 때 재사용되니 두는 편이 낫지만, 정말 정리하려면 `docker image rm kindest/node:v1.37.0`.

## 정리

- **kind 는 노드를 도커 컨테이너로 흉내 내서 정식 쿠버네티스를 올린다.** 경량 배포판과 달리 미리 들어있는 게 적어 직접 넣어야 하는데, 공부가 목적이면 그 과정이 값이다.
- **워커를 2대 이상 둔다.** 노드가 하나면 "어디에 떴는지" 가 안 보여서 스케줄링 관련 실습이 전부 무의미해진다.
- **ingress-nginx 의 kind 용 파일은 `ingress-ready` 라벨을 더 이상 쓰지 않는다.** `hostPort` 로 포트를 여는 구조라 **컨트롤러가 뜬 노드가 곧 입구**가 된다. 포트를 연결해 둔 노드에 `nodeSelector` 로 **고정해야** 한다. 안 하면 될 때도 있고 안 될 때도 있다.
- **`EXTERNAL-IP <pending>` 은 고장이 아니다.** 내 맥에는 LoadBalancer 에 IP 를 붙여 줄 주체가 없으니 당연한 결과다.
- **남이 만든 설치 파일은 적용하기 전에 열어 본다.** 이번 건은 `grep` 한 번으로 걸렀다. 적용하고 나서 "왜 안 되지" 를 헤맸다면 훨씬 오래 걸렸을 문제다.

> 💡 이 클러스터를 채팅으로 조회하고 싶다면 [mcp-server-kubernetes 로 Hermes·Claude 에 kind 클러스터 붙이기](https://autops.run/kubernetes-mcp-server/)를 이어서 본다.
