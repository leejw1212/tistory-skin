![Jenkins 백업본으로 복구하기 — 지우고, 다시 깔고, 되돌리기](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/61-cover-jenkins-restore.jpg)

Jenkins 가 어느 날 먹통이 된다. 플러그인을 잘못 올렸거나, 설정을 건드렸거나, 장비가 죽었거나. **백업셋이 있다면 되돌릴 수 있다.**

되돌리는 원리는 생각보다 단순하다.

> **Jenkins 의 상태는 거의 전부 `JENKINS_HOME` 디렉터리 안에 있다.** 잡 설정, 빌드 이력, 플러그인, 자격 증명 — 전부 여기다. 백업셋이란 사실상 **이 디렉터리를 통째로 압축한 것**이다.

그래서 복구는 **그 디렉터리를 갈아 끼우는 일**이 된다.

## 순서

| 단계 | 하는 일 |
|---|---|
| 1 | 기존 Jenkins 를 **완전히** 지운다 |
| 2 | 원하는 버전으로 다시 설치한다 |
| 3 | `JENKINS_HOME` 을 백업본으로 교체한다 |
| 4 | 재시작하고 확인한다 |

## 1. 기존 Jenkins 완전히 지우기

찌꺼기가 남으면 복구본과 섞인다. 깨끗이 지운다.

```bash
# 1) 서비스 정지
sudo systemctl stop jenkins.service

# 2) 패키지 삭제
sudo apt remove jenkins

# 3) 관련 디렉터리 삭제
sudo rm -rf /var/lib/jenkins      # JENKINS_HOME
sudo rm -f  /etc/init.d/jenkins
sudo rm -rf /var/log/jenkins
```

> ⚠️ **`rm -rf /var/lib/jenkins` 는 지금 있는 잡과 빌드 이력을 전부 지운다.** 복구하려는 백업본이 실제로 쓸 수 있는 것인지 **먼저 확인하고** 이 명령을 친다. 압축을 한 번 풀어 안에 `config.xml` 과 `jobs/` 가 있는지 보는 것으로 충분하다.

### 경로를 바꿔 썼다면

기본값을 안 쓰고 경로를 옮겼다면 지울 곳이 다르다. 설정 파일에서 확인한다.

```bash
cat /etc/default/jenkins
```

```
# location of the jenkins war file
JENKINS_WAR=/usr/share/$NAME/$NAME.war

# jenkins home location
JENKINS_HOME=/var/lib/$NAME

# log location. this may be a syslog facility.priority
JENKINS_LOG=/var/log/$NAME/$NAME.log
```

`JENKINS_WAR`, `JENKINS_HOME`, `JENKINS_LOG` 세 경로를 보고 그 자리를 지운다.

> 📌 최근 패키지는 `/etc/default/jenkins` 대신 **systemd 유닛**으로 설정이 넘어간 경우가 있다. 그럴 때는 이렇게 본다.
>
> ```bash systemctl cat jenkins | grep -i "environment\|JENKINS_HOME"
> ```

## 2. 원하는 버전으로 다시 설치

배포판 기본 저장소의 Jenkins 는 대체로 옛 버전이다. LTS 저장소를 추가한다.

```bash
# 저장소 키 추가
curl -fsSL https://pkg.jenkins.io/debian-stable/jenkins.io-2023.key \
  | sudo tee /usr/share/keyrings/jenkins-keyring.asc > /dev/null

# 저장소 추가
echo "deb [signed-by=/usr/share/keyrings/jenkins-keyring.asc]" \
     "https://pkg.jenkins.io/debian-stable binary/" \
  | sudo tee /etc/apt/sources.list.d/jenkins.list > /dev/null

sudo apt update
sudo apt install jenkins
```

> 📌 예전 글에서 흔히 보이는 `apt-key add` 방식은 **더 이상 쓰지 않는다.** `apt-key` 가 폐기되어 위처럼 `signed-by` 로 키링을 지정하는 방식으로 바뀌었다. 오래된 안내를 그대로 따라 하면 경고가 나거나 저장소를 못 읽는다.

### 예전 버전으로 되돌려야 한다면

백업본이 만들어진 시점의 Jenkins 버전으로 맞추고 싶을 때가 있다. `.war` 파일을 직접 받아 `JENKINS_WAR` 경로에 놓으면 된다.

