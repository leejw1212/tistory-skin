![Claude Code 클라우드 세션에 Proxmox 붙이기 — MCP 설정부터 권한 부여까지](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/129-cover-claude-proxmox.jpg)

Claude Code 에게 "VM 목록 보여 줘", "이 VM 메모리 줄여 줘" 라고 말하면, Claude 가 집의 Proxmox 를 직접 조회하고 설정을 바꾸게 할 수 있다. 이 글은 그 연결을 **처음 해 보는 사람** 기준으로 순서대로 정리한 것이다.

```
 [Claude Code 클라우드 세션] ──HTTPS(API 토큰)──▶ [Proxmox API]
        MCP 서버가 여기서 돈다                    집 서버
```

| 단계 | 하는 일 |
|---|---|
| 1~2 | Proxmox 에 Claude 전용 사용자와 API 토큰을 만들고, **읽기 권한만** 준다 |
| 3 | 저장소에 MCP 설정 파일(`.mcp.json`)을 넣는다 |
| 4 | 클라우드 환경에 토큰과 접속 허용 주소를 넣는다 |
| 5 | 새 세션을 열어 붙었는지 확인한다 |
| 6 | 필요해지면 쓰기 권한을 연다 |

[mcp-server-kubernetes 로 Hermes·Claude 에 kind 클러스터 붙이기](https://autops.run/kubernetes-mcp-server/)와 같은 생각으로 접근한다. **처음에는 읽기 전용, 필요해지면 그때 넓힌다.**

## 먼저 알아 둘 말

| 말 | 쉽게 말하면 |
|---|---|
| **MCP** | Claude 가 바깥 프로그램(여기서는 Proxmox)을 도구처럼 쓰게 해 주는 연결 방식 |
| **MCP 서버** | 그 연결을 맡는 작은 프로그램. Claude 의 말을 Proxmox API 호출로 바꿔 준다 |
| **클라우드 세션** | 내 PC 가 아니라 클라우드의 임시 컨테이너에서 도는 Claude Code. 웹·앱에서 연다 |
| **API 토큰** | 비밀번호 대신 쓰는 열쇠. 사람 계정 비밀번호를 넘기지 않아도 된다 |
| **ACL / 역할(Role)** | "누가, 어디에, 무엇을 할 수 있나" 를 정하는 Proxmox 의 권한 표 |

## 준비물

- Proxmox VE (여기서는 9.1)와 관리자 계정
- **인터넷에서 HTTPS 로 닿는 Proxmox API 주소.** 클라우드 세션은 집 밖에서 접속하기 때문이다. 이 글에서는 `pve.example.com` 으로 적는다
- GitHub 저장소 하나 (설정 파일을 둘 곳)
- Claude Code 클라우드 세션을 쓸 수 있는 계정

> ⚠️ Proxmox 기본 인증서(자체 서명)로 열린 8006번 포트는 클라우드 세션에서 인증서 검사에 걸린다. **정식 인증서가 붙은 HTTPS 주소**를 준비한다. 앞에 리버스 프록시를 두는 방법은 [nginx 를 앞에 세우는 이유](https://autops.run/nginx-reverse-proxy/)에 정리해 두었다.

## 1. Claude 전용 사용자와 API 토큰을 만든다

내 관리자 계정을 그대로 쓰지 않는다. **Claude 전용 계정**을 따로 만들어야 권한을 좁게 주고, 문제가 생기면 그 계정만 끊을 수 있다.

Proxmox 웹 화면에서 순서대로 누른다.

1. **Datacenter → Permissions → Users → Add**
   - User name: `claude`, Realm: `Proxmox VE authentication server` (`pve`)
   - 이렇게 만든 계정의 전체 이름은 `claude@pve` 다
2. **Datacenter → Permissions → API Tokens → Add**
   - User: `claude@pve`, Token ID: `mcp`
   - **Privilege Separation 체크를 끈다** (이유는 아래 NOTE)
   - Add 를 누르면 **Secret** 이 한 번만 나온다. 바로 안전한 곳에 적어 둔다

토큰의 전체 이름은 `claude@pve!mcp` 가 된다. 같은 일을 터미널(Proxmox 셸)에서 하려면 이렇다.

```bash
pveum user add claude@pve
pveum user token add claude@pve mcp --privsep 0
```

> 📌 **Privilege Separation** 을 켜면 토큰은 사용자 권한을 물려받지 않고 **따로** 권한을 받아야 한다. 사용자에게 권한을 줬는데도 토큰으로는 아무것도 안 되는 일이 여기서 생긴다. 처음에는 꺼 두고 "사용자 권한 = 토큰 권한" 으로 단순하게 시작하는 편이 헷갈리지 않는다.

> ⚠️ Secret 은 다시 볼 수 없다. 잃어버리면 토큰을 지우고 새로 만든다. **채팅창, 저장소, 블로그 어디에도 붙여 넣지 않는다.** 4단계에서 클라우드 환경 설정에만 넣는다.

## 2. 처음에는 읽기 권한만 준다

1. **Datacenter → Permissions → Add → User Permission**
   - Path: `/`
   - User: `claude@pve`
   - Role: **`PVEAuditor`**
   - Propagate: 체크 (하위 경로에도 적용)

```bash
pveum acl modify / --users claude@pve --roles PVEAuditor
```

`PVEAuditor` 는 **보기만 하는** 역할이다. 노드 상태, VM 목록, 설정, 스토리지를 볼 수 있고, 아무것도 바꾸지 못한다. 연결이 제대로 되는지 확인하는 동안은 이걸로 충분하다.

## 3. 저장소에 MCP 설정 파일을 넣는다

저장소 맨 위에 `.mcp.json` 을 만든다. 여기서는 `@bldg-7/proxmox-mcp` 라는 MCP 서버를 썼다.

```json
{
  "mcpServers": {
    "proxmox": {
      "command": "npx",
      "args": ["-y", "@bldg-7/proxmox-mcp@1.3.0"],
      "env": {
        "PROXMOX_HOST": "${PROXMOX_HOST}",
        "PROXMOX_PORT": "${PROXMOX_PORT:-443}",
        "PROXMOX_USER": "${PROXMOX_USER}",
        "PROXMOX_TOKEN_NAME": "${PROXMOX_TOKEN_NAME}",
        "PROXMOX_TOKEN_VALUE": "${PROXMOX_TOKEN_VALUE}",
        "PROXMOX_SSL_MODE": "${PROXMOX_SSL_MODE:-strict}",
        "PROXMOX_ALLOW_ELEVATED": "${PROXMOX_ALLOW_ELEVATED:-false}"
      }
    }
  }
}
```

- `command`, `args` — 세션이 시작될 때 `npx` 로 MCP 서버를 받아서 띄운다. 버전(`@1.3.0`)을 고정해 두면 어느 날 갑자기 동작이 바뀌는 일이 없다.
- `${PROXMOX_HOST}` 처럼 **값 대신 변수 이름만** 적는다. 진짜 값은 4단계에서 클라우드 환경에 넣는다. 그래서 이 파일은 저장소에 올려도 안전하다.
- `${…:-기본값}` 은 "변수가 없으면 이 값을 쓴다" 는 뜻이다.
- `PROXMOX_ALLOW_ELEVATED` 는 기본이 `false` 다. 이 MCP 서버는 이 값이 `true` 가 아니면 VM 만들기·지우기·전원 같은 쓰기 도구를 스스로 막는다. 6단계에서 다시 다룬다.

커밋하고 GitHub 에 올린다.

## 4. 클라우드 환경에 값과 접속 허용을 넣는다

클라우드 세션 화면 위쪽의 **환경 이름(환경 메뉴) → Edit** 을 연다.

**① 환경 변수**에 아래를 넣는다.

```
PROXMOX_HOST=pve.example.com
PROXMOX_USER=claude@pve
PROXMOX_TOKEN_NAME=mcp
PROXMOX_TOKEN_VALUE=(1단계에서 받은 Secret)
```

`PORT`, `SSL_MODE`, `ALLOW_ELEVATED` 는 `.mcp.json` 의 기본값(443, strict, false)을 쓰므로 지금은 넣지 않아도 된다.

**② Network access** 에서 **Allowed domains** 에 `pve.example.com` 을 추가한다. 클라우드 세션은 허용된 주소로만 나갈 수 있다. 이게 빠지면 MCP 서버가 Proxmox 에 닿지 못한다. "Allow package managers" 체크는 그대로 둔다. `npx` 가 MCP 서버를 내려받아야 하기 때문이다.

> 📌 환경 변수는 **세션이 시작될 때 한 번만** 읽힌다. 값을 바꿨으면 반드시 **새 세션**을 연다. 이미 열린 세션에는 반영되지 않는다. 6단계에서 실제로 여기서 한 번 막혔다.

## 5. 새 세션을 열고 확인한다

3단계의 저장소로 **새 클라우드 세션**을 연다. 그리고 그냥 말로 물어본다.

```
Proxmox 노드 목록 보여 줘
```

Claude 가 MCP 도구(`proxmox_node`)를 불러 이런 답을 가져오면 연결된 것이다. 노드 이름은 바꿔 적었다.

```
🖥️  Proxmox Cluster Nodes

🟢 pve1
   • Status: online
   • Uptime: 245 days, 15 hours
   • CPU: 0.79%
   • Memory: 8.97 GB / 11.43 GB (78.5%)
```

읽기 권한만 줬으니 이 단계에서 할 수 있는 일은 조회뿐이다. VM 목록, VM 설정, 노드 상태, 스토리지, 그리고 지금 내 권한(ACL)까지 볼 수 있다.

> 💡 같은 저장소를 **내 PC 의 Claude Code** 에서 열면, 처음에는 저장소의 MCP 서버를 쓸지 묻는다.
>
> ``` $ claude mcp list proxmox: npx -y @bldg-7/proxmox-mcp@1.3.0 - ⏸ Pending approval (run `claude` to approve)
> ```
>
> `claude` 를 실행해 승인하면 된다. 남이 올린 저장소의 설정이 몰래 실행되지 않게 막는 장치다.

## 6. 권한 부여 — 쓰기 작업을 열 때

조회만으로 부족해지면 권한을 연다. 여기서 헷갈리기 쉬운 점은 **권한의 문이 두 겹**이라는 것이다.

| 문 | 어디서 정하나 | 닫혀 있을 때 |
|---|---|---|
| ① MCP 서버의 잠금 | 환경 변수 `PROXMOX_ALLOW_ELEVATED` | MCP 서버가 **스스로** 거절한다. "requires elevated permissions" |
| ② Proxmox 의 권한 | Proxmox 의 사용자 권한(ACL) | Proxmox 가 거절한다. `403` "Permission check failed" |

**두 문이 모두 열려 있어야** 쓰기 작업이 된다. 오류 문장을 보면 어느 문에서 막혔는지 알 수 있다.

### 6-1. MCP 서버의 잠금을 푼다

클라우드 환경 변수에 한 줄을 더 넣는다.

```
PROXMOX_ALLOW_ELEVATED=true
```

그리고 **새 세션을 연다.** 실제로 값을 넣고 이미 열려 있던 세션에서 다시 시도했다가, 여전히 "requires elevated permissions" 로 막혔다. 세션 안에서 MCP 서버 프로세스를 확인해 보니 예전 값 그대로 떠 있었다.

```
PROXMOX_ALLOW_ELEVATED=false
```

새 세션에서는 `true` 로 떴고, 막혔던 노드 상세 조회가 바로 됐다.

### 6-2. Proxmox 에서 역할을 준다

①을 열어도 Proxmox 가 허락하지 않으면 소용없다. 이번에는 Proxmox 쪽 권한을 넓힌다.

1. **Datacenter → Permissions → Add → User Permission**
   - Path: `/` (VM 만 다룰 거면 `/vms`)
   - User: `claude@pve`
   - Role: 필요한 만큼 고른다 (아래 표)

```bash
pveum acl modify / --users claude@pve --roles PVEAdmin
```

| 역할 | 할 수 있는 일 | 언제 고르나 |
|---|---|---|
| `PVEAuditor` | 보기만 | 연결 확인, 조회용 |
| `PVEVMAdmin` | VM·컨테이너 만들기·지우기·전원·설정·스냅샷·백업 | VM 관리만 맡길 때 |
| `PVEAdmin` | 위 + 스토리지·사용자·풀·SDN 관리 | 거의 다 맡길 때 |
| `Administrator` | 전부 (노드 재부팅, 패키지 업그레이드, 권한 변경 포함) | **권하지 않는다** |

> ⚠️ 관리 화면의 Permissions 목록에서 **Propagate 칸의 "Yes"** 를 "권한이 다 있다" 로 읽기 쉽다. 실제로 그렇게 착각했다. Propagate 는 "하위 경로에도 똑같이 적용" 이라는 뜻일 뿐이다. 무엇을 할 수 있는지는 **Role** 칸이 정한다.

### 6-3. 실제로 무엇이 열렸는지 확인한다

화면만 보고 짐작하지 말고 Proxmox 에게 직접 물어본다. 이 API 는 **"이 토큰이 지금 실제로 가진 권한"** 을 경로마다 알려 준다. Claude 에게 "내 권한 확인해 줘" 라고 해도 되고, 직접 부를 수도 있다.

```bash
curl -s -H 'Authorization: PVEAPIToken=claude@pve!mcp=<Secret>' \
  https://pve.example.com/api2/json/access/permissions
```

> 📌 큰따옴표(`"`)로 감싸면 bash 가 `!mcp` 를 "예전 명령 불러오기" 로 읽어서 `event not found` 를 낸다. 토큰 이름에 `!` 가 들어가므로 **작은따옴표**(`'`)로 감싼다.

같은 토큰으로 역할을 바꾸기 전후에 불러 본 결과를 정리하면 이렇다.

| | `PVEAuditor` 만 | `PVEAdmin` 추가 후 |
|---|---|---|
| 켜진 권한 수 (`/` 기준) | 7 | 40 |
| 예 | `VM.Audit`, `Sys.Audit`, `Datastore.Audit` … (전부 `.Audit`) | `VM.Allocate`, `VM.PowerMgmt`, `VM.Config.Memory`, `VM.Snapshot`, `VM.Backup` … |

`.Audit` 는 "보기" 다. 7개가 전부 `.Audit` 이면 아무리 Propagate 가 Yes 여도 읽기 전용이다.

### 6-4. PVEAdmin 으로도 안 되는 것

`PVEAdmin` 에는 노드 자체를 건드리는 권한(`Sys.Modify`, `Sys.PowerMgmt`)과 권한을 바꾸는 권한 (`Permissions.Modify`)이 없다. 실제로 Proxmox 가 인터넷에서 이미지를 직접 내려받게 하는 기능 (Download from URL)을 시켰더니 이렇게 거절됐다.

```
{"data":null,"message":"Permission check failed\n"}
```

이런 일은 Claude 에게 맡기지 않고 관리자 계정으로 직접 하면 된다. 웹 화면에서 버튼 한 번이다. **Claude 에게는 꼭 필요한 만큼만** 주고, 나머지는 사람이 하는 쪽이 안전하다.

### 6-5. Claude Code 쪽의 확인 단계

두 문을 다 열어도, VM 종료처럼 되돌리기 어려운 작업은 Claude Code 가 한 번 더 확인할 수 있다. 권한 모드(입력창 옆 모드 선택)에 따라 실행 전에 승인을 묻거나, 자동 모드에서는 위험한 작업을 알아서 멈춘다. 실제로 자동 모드에서 VM 종료 요청이 멈췄고, 그 자리에서 직접 Proxmox 화면으로 종료했다. **세 번째 안전장치**라고 보면 된다.

## 확인

- 새 세션에서 "노드 목록 보여 줘" 가 결과를 돌려준다 → 연결 성공
- 읽기 전용일 때 VM 을 바꾸라고 하면 거절된다 → 잠금이 제대로 걸려 있다
- `/access/permissions` 의 권한 목록이 내가 준 역할과 맞는다 → 권한이 의도대로다
- 토큰 Secret 이 저장소·채팅·글 어디에도 없다 → 비밀값이 안전하다

## 정리

- **Claude 전용 사용자 + API 토큰**으로 붙인다. 내 관리자 계정을 넘기지 않는다.
- **설정 파일에는 변수 이름만, 값은 클라우드 환경에.** 값을 바꾸면 새 세션을 연다.
- **처음엔 `PVEAuditor`, 필요해지면 넓힌다.** 권한의 문은 MCP 서버 잠금과 Proxmox 역할 두 겹이고, 오류 문장으로 어느 쪽에서 막혔는지 구분한다.
- 실제 권한은 화면의 Propagate 가 아니라 **`/access/permissions`** 로 확인한다.
