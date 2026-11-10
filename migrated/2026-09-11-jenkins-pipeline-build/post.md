![Jenkins Pipeline 으로 git clone 부터 빌드까지](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/62-cover-jenkins-pipeline.jpg)

CI/CD 를 붙일 때 **반드시 들어가는 두 단계**가 있다.

> 저장소에서 코드를 가져온다 → 빌드한다

이게 CI(Continuous Integration), 지속적 통합이다. 개발자는 코드만 밀어 넣고, **나머지는 파이프라인이 알아서 하게 만드는 것**이 목적이다.

이 글은 그 두 단계를 Jenkins Pipeline 으로 짜는 방법을 다룬다.

> 📌 파이프라인이 도는 노드를 따로 두는 구조는 [Jenkins 분산 빌드](https://autops.run/jenkins-distributed-build/)에 정리해 두었다. 여기서는 파이프라인 코드 자체를 다룬다.

## 준비 — 플러그인과 자격 증명

### Git 플러그인

파이프라인에서 `git` 이나 `checkout` 을 쓰려면 **Git 플러그인이 깔려 있어야 한다.** 없으면 이런 오류를 본다.

```
java.lang.NoSuchMethodError: No such DSL method 'checkout' found
```

> 💡 `No such DSL method` 는 **거의 항상 플러그인이 없다는 뜻이다.** 문법을 의심하기 전에 Jenkins 관리 → 플러그인에서 해당 플러그인부터 확인한다.

### 저장소 자격 증명

공개 저장소가 아니라면 — 대부분 그렇다 — Jenkins 가 저장소에 접근할 계정이 필요하다. **Jenkins 관리 → Credentials** 에 먼저 등록해 둔다.

| 저장소 접근 방식 | 등록할 것 |
|---|---|
| HTTPS | Username with password (토큰 권장) |
| SSH | SSH Username with private key |

> ⚠️ **계정 비밀번호를 그대로 넣지 않는다.** GitHub·Bitbucket 모두 개인 액세스 토큰을 지원하고, 토큰은 권한을 좁게 줄 수 있으며 유출 시 그것만 폐기하면 된다. 파이프라인 코드에는 **자격 증명 ID 만** 적히고 값은 안 적힌다.

## 1. Git Clone stage

`checkout` 을 그대로 쓰면 옵션이 길어진다. **함수로 빼 두면 여러 잡에서 재사용**할 수 있다.

```groovy
def checkout(git_url, credentialsId, branch) {
    checkout poll: false,
      changelog: true,
      scm: [$class: 'GitSCM',
            branches: [[name: branch.trim()]],
            doGenerateSubmoduleConfigurations: false,
            extensions: [
              [$class: 'PruneStaleBranch'],   // 원격에 없는 브랜치 정리
              [$class: 'WipeWorkspace']       // clone 전에 작업 디렉터리 비우기
            ],
            submoduleCfg: [],
            userRemoteConfigs: [[credentialsId: credentialsId,
                                 url: git_url]]]
}
```

두 옵션이 핵심이다.

| 옵션 | 하는 일 | 언제 |
|---|---|---|
| `PruneStaleBranch` | 원격에서 지워진 브랜치를 로컬에서도 정리 | 브랜치가 자주 생기고 지워지는 저장소 |
| `WipeWorkspace` | clone 전에 작업 디렉터리를 비운다 | **빌드가 이전 잔여물에 영향받지 않게** |

> 💡 `WipeWorkspace` 는 안전하지만 **매번 전체를 새로 받아 느리다.** 저장소가 크면 빌드 시간이 눈에 띄게 늘어난다. "지난번 빌드 결과가 섞여 이상하다" 는 문제가 없다면 빼고, 한 번이라도 겪었다면 켜 둔다. **재현성과 속도의 맞교환이다.**

## 2. Build stage

빌드 명령은 도구마다 다르다 — gradle, maven, npm… 그래서 **도구별로 함수를 나눠 두고 파이프라인에서 골라 쓰는 구조**가 편하다.

```groovy
def gradle(task) {
    def gradle_home = "/opt/gradle"
    sh "#!/bin/sh -e\n ${gradle_home}/bin/gradle clean ${task} --refresh-dependencies"
}
```

> 📌 `sh` 첫 줄의 `#!/bin/sh -e` 는 **명령이 실패하면 거기서 멈추라**는 뜻이다. 이게 없으면 중간 명령이 실패해도 스크립트가 계속 돌아 **빌드가 초록불로 끝나 버린다.** 실패를 실패로 만들어 주는 한 줄이다.

## 3. 이어 붙이기

```groovy
def pipeLine() {
    node {
        stage('code update') {
            checkout("git_url", "credential-id", "main")
        }

        stage('build') {
            // 이 잡만 JDK 17 을 쓴다
            env.JAVA_HOME = "/usr/lib/jvm/jdk-17"
            env.PATH = "${env.JAVA_HOME}/bin:${env.PATH}"
            sh "java -version"

            gradle("build")
        }
    }
}

pipeLine()
```

**stage 로 나누는 이유**는 화면 때문이다. Jenkins 가 stage 별로 소요 시간과 성패를 따로 보여 줘서, **어디서 깨졌는지 한눈에 보인다.** 한 덩어리로 짜면 로그를 처음부터 읽어야 한다.

### JDK 를 stage 안에서 지정하는 이유

```groovy
env.JAVA_HOME = "/usr/lib/jvm/jdk-17"
env.PATH = "${env.JAVA_HOME}/bin:${env.PATH}"
sh "java -version"
```

한 Jenkins 에서 **JDK 버전이 다른 프로젝트를 여러 개 돌리는 일이 흔하다.** 장비 기본 JDK 에 맡기면 다른 잡이 깨진다. 잡마다 지정하면 서로 간섭하지 않는다.

`sh "java -version"` 한 줄을 남겨 두면 **빌드 로그에 어떤 JDK 로 돌았는지 찍혀** 나중에 문제를 볼 때 도움이 된다.

> 💡 장비에 JDK 를 직접 깔고 경로를 박는 대신, Jenkins 의 **Global Tool Configuration** 에 등록해 `tool` 로 가져오는 방법도 있다. 장비가 여러 대일 때는 그쪽이 관리하기 낫다 — 경로가 장비마다 달라도 잡은 안 고쳐도 된다.

## 확인

빌드를 한 번 돌리고 **콘솔 출력의 처음과 끝**을 본다.

```
Running on DEV_T03 in /opt/jenkins/workspace/my-job
...
openjdk version "17.0.9" 2023-10-17
...
BUILD SUCCESSFUL in 42s
Finished: SUCCESS
```

| 볼 것 | 뜻 |
|---|---|
| `Running on` | 의도한 노드에서 돌았나 |
| `java -version` 출력 | 의도한 JDK 로 돌았나 |
| `Finished: SUCCESS` | 진짜 성공인가 |

> ⚠️ **`BUILD SUCCESSFUL` 과 `Finished: SUCCESS` 는 다르다.** 앞은 gradle 이 한 말, 뒤는 Jenkins 가 한 말이다. 스크립트가 실패를 삼키면 앞이 없어도 뒤가 SUCCESS 로 찍힐 수 있다. 앞에서 말한 `-e` 가 필요한 이유다.

## 여기서 더 나아가면

이 뼈대에 붙이는 것들이 다음 단계다.

- **분기** — 저장소마다 빌드 도구가 다르면 `if` 로 함수를 골라 호출한다
- **산출물 전달** — 빌드 결과를 배포 도구로 넘긴다. [빌드한 산출물을 Ansible 로 넘기기](https://autops.run/jenkins-artifact-ansible/)에서 이어서 다룬다
- **바깥 빌드 서비스 호출** — 사내 Jenkins 에서 [AWS CodeBuild 를 부르고 변수를 넘기는 법](https://autops.run/jenkins-aws-codebuild/)
- **트리거** — 저장소에 푸시가 오면 자동으로 돌게 웹훅을 건다

## 정리

- **CI 의 뼈대는 clone + build 둘뿐이다.** 나머지는 이 위에 붙는다.
- **`No such DSL method` 는 문법이 아니라 플러그인 문제다.**
- **자격 증명은 Credentials 에, 코드에는 ID 만.** 비밀번호 대신 토큰을 쓴다.
- **`WipeWorkspace` 는 재현성과 속도의 맞교환이다.** 잔여물 문제를 겪었다면 켠다.
- **`sh` 에 `-e` 를 준다.** 없으면 실패한 빌드가 초록불로 끝난다.
- **JDK 는 잡 안에서 지정한다.** 한 장비에서 여러 프로젝트를 돌리면 필수다.
