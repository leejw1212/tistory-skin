![mcp-server-kubernetes 로 Hermes·Claude 에 kind 클러스터 붙이기 — 읽기 전용부터](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/124-cover-k8s-mcp.jpg)

에이전트에게 "default 네임스페이스 상태 확인해 줘" 라고 치면, 에이전트가 직접 클러스터를 조회해서 답한다. 이걸 가능하게 하는 게 **mcp-server-kubernetes** (Flux159) 다. 이 글은 그걸 Claude 와 Hermes 에이전트 양쪽에 붙이고, 처음에는 **조회만** 되게 묶어 두는 순서를 정리한다.

| 순서 | 할 일 | 결과 |
|---|---|---|
| 1 | mcp-server-kubernetes 가 무엇인지 안다 | 어떤 도구가 위험한지 구분된다 |
| 2 | Claude 에 등록한다 | Claude Code·Desktop 에서 kubectl 도구가 보인다 |
| 3 | Hermes 에 등록한다 | `config.yaml` 한 블록으로 붙는다 |
| 4 | 조회부터 써 본다 | 채팅으로 클러스터 상태를 본다 |

> 📌 **직접 확인한 범위.** Hermes 쪽은 아래 설정 그대로 실제 kind 클러스터에 붙여서 조회까지 돌렸다(4장 화면). Claude Code·Desktop 쪽 명령과 설정은 mcp-server-kubernetes 공식 README 에서 옮긴 것이고, 이번에 직접 돌려 보지는 않았다.

## 준비물

- **쿠버네티스 클러스터.** 여기서는 M1 맥의 Docker Desktop 위에 kind 로 올린 3노드 클러스터 `lab` 을 쓴다. 만드는 법은 [M1 맥에 kind 로 쿠버네티스 클러스터 세우기](https://autops.run/kind-kubernetes-on-mac/)에 정리해 두었다.
- **kubectl** — PATH 에 있고, `~/.kube/config` 로 클러스터에 붙는 상태.
- **Node.js** — 서버를 `npx` 로 띄운다.
- **Helm v3** — Helm 도구를 쓸 때만.
- **Hermes 에이전트** — 3장을 따라 하려면. 설치는 [Hermes 에이전트 리눅스에 올리기](https://autops.run/hermes-agent-setup/)를 본다.

시작하기 전에 터미널에서 kubectl 이 되는지부터 본다. MCP 서버는 이 환경을 그대로 쓴다.

```bash
kubectl config current-context
kubectl get nodes
```

컨텍스트가 `kind-lab` 으로 나오고, 노드 세 개(`lab-control-plane`, `lab-worker`, `lab-worker2`)가 `Ready` 면 된다. kind 는 컨텍스트 이름을 `kind-<클러스터 이름>` 으로 만든다. MCP 서버는 **지금 선택된 컨텍스트**로 붙으니, 여러 클러스터를 쓴다면 여기서 맞춰 둔다.

## 1. mcp-server-kubernetes 가 하는 일

에이전트가 클러스터 API 를 직접 부르는 게 아니다. 에이전트가 이 서버를 **하위 프로세스로 띄우고**(stdio), 서버가 로컬의 kubectl·helm 으로 명령을 실행해 결과를 돌려준다. 그래서 등록하는 방법이 어느 에이전트든 "실행 명령 한 줄 적기" 로 거의 같다.

```
에이전트(Claude · Hermes) ──stdio──▶ npx mcp-server-kubernetes ──▶ kubectl ──▶ 클러스터
```

서버가 내놓는 도구는 이렇다.

| 분류 | 도구 |
|---|---|
| 조회 | `kubectl_get`, `kubectl_describe`, `kubectl_logs`, `explain_resource`, `list_api_resources` |
| 생성·수정 | `kubectl_create`, `kubectl_apply`, `kubectl_patch`, `kubectl_scale`, `kubectl_rollout` |
| 삭제 | `kubectl_delete` |
| 컨텍스트 | `kubectl_context` |
| 포트 포워딩 | `port_forward`, `stop_port_forward` |
| Helm | `install_helm_chart`, `upgrade_helm_chart`, `uninstall_helm_chart`, `helm_template_apply`, `helm_template_uninstall` |
| 정리·노드 | `cleanup_pods`, `node_management` |
| 아무 명령 | `kubectl_generic` |
| 진단 | `ping`, `/k8s-diagnose` 프롬프트 |

### 비파괴 모드

환경변수 `ALLOW_ONLY_NON_DESTRUCTIVE_TOOLS=true` 를 주면 지우거나 되돌리기 어려운 도구가 꺼진다.

- **꺼지는 것** — `kubectl_delete`, `uninstall_helm_chart`, `cleanup_pods`, `node_management`, `kubectl_generic`
- **남는 것** — 조회 전부, `kubectl_apply`·`create`·`scale`·`patch`·`rollout`, Helm 설치·업그레이드, 포트 포워딩, 컨텍스트 전환

> ⚠️ 비파괴 모드는 **읽기 전용이 아니다.** apply·scale·Helm 설치는 그대로 열려 있다. 정말 조회만 시키려면 3장의 Hermes `tools.include` 처럼 에이전트 쪽에서 도구를 골라 넣어야 한다.

## 2. Claude 에 등록한다

### Claude Code

```bash
claude mcp add kubernetes -e ALLOW_ONLY_NON_DESTRUCTIVE_TOOLS=true -- npx mcp-server-kubernetes
```

`claude mcp list` 에 `kubernetes` 가 보이면 등록된 것이다. Claude Code 안에서는 `/mcp` 로 연결 상태를 본다.

### Claude Desktop

설정 파일을 연다.

- macOS — `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows — `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "kubernetes": {
      "command": "npx",
      "args": ["mcp-server-kubernetes"],
      "env": {
        "ALLOW_ONLY_NON_DESTRUCTIVE_TOOLS": "true"
      }
    }
  }
}
```

저장하고 Claude Desktop 을 **완전히 종료했다가** 다시 켠다. 창만 닫으면 설정을 다시 읽지 않는다.

> 💡 Claude Desktop 은 Settings → Extensions 에서 mcp-server-kubernetes 를 바로 설치할 수도 있다. 저장소 Releases 의 `.mcpb` 파일로도 된다. VS Code·Cursor 도 위와 같은 `mcpServers` 블록을 각자 MCP 설정 파일에 넣으면 된다.

## 3. Hermes 에 등록한다

Hermes 는 `~/.hermes/config.yaml` 의 `mcp_servers` 블록을 읽는다. 블록 문법과 MCP 의존성 설치는 [Hermes 에이전트에 MCP 붙이기](https://autops.run/hermes-mcp-playwright-confluence/)에서 다뤘으니, 여기서는 쿠버네티스 블록만 적는다.

```yaml
mcp_servers:
  kubernetes:
    command: npx
    args:
      - -y
      - mcp-server-kubernetes
    env:
      ALLOW_ONLY_NON_DESTRUCTIVE_TOOLS: "true"
    tools:
      include:
        - kubectl_get
        - kubectl_describe
        - kubectl_logs
        - explain_resource
