![빌드한 산출물을 Ansible 로 넘기기 — 아티팩트 저장소와 AWX 연동](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/70-cover-artifact-handoff.jpg)

[파이프라인으로 빌드](https://autops.run/jenkins-pipeline-build/)까지 하면 `.jar` 나 `.war` 가 만들어진다. 그런데 그건 **Jenkins 워크스페이스에 남아 있을 뿐**이다. 다음 빌드가 돌면 지워진다.

여기서 CI 가 끝나고 CD 가 시작된다. 이 글은 그 사이를 잇는다.

> 빌드한다 → **아티팩트 저장소에 둔다** → **배포 대상이 가져간다**

## 전체 그림

![Jenkins(CI 서버)가 마운트된 디스크의 아티팩트 저장소에 산출물을 두고, Ansible(CD 서버)이 인스턴스들에 배포를 지시하면 각 인스턴스가 저장소에서 산출물을 받아 간다](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/68-artifact-storage-layout.png)

| 역할 | 하는 일 |
|---|---|
| **Jenkins (CI)** | 빌드하고 산출물을 저장소 경로에 옮긴다 |
| **아티팩트 저장소** | 산출물을 보관하고 HTTP 로 내려받게 한다 |
| **Ansible (CD)** | 배포 대상에게 "저기서 받아다 띄워라" 를 지시한다 |
| **인스턴스** | 저장소에서 산출물을 가져가 교체한다 |

**Jenkins 가 각 서버로 파일을 밀어 넣지 않는다는 점**이 중요하다. 저장소에 두면 인스턴스가 가져간다. 서버가 늘어도 Jenkins 쪽은 안 바뀐다.

> 💡 프로젝트가 늘면 아티팩트 용량이 빠르게 커진다. 운영에서는 **CI 서버에 별도 디스크를 붙여** 그 경로로 마운트한다. 루트 파티션이 차면 Jenkins 자체가 멈춘다.

## 1. 저장소를 HTTP 로 여는 법

인스턴스가 가져가려면 HTTP 로 접근할 수 있어야 한다. 가장 간단한 건 nginx 로 디렉터리를 그대로 호스팅하는 것이다.

```bash
apt update && apt install nginx
```

```nginx
server {
    listen 80;
    server_name artifact.example.com;

    root /opt/build-java;
    autoindex on;          # 디렉터리 목록을 보여 준다
}
```

`autoindex on` 이면 브라우저로 열었을 때 파일 목록이 나온다. 인스턴스는 `wget` 이나 `curl` 로 받아 가면 된다.

> ⚠️ **이건 인증이 없다.** 그 주소에 닿을 수 있는 누구나 산출물을 받아 갈 수 있고, `autoindex` 는 무엇이 있는지까지 보여 준다. **사내망 안에서만 열리게** 막고, 외부에서 접근해야 한다면 인증을 붙이거나 Nexus·Artifactory·S3 같은 제대로 된 저장소를 쓴다.

## 2. Jenkins — 빌드 산출물을 저장소로 옮기기

파이프라인에서 할 일은 하나다. **빌드 결과를 저장소 경로로 옮긴다.**

```groovy
def gradle_artifacts() {
    sh """
    #!/bin/bash -e
    artifact=/opt/build-java/\$profile/\$project
    target=build/libs

    # war 가 있으면 war, 없으면 plain 이 아닌 jar
    jar=\$(cd \$target && if [ -f *.war ]; then
            ls *.war | head -n 1
          else
            ls *.jar | grep -v 'plain' | head -n 1
          fi)

    [ -d "\$artifact" ] || mkdir -p \$artifact
    mv -f \$target/\$jar \$artifact
    """
}
```

### `plain` 을 걸러 내는 이유

**여기서 한 번은 반드시 걸린다.** Gradle 로 Spring Boot 를 빌드하면 `build/libs` 에 jar 가 **두 개** 생긴다.

| 파일 | 무엇 | 배포 가능? |
|---|---|---|
| `myapp-1.0.0.jar` | 의존성까지 포함된 실행 가능 jar | **○** |
| `myapp-1.0.0-plain.jar` | 내 클래스와 리소스만 담긴 jar | **✕** |

`plain` 을 집어 배포하면 **`ClassNotFoundException` 으로 뜨지 않는다.** 그래서 `grep -v 'plain'` 으로 걸러 낸다.

> 📌 경로를 `/opt/build-java/$profile/$project` 로 나눈 것은 **프로젝트와 환경별로 겹치지 않게** 하기 위해서다. `profile`(dev/stg/prod)과 `project` 는 파이프라인 변수라, 잡이 늘어도 서로 덮어쓰지 않는다.

> 💡 파일 이름에 버전을 남겨 두면 [롤백](https://autops.run/deploy-rollback/)할 때 그대로 쓸 수 있다. 늘 같은 이름으로 덮어쓰면 되돌릴 자산이 없어진다.

## 3. Jenkins 와 Ansible Tower(AWX) 연동

산출물이 저장소에 놓였으면 이제 **배포를 지시**해야 한다. Ansible Tower(AWX)를 쓰면 Jenkins 가 배포 대상 목록을 직접 들고 있지 않아도 된다.

> **연동의 목적은 "파이프라인 코드가 호스트 정보를 몰라도 되게" 만드는 것이다.** AWX 가 host 와 group 을 갖고 있으니, Jenkins 는 "이 그룹에 배포해" 라고만 하면 된다. 서버가 늘고 줄어도 파이프라인은 안 고친다.

### Jenkins 쪽 설정

**Ansible Tower 플러그인**을 설치하고 **Jenkins 관리 → System** 에서 AWX 정보를 등록한다.

![Jenkins System 설정의 Ansible Tower 항목. Name 에 awxtower, URL, Credentials 를 넣고 Test Connection 결과가 Success 로 표시된 화면](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/69-jenkins-awx-config.png)

| 칸 | 넣을 값 |
|---|---|
| **Name** | Jenkins 안에서 이 타워를 부를 이름 (`awxtower`) |
| **URL** | AWX 주소 |
| **Credentials** | AWX 에 만들어 둔 계정 |

**Test Connection 이 Success 가 되어야** 다음으로 넘어간다.

> ⚠️ Success 가 안 나오면 대개 둘 중 하나다 — **방화벽**(Jenkins 에서 AWX 의 IP·포트로 통신이 되는가)이거나 **계정 권한**이다. 앞서 다룬 것처럼 **응답 없이 timeout 이면 방화벽, 거부되면 계정·포트** 쪽을 먼저 본다.

### AWX 쪽 — 무엇을 실행할지 적어 둔다

Jenkins 는 "실행해 달라" 고만 한다. **무엇을 실행할지는 AWX 의 Template 에 적혀 있다.** Resources → Templates 에서 만든다.

여기서 `project` 같은 변수를 받아, 그 이름을 가진 group 을 조회해 그 호스트들에 배포하도록 구성한다. 그러면 파이프라인은 이렇게만 넘기면 된다.

```groovy
stage('deploy') {
    ansibleTower(
        towerServer: 'awxtower',
        templateType: 'job',
        jobTemplate: 'deploy-java',
        extraVars: """
        project: ${project}
        profile: ${profile}
        """
    )
}
```

## 확인

단계별로 끊어서 본다. **한 번에 전부 확인하려 하면 어디서 깨졌는지 모른다.**

| 확인할 것 | 방법 |
|---|---|
| 산출물이 저장소에 놓였나 | `ls /opt/build-java/<profile>/<project>/` |
| `plain` 이 아닌 게 맞나 | 파일 이름에 `plain` 이 없는지 |
| HTTP 로 받아지나 | 배포 대상에서 `curl -I http://저장소주소/경로/파일` → `200` |
| AWX 연동이 되나 | Jenkins System 설정의 **Test Connection** |
| 배포가 도나 | AWX 의 Jobs 화면에 잡이 뜨는가 |

> 💡 **배포 대상에서 직접 `curl` 을 해 보는 것**이 가장 빠른 진단이다. Jenkins 에서 되는데 인스턴스에서 안 되면 네트워크·방화벽 문제이고, 양쪽 다 안 되면 nginx 설정이나 파일 권한 문제다.

## 정리

- **빌드 산출물은 워크스페이스에 두면 사라진다.** 저장소로 옮기는 단계가 CI 와 CD 를 잇는 자리다.
- **밀어 넣지 말고 가져가게 한다.** 저장소에 두면 서버가 늘어도 Jenkins 는 안 바뀐다.
- **`plain` jar 를 배포하면 안 뜬다.** 의존성이 안 들어 있다. 걸러 내는 한 줄이 필요하다.
- **AWX 연동의 목적은 호스트 목록을 파이프라인에서 걷어내는 것이다.** 서버가 바뀌어도 잡을 안 고친다.
- **`autoindex` 저장소에는 인증이 없다.** 사내망 안으로 막거나 제대로 된 저장소를 쓴다.
- **파일 이름에 버전을 남긴다.** 덮어쓰면 되돌릴 자산이 사라진다.
