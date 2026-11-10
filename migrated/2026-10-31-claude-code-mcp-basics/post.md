![Claude Code MCP 사용법 — MCP 서버가 뭔지부터 .mcp.json 연결까지, 비전공자용](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/131-cover-mcp-basics.jpg)

요즘 Claude Code 이야기에 **MCP** 라는 말이 자주 나온다. "MCP 서버를 붙였더니 Claude 가 서버를 관리해 준다" 같은 이야기다. 이 글은 MCP 가 무엇인지, Claude Code 에 어떻게 붙이는지를 **개발을 전공하지 않은 사람**도 따라올 수 있게 정리한 것이다.

## MCP 를 한 문장으로

> **MCP 는 Claude 가 바깥 프로그램을 "도구" 처럼 쓰게 해 주는 연결 규칙이다.**

스마트폰에 비유하면 이렇다.

| 스마트폰 | Claude |
|---|---|
| 스마트폰 본체 | Claude (똑똑하지만 혼자서는 바깥을 못 만진다) |
| USB-C 단자 규격 | **MCP** (무엇이든 같은 방식으로 꽂게 해 주는 약속) |
| 충전기·이어폰·모니터 | **MCP 서버** (각자 한 가지 일을 맡는 연결 장치) |

Claude 는 원래 대화와 파일 작업은 잘하지만, 회사 위키나 집 서버나 웹 브라우저를 **직접 만지지는 못한다.** MCP 서버를 하나 꽂으면 그 프로그램을 다루는 **도구**가 Claude 에게 생긴다.

예를 들면 이렇다.

| MCP 서버 | Claude 가 할 수 있게 되는 일 |
|---|---|
| Proxmox (가상 머신 관리) | "VM 목록 보여 줘", "이 VM 메모리 줄여 줘" |
| Kubernetes | "지금 떠 있는 서비스 알려 줘" |
| Playwright (웹 브라우저) | "이 페이지 열어서 버튼 눌러 봐" |

## 용어 세 개만

| 말 | 쉽게 말하면 |
|---|---|
| **MCP 서버** | 특정 프로그램을 Claude 에게 연결해 주는 작은 프로그램. 대부분 무료로 공개돼 있다 |
| **도구(tool)** | MCP 서버가 Claude 에게 주는 기능 하나하나. "VM 목록 보기", "VM 끄기" 같은 것 |
| **설정 파일** | 어떤 MCP 서버를 어떻게 띄울지 적어 두는 파일. Claude Code 는 `.mcp.json` 을 쓴다 |

## Claude Code 에 붙이는 두 가지 방법

### 방법 1. 명령 한 줄로 (내 컴퓨터에만)

내 컴퓨터의 터미널에서 이렇게 입력한다. 쿠버네티스 MCP 서버를 붙였던 실제 명령이다.

```bash
claude mcp add kubernetes -e ALLOW_ONLY_NON_DESTRUCTIVE_TOOLS=true -- npx mcp-server-kubernetes
```

| 부분 | 뜻 |
|---|---|
| `claude mcp add` | MCP 서버를 추가한다 |
| `kubernetes` | 내가 붙이는 이름 |
| `-e …=true` | 서버에 줄 설정 값. 여기서는 "지우는 기능은 빼라" |
| `--` 뒤 | 그 서버를 실제로 띄우는 명령 |

빠르고 간단하지만, **내 컴퓨터에만** 등록된다.

### 방법 2. 설정 파일로 (저장소에 넣어 함께 쓰기)

저장소 맨 위에 `.mcp.json` 이라는 파일을 만든다. 집의 가상 머신 관리 프로그램(Proxmox)을 붙일 때 실제로 쓴 파일에서, 설명에 필요 없는 줄 두 개(포트·인증서 검사 설정)를 뺀 것이다.

```json
{
  "mcpServers": {
    "proxmox": {
      "command": "npx",
      "args": ["-y", "@bldg-7/proxmox-mcp@1.3.0"],
      "env": {
        "PROXMOX_HOST": "${PROXMOX_HOST}",
        "PROXMOX_USER": "${PROXMOX_USER}",
        "PROXMOX_TOKEN_NAME": "${PROXMOX_TOKEN_NAME}",
        "PROXMOX_TOKEN_VALUE": "${PROXMOX_TOKEN_VALUE}",
        "PROXMOX_ALLOW_ELEVATED": "${PROXMOX_ALLOW_ELEVATED:-false}"
      }
    }
  }
}
```

읽는 법은 이렇다.

- `"proxmox"` — 이 서버의 이름
- `"command"`, `"args"` — 서버를 띄우는 명령. `npx` 가 인터넷에서 서버 프로그램을 받아 실행한다
- `"env"` — 서버에 넘길 설정 값