- [get.jenkins.io/war-stable](https://get.jenkins.io/war-stable/) 에서 해당 버전을 받는다
- `JENKINS_WAR` 가 가리키는 경로(`/usr/share/jenkins/jenkins.war`)에 덮어쓴다

> 💡 **버전을 맞추는 쪽이 안전하다.** 백업본이 만들어진 버전보다 새 Jenkins 에 얹으면 플러그인 호환이 깨지는 경우가 있다. 반대로 **더 낮은 버전으로 내리는 것은 더 위험하다** — 새 버전이 쓴 설정 파일을 옛 버전이 못 읽는다.

## 3. JENKINS_HOME 을 백업본으로 교체

여기가 복구의 핵심이다.

```bash
sudo systemctl stop jenkins.service

# 새로 설치되며 만들어진 빈 HOME 을 치운다
sudo rm -rf /var/lib/jenkins

# 백업본을 그 자리에 푼다
sudo tar -xzf /backup/jenkins-backupset.tar.gz -C /var/lib/

# 소유자를 jenkins 로 돌려 놓는다
sudo chown -R jenkins:jenkins /var/lib/jenkins
```

> ⚠️ **`chown` 을 빠뜨리는 실수가 가장 흔하다.** root 로 압축을 풀면 파일 주인이 root 가 되고, Jenkins 는 자기 홈을 못 읽어 기동에 실패하거나 빈 화면으로 뜬다. 복구했는데 잡이 하나도 안 보인다면 **여기부터 본다.**

## 4. 재시작하고 확인

```bash
sudo systemctl restart jenkins.service
sudo systemctl status jenkins.service --no-pager
```

확인할 것은 셋이다.

| 볼 것 | 어떻게 |
|---|---|
| **서비스가 떴나** | `systemctl status` 가 `active (running)` |
| **잡이 돌아왔나** | 웹 UI 의 잡 목록이 백업 시점과 같은가 |
| **플러그인이 정상인가** | Jenkins 관리 화면에 오류 배너가 없는가 |

안 뜨면 로그를 본다. 원인이 대체로 그대로 적혀 있다.

```bash
sudo journalctl -u jenkins -n 50 --no-pager
```

| 로그에 보이는 것 | 원인 |
|---|---|
| `Failed to create ... Permission denied` | 3장의 `chown` 을 빠뜨렸다 |
| 플러그인 관련 예외 | 백업본과 Jenkins 버전이 안 맞는다 |
| `Address already in use` | 옛 프로세스가 아직 떠 있다 |

> 💡 복구가 끝나면 **그 상태로 백업을 한 번 더 뜬다.** 복구 직후가 "확실히 동작하는 상태"인데, 여기서 다시 만지다 깨지면 돌아올 자리가 또 필요하다.

## 백업은 어떻게 떠 두나

복구를 해 보면 무엇을 백업해야 하는지가 분명해진다. **`JENKINS_HOME` 하나면 된다.**

```bash
sudo systemctl stop jenkins.service
sudo tar -czf /backup/jenkins-$(date +%Y%m%d).tar.gz -C /var/lib jenkins
sudo systemctl start jenkins.service
```

> 📌 돌아가는 중에 떠도 대개 되지만, **빌드가 도는 중이면 어긋난 상태가 담길 수 있다.** 정기 백업은 빌드가 없는 시간대에 잡고, 가능하면 정지 후 뜬다. 멈출 수 없다면 `ThinBackup` 같은 플러그인이 대안이다.
>
> `workspace/` 와 `builds/` 는 용량이 크고 대개 다시 만들 수 있다. 용량이 부담되면 이 둘을 빼고 뜨는 것도 방법이다 — 다만 **빌드 이력이 사라진다.**

## 정리

- **Jenkins 의 상태는 `JENKINS_HOME` 안에 있다.** 백업도 복구도 이 디렉터리 하나로 귀결된다.
- **지우기 전에 백업본이 쓸 수 있는지 확인한다.** 압축을 열어 `config.xml` 과 `jobs/` 가 있는지 보는 것으로 족하다.
- **버전을 맞춘다.** 특히 낮은 버전으로 내리는 것은 위험하다.
- **`chown -R jenkins:jenkins` 를 잊지 않는다.** 복구했는데 잡이 안 보이는 사고의 대부분이 이것이다.
- **복구 직후 다시 백업을 뜬다.** 확실히 동작하는 상태를 하나 확보해 둔다.

## 함께 읽기

- [Jenkins 분산 빌드](https://autops.run/jenkins-distributed-build/) — 에이전트를 붙여 쓰고 있다면 복구 뒤에 노드가 다시 붙는지도 확인해야 한다.
- [배포 롤백](https://autops.run/deploy-rollback/) — Jenkins 자체가 아니라 배포한 것을 되돌리는 쪽.
