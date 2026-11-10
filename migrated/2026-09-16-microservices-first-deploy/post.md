![쿠버네티스에 첫 서비스 두 개 올리기 — Deployment · Service · Ingress 가 각각 하는 일](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/92-cover-first-deploy.jpg)

[앞 편](https://autops.run/microservices-on-k8s-intro/)에서 만들 것을 정했다. 이번에는 `web` 과 `fetcher` 두 서비스를 실제로 클러스터에 올린다.

쿠버네티스에 뭔가를 올리려면 **매니페스트** 라는 YAML 파일을 쓴다. 종류가 여럿인데, 이 편에서 쓰는 건 셋뿐이다. 하나씩 무슨 일을 하는지 보자.

## 이 편에서 만드는 것

| 매니페스트 | 하는 일 | 비유 |
|---|---|---|
| **Deployment** | 컨테이너를 몇 개 띄울지 정한다 | 몇 명 뽑을지 |
| **Service** | 그것들에 **고정된 이름**을 붙인다 | 대표 전화번호 |
| **Ingress** | 바깥에서 들어오는 길을 연다 | 정문 |

> 📌 **파드(Pod)** 라는 말이 계속 나온다. 컨테이너를 감싼 가장 작은 단위다. 보통 파드 하나에 컨테이너 하나가 들어간다고 생각하면 된다. Deployment 는 이 파드를 몇 개 유지할지 관리하는 쪽이다.

## 1. Deployment — 몇 개를 띄울지

`fetcher` 부터 보자.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: linkcard-fetcher
  namespace: linkcard
spec:
  replicas: 1                      # 하나만 띄운다
  selector:
    matchLabels: { app: linkcard-fetcher }
  template:
    metadata:
      labels: { app: linkcard-fetcher }    # ← 이 이름표가 중요하다
    spec:
      containers:
        - name: fetcher
          image: linkcard-fetcher:v3
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 8000
```

**`labels` 를 눈여겨보자.** 파드에 `app: linkcard-fetcher` 라는 이름표를 붙인다. 잠시 뒤 Service 가 이 이름표로 파드를 찾는다. 쿠버네티스는 대부분 **이름표로 서로를 연결**한다.

> 💡 `imagePullPolicy: IfNotPresent` 는 "이미 노드에 있으면 받아오지 마라" 는 뜻이다. 나는 이미지를 레지스트리에 올리지 않고 `kind load` 로 노드에 직접 넣었기 때문에 이 설정이 필요하다. 실제 운영에서 레지스트리를 쓴다면 빼야 한다. 안 그러면 새 이미지를 올려도 옛것을 계속 쓴다.

### 살았는지 확인하는 두 가지

```yaml
          readinessProbe:                  # 손님을 받아도 되나?
            httpGet: { path: /healthz, port: 8000 }
            initialDelaySeconds: 2
          livenessProbe:                   # 아직 살아 있나?
            httpGet: { path: /healthz, port: 8000 }
            initialDelaySeconds: 10
```

둘이 헷갈리기 쉬운데 역할이 다르다.

| | 실패하면 |
|---|---|
| **readinessProbe** | 트래픽을 안 보낸다. **죽이지는 않는다** |
| **livenessProbe** | 컨테이너를 **재시작한다** |

기동에 시간이 걸리는 앱이라면 readiness 만 걸고, liveness 는 넉넉하게 두는 게 안전하다. liveness 를 너무 빡빡하게 잡으면 **느려졌을 뿐인 앱을 계속 죽인다.**

## 2. Service — IP 대신 이름으로 부른다

파드는 죽었다 살면 IP 가 바뀐다. 그래서 IP 를 적어 두면 안 된다. Service 가 그 앞에 고정된 이름을 세워 준다.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: linkcard-fetcher
  namespace: linkcard
spec:
  selector: { app: linkcard-fetcher }      # 이 이름표가 붙은 파드로 보낸다
  ports:
    - port: 8000
      targetPort: 8000
```

`web` 은 이렇게 부르면 끝이다.

```yaml
          env:
            - name: FETCHER_URL
              value: "http://linkcard-fetcher:8000"
```

IP 가 어디에도 없다. 실제로 파드 안에서 확인해 보면 이름이 풀린다.

```bash
kubectl exec -n linkcard <web파드> -- python -c \
  "import socket; print(socket.gethostbyname('linkcard-fetcher'))"
```

```
10.96.216.122
```

이 주소는 Service 의 것이고, 파드가 아니다.

```bash
kubectl get svc -n linkcard linkcard-fetcher -o jsonpath='{.spec.clusterIP}'
```

```
10.96.216.122
```

같다. **파드가 몇 번을 죽었다 살아나도 이 주소는 그대로다.**

> 📌 **이름이 풀리는 원리.** 클러스터 안에는 CoreDNS 가 돌고 있고, Service 를 만들면 자동으로 DNS 이름이 생긴다. 전체 이름은 `linkcard-fetcher.linkcard.svc.cluster.local` 인데, 같은 네임스페이스 안에서는 앞부분만 써도 된다.

## 3. Ingress — 바깥에서 들어오는 길

Service 는 **클러스터 안에서만** 통한다. 브라우저에서 접속하려면 Ingress 가 필요하다.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: linkcard
  namespace: linkcard
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  ingressClassName: nginx
  rules:
    - host: localhost
      http:
        paths:
          - path: /linkcard(/|$)(.*)
            pathType: ImplementationSpecific
            backend:
              service:
                name: linkcard-web
                port: { number: 8000 }
```

경로로 나눈 이유가 있다. 이 클러스터에는 이미 `/` 에 다른 앱이, `/argocd` 에 [ArgoCD](https://autops.run/argocd-on-kind/) 가 붙어 있다. 그래서 `/linkcard` 를 쓴다.

`rewrite-target: /$2` 는 **`/linkcard/api/cards` 로 들어온 요청을 뒤쪽에는 `/api/cards` 로 넘긴다**는 뜻이다. 앱이 자기가 하위 경로에 있다는 걸 몰라도 되게 하려는 배려인데 — 이게 문제를 일으켰다.

## 여기서 막혔다 — 요청이 엉뚱한 서비스로 샜다

화면은 떴는데 버튼을 누르면 이런 오류가 났다.

```
Unexpected token 'N', "NOW: 2026-"... is not valid JSON
```

JSON 을 기대했는데 `NOW: 2026-...` 이라는 글자가 왔다는 뜻이다. **내 앱은 저런 응답을 만들지 않는다.**

원인은 화면의 자바스크립트였다.

```js
const r = await fetch('/api/cards', { ... });   // ← 절대 경로
```

`/api/cards` 는 **맨 앞에 슬래시가 있는 절대 경로**다. 브라우저는 이걸 `http://localhost/api/cards` 로 해석한다. `/linkcard` 가 빠져 있다. 그래서 요청이 루트에 붙어 있던 **다른 앱**으로 갔고, 그 앱이 시각을 찍어 준 것이다.

> ⚠️ Ingress 가 경로를 떼어 내면 **앱은 자기가 어디 붙어 있는지 모른다.** 서버 쪽은 상관없지만, 브라우저에서 도는 자바스크립트는 자기 주소를 기준으로 요청을 만들기 때문에 이런 일이 생긴다.

### 해결 — 접두어를 알려 준다

앱에 "너는 `/linkcard` 아래 있다" 고 알려 주고, 자바스크립트가 그걸 앞에 붙이게 했다.

```yaml
            - name: BASE_PATH
              value: "/linkcard"
```

```js
const BASE = {{ base_path|tojson }};            // 서버가 심어 준다
const r = await fetch(BASE + '/api/cards', { ... });
```

[ArgoCD 를 `/argocd` 에 붙일 때 `server.rootpath` 가 필요했던 것](https://autops.run/argocd-on-kind/)과 정확히 같은 문제다. **하위 경로에 앱을 붙일 때 거의 항상 만난다.**

## 4. ArgoCD 에 맡긴다

매니페스트를 `kubectl apply` 로 넣지 않는다. git 에 올리고 ArgoCD 에게 맡긴다.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: linkcard
  namespace: argocd
spec:
  source:
    repoURL: https://github.com/<사용자>/<저장소>.git
    targetRevision: main
    path: apps/linkcard/k8s        # 이 경로의 YAML 을 전부 본다
  destination:
    server: https://kubernetes.default.svc
    namespace: linkcard
  syncPolicy:
    automated:
      prune: true                  # git 에서 지우면 클러스터에서도 지운다
      selfHeal: true               # 손으로 바꾸면 git 상태로 되돌린다
    syncOptions:
      - CreateNamespace=true
```

이걸 등록하고 커밋하면 알아서 맞춰 준다.

```
+0초   Synced/Progressing
+18초  Synced/Healthy
```

## 확인

```bash
kubectl get deploy,svc,ingress -n linkcard
```

```
deployment.apps/linkcard-fetcher     1/1
deployment.apps/linkcard-web         2/2
service/linkcard-fetcher             ClusterIP
service/linkcard-web                 ClusterIP
ingress.networking.k8s.io/linkcard   nginx
```

`web` 은 2개, `fetcher` 는 1개다. 일부러 이렇게 뒀다. **[다음 편](https://autops.run/microservices-tail-latency/)에서 이 불균형이 문제를 일으킨다.**

브라우저에서 `http://localhost/linkcard/` 를 열고 주소를 하나 넣으면 카드가 만들어진다.

## 정리

- **Deployment 는 몇 개를 띄울지, Service 는 이름을 붙이고, Ingress 는 바깥 길을 연다.** 셋은 **이름표(label)** 로 이어진다.
- **서비스끼리는 IP 가 아니라 이름으로 부른다.** 파드 IP 는 바뀌지만 Service 이름과 주소는 그대로다.
- **readinessProbe 와 livenessProbe 는 다르다.** 앞의 것은 트래픽을 끊고, 뒤의 것은 컨테이너를 죽인다. liveness 를 빡빡하게 잡으면 느려졌을 뿐인 앱을 계속 죽인다.
- **하위 경로에 앱을 붙이면 브라우저 쪽 코드가 자기 위치를 모른다.** 접두어를 앱에 알려 주고 요청 앞에 붙여야 한다. 안 그러면 요청이 다른 서비스로 샌다.