```

실제로 쓰고 있는 설정 그대로다. 두 겹으로 묶었다.

- `env` 의 비파괴 모드가 서버 쪽에서 삭제류를 끄고,
- `tools.include` 가 Hermes 쪽에서 **조회 도구 네 개만** 에이전트에게 보여 준다.

`-y` 는 npx 가 패키지를 받을 때 확인을 묻지 않게 한다. 하위 프로세스라 질문에 답할 사람이 없다.

> 📌 Hermes 문서에 따르면 stdio 서버에는 셸의 환경변수를 통째로 넘기지 않고 **설정에 적은 `env` 를 넘긴다.** 기본 위치(`~/.kube/config`)를 쓰면 위 설정으로 그대로 붙었다. kubeconfig 를 다른 곳에 두었다면 `KUBECONFIG: /경로/config` 도 `env` 에 적는다.

이미 Hermes 를 띄워 둔 상태라면 재시작하지 않고 다시 읽힌다.

```
/reload-mcp
```

Hermes 안에서 도구 이름은 `mcp_<서버 이름>_<도구 이름>` 으로 붙는다. 여기선 `mcp_kubernetes_kubectl_get` 같은 식이다.

## 4. 써 본다 — 확인

Hermes 에게 그냥 말로 묻는다.

```
default 네임스페이스 상태 확인해줘.
```

![Hermes 채팅 화면. Kubernetes · kubectl get 도구가 두 번 불렸고, echo Deployment 3/3 Ready, Pod 3개 Running(각 재시작 2회), Service·Ingress 상태와 약 7분 전 노드 재부팅 내용을 정리해 답했다](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/125-hermes-k8s-mcp-default.png)

화면에서 볼 것은 세 가지다.

- **도구 줄에 `Kubernetes · kubectl get` 이 찍혔다.** 에이전트가 터미널이 아니라 MCP 도구로 조회했다는 뜻이다. 직접 물어보면 이렇게 답한다.

  ```
  네, kubernetes MCP의 kubectl_get을 두 번 호출했습니다. kubeconfig 컨텍스트는 kind-lab입니다.
  1. resourceType: all, namespace: default, output: wide
  2. resourceType: events, namespace: default
  터미널에서 kubectl을 직접 실행하지는 않았습니다.
  ```

- **리소스만이 아니라 events 까지 봤다.** 파드마다 재시작이 2회씩 있었는데, 에이전트가 이벤트에서 노드 세 개의 `Rebooted` 경고를 찾아 원인을 짚었다. kind 노드는 Docker 컨테이너라, Docker Desktop 이 다시 뜨면 노드가 함께 재부팅된다. 앱 문제가 아니었다.
- **include 에 넣은 도구만 썼다.** 고칠 게 없다는 결론을 내고 멈췄다.

> 💡 이 클러스터의 `echo` Deployment·Service·Ingress 는 [M1 맥에 kind 로 쿠버네티스 클러스터 세우기](https://autops.run/kind-kubernetes-on-mac/) 끝에서 확인용으로 띄워 둔 그것이다.

### 이렇게 물어보면 된다

| 하고 싶은 것 | 물어볼 말 | 쓰는 도구 |
|---|---|---|
| 상태 보기 | "default 네임스페이스 파드 상태 보여줘" | `kubectl_get` |
| 원인 찾기 | "echo 파드 하나 describe 해줘" | `kubectl_describe` |
| 로그 | "echo 파드 로그 최근 20줄 보여줘" | `kubectl_logs` |
| 스펙 공부 | "Deployment 의 strategy 필드 설명해줘" | `explain_resource` |
| 스케일 | "echo 를 5개로 늘려줘" | `kubectl_scale` (include 에 추가해야) |
| 롤백 | "echo 직전 버전으로 되돌려줘" | `kubectl_rollout` (include 에 추가해야) |

## 5. 도구를 하나씩 연다

조회가 손에 익으면 `tools.include` 에 한 줄씩 더하고 `/reload-mcp` 한다.

```yaml
    tools:
      include:
        - kubectl_get
        - kubectl_describe
        - kubectl_logs
        - explain_resource
        - kubectl_scale        # 2단계 — 늘리고 줄이기
