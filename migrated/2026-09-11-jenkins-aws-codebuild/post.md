![Jenkins 에서 AWS 붙이기 — CodeBuild 호출과 저장소 미러링](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/75-cover-jenkins-aws.jpg)

사내 Jenkins 와 AWS 를 같이 쓰다 보면 둘을 이어야 하는 순간이 온다. 이 글은 그런 두 가지를 다룬다.

1. **Jenkins 에서 CodeBuild 를 호출하고 변수를 넘기기**
2. **Bitbucket 저장소를 CodeCommit 으로 미러링하기**

> ⚠️ **2번은 지금 새로 만들 구성이 아니다.** AWS CodeCommit 은 2024년 7월 25일부로 **신규 고객을 받지 않는다.** 이미 저장소가 있는 계정만 계속 쓸 수 있고, 보안·가용성 외의 새 기능도 나오지 않는다. AWS 는 CodeCatalyst 나 GitHub·GitLab 같은 외부 저장소를 권한다.
>
> 그래도 남겨 두는 이유는 **"지원이 끊긴 도구를 어떻게 임시로 메웠나" 라는 문제 풀이가 그 자체로 쓸모 있어서**다. 대상만 다를 뿐 같은 상황은 계속 생긴다.

## 1. Jenkins 에서 CodeBuild 호출하기

### 왜 이렇게 하나

Jenkins 에서 빌드하고 그 결과나 태그 값을 CodeBuild 로 넘겨야 할 때가 있다. 예를 들어 **빌드는 사내에서 하되 배포는 AWS 쪽 파이프라인이 맡는** 구조다.

