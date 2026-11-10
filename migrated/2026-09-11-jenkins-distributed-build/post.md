![Jenkins 분산 빌드 — 마스터·에이전트 구조와 노드 붙이기](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/56-cover-jenkins-nodes.jpg)

Jenkins 를 처음 세우면 마스터 한 대에서 전부 돌린다. 잡이 서너 개일 때는 그걸로 충분하다. 그런데 빌드가 늘면 이런 일이 생긴다.

- 무거운 빌드가 도는 동안 **웹 UI 가 먹통이 된다**
- 잡이 순서를 기다리느라 큐에 쌓인다
- 리눅스와 윈도우 빌드를 한 대에서 할 수 없다

**마스터는 지휘만 하고 실제 빌드는 다른 장비에서 돌리게 나누는 것**이 분산 빌드다. 이 글은 그 구조와, 노드를 실제로 붙이는 순서를 다룬다.

## 네 가지 이름부터

Jenkins 문서에서 계속 나오는 말이 넷이다. 헷갈리기 쉬운데 관계는 단순하다.

![Jenkins 환경의 구조. 마스터 아래에 에이전트 셋이 붙어 있고, 각 에이전트 안에 엑시큐터가 여러 개 들어 있다](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/50-jenkins-architecture.png)

| 이름 | 무엇 |
|---|---|
| **마스터** | 설정·권한·잡 배정을 맡는 중심. 웹 UI 가 도는 곳 |
| **노드** | 잡을 실행할 수 있는 시스템 전체를 부르는 말. 마스터도 노드다 |
| **에이전트** | 마스터가 아닌 노드. 예전 이름이 **슬레이브** |
| **엑시큐터** | 노드 안에서 잡이 실제로 돌아가는 자리 |

### 마스터

- Jenkins 인스턴스 제어의 중심이다. 모든 설정과 잡에 대한 권한을 갖는다
- 다른 노드를 안 붙였다면 잡도 여기서 돈다. **다만 무거운 작업에는 맞지 않는다**
- 모든 데이터와 자격 증명에 접근할 수 있어 **보안상 가장 민감한 자리**다

> ⚠️ 마스터에서 빌드를 돌리면 안 되는 이유가 성능만은 아니다. 잡 안의 스크립트가 **마스터의 자격 증명과 설정 전체에 닿을 수 있다.** 운영에서는 마스터의 엑시큐터를 **0으로 두고** 빌드는 전부 에이전트로 내보낸다.

### 엑시큐터가 동시 실행 수를 정한다

**한 노드가 몇 개의 잡을 동시에 돌릴 수 있는지는 엑시큐터 개수가 정한다.**

- 엑시큐터가 2개면 그 노드에서 잡 2개가 동시에 돈다. 세 번째는 기다린다
- 마스터가 잡을 어떤 노드에 배정했는데 그 노드의 엑시큐터가 다 차 있으면, **그 잡은 노드가 비어 있어도 대기한다**
- 개수는 노드를 만들 때 정하고 나중에 바꿀 수 있다

> 💡 엑시큐터를 CPU 코어 수 근처로 잡는 것이 출발점이다. 너무 늘리면 빌드끼리 자원을 다투느라 **전체가 같이 느려진다.** 큐가 밀린다고 엑시큐터부터 올리지 말고, 노드를 늘릴지 먼저 따져 본다.

## 노드를 붙이기 전에 — SSH 부터

Jenkins 가 에이전트를 띄우는 방법은 여럿이지만, 리눅스에서는 **마스터가 SSH 로 접속해 에이전트를 실행하는 방식**이 가장 흔하다. 그래서 **노드 등록보다 SSH 키 설정이 먼저다.**

마스터에서 키를 만든다.

```bash
ssh-keygen -t rsa
```

만들어진 공개 키를 **에이전트가 될 서버**의 Jenkins 계정에 등록한다.

```bash
# 에이전트 서버에서
mkdir -p ~/.ssh && chmod 700 ~/.ssh
vi ~/.ssh/authorized_keys      # 마스터의 id_rsa.pub 내용을 붙여 넣는다
chmod 600 ~/.ssh/authorized_keys
```

붙기 전에 손으로 먼저 확인한다. **여기서 안 되면 Jenkins 에서도 안 된다.**

```bash
ssh -i ~/.ssh/id_rsa jenkins@에이전트주소
```