```

순서는 이렇게 잡으면 무난하다.

1. **조회** — get, describe, logs, explain_resource
2. **되돌리기 쉬운 수정** — scale, rollout
3. **배포** — apply, create, Helm 설치
4. **지우기·노드** — 비파괴 모드를 끄고, 테스트 클러스터에서만

> ⚠️ **kubeconfig 의 권한이 곧 에이전트의 권한이다.** 서버는 kubeconfig 를 그대로 쓴다. 운영 클러스터 컨텍스트가 같은 파일에 있다면, 에이전트용으로 RBAC 권한을 줄인 계정과 컨텍스트를 따로 만든다. `kubectl_generic` 은 아무 kubectl 명령이나 실행하니 마지막까지 막아 둔다.

> 📌 `kubectl get secrets` 결과는 서버가 값을 가려서 돌려준다. 하지만 파드 로그에 찍힌 비밀값은 가려지지 않는다.

## 정리

- **등록은 실행 명령 한 줄이다.** Claude 는 `mcpServers`, Hermes 는 `mcp_servers` 에 `npx mcp-server-kubernetes` 를 적는다.
- **비파괴 모드는 읽기 전용이 아니다.** 조회만 원하면 에이전트 쪽에서 도구를 골라 넣는다(Hermes `tools.include`).
- **에이전트가 events 까지 같이 본다.** "재시작 2회" 같은 숫자의 이유를 묻지 않아도 찾아 준다. 조회만 열어 둬도 쓸모가 있다.

## 참고

- mcp-server-kubernetes — https://github.com/Flux159/mcp-server-kubernetes
- Hermes MCP 문서 — https://hermes-agent.nousresearch.com/docs/ko/user-guide/features/mcp