> 📌 Jenkins Pipeline 자체가 처음이라면 [Jenkins Pipeline 으로 git clone 부터](https://autops.run/jenkins-pipeline-build/)를 먼저 보는 게 낫다.

### Access Key 준비

Jenkins 가 AWS 계정을 식별해야 그 안의 CodeBuild 에 접근할 수 있다. IAM 에서 **Access Key 와 Secret Key** 를 발급한다.

> ⚠️ **이 키는 엄격히 관리한다.** 유출되면 남이 내 계정에서 빌드를 돌릴 수 있고, 그건 곧 **요금**이다. 반드시 지킬 것 셋이다.
>
> - **CodeBuild 실행에 필요한 권한만** 준다. `AdministratorAccess` 를 붙이지 않는다
> - **Jenkins Credentials 에만** 저장한다. 파이프라인 코드나 잡 설정에 직접 안 적는다
> - **주기적으로 교체한다**

> 💡 Jenkins 가 EC2 위에 있다면 **Access Key 대신 IAM Role 을 붙이는 쪽이 훨씬 안전하다.** 키 파일 자체가 없어지니 유출될 것도 없고 교체할 것도 없다.

### 플러그인과 설정

[AWS CodeBuild 플러그인](https://plugins.jenkins.io/aws-codebuild/)을 설치하면 잡의 **Build Step** 에 `AWS CodeBuild` 항목이 생긴다.

> 📌 플러그인 공식 문서는 **Pipeline 기준으로만** 쓰여 있다. 하지만 이 작업은 파이프라인을 짤 만큼 내용이 많지 않아서, **Freestyle 잡의 Build Step 에서 설정하는 편이 간단하다.** 문서에 없다고 안 되는 게 아니다.

넘길 변수는 **Environment Variables Override** 에 적는다. Jenkins 가 만든 태그 값을 CodeBuild 쪽 `buildspec.yml` 이 받아 쓸 수 있다.

```
IMAGE_TAG = ${BUILD_NUMBER}
PROFILE   = prod
```

### 확인

- 잡을 돌리면 **AWS 콘솔의 CodeBuild → 빌드 기록**에 잡이 뜬다
- 넘긴 변수는 CodeBuild 빌드 로그의 환경 변수 영역에서 확인한다
- 권한이 모자라면 `AccessDeniedException` 이 뜨고 **어떤 액션이 거부됐는지** 메시지에 그대로 적힌다 — 그 액션만 IAM 정책에 더한다

## 2. Bitbucket → CodeCommit 미러링

### 왜 필요했나

AWS 의 CI/CD(CodeBuild, CodePipeline)를 쓰려면 **CodeCommit 이 출발점**이 되는 편이 편하다. CodeCommit 의 특정 브랜치가 갱신되면 CloudWatch 이벤트가 잡아 파이프라인을 돌리는 구성이 자연스럽기 때문이다.

그런데 실제 개발은 Bitbucket 에서 한다. **둘을 같은 상태로 유지**해야 했다.

### 플러그인이 끊겼다

예전 Bitbucket(v6.x)에는 미러링 플러그인이 있었다. 저장소 설정 → 갈고리 → Mirror Hook 에서 URL 과 Credential 만 넣으면 됐다.

**v8.9.1 로 올리면서 그 플러그인이 지원 범위를 벗어났다.** 마지막 릴리스가 2020년 8월이라 추가 지원을 기대하기도 어려웠다.

> 📌 **업그레이드 전에 쓰던 플러그인의 마지막 릴리스 날짜를 확인하는 습관**이 여기서 값을 한다. 몇 년째 조용한 플러그인에 핵심 기능을 걸어 두면, 업그레이드가 곧 장애가 된다.

### Jenkins 로 대신하기

플러그인이 하던 일은 단순했다. [원본 소스](https://github.com/ef-labs/stash-hook-mirror)를 보면 **git URL 을 설정하고 credential 로 `prune`·`force` 옵션을 붙여 push** 하는 것이 전부였다. 그래서 같은 동작을 파이프라인으로 옮겼다.

**동작 흐름**

| 단계 | 하는 일 |
|---|---|
| 1. 웹훅 수신 | Bitbucket 의 push·merge 가 Jenkins 를 트리거 |
| 2. clone | 해당 저장소를 받는다 |
| 3. git init / prune | 받은 저장소를 정리한다 |
| 4. remote 교체 | 원격을 Bitbucket 에서 CodeCommit 으로 바꾼다 |
| 5. force push | 바뀐 원격으로 밀어 넣는다 |

**웹훅 payload 에서 뽑아 쓰는 값**

```
repo_name      $.repository.slug
project_key    $.repository.project.key
merge_branch   $.pullRequest.toRef.displayId
merge_slug     $.pullRequest.toRef.repository.slug
merge_project  $.pullRequest.toRef.repository.project.key
```

**remote 교체**

```bash
git remote remove origin
git remote add origin https://<credential>@git-codecommit.<region>.amazonaws.com/v1/repos/<repo>-mirror
git push --prune --force origin
```

> 📌 모든 저장소에 **같은 Jenkins 잡 하나**를 쓰려다 보니 규칙이 하나 필요했다 — **CodeCommit 저장소 이름은 Bitbucket 저장소 이름 뒤에 `-mirror` 를 붙인다.** 이름 규칙 하나로 잡을 저장소마다 만들지 않아도 된다.

### 한계를 알고 쓴다

> ⚠️ **이건 임시 방편이다.** 실제로 이런 약점이 있었다.
>
> - **웹훅이 가끔 안 온다.** 그러면 그 변경은 미러링되지 않고 조용히 어긋난다
> - **`--force` 라서 덮어쓴다.** CodeCommit 쪽에 직접 넣은 커밋이 있으면 사라진다
> - **원자적이지 않다.** 미러링 도중 실패하면 중간 상태로 남는다
>
> 그래서 **CodeCommit 을 "읽기 전용 사본" 으로만 취급**해야 한다. 거기에 직접 커밋하는 순간 규칙이 깨진다.

> 💡 어긋남을 빨리 알아채려면 **양쪽 최신 커밋 해시를 주기적으로 비교**하는 잡을 따로 둔다. 웹훅이 빠진 것을 다음 배포 때 발견하는 것보다 낫다.

## 정리

- **Access Key 보다 IAM Role.** Jenkins 가 EC2 위라면 키를 아예 만들지 않는 쪽이 안전하다.
- **권한은 필요한 것만.** 유출된 키로 돌아가는 빌드는 그대로 요금이다.
- **문서가 Pipeline 기준이어도 Freestyle 로 되는 일이 있다.** 내용이 적으면 그쪽이 간단하다.
- **플러그인의 마지막 릴리스 날짜를 본다.** 조용한 플러그인에 핵심 기능을 걸면 업그레이드가 장애가 된다.
- **임시 방편은 한계를 적어서 남긴다.** 웹훅 유실과 `--force` 를 모르는 사람이 CodeCommit 에 직접 커밋하면 그때 사고가 난다.
- **CodeCommit 은 2024년 7월부터 신규 고객을 받지 않는다.** 새로 잡는 구성이라면 다른 저장소를 출발점으로 삼는다.