여기서 중요한 점이 하나 있다. `"${PROXMOX_TOKEN_VALUE}"` 처럼 **진짜 값 대신 이름만** 적었다. 진짜 비밀번호는 내 컴퓨터나 클라우드 환경 설정에 따로 넣고, 파일에는 "이 이름의 값을 가져다 써라" 라고만 적는다. 그래서 이 파일은 GitHub 에 올려도 안전하다.

> ⚠️ 설정 파일에 비밀번호나 토큰을 **그대로 적지 않는다.** 저장소에 올라가면 누구나 볼 수 있다.

이 방법의 장점은 **저장소만 열면 MCP 서버가 같이 따라온다**는 것이다. 다른 컴퓨터에서도, 웹에서 쓰는 Claude Code(클라우드 세션)에서도 그대로 쓸 수 있다.

## "Pending approval" 이 뜨는 이유

설정 파일로 붙인 저장소를 내 컴퓨터에서 처음 열면, 서버가 바로 켜지지 않고 이렇게 나온다.

```
$ claude mcp list
proxmox: npx -y @bldg-7/proxmox-mcp@1.3.0 - ⏸ Pending approval (run `claude` to approve)
```

"승인 대기 중" 이라는 뜻이다. 고장이 아니다. **남이 만든 저장소에 들어 있는 설정이 내 허락 없이 프로그램을 실행하지 못하게** 막는 장치다.

`claude` 를 실행하면 이 서버를 쓸지 묻는다. 내가 만든 저장소이거나 믿을 수 있는 설정이면 승인하면 된다.

> 💡 연결이 됐는지 보려면 터미널에서 `claude mcp list`, Claude Code 안에서는 `/mcp` 를 입력한다.

## 붙인 다음에는 말로 시킨다

연결되면 따로 명령을 외울 필요가 없다. 평소 말투로 시키면 Claude 가 알맞은 도구를 골라 쓴다.

```
Proxmox 노드 목록 보여 줘
```

실제로 이렇게 물었을 때 Claude 가 MCP 도구로 가져온 답이다. 서버 이름은 바꿔 적었다.

```
🖥️  Proxmox Cluster Nodes

🟢 pve1
   • Status: online
   • Uptime: 245 days, 15 hours
   • CPU: 0.79%
   • Memory: 8.97 GB / 11.43 GB (78.5%)
```

## 처음엔 "보기만" 하게 붙인다

MCP 서버는 Claude 에게 **진짜 손**을 달아 주는 것이다. 조회만 하는 도구도 있지만, 지우고 끄고 바꾸는 도구도 있다. 그래서 처음에는 **읽기 전용**으로 시작하는 게 좋다.

- 위 쿠버네티스 예시의 `ALLOW_ONLY_NON_DESTRUCTIVE_TOOLS=true` — 지우는 도구를 뺀다
- 위 Proxmox 예시의 `PROXMOX_ALLOW_ELEVATED:-false` — 바꾸는 도구를 잠근다
- 연결하는 쪽 계정에도 **보기 권한만** 준다

실제로 Proxmox 를 붙일 때도 처음엔 보기 권한만 줬다가, 필요해진 뒤에 권한을 넓혔다. 이때 "MCP 서버의 잠금" 과 "상대 프로그램의 권한" 두 겹을 모두 열어야 했는데, 그 과정은 [Claude Code 클라우드 세션에 Proxmox 붙이기](https://autops.run/claude-code-proxmox-mcp/)에 자세히 적었다.

> 📌 MCP 서버는 누구나 만들어 공개할 수 있다. 처음 보는 MCP 서버는 **많이 쓰이는 것인지, 무슨 도구를 주는지** 확인하고 붙인다. 버전을 `@1.3.0` 처럼 고정해 두면 어느 날 갑자기 동작이 바뀌는 일도 막을 수 있다.

## 정리

- **MCP** 는 Claude 가 바깥 프로그램을 도구처럼 쓰게 해 주는 연결 규칙이고, **MCP 서버**는 프로그램마다 하나씩 꽂는 연결 장치다.
- 붙이는 방법은 둘이다. 내 컴퓨터에만 쓸 거면 `claude mcp add`, 저장소와 함께 쓸 거면 `.mcp.json`.
- 설정 파일에는 **값 대신 이름만** 적는다. 비밀값은 따로 둔다.
- "Pending approval" 은 **안전장치**다. 믿을 수 있으면 승인한다.
- 처음엔 **보기만** 하게 붙이고, 필요해지면 넓힌다.

쿠버네티스에 MCP 서버를 붙여 본 과정은 [mcp-server-kubernetes 로 Hermes·Claude 에 kind 클러스터 붙이기](https://autops.run/kubernetes-mcp-server/)에 있다. Claude Code 를 웹에서 쓰는 법이 궁금하면 [Claude Code 웹(클라우드 세션) 사용법](https://autops.run/claude-code-cloud-session/)을 먼저 보면 좋다.
