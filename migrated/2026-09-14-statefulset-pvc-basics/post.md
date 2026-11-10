![파드가 죽으면 데이터도 사라진다 — StatefulSet 과 PVC 로 남기는 법](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/80-cover-statefulset-pvc.jpg)

쿠버네티스를 처음 만지면 이 사실에 한 번 놀란다.

**파드가 재시작되면 그 안에 쓴 파일이 전부 사라진다.**

웹 서버라면 상관없다. 하지만 데이터베이스를 파드로 띄웠다가 이걸 겪으면 곤란해진다. 이 글은 그걸 막는 방법을 처음부터 짚는다.

[M1 맥에 만든 kind 실습 클러스터](https://autops.run/kind-kubernetes-on-mac/)에서 직접 해 본 것이고, 붙여 놓은 출력은 전부 그때 나온 것이다.

## 무엇을 알게 되는가

| | |
|---|---|
| 왜 데이터가 사라지나 | 파드의 기본 저장 공간은 파드와 생사를 같이한다 |
| PV · PVC · StorageClass | 저장소를 빌리는 세 등장인물 |
| PVC 가 `Pending` 인 이유 | 고장이 아니다. 기다리는 중이다 |
| StatefulSet | 파드에 **고정된 이름**과 **전용 저장소**를 준다 |
| Deployment 와 차이 | 직접 죽여 보며 비교한다 |

## 준비물

- 쿠버네티스 클러스터 하나. 없으면 [앞 글](https://autops.run/kind-kubernetes-on-mac/)대로 kind 로 만든다
- `kubectl`
- 걸리는 시간 20분 안팎

실습은 전용 네임스페이스에서 한다. 다 끝나고 통째로 지우면 깨끗하다.

```bash
kubectl create namespace stateful-demo
```

> 📌 **네임스페이스가 무엇인가.** 클러스터 안을 논리적으로 나눈 칸이다. 폴더라고 생각하면 쉽다. 실습용으로 하나 만들어 두면 나중에 그 칸만 지워서 한 번에 치울 수 있다.

## 1. 먼저 데이터가 사라지는 것을 본다

말로 듣는 것보다 한 번 겪는 게 빠르다.

파드 3개를 띄우는 평범한 **Deployment** 를 만든다. 저장 공간으로는 `emptyDir` 를 붙였다. 이름 그대로 "빈 디렉터리"인데, **파드가 사라지면 같이 사라진다.**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: notes-deploy
  namespace: stateful-demo
spec:
  replicas: 3
  selector:
    matchLabels: { app: notes-deploy }
  template:
    metadata:
      labels: { app: notes-deploy }
    spec:
      containers:
        - name: app
          image: busybox:1.36
          command: ["sh", "-c", "sleep 36000"]
          volumeMounts:
            - name: data
              mountPath: /data     # 이 경로에 저장 공간을 붙인다
      volumes:
        - name: data
          emptyDir: {}             # 파드와 생사를 같이하는 임시 공간
```

파드 이름부터 본다.

```bash
kubectl get pods -n stateful-demo -l app=notes-deploy
```

```
notes-deploy-85bb56cf5d-b62vz
notes-deploy-85bb56cf5d-f2ddl
notes-deploy-85bb56cf5d-tbs64
```

**뒤에 붙은 글자가 무작위다.** 이게 뒤에서 중요해진다.

첫 번째 파드에 글자를 하나 써 넣는다.

```bash
kubectl exec -n stateful-demo notes-deploy-85bb56cf5d-b62vz -- \
  sh -c "echo '이 글은 살아남을까?' > /data/note.txt"
```

이제 그 파드를 죽인다.

```bash
kubectl delete pod notes-deploy-85bb56cf5d-b62vz -n stateful-demo
```

Deployment 는 파드가 3개 유지되도록 새로 하나를 띄운다. 다시 목록을 본다.

```
notes-deploy-85bb56cf5d-f2ddl
notes-deploy-85bb56cf5d-jr928     ← 새로 뜬 것. 이름이 다르다
notes-deploy-85bb56cf5d-tbs64
```

죽인 `b62vz` 는 없고 **처음 보는 `jr928`** 이 대신 들어왔다. 파일을 찾아본다.

```bash
for p in f2ddl jr928 tbs64; do
  kubectl exec -n stateful-demo notes-deploy-85bb56cf5d-$p -- cat /data/note.txt
done
```

```
cat: can't open '/data/note.txt': No such file or directory
cat: can't open '/data/note.txt': No such file or directory
cat: can't open '/data/note.txt': No such file or directory
```

**어디에도 없다.** 데이터가 사라졌다. 이게 출발점이다.

> 📌 Deployment 가 잘못 만들어진 게 아니다. **원래 그런 용도**다. 웹 서버처럼 "누가 요청을 받아도 상관없는" 것을 여러 개 띄우는 데 쓴다. 파드끼리 구별할 이유가 없으니 이름도 무작위로 짓고, 죽으면 새로 만들면 그만이다.

## 2. 저장소를 빌리는 세 등장인물

데이터를 남기려면 **파드 바깥의 저장 공간**을 빌려야 한다. 쿠버네티스에서는 등장인물이 셋이다. 이름이 비슷해서 헷갈리는데, 역할은 확실히 다르다.

| 이름 | 하는 일 | 비유 |
|---|---|---|
| **PV** (PersistentVolume) | 실제 저장 공간 | 창고 |
| **PVC** (PersistentVolumeClaim) | "이만큼 주세요" 하는 요청서 | 창고 신청서 |
| **StorageClass** | 요청이 오면 창고를 자동으로 만들어 준다 | 창고 관리소 |

우리가 직접 쓰는 것은 **PVC 하나뿐**이다. 신청서만 내면 StorageClass 가 알아서 창고(PV)를 만들어 붙여 준다.

지금 클러스터에 어떤 관리소가 있는지 본다.

```bash
kubectl get storageclass
```

```
NAME                 PROVISIONER             RECLAIMPOLICY   VOLUMEBINDINGMODE
standard (default)   rancher.io/local-path   Delete          WaitForFirstConsumer
```

`(default)` 가 붙어 있으니, PVC 에 아무것도 안 적으면 이게 쓰인다. 맨 오른쪽 `WaitForFirstConsumer` 는 다음 단계에서 바로 만나게 된다.

## 3. PVC 를 만들어 본다 — 그런데 Pending 에서 멈춘다

신청서를 하나 낸다. 쓰는 파드는 아직 없다.

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: lonely
  namespace: stateful-demo
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 100Mi
```

```bash
kubectl get pvc -n stateful-demo
```

```
NAME     STATUS    VOLUME   CAPACITY   STORAGECLASS   AGE
lonely   Pending                       standard       0s
```

**`Pending` 이다.** 여기서 "뭐가 잘못됐나" 하고 한참 찾게 되는데, 고장이 아니다. 이유를 물어보면 친절하게 알려 준다.

```bash
kubectl describe pvc lonely -n stateful-demo
```

```
Type    Reason                Age   Message
----    ------                ----  -------
Normal  WaitForFirstConsumer  0s    waiting for first consumer to be created before binding
```

**"이걸 쓰겠다는 파드가 나타날 때까지 기다리는 중"** 이라는 뜻이다.

> 📌 **왜 기다리나.** 창고는 어느 노드엔가 만들어져야 한다. 그런데 이 PVC 를 쓸 파드가 어느 노드에 뜰지 아직 모른다. 먼저 창고를 만들어 뒀는데 파드가 다른 노드에 떠 버리면, 파드는 자기와 다른 노드의 창고를 쓰지 못한다.
>
> 그래서 **파드가 어느 노드에 갈지 정해진 다음에** 그 노드에 창고를 만든다. `WaitForFirstConsumer` 가 그 뜻이다.

실제로 쓰는 파드를 하나 붙여 보면 바로 풀린다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: lonely-consumer
  namespace: stateful-demo
spec:
  containers:
    - name: app
      image: busybox:1.36
      command: ["sh", "-c", "sleep 3600"]
      volumeMounts:
        - name: d
          mountPath: /data
  volumes:
    - name: d
      persistentVolumeClaim:
        claimName: lonely        # 아까 만든 신청서를 가리킨다
```

```
lonely → Bound (100Mi)
```

`Pending` 이 `Bound` 로 바뀌었다. **묶였다**는 뜻이다.

> 💡 PVC 가 `Pending` 에서 안 넘어갈 때 **가장 먼저 볼 것은 `kubectl describe pvc` 의 Events** 다. `WaitForFirstConsumer` 면 정상이고, StorageClass 이름이 틀렸거나 용량이 부족하면 다른 메시지가 뜬다.

## 4. StatefulSet — 파드에 이름표를 달아 준다

이제 본론이다. **StatefulSet** 은 Deployment 와 달리 파드마다 **고정된 이름**과 **전용 저장소**를 준다.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: notes
  namespace: stateful-demo
spec:
  clusterIP: None          # 헤드리스 서비스 — 뒤에서 설명한다
  selector: { app: notes }
  ports: [{ port: 80 }]
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: notes
  namespace: stateful-demo
spec:
  serviceName: notes
  replicas: 3
  selector:
    matchLabels: { app: notes }
  template:
    metadata:
      labels: { app: notes }
    spec:
      containers:
        - name: app
          image: busybox:1.36
          command: ["sh", "-c", "sleep 36000"]
          volumeMounts:
            - name: data
              mountPath: /data

  # ★ 여기가 핵심이다. Deployment 에는 이 항목이 없다.
  #   파드마다 PVC 를 하나씩 자동으로 만들어 준다.
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: [ReadWriteOnce]
        resources:
          requests:
            storage: 100Mi
```

만들고 파드 이름을 본다.

```bash
kubectl get pods -n stateful-demo -l app=notes
```

```
notes-0
notes-1
notes-2
```

**무작위 글자가 없다.** 0, 1, 2 번호가 붙었다. PVC 도 자동으로 생겼다.

```bash
kubectl get pvc -n stateful-demo
```

```
NAME           STATUS    CAPACITY
data-notes-0   Bound     100Mi
data-notes-1   Bound     100Mi
data-notes-2   Bound     100Mi
lonely         Pending                ← 3단계의 그 PVC (아직 소비자 없을 때)
```

이름이 `data-notes-0` 처럼 **`볼륨이름-파드이름`** 으로 붙는다. 어느 저장소가 누구 것인지 이름만 봐도 안다.

## 5. 순서대로 뜨고, 역순으로 죽는다

StatefulSet 의 또 다른 성질이다. 파드 수를 0 으로 줄여 본다.

```bash
kubectl scale statefulset notes -n stateful-demo --replicas=0
```

```
+0초  notes-0(Running) notes-1(Running) notes-2(Terminating)
+2초  notes-0(Running) notes-1(Terminating)
+5초  notes-0(Terminating)
```

**뒷번호부터** 사라진다. 2 → 1 → 0 순이다. 다시 3 으로 올리면 반대다.

```bash
kubectl scale statefulset notes -n stateful-demo --replicas=3
```

```
+0초  notes-0(ContainerCreating)
+1초  notes-0(Running) notes-1(ContainerCreating)
+1초  notes-0(Running) notes-1(Running) notes-2(ContainerCreating)
```

`notes-0` 이 **Running 이 된 다음에야** `notes-1` 이 시작된다.

> 📌 **왜 순서를 지키나.** 데이터베이스 클러스터를 떠올리면 된다. 보통 0번이 주 노드가 되고 나머지가 거기 붙어 복제를 시작한다. 0번이 준비되기 전에 1번이 붙으려 하면 실패한다. 그래서 순서를 지킨다.

> 📌 그러면 **이 순서를 거꾸로 바꿀 수 있을까?** 줄일 때 뒷번호가 아니라 앞번호를 없앨 수는 없는지 직접 해 본 것을 [StatefulSet 은 뒷번호부터 지운다](https://autops.run/statefulset-scale-down-order/)에 정리했다. 아래 나오는 PVC 보존 동작을 바꾸는 방법도 거기서 다룬다.

그리고 파드가 하나도 없는 상태에서 PVC 를 보면 이렇다.

```
data-notes-0   Bound
data-notes-1   Bound
data-notes-2   Bound
```

**파드를 다 지워도 저장소는 남아 있다.** 이게 핵심이다.

## 6. 파드를 죽여 본다

1단계에서 데이터가 날아갔던 그 실험을 이번엔 StatefulSet 으로 한다.

각 파드에 서로 다른 글을 써 넣는다.

```bash
for i in 0 1 2; do
  kubectl exec -n stateful-demo notes-$i -- \
    sh -c "echo '나는 notes-$i 이고 이 글은 내 전용 저장소에 있다' > /data/note.txt"
done
```

죽이기 전에 `notes-1` 의 신상을 적어 둔다.

```bash
kubectl get pod notes-1 -n stateful-demo \
  -o custom-columns='NAME:.metadata.name,NODE:.spec.nodeName,IP:.status.podIP,UID:.metadata.uid'
```

```
NAME      NODE          IP              UID
notes-1   lab-worker2   10.244.16.141   aae84a06-a44c-467e-bbaa-26ba99ecf319
```

죽인다.

```bash
kubectl delete pod notes-1 -n stateful-demo
```

돌아온 것을 같은 명령으로 본다.

```
NAME      NODE          IP              UID
notes-1   lab-worker2   10.244.16.142   1ba16dd4-fba2-4a08-8814-c8bbe7008646
```

세 가지를 짚어야 한다.

- **UID 가 다르다.** `aae84a06...` → `1ba16dd4...` — 진짜 **새 파드**다. 되살아난 게 아니다.
- **IP 도 바뀌었다.** `.141` → `.142`
- **그런데 이름은 그대로 `notes-1` 이다.**

그리고 결정적인 것.

```bash
kubectl exec -n stateful-demo notes-1 -- cat /data/note.txt
```

```
나는 notes-1 이고 이 글은 내 전용 저장소에 있다
```

**데이터가 남았다.** 새 파드가 `data-notes-1` 저장소를 다시 물고 온 것이다.

### 이름으로 부를 수 있다

아까 서비스에 적었던 `clusterIP: None` 이 여기서 쓰인다. 이걸 **헤드리스 서비스**라고 하는데, 트래픽을 나눠 주는 대신 **파드 하나하나에 DNS 이름**을 달아 준다.

```bash
kubectl exec -n stateful-demo notes-0 -- \
  nslookup notes-1.notes.stateful-demo.svc.cluster.local
```

```
Name:	notes-1.notes.stateful-demo.svc.cluster.local
Address: 10.244.16.142
```

**IP 가 `.141` 에서 `.142` 로 바뀌었는데도 같은 이름으로 찾아진다.** 이름이 새 IP 를 가리키도록 알아서 갱신된 것이다. 다른 파드는 IP 를 몰라도 `notes-1` 이라는 이름만 알면 된다.

## 7. 데이터는 실제로 어디 있나

추상적으로 느껴질 수 있으니 실물을 확인한다. PVC 가 물고 있는 PV 를 찾는다.

```bash
PVNAME=$(kubectl get pvc data-notes-1 -n stateful-demo -o jsonpath='{.spec.volumeName}')
kubectl get pv "$PVNAME" -o jsonpath='{.spec.hostPath.path}'
```

```
/var/local-path-provisioner/pvc-20f154d1-..._stateful-demo_data-notes-1
```

`lab-worker2` 노드 안의 경로다. kind 는 노드가 도커 컨테이너라 직접 열어볼 수 있다.

```bash
docker exec lab-worker2 cat /var/local-path-provisioner/pvc-20f154d1-.../note.txt
```

```
나는 notes-1 이고 이 글은 내 전용 저장소에 있다
```

**파드 밖, 노드의 디스크에 진짜 파일로 있다.** 그래서 파드가 죽어도 남는다.

> ⚠️ 지금 쓰는 `local-path` 는 **노드의 디스크**에 저장한다. 실습에는 충분하지만 그 노드가 죽으면 데이터도 함께 사라진다. 또 파드가 다른 노드로 옮겨가지도 못한다. 창고가 그 노드에 묶여 있기 때문이다.
>
> 실제 운영에서는 노드와 분리된 저장소(클라우드 디스크, NFS, Ceph 등)를 쓴다. 구조는 똑같고 StorageClass 만 바뀐다.

## 8. 정리하면 이렇게 다르다

| | Deployment | StatefulSet |
|---|---|---|
| 파드 이름 | `notes-deploy-85bb56cf5d-b62vz` | `notes-0`, `notes-1`, `notes-2` |
| 죽였다 살리면 | **다른 이름**으로 새로 뜸 | **같은 이름**으로 돌아옴 |
| 저장소 | 직접 붙여야 하고, 보통 공유하거나 임시 | 파드마다 **자동으로 하나씩** |
| 데이터 | `emptyDir` 면 **사라짐** | **남음** |
| 뜨는 순서 | 한꺼번에 | 0 → 1 → 2 |
| 지우는 순서 | 아무거나 | 2 → 1 → 0 |
| 개별 접근 | 어려움 | 헤드리스 서비스로 **이름 접근** |
| 쓰는 곳 | 웹 서버, API | **DB, 메시지 큐, 분산 저장소** |

## 다 쓰고 치우기

네임스페이스를 지우면 파드와 PVC 가 함께 사라진다.

```bash
kubectl delete namespace stateful-demo
```

> ⚠️ **PVC 가 지워지면 데이터도 지워진다.** 이 StorageClass 의 정책이 `RECLAIMPOLICY: Delete` 이기 때문이다(2단계의 `kubectl get storageclass` 출력에 나와 있다). 운영 환경에서 실수로 네임스페이스를 지우면 DB 데이터가 같이 날아간다는 뜻이다. `Retain` 으로 두면 PVC 를 지워도 창고는 남는다.
>
> 참고로 **StatefulSet 만 지우는 경우 PVC 는 남는다.** 일부러 그렇게 돼 있다. 지우려면 따로 지워야 한다.

## 정리

- **파드의 기본 저장 공간은 파드와 함께 사라진다.** `emptyDir` 로 실험해 보면 바로 확인된다. 데이터를 남기려면 PVC 로 바깥 저장소를 빌려야 한다.
- **PVC 가 `Pending` 인 것은 대개 고장이 아니다.** `kubectl describe pvc` 에 `waiting for first consumer to be created before binding` 이 보이면, 쓸 파드가 어느 노드에 뜰지 정해지기를 기다리는 중이다.
- **StatefulSet 은 파드에 고정된 이름과 전용 저장소를 준다.** 죽였다 살려도 같은 이름으로 돌아오고 자기 저장소를 다시 물고 온다. UID 와 IP 는 바뀌지만 이름은 안 바뀐다.
- **헤드리스 서비스(`clusterIP: None`)가 파드마다 DNS 이름을 달아 준다.** IP 가 바뀌어도 이름은 그대로라, 다른 파드가 이름만 알면 찾아갈 수 있다.
- **DB 를 쿠버네티스에 올린다면 Deployment 가 아니라 StatefulSet 이다.**