> 📌 SSH 키가 왜 이렇게 동작하는지, 비대칭키와 대칭키가 각각 어디에 쓰이는지는 [SSH 키로 비밀번호 없이 서버 접속하기](https://autops.run/ssh-key-login/)에 따로 정리해 두었다 — 이 글에서는 "되게 만드는 것"까지만 다룬다.

에이전트 쪽 `sshd` 설정도 맞춰 둔다.

```
# /etc/ssh/sshd_config
PasswordAuthentication no
PubkeyAuthentication yes
```

> ⚠️ `PasswordAuthentication no` 로 바꾸기 전에 **키 접속이 되는 것을 반드시 먼저 확인한다.** 순서를 바꾸면 그 서버에 다시 못 들어간다.

## 노드 등록하기

### 1. 노드 관리로 들어간다

**Jenkins 관리**로 간다.

![Jenkins 관리 메뉴](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/51-jenkins-manage.png)

**노드 관리**를 연다.

![노드 관리 항목](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/52-jenkins-nodes.png)

### 2. 신규 노드를 만든다

![신규 노드 버튼이 있는 노드 목록 화면](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/53-jenkins-new-node.png)

노드 이름을 적고 **Permanent Agent** 를 고른 뒤 OK 를 누른다.

![노드명에 DEV_T03 을 입력하고 Permanent Agent 를 선택한 화면](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/54-jenkins-permanent-agent.png)

> 📌 **Permanent Agent** 는 계속 살아 있는 장비를 붙일 때 쓴다. 빌드할 때마다 컨테이너를 띄웠다 지우는 방식은 별도 플러그인(Docker, Kubernetes)을 쓴다.

### 3. 접속 방법을 채운다

여기가 실제 설정이다.

![노드 설정 화면. Remote root directory 는 /opt/jenkins, Launch method 는 SSH 로 지정되어 있다](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/55-jenkins-node-config.png)

| 칸 | 넣을 값 |
|---|---|
| **# of executors** | 이 노드에서 동시에 돌릴 잡 수 |
| **Remote root directory** | 에이전트의 작업 디렉터리. `slave.jar` 등이 여기 생긴다 |
| **Labels** | 잡에서 노드를 골라 쓸 이름표 (`linux`, `build` 등) |
| **Launch method** | `Launch agents via SSH` |
| **Host** | 에이전트 주소 |
| **Credentials** | 앞에서 만든 **개인 키**를 등록해 고른다 |

**Credentials 에는 마스터의 개인 키를 넣는다.** 공개 키는 에이전트 쪽 `authorized_keys` 에 이미 넣어 두었다 — 방향을 헷갈리지 않는다.

> 💡 **Labels 를 꼭 채운다.** 비워 두면 잡을 특정 노드로 보낼 방법이 노드 이름밖에 없다. 라벨을 달아 두면 파이프라인에서 `agent { label 'linux' }` 로 고를 수 있고, 나중에 장비를 바꿔도 잡을 안 고쳐도 된다.

저장하면 마스터가 SSH 로 붙어 에이전트를 띄운다.

## 확인

노드 목록에서 방금 만든 노드가 **온라인**으로 보이면 된다. 안 되면 그 노드의 **로그** 화면에 SSH 접속 과정이 그대로 찍히니 거기서 원인을 본다.

| 로그에 보이는 것 | 원인 |
|---|---|
| `Permission denied (publickey)` | 공개 키가 에이전트에 안 들어갔거나 경로·권한이 틀렸다 |
| `Connection refused` | 주소·포트가 틀렸거나 방화벽이 막는다 |
| `No such file or directory` | Remote root directory 가 없거나 쓸 권한이 없다 |
| `Java not found` | 에이전트에 JDK 가 없다 |

실제로 잡이 그 노드에서 도는지도 확인한다. 잡 설정에서 라벨로 노드를 지정하고 한 번 돌린 뒤, 콘솔 출력 첫 줄을 본다.

```
Running on DEV_T03 in /opt/jenkins/workspace/...
```

**`Running on` 뒤가 마스터가 아니라 에이전트 이름이면** 분산이 제대로 걸린 것이다.

> 📌 노드와 자격 증명이 쌓이면 그게 곧 `JENKINS_HOME` 이고, 여기까지 맞춰 둔 설정이 통째로 그 안에 있다. 장비가 죽거나 플러그인을 잘못 올려 되돌려야 할 때는 [Jenkins 백업본으로 복구하기](https://autops.run/jenkins-backup-restore/)를 본다.

## 정리

- **마스터는 지휘, 에이전트는 실행.** 마스터의 엑시큐터는 0으로 두고 빌드를 내보내는 것이 성능과 보안 양쪽에 맞다.
- **엑시큐터 개수가 동시 실행 수다.** 큐가 밀릴 때 엑시큐터부터 올리면 서로 자원을 다퉈 전체가 느려질 수 있다.
- **노드 등록보다 SSH 가 먼저다.** 손으로 `ssh` 가 되는 것을 확인한 뒤 Jenkins 에 넣는다. 여기서 안 되면 Jenkins 에서도 안 된다.
- **Credentials 에는 개인 키, 에이전트에는 공개 키.** 방향을 헷갈리면 계속 `Permission denied` 를 본다.
- **라벨을 채운다.** 장비가 바뀌어도 잡을 안 고치게 해 주는 유일한 장치다.
