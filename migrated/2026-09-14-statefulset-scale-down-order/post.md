![StatefulSet 은 뒷번호부터 지운다 — 순서를 뒤집는 대신 ordinals.start 로 범위를 옮긴다](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/81-cover-statefulset-ordinals.jpg)

[앞 글](https://autops.run/statefulset-pvc-basics/)에서 StatefulSet 이 `notes-0`, `notes-1`, `notes-2` 처럼 번호가 붙은 파드를 만들고, 줄일 때는 **뒷번호부터** 사라지는 것을 봤다.

그러면 이런 궁금증이 생긴다.

> **이 순서를 거꾸로 바꿀 수 있을까?** 5개를 3개로 줄일 때 4·3 이 아니라 0·1 을 없앨 수는 없나?

직접 해 봤다. **결론부터 말하면 "방향을 뒤집는 설정"은 없다.** 하지만 **낮은 번호를 없애는 방법은 있다.** 다른 길로 간다.

## 먼저 결론

| 시도 | 결과 |
|---|---|
| `podManagementPolicy: Parallel` | **안 된다.** 만든 뒤에는 못 바꾸고, 방향도 안 바뀐다 |
| `pod-deletion-cost` 어노테이션 | **안 된다.** StatefulSet 에는 효과가 없다 |
| **`ordinals.start` 로 범위 옮기기** | **된다.** 5개 중 0·1 을 없애고 2·3·4 를 남겼다 |

> 📌 **"번호"를 정확히는 ordinal(오디널, 서수) 이라고 부른다.** `notes-0` 의 0, `notes-1` 의 1 이 그것이다. 이 글에서는 그냥 "번호" 라고 쓴다.

## 0. 실습 준비

앞 글에서 만든 것을 그대로 쓴다. 없으면 [거기](https://autops.run/statefulset-pvc-basics/)부터 본다.

파드마다 자기 이름을 파일로 적어 둔다. 나중에 **누가 살아남았는지, 데이터가 남았는지**를 이걸로 확인한다.

```bash
for i in 0 1 2 3 4; do
  kubectl exec -n stateful-demo notes-$i -- \
    sh -c "echo '나는 notes-$i' > /data/note.txt"
done
```

## 1. 전제부터 확인한다 — 정말 뒷번호부터인가

3개를 5개로 늘린다.

```bash
kubectl scale statefulset notes -n stateful-demo --replicas=5
```

```
+0초  notes-0(Running) notes-1(Running) notes-2(Running) notes-3(Pending)
+4초  notes-0(Running) notes-1(Running) notes-2(Running) notes-3(ContainerCreating)
+5초  notes-0(Running) ... notes-3(Running) notes-4(Pending)
+9초  notes-0(Running) ... notes-3(Running) notes-4(ContainerCreating)
```

`notes-3` 이 **Running 이 된 뒤에야** `notes-4` 가 시작된다. 앞번호부터 차례로다.

이제 5개를 3개로 줄인다.

```bash
kubectl scale statefulset notes -n stateful-demo --replicas=3
```

```
+0초  notes-0(Running) notes-1(Running) notes-2(Running) notes-3(Running) notes-4(Terminating)
+3초  notes-0(Running) notes-1(Running) notes-2(Running) notes-3(Terminating)
+6초  notes-0(Running) notes-1(Running) notes-2(Running)
```

**4번이 먼저, 그다음 3번.** 뒷번호부터 맞다.

> 📌 **왜 이 방향인가.** StatefulSet 의 파드 번호는 **끊기지 않는 범위**여야 한다. 0,1,2,3,4 에서 가운데 2 를 빼면 0,1,3,4 가 되는데, 이러면 "3개짜리 StatefulSet" 인데 번호가 3,4 까지 가 있는 이상한 상태가 된다.
>
> 범위를 유지하면서 개수를 줄이는 가장 단순한 방법이 **끝에서 자르는 것**이다. 그래서 뒷번호부터다.

## 2. 시도 1 — podManagementPolicy 를 바꿔 본다

검색하면 가장 먼저 나오는 설정이다. 문서를 읽어 보면 이렇게 돼 있다.

```bash
kubectl explain statefulset.spec.podManagementPolicy
```

```
- "OrderedReady" will create pods in strictly increasing order on scale up
  and strictly decreasing order on scale down, progressing only when the
  previous pod is ready or terminated.
- "Parallel" will create and delete pods as soon as the stateful set replica
  count is changed, and will not wait for pods to be ready or complete
  termination.
```

읽어 보면 **`Parallel` 은 "기다리지 않는다" 는 뜻이지 "거꾸로 한다" 가 아니다.** 한꺼번에 처리할 뿐, 줄일 때 없어지는 것은 여전히 뒷번호다.

그래도 바꿔 보려 하면 이 오류를 만난다.

```bash
kubectl patch statefulset notes -n stateful-demo --type=merge \
  -p '{"spec":{"podManagementPolicy":"Parallel"}}'
```

```
The StatefulSet "notes" is invalid: spec.podManagementPolicy: Invalid value:
"Parallel": field is immutable
```

> ⚠️ **`field is immutable` 은 "만든 뒤에는 못 바꾼다"** 는 뜻이다. 바꾸려면 StatefulSet 을 지우고 다시 만들어야 한다. 이 필드 말고도 `serviceName`, `selector`, `volumeClaimTemplates` 가 같은 성질이다. 처음 만들 때 정해야 한다.

어차피 방향이 안 바뀌니 여기서는 넘어간다.

## 3. 시도 2 — pod-deletion-cost 어노테이션

"어떤 파드를 먼저 지울지" 를 정하는 기능이 쿠버네티스에 있긴 하다. `controller.kubernetes.io/pod-deletion-cost` 인데, **값이 낮은 파드를 먼저 지운다.**

`notes-2` 에 아주 낮은 값을 주고 줄여 본다. 먹힌다면 2번이 지워질 것이다.

```bash
kubectl annotate pod notes-2 -n stateful-demo \
  controller.kubernetes.io/pod-deletion-cost=-9999 --overwrite
kubectl scale statefulset notes -n stateful-demo --replicas=2
```

```
+0초  notes-0(Running) notes-1(Running) notes-2(Terminating)
```

2번이 지워지긴 했다. **그런데 이건 어노테이션 덕분이 아니다.** 원래도 3개에서 2개로 줄이면 맨 뒤인 2번이 지워진다. 어노테이션이 없어도 같은 결과다.

**이 기능은 ReplicaSet(그래서 Deployment)에만 동작한다.** StatefulSet 컨트롤러는 이 값을 아예 보지 않는다. 넣어도 조용히 무시된다.

> 💡 이런 걸 확인할 때는 **"기대한 결과가 나왔다" 만으로 판단하면 안 된다.** 어노테이션 없이도 같은 결과가 나오는 상황이었기 때문이다. 이번 경우는 원래 동작과 구분이 안 되는 실험이었다. 구분하려면 맨 뒤가 아닌 파드 (예: `notes-0`)에 낮은 값을 주고 그게 지워지는지 봐야 한다.

## 4. 되는 방법 — ordinals.start 로 범위를 옮긴다

1단계 콜아웃에서 "파드 번호는 끊기지 않는 범위" 라고 했다. 그 범위가 **어디서 시작하는지**를 정하는 필드가 있다.

```bash
kubectl explain statefulset.spec.ordinals
```

```
start is the number representing the first replica's index. ...
If set, replica indices will be in the range:
  [.spec.ordinals.start, .spec.ordinals.start + .spec.replicas).
```

**범위가 `[start, start + replicas)`** 라고 적혀 있다. 기본값은 `start: 0` 이라 `replicas: 5` 면 `[0, 5)` = 0,1,2,3,4 가 된다.

여기서 아이디어가 나온다. **`start` 를 올리면 앞쪽이 잘려 나간다.**

- `start=0, replicas=5` → `[0, 5)` = **0,1,2,3,4**
- `start=2, replicas=3` → `[2, 5)` = **2,3,4**

개수는 5 → 3 으로 줄었는데, 없어지는 것은 **0 과 1** 이다. 해 본다.

```bash
kubectl patch statefulset notes -n stateful-demo --type=merge \
  -p '{"spec":{"ordinals":{"start":2},"replicas":3}}'
```

```
+0초  notes-0(Running) notes-1(Terminating) notes-2(Running) notes-3(Running) notes-4(Running)
+2초  notes-0(Terminating) notes-2(Running) notes-3(Running) notes-4(Running)
+5초  notes-2(Running) notes-3(Running) notes-4(Running)
```

**0 과 1 이 사라지고 2,3,4 가 남았다.** 살아남은 파드의 데이터도 확인한다.

```bash
for i in 2 3 4; do kubectl exec -n stateful-demo notes-$i -- cat /data/note.txt; done
```

```
나는 notes-2
나는 notes-3
나는 notes-4
```

그대로다. 각자 자기 저장소를 계속 물고 있다.

### 다만, 이건 "역순"이 아니다

정확히 말해야 한다. 위 출력을 다시 보면 **없어지는 순서 자체는 여전히 1 → 0 으로 내림차순**이다. 바뀐 것은 **어느 번호들이 없어지느냐**다.

| | 보통 방식 | `ordinals.start` 방식 |
|---|---|---|
| 5 → 3 으로 줄일 때 | 4,3 이 없어짐 | 0,1 이 없어짐 |
| 없어지는 순서 | 4 → 3 (내림차순) | 1 → 0 (내림차순) |
| 남는 파드 | 0,1,2 | 2,3,4 |

즉 **"삭제 방향" 을 바꾼 게 아니라 "번호 창(window)" 을 통째로 옮긴 것**이다. 결과적으로 낮은 번호를 없앨 수 있으니, 원하던 목적은 달성된다.

### 되돌리면 데이터도 돌아온다

`start` 를 다시 0 으로 놓고 5개로 늘려 본다.

```bash
kubectl patch statefulset notes -n stateful-demo --type=merge \
  -p '{"spec":{"ordinals":{"start":0},"replicas":5}}'
```

```
나는 notes-0
나는 notes-1
나는 notes-2
나는 notes-3
나는 notes-4
```

**0번과 1번이 데이터를 그대로 갖고 돌아왔다.** 파드는 사라졌어도 PVC 는 남아 있었기 때문이다. 새로 뜬 `notes-0` 이 예전 `data-notes-0` 을 다시 물었다.

> 📌 `ordinals.start` 의 원래 용도는 **StatefulSet 을 다른 것으로 옮기는 작업**이다. 문서에 "orchestrate progressive movement of replicas from one StatefulSet to another" 라고 적혀 있다. 한쪽의 `start` 를 올려 가며 파드를 줄이고, 다른 쪽에서 그 번호를 받아 가는 식이다. 이 글의 실험은 그 성질을 빌려 쓴 것이다.

## 5. 줄이면 PVC 는 어떻게 되나

앞 글에서 "파드를 지워도 저장소는 남는다" 고 했다. 확인해 보면 실제로 그렇다.

```bash
kubectl scale statefulset notes -n stateful-demo --replicas=3
kubectl get pvc -n stateful-demo
```

```
data-notes-0   Bound
data-notes-1   Bound
data-notes-2   Bound
data-notes-3   Bound     ← 파드는 없는데 남아 있다
data-notes-4   Bound     ← 이것도
```

기본 설정이 그렇게 돼 있기 때문이다.

```bash
kubectl get statefulset notes -n stateful-demo \
  -o jsonpath='{.spec.persistentVolumeClaimRetentionPolicy}'
```

```
{"whenDeleted":"Retain","whenScaled":"Retain"}
```

- `whenScaled` — **줄일 때** 남는 PVC 를 어떻게 할지
- `whenDeleted` — **StatefulSet 자체를 지울 때** 어떻게 할지

둘 다 기본이 `Retain`(남긴다)이다.

### 안 남기고 싶다면

`whenScaled` 를 `Delete` 로 바꾼다.

```bash
kubectl patch statefulset notes -n stateful-demo --type=merge \
  -p '{"spec":{"persistentVolumeClaimRetentionPolicy":
       {"whenScaled":"Delete","whenDeleted":"Retain"}}}'
```

이 상태로 5 → 3 으로 줄이면 결과가 다르다.

```
data-notes-0   Bound
data-notes-1   Bound
data-notes-2   Bound
                        ← 3,4 는 사라졌다
```

다시 5개로 늘려 보면 차이가 분명해진다.

```
notes-2: 나는 notes-2
notes-3: cat: can't open '/data/note.txt': No such file or directory
notes-4: cat: can't open '/data/note.txt': No such file or directory
```

**3번과 4번은 빈 저장소를 새로 받았다.** 데이터가 사라진 것이다.

> ⚠️ `whenScaled: Delete` 는 **줄이는 순간 데이터가 지워진다.** 트래픽이 적을 때 파드를 줄였다가 나중에 늘리는 식으로 운영한다면, 늘렸을 때 데이터가 없다.
>
> 쓰지 말라는 게 아니라 **캐시처럼 없어져도 되는 데이터**에만 쓰라는 뜻이다. DB 라면 기본값 `Retain` 을 그대로 둔다. 저장소가 쌓여 아깝더라도, 실수로 줄였을 때 데이터가 날아가는 것보다 낫다.

## 6. 손으로 치지 말고 git 에 적는다

여기까지는 전부 `kubectl patch` 로 했다. 잘 되긴 하는데 문제가 하나 있다. **무엇을 왜 바꿨는지가 아무 데도 안 남는다.** 며칠 뒤에 "이 클러스터 번호가 왜 2부터 시작하지?" 하면 답할 방법이 없다.

같은 일을 **git 에 적어서** 하면 기록이 따라온다. [ArgoCD 를 올려 둔 클러스터](https://autops.run/argocd-on-kind/)에서 해 봤다.

YAML 에 4단계에서 patch 로 넣었던 것을 그대로 적는다.

```yaml
spec:
  serviceName: notes
  replicas: 3

  # 파드 번호 범위를 [2, 2+3) = 2,3,4 로 옮긴다.
  # 개수는 3 그대로인데 0,1 이 빠지고 3,4 가 새로 생긴다.
  ordinals:
    start: 2
```

커밋하고 푸시한다.

```bash
git commit -am "StatefulSet 번호 범위를 [2,5) 로 옮긴다 (ordinals.start=2)"
git push
```

그러면 ArgoCD 가 알아서 맞춘다.

```
+0초  [Synced] notes-0(Running) notes-1(Running) notes-2(Running)
+2초  [Synced] notes-0(Terminating) notes-1(Terminating) notes-2(Running) notes-3(ContainerCreating) notes-4(ContainerCreating)
```

결과는 4단계에서 손으로 했을 때와 같다.

```
notes-2
notes-3
notes-4

replicas=3  ordinals.start=2
SYNC=Synced  HEALTH=Healthy  PHASE=Succeeded
```

살아남은 파드의 데이터도 그대로다.

```bash
kubectl exec -n stateful-demo notes-2 -- cat /data/note.txt
```

```
나는 notes-2
```

> 📌 위 출력에서 **0번과 1번이 동시에** 사라진 것이 4단계와 다르다. 4단계에서는 1 → 0 순서로 하나씩 사라졌다.
>
> 이 클러스터는 별도 실험에서 `podManagementPolicy` 를 `Parallel` 로 바꿔 둔 상태였기 때문이다. 2단계에서 봤듯 이 필드는 만든 뒤에 못 바꾸는 것이라, StatefulSet 을 지웠다 다시 만들어야 적용된다. 그 과정은 [ArgoCD 글](https://autops.run/argocd-on-kind/)에 정리했다.

### 이 방식이 나은 점

- **커밋에 남는다.** 누가 언제 왜 바꿨는지가 `git log` 에 있다.
- **되돌리기가 쉽다.** `git revert` 한 번이면 ArgoCD 가 알아서 원래대로 맞춘다. `kubectl patch` 로 되돌리려면 원래 값을 기억하고 있어야 한다.
- **여러 사람이 봐도 헷갈리지 않는다.** YAML 이 곧 현재 상태다.

### 대신 잃는 것

- **`kubectl scale` 이 안 통한다.** ArgoCD 의 자동 동기화(`selfHeal`)를 켜 두면 손으로 바꾼 값이 1초도 안 되어 git 의 값으로 되돌아간다.
- **immutable 필드를 커밋하면 동기화가 멈춘다.** 2단계에서 본 `field is immutable` 오류가 ArgoCD 안에서 나면 무한 재시도에 빠진다.

> 💡 `ordinals.start` 는 **바꿀 수 있는 필드**라 이번처럼 커밋만으로 적용된다. 하지만 `podManagementPolicy` 는 아니다. **git 에 커밋하기 전에 그 필드가 바꿀 수 있는 것인지 먼저 확인하는 습관**이 여기서 값을 한다.

## 7. 치우기

```bash
kubectl delete namespace stateful-demo
```

## 정리

- **StatefulSet 을 줄이면 언제나 뒷번호부터 사라진다.** 파드 번호가 끊기지 않는 범위여야 하기 때문이고, 이 방향을 뒤집는 설정은 없다.
- **`podManagementPolicy` 는 방향과 관계없다.** `Parallel` 은 "기다리지 않는다" 는 뜻이다. 게다가 만든 뒤에는 못 바꾼다(`field is immutable`).
- **`pod-deletion-cost` 는 StatefulSet 에 안 먹는다.** ReplicaSet 전용이다. 실험할 때는 **그 설정이 없어도 같은 결과가 나오는 상황은 아닌지** 먼저 본다.
- **낮은 번호를 없애려면 `ordinals.start` 로 번호 범위를 옮긴다.** `start=2, replicas=3` 이면 범위가 `[2, 5)` 라 0·1 이 빠지고 2·3·4 가 남는다. 삭제 방향을 바꾼 게 아니라 창을 옮긴 것이다.
- **같은 변경을 git 에 적으면 기록이 남는다.** `ordinals.start` 는 바꿀 수 있는 필드라 커밋만으로 ArgoCD 가 적용한다. 대신 자동 동기화를 켜면 `kubectl scale` 로 손대는 것은 되돌려진다.
- **줄여도 PVC 는 남는 것이 기본이다(`whenScaled: Retain`).** 그래서 범위를 되돌리면 데이터가 그대로 돌아온다. `Delete` 로 바꾸면 줄이는 순간 지워지니, 없어져도 되는 데이터에만 쓴다.
