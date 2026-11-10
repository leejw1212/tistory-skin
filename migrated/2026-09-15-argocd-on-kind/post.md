![kind 클러스터에 ArgoCD 올리기 — UI 를 경로로 열고, field is immutable 로 멈춘 동기화 풀기](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/82-cover-argocd-kind.jpg)

지금까지 [실습 클러스터](https://autops.run/kind-kubernetes-on-mac/)에서 `kubectl apply`, `kubectl scale`, `kubectl patch` 를 손으로 쳐 왔다. 문제가 하나 있다. **무엇을 왜 바꿨는지가 아무 데도 안 남는다.**

**ArgoCD** 는 그걸 git 으로 옮긴다. YAML 을 저장소에 두면 ArgoCD 가 클러스터를 거기에 맞춰 준다. 이 글은 그걸 올리고, 실제로 막혔던 두 지점을 정리한다.

## 무엇을 하는가

| | |
|---|---|
| ArgoCD | v3.5.2, 파드 7개 |
| git 저장소 | 공개 저장소 하나 (인증 설정이 필요 없어진다) |
| UI 주소 | `http://localhost/argocd/` |
| 관리 대상 | 저장소의 `manifests/stateful-demo` 경로 |

## GitOps 가 무엇인가

한 줄로 줄이면 이렇다.

> **git 에 적힌 것이 정답이고, 클러스터를 거기에 맞춘다.**

지금까지 하던 방식과 방향이 반대다.

| | 지금까지 | GitOps |
|---|---|---|
| 바꾸는 곳 | 클러스터에 직접 `kubectl` | **git 의 YAML** |
| 적용 | 사람이 명령을 친다 | **ArgoCD 가 맞춘다** |
| 기록 | 안 남는다 | **커밋으로 남는다** |
| 되돌리기 | 기억해서 반대로 친다 | **`git revert`** |

> 📌 **"동기화(sync)" 와 "드리프트(drift)" 라는 말이 계속 나온다.** 클러스터가 git 과 같은 상태면 `Synced`, 다르면 `OutOfSync` 다. 누가 손으로 클러스터를 바꿔서 git 과 어긋난 상태를 **드리프트**라고 한다.

## 준비물

- 쿠버네티스 클러스터. 없으면 [앞 글](https://autops.run/kind-kubernetes-on-mac/)대로 만든다
- **git 저장소 하나.** 이 글은 공개 저장소를 쓴다. 비공개로 해도 되지만 ArgoCD 에 접근 키를 등록하는 단계가 늘어난다
- 걸리는 시간 30분 안팎

> ⚠️ 저장소를 공개로 만들 거라면 **올리기 전에 내용을 한 번 훑는다.** 매니페스트에 집 네트워크 주소나 내부 호스트 이름이 주석으로 들어가 있기 쉽다. 나는 맥의 LAN 주소가 주석에 있어서 마지막 자리를 가리고 올렸다.

## 1. ArgoCD 를 설치한다

공식 매니페스트 하나면 된다.

```bash
kubectl create namespace argocd
kubectl apply -n argocd --server-side -f \
  https://raw.githubusercontent.com/argoproj/argo-cd/v3.5.2/manifests/install.yaml
```

> 📌 `--server-side` 를 붙인 이유가 있다. 보통 `kubectl apply` 는 적용한 내용 전체를 어노테이션에 적어 두는데, 이 파일은 1.8MB 라 **크기 제한(약 262KB)에 걸려 실패**한다. `--server-side` 는 그 방식을 쓰지 않아 통과한다.

파드가 일곱 개 뜬다. 전부 준비될 때까지 기다린다.

```bash
kubectl wait -n argocd --for=condition=ready pod --all --timeout=600s
```

```
argocd-application-controller-0        1/1   Running
argocd-applicationset-controller-...   1/1   Running
argocd-dex-server-...                  1/1   Running
argocd-notifications-controller-...    1/1   Running
argocd-redis-...                       1/1   Running
argocd-repo-server-...                 1/1   Running
argocd-server-...                      1/1   Running
```

> 💡 설치 파일에는 **NetworkPolicy 가 7개** 들어 있다. 네트워크 플러그인이 그걸 지원하지 않으면 조용히 무시된다. [Calico 로 바꿔 둔 이야기](https://autops.run/kind-cni-kindnet-to-calico/)가 여기서 값을 한다.

## 2. 매니페스트를 git 에 올린다

ArgoCD 는 **git 저장소를 본다.** 로컬 폴더는 못 본다. 클러스터 안에서 도는 프로그램이라 내 맥의 파일 시스템에 닿을 수 없기 때문이다.

```bash
cd ~/k8s
git init -b main
git add -A
git commit -m "kind 실습 클러스터 매니페스트"
git remote add origin git@github.com:<사용자>/<저장소>.git
git push -u origin main
```

## 3. Application 을 만든다

**Application** 은 "이 저장소의 이 경로를, 이 클러스터의 이 네임스페이스에 맞춰 줘" 라고 적은 것이다.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: stateful-demo
  namespace: argocd          # Application 자체는 argocd 네임스페이스에 둔다
spec:
  project: default

  source:                                    # 어디를 볼지
    repoURL: https://github.com/<사용자>/<저장소>.git
    targetRevision: main                     # 어느 브랜치
    path: manifests/stateful-demo            # 저장소 안 어느 경로

  destination:                               # 어디에 넣을지
    server: https://kubernetes.default.svc   # 자기 자신(이 클러스터)
    namespace: stateful-demo

  syncPolicy:
    syncOptions:
      - CreateNamespace=true                 # 네임스페이스가 없으면 만들어 준다
```

> 📌 여기서는 **자동 동기화를 일부러 켜지 않았다.** 먼저 손으로 눌러 보고 동작을 이해한 뒤 6단계에서 켠다. 처음부터 켜면 무슨 일이 일어나는지 보기 어렵다.

만들고 상태를 본다.

```bash
kubectl get application -n argocd stateful-demo \
  -o custom-columns='SYNC:.status.sync.status,HEALTH:.status.health.status'
```

```
SYNC        HEALTH
OutOfSync   Missing
```

**`OutOfSync` / `Missing`** — git 에는 있는데 클러스터에는 없다는 뜻이다. 아직 아무것도 안 만들었으니 맞는 상태다. 무엇을 봤는지도 알려 준다.

```
PersistentVolumeClaim  lonely            OutOfSync
Pod                    lonely-consumer   OutOfSync
Service                notes             OutOfSync
Deployment             notes-deploy      OutOfSync
StatefulSet            notes             OutOfSync
```

## 4. 첫 동기화

UI 나 `argocd` CLI 로 누르는 게 보통이지만, `kubectl` 로도 된다.

```bash
kubectl patch application stateful-demo -n argocd --type merge -p '{
  "operation": {
    "initiatedBy": {"username": "admin"},
    "sync": {"revision": "main", "syncOptions": ["CreateNamespace=true"]}
  }
}'
```

```
+0초  OutOfSync/Missing/Running
+1초  OutOfSync/Progressing/Running
+1초  Synced/Progressing/Succeeded
```

1초 만에 끝났다. 클러스터를 보면 git 에 적힌 것들이 만들어져 있다.

```
pod/lonely-consumer                  1/1
pod/notes-0                          0/1
pod/notes-deploy-...                 1/1
persistentvolumeclaim/data-notes-0   Bound
persistentvolumeclaim/lonely         Bound
```

## 5. UI 를 연다 — 맥에서는 경로로 열어야 한다

여기서 한 번 막힌다. 보통 문서는 `argocd.내도메인` 처럼 **호스트 이름으로** 나누라고 한다. 그런데 로컬 실습에서는 두 가지가 걸린다.

**첫째, 맥은 `argocd.localhost` 를 해석하지 않는다.**

```bash
ping -c1 argocd.localhost
```

```
ping: cannot resolve argocd.localhost: Unknown host
```

리눅스는 `*.localhost` 를 자동으로 127.0.0.1 로 보내 주지만 macOS 는 아니다. 쓰려면 `/etc/hosts` 를 고쳐야 하는데 관리자 권한이 필요하다.

**둘째, `localhost/` 는 이미 다른 앱이 쓰고 있다.** [앞 글](https://autops.run/kind-kubernetes-on-mac/)에서 올린 `echo` 앱이 거기 붙어 있다.

그래서 **경로로 나눈다.** `localhost/argocd` 로 간다.

다만 경로로 나눌 때는 **ArgoCD 에게도 알려 줘야 한다.**

```bash
kubectl patch configmap argocd-cmd-params-cm -n argocd --type merge -p '{
  "data": {
    "server.rootpath": "/argocd",
    "server.insecure": "true"
  }
}'
kubectl rollout restart deployment argocd-server -n argocd
```

- `server.rootpath` — **"나는 /argocd 아래에 있다"** 를 알려 준다. 이걸 안 하면 화면은 뜨는데 CSS·JS 를 `/` 기준으로 찾아서 **빈 화면이나 깨진 화면**이 나온다.
- `server.insecure` — ArgoCD 가 평문 HTTP 로 받게 한다. 앞단 nginx 가 이미 바깥쪽을 맡고 있으니 안쪽까지 TLS 를 쓸 이유가 없다.

> ⚠️ ConfigMap 을 고쳐도 **돌고 있는 파드는 모른다.** 반드시 재시작해야 반영된다. 설정을 바꿨는데 그대로라면 이걸 빠뜨린 경우가 많다.

Ingress 를 붙인다.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: argocd-server
  namespace: argocd
spec:
  ingressClassName: nginx
  rules:
    - host: localhost
      http:
        paths:
          - path: /argocd
            pathType: Prefix
            backend:
              service:
                name: argocd-server
                port:
                  number: 80
```

확인한다.

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost/argocd/
curl -s http://localhost/argocd/ | grep -o '<title>[^<]*</title>'
```

```
200
<title>Argo CD</title>
```

기존 앱도 그대로인지 함께 본다. 경로로 나눴으니 둘 다 살아 있어야 한다.

```bash
curl -s http://localhost/hostname
```

```
echo-557947968f-l4lpx
```

브라우저에서 `http://localhost/argocd/` 를 열면 로그인 화면이 나온다. **화면이 깨지지 않고 제대로 그려지면 `rootpath` 가 맞게 들어간 것이다.**

초기 비밀번호는 시크릿에 들어 있다. 사용자 이름은 `admin` 이다.

```bash
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d; echo
```

> 💡 로그인한 뒤 비밀번호를 바꾸고 `argocd-initial-admin-secret` 은 지우는 것이 권장된다. 실습 클러스터라도 습관을 들여 두면 좋다.

## 6. 자동 동기화를 켜면 kubectl 이 안 통한다

여기가 GitOps 를 처음 쓸 때 가장 놀라는 부분이다.

먼저 **자동 동기화가 꺼진 상태**에서 손으로 늘려 본다.

```bash
kubectl scale statefulset notes -n stateful-demo --replicas=5
```

```
replicas=5
ArgoCD 상태: OutOfSync
```

늘어나긴 했다. ArgoCD 는 **"git 과 다르다" 고 알려만 주고 건드리지 않는다.**

이제 자동 동기화를 켠다.

```bash
kubectl patch application stateful-demo -n argocd --type merge -p '{
  "spec": {"syncPolicy": {
    "automated": {"prune": true, "selfHeal": true},
    "syncOptions": ["CreateNamespace=true"]
  }}
}'
```

```
+0초  replicas=5 sync=OutOfSync
+0초  replicas=3 sync=OutOfSync     ← 되돌려졌다
+0초  replicas=3 sync=Synced
```

**1초도 안 걸려 3 으로 돌아갔다.** git 에 `replicas: 3` 이라고 적혀 있기 때문이다.

- `selfHeal: true` — 클러스터가 git 과 달라지면 **되돌린다**
- `prune: true` — git 에서 지운 리소스를 **클러스터에서도 지운다**

> ⚠️ 이제부터 `kubectl scale`, `kubectl edit` 은 **일시적으로만 먹는다.** 바꾸려면 git 을 고쳐야 한다. 이게 GitOps 의 핵심이지만, 모르고 쓰면 "왜 자꾸 원복되지" 하고 한참 헤맨다.
>
> HPA 로 파드 수를 자동 조절한다면 충돌한다. 그때는 `ignoreDifferences` 로 ArgoCD 가 `replicas` 를 관리하지 않게 빼 준다.

## 7. immutable 필드를 커밋하면 무한 재시도에 빠진다

[앞 글](https://autops.run/statefulset-scale-down-order/)에서 `podManagementPolicy` 는 만든 뒤에 못 바꾸는 필드라는 것을 봤다. **이걸 git 에 커밋하면 어떻게 될까.**

```yaml
spec:
  serviceName: notes
  replicas: 3
  podManagementPolicy: Parallel     # 추가
```

```bash
git commit -am "podManagementPolicy 추가"
git push
```

ArgoCD 는 당연히 실패한다.

```
error when patching "/dev/shm/1855032735": StatefulSet.apps "notes" is invalid:
spec.podManagementPolicy: Invalid value: "Parallel": field is immutable.
Retrying attempt #2 at 11:56AM.
```

**문제는 마지막 줄이다.** ArgoCD 는 **계속 재시도한다.** 스스로 풀리지 않는다.

### 여기서 한 번 더 막혔다

문서를 보면 `Replace=true`, `Force=true` 라는 동기화 옵션이 있다. `apply` 대신 지우고 다시 만들게 하는 것이다. 그래서 넣어 봤는데 **안 먹었다.**

확인해 보니 이렇다.

```bash
kubectl get application -n argocd stateful-demo \
  -o jsonpath='{.status.operationState.operation.sync.syncOptions}'
```

```
["CreateNamespace=true"]
```

새로 준 옵션이 빠져 있다. **이전 동기화 작업이 아직 재시도 중이라, ArgoCD 가 새 작업을 받지 않은 것이다.** 진행 중인 작업이 있으면 새 요청은 무시된다.

### 푼 방법 — 리소스를 지운다

재시도가 실패하는 이유는 **기존 리소스를 patch 하려 해서**다. 리소스가 없으면 patch 가 아니라 create 가 되므로 immutable 제약에 걸리지 않는다.

```bash
kubectl delete statefulset notes -n stateful-demo
```

```
+0초   OutOfSync/Running
+83초  Synced/Succeeded        ← 재시도가 통과했다
```

```bash
kubectl get statefulset notes -n stateful-demo \
  -o jsonpath='{.spec.podManagementPolicy}'
```

```
Parallel
```

> 📌 **데이터는 무사하다.** StatefulSet 을 지워도 PVC 는 남는다. 기본 정책이 `whenDeleted: Retain` 이기 때문이다. 새로 만들어진 파드가 예전 PVC 를 다시 문다.
>
> ``` notes-0: force replace 전에 쓴 글
> ```
>
> 왜 그런지는 [StatefulSet 과 PVC 글](https://autops.run/statefulset-pvc-basics/)에 정리했다.

`Parallel` 로 바뀐 것도 눈으로 확인된다. 파드를 늘려 보면 **번호 순서를 안 지키고 한꺼번에** 뜬다.

```
+0초  notes-0(Running) notes-1(Running) notes-2(Running) notes-3(ContainerCreating) notes-4(ContainerCreating)
```

`OrderedReady` 였다면 3번이 Running 이 된 뒤에야 4번이 시작됐다.

> 💡 참고로 위 파드들은 곧 사라졌다. 6단계에서 켜 둔 `selfHeal` 이 git 의 `replicas: 3` 에 맞춰 되돌렸기 때문이다. **자동 동기화를 켜 둔 채로는 스케일 실험이 안 된다.** 실험하려면 잠시 끄거나 git 을 고쳐야 한다.

## 정리

- **GitOps 는 방향이 반대다.** 클러스터를 고치는 게 아니라 git 을 고치고, ArgoCD 가 클러스터를 맞춘다. 무엇을 왜 바꿨는지가 커밋으로 남는다.
- **`--server-side` 없이는 설치가 실패한다.** 매니페스트가 1.8MB 라 어노테이션 크기 제한에 걸린다.
- **맥에서 UI 를 열려면 경로로 나눈다.** `argocd.localhost` 는 해석되지 않는다. 경로로 나눌 때는 `server.rootpath` 를 꼭 같이 설정한다. 안 하면 화면이 깨진다. ConfigMap 을 고친 뒤 **재시작해야** 반영된다.
- **`selfHeal` 을 켜면 `kubectl` 수정은 되돌려진다.** 이게 정상 동작이다. HPA 처럼 클러스터가 스스로 바꾸는 값이 있다면 `ignoreDifferences` 로 빼 준다.
- **immutable 필드를 커밋하면 무한 재시도에 빠진다.** 게다가 그동안은 새 동기화 옵션도 안 먹는다. 리소스를 지워 create 로 만들면 풀린다. PVC 는 남으니 데이터는 잃지 않는다.
