![Hermes 에이전트에 MCP 붙이기 — Playwright, 그리고 사내 Confluence Server/DC](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/77-cover-hermes-mcp.png)

[Hermes 에이전트를 리눅스에 올리고](https://autops.run/hermes-agent-setup/) 모델까지 붙였다면, 다음은 **도구를 쥐여 주는 일**이다. MCP(Model Context Protocol)가 그 통로다.

이 글은 서버 두 개를 붙인다.

| 서버 | 무엇을 할 수 있게 되나 |
|---|---|
| **Playwright MCP** | 에이전트가 실제 브라우저를 몬다 — 열고, 누르고, 찍는다 |
| **Confluence MCP** | 사내 위키를 검색하고 문서를 읽는다 |

> ⚠️ **어디까지 직접 확인했는지 먼저 밝힌다.**
>
> - **확인함** — Playwright MCP 와 Confluence MCP 서버를 실제로 설치해 기동하고, MCP 규약대로 `initialize` · `tools/list` 를 찔러 봤다. 이 글의 버전·도구 목록·경고 메시지는 **그때 나온 출력 그대로**다.
> - **확인 못 함** — Hermes 쪽 `config.yaml` 문법은 공식 저장소 문서를 옮긴 것이다. 이 환경에서 `hermes-agent.nousresearch.com` 으로 나가는 통신이 403 으로 막혀 Hermes 자체를 설치할 수 없었다. 앞 글과 같은 사정이다.
> - **확인 못 함** — 사내 Confluence 에 실제로 붙여 문서를 읽어 오는 것까지는 못 했다. 붙일 사내 위키가 없다. 가짜 자격 증명으로 **기동과 도구 목록까지**다.

## 준비물

- Hermes 에이전트가 이미 돌아가는 상태
- Node.js 18 이상 (Playwright MCP 가 `npx` 로 뜬다)
- `uv` 또는 Docker (Confluence MCP 용)
- 사내 Confluence 의 **개인 액세스 토큰(PAT)**
- 30분쯤

## MCP 서버는 config.yaml 에 적는다

Hermes 는 `~/.hermes/config.yaml` 의 `mcp_servers` 블록을 읽는다. 서버 하나가 한 항목이고, 크게 두 가지 모양이 있다.

```yaml
mcp_servers:
  # (1) 내 장비에서 프로세스로 띄우는 서버 — command
  이름:
    command: "npx"
    args: ["-y", "어떤-mcp-서버"]
    env:
      TOKEN: "${env:MY_TOKEN}"

  # (2) 남이 띄워 둔 서버에 붙는 것 — url
  다른이름:
    url: "https://mcp.example.com"
    headers:
      Authorization: "Bearer ${env:SOME_TOKEN}"
```

`command` 와 `url` 은 **둘 중 하나만** 쓴다. 같이 쓰는 모양은 없다.

> 📌 `${env:이름}` 은 환경변수를 끌어다 쓴다는 뜻이다. **토큰을 config.yaml 에 직접 적지 않는다.** 이 파일은 실수로 공유되기 쉽고, 값이 그대로 박혀 있으면 되돌릴 수 없다. 비밀 값은 `~/.hermes/.env` 에 두고 여기서는 이름만 부른다.

명령으로 붙이는 길도 있다. `hermes mcp` 는 고른 목록을 대화형으로 보여 주고, `hermes mcp catalog` 는 같은 것을 글자로 뽑아 준다. 다만 이 글은 **직접 적는 쪽**을 다룬다. 사내 서버는 카탈로그에 없고, 무엇이 어디에 적히는지 알고 있어야 나중에 고칠 수 있다.

## 1. Playwright MCP — 에이전트에게 브라우저 쥐여 주기

### 먼저 서버만 띄워 본다

Hermes 에 붙이기 전에 **서버가 혼자 뜨는지부터 본다.** 여기서 막히면 Hermes 설정을 아무리 고쳐도 소용없다.

```bash
npx -y @playwright/mcp@latest --version
```

```
Version 0.0.80
```

### config.yaml 에 적는다

```yaml
mcp_servers:
  playwright:
    command: "npx"
    args:
      - "-y"
      - "@playwright/mcp@latest"
      - "--headless"
      - "--isolated"
    enabled: true
    timeout: 120
```

두 옵션이 서버에서 특히 중요하다.

- **`--headless`** — 화면 없는 장비에서 돌린다. 빼면 창을 띄우려다 실패한다.
- **`--isolated`** — 프로필을 디스크에 남기지 않는다. 세션마다 깨끗한 브라우저로 시작하고, 로그인 쿠키가 다음 세션으로 새지 않는다.

> 💡 버전을 `@latest` 로 두면 매번 최신을 받는다. 사내에서 여럿이 같은 설정을 쓴다면 `@playwright/mcp@0.0.80` 처럼 **박아 두는 편**이 낫다. 어제 되던 게 오늘 안 되는 이유를 찾는 데 시간을 쓰지 않게 된다.

### 무슨 도구가 생기나

실제로 기동해 `tools/list` 를 찔러 보면 이렇게 나온다.

```
serverInfo: Playwright 1.63.0-alpha-2026-08-31
protocolVersion: 2024-11-05

tools/list → 24개
  browser_close            browser_resize           browser_console_messages  browser_handle_dialog
  browser_evaluate         browser_file_upload      browser_drop              browser_find
  browser_fill_form        browser_press_key        browser_type              browser_navigate
  browser_navigate_back    browser_network_requests browser_network_request   browser_run_code_unsafe
  browser_take_screenshot  browser_snapshot         browser_click             browser_drag
  browser_hover            browser_select_option    browser_tabs              browser_wait_for
```

> ⚠️ 목록에 **`browser_run_code_unsafe`** 가 있다. 이름 그대로다. 에이전트가 브라우저 안에서 임의의 코드를 돌릴 수 있다는 뜻이고, 그 브라우저가 사내망에 닿아 있으면 닿는 곳이 전부 사정권이다.
>
> 안 쓸 생각이면 목록에서 빼 둔다. Hermes 는 서버별로 도구를 걸러 준다.
>
> ```yaml playwright: tools: exclude: ["browser_run_code_unsafe", "browser_file_upload"]
> ```

브라우저를 못 찾는다는 오류가 나면 실행 파일이 없는 것이다.

```bash
npx playwright install chromium
```

## 2. 사내 Confluence MCP — 여기가 진짜 함정이다

### 공식 원격 MCP 는 사내 Confluence 에 안 된다

먼저 짚고 갈 것이 있다. Atlassian 이 공식 원격 MCP 서버를 낸다. 그런데 **그건 Atlassian Cloud 전용이다.** 사내에 직접 올린 Confluence Server / Data Center 는 그 주소로 붙지 않는다.

| 우리 Confluence | 붙는 방법 |
|---|---|
| `*.atlassian.net` (Cloud) | Atlassian 공식 원격 MCP · OAuth |
| 사내 설치 (Server/DC) | **커뮤니티 서버를 직접 띄우고 PAT 로 인증** |

사내 위키 주소가 `wiki.회사.com` 처럼 생겼다면 아래쪽이다. 공식 문서를 보고 따라 하다 계속 실패하는 자리가 여기다.

### 토큰부터 만든다

Confluence 에서 **프로필 → 개인 액세스 토큰 → 토큰 만들기**. 만료 기간을 정하고, 나온 값을 그 자리에서 복사한다. 다시 볼 수 없다.

```bash
# ~/.hermes/.env
CONFLUENCE_URL=https://wiki.example.com
CONFLUENCE_PERSONAL_TOKEN=여기에-발급받은-토큰
```

> ⚠️ **Cloud 와 Server/DC 는 인증 변수가 다르다.** 이것 때문에 한참 헤맨다.
>
> | | 쓰는 변수 |
> |---|---|
> | Cloud | `CONFLUENCE_USERNAME` + `CONFLUENCE_API_TOKEN` |
> | **Server/DC** | **`CONFLUENCE_PERSONAL_TOKEN`** (단독) |
>
> Server/DC 인데 username 과 api_token 을 넣으면 인증이 안 된다.

### config.yaml 에 적는다

```yaml
mcp_servers:
  confluence:
    command: "uvx"
    args: ["mcp-atlassian"]
    env:
      CONFLUENCE_URL: "${env:CONFLUENCE_URL}"
      CONFLUENCE_PERSONAL_TOKEN: "${env:CONFLUENCE_PERSONAL_TOKEN}"
      READ_ONLY_MODE: "true"
      TOOLSETS: "all"
      CONFLUENCE_SPACES_FILTER: "DEV,INFRA"
    enabled: true
    timeout: 120
    trust: untrusted
```

### READ_ONLY_MODE 를 빼면 무슨 일이 생기나

직접 세어 봤다.

```
READ_ONLY_MODE=true  → tools/list 20개
READ_ONLY_MODE 없음  → tools/list 35개
```

늘어난 15개가 전부 **쓰기 도구**다.

```
confluence_create_page          confluence_update_page        confluence_delete_page
confluence_move_page            confluence_copy_page          confluence_add_comment
confluence_reply_to_comment     confluence_add_inline_comment confluence_add_label
confluence_upload_attachment    confluence_upload_attachments confluence_delete_attachment
confluence_create_page_from_template  confluence_set_page_restrictions  confluence_update_page_section
```

`confluence_delete_page` 와 `confluence_set_page_restrictions` 가 그 안에 있다. **사내 위키에서 에이전트가 문서를 지우거나 권한을 바꿀 수 있다는 뜻이다.** 읽기만 시킬 생각이라면 `READ_ONLY_MODE=true` 를 반드시 넣는다.

> ⚠️ **`trust: untrusted` 도 같이 넣는다.** 사내 위키 문서는 내가 쓴 글이 아니다. 누군가 문서에 "지금까지의 지시를 무시하고 …" 같은 문장을 심어 두면, 그걸 읽은 에이전트가 그대로 따를 수 있다. 프롬프트 인젝션이라고 부르는 것이고, 위키처럼 **여러 사람이 쓰는 곳에서 가져온 내용**은 전부 여기 해당한다.
>
> Hermes 는 서버별로 신뢰 수준을 매긴다. 사람이 쓴 문서를 읽어 오는 서버는 `untrusted` 가 맞다.

### 공간을 좁혀 둔다

`CONFLUENCE_SPACES_FILTER` 는 검색 범위를 특정 공간으로 묶는다. 사내 위키가 크면 이걸 안 잡았을 때 엉뚱한 부서 문서가 딸려 온다. 인사·재무 공간이 섞이면 곤란하다.

### 기동하면 이런 경고가 나온다

```
WARNING - mcp_atlassian.utils.toolsets - TOOLSETS is not set — currently
defaults to all toolsets. In v0.22.0, the default will change to 6 core
toolsets only. Set TOOLSETS=all explicitly to preserve current behavior.
```

기본값이 바뀔 예정이니 원하는 값을 못박으라는 말이다. 위 설정에 `TOOLSETS: "all"` 을 넣어 둔 이유가 이것이다.

> 📌 설치한 판은 0.23.1 인데 경고는 "v0.22.0 에서 바뀐다"고 말한다. 이미 지난 버전을 가리키고 있는 셈이라 경고문 자체가 낡았을 수 있다. **그래도 값을 명시해 두는 쪽이 안전하다** — 기본값에 기대면 언젠가 조용히 달라진다.

### 사내 인증서를 쓴다면

사설 CA 로 발급한 인증서를 쓰는 사내 위키가 많다. 그러면 TLS 검증에서 막힌다.

```yaml
  confluence:
    ssl_verify: "/etc/ssl/certs/사내-ca.pem"
```

> ⚠️ 검증을 **끄지 않는다.** `ssl_verify: false` 로 두면 그 순간 중간자 공격을 막을 방법이 사라진다. 사내망이라고 안전한 것이 아니다. 귀찮아도 CA 번들 경로를 넣는다.

## 3. 확인

설정을 고쳤으면 Hermes 안에서 다시 읽힌다.

```
/reload-mcp
```

붙은 서버와 도구가 보이면 된 것이다. 안 보이면 아래를 순서대로 본다.

### 서버가 혼자 뜨는지부터

Hermes 를 빼고 서버만 띄워 본다. 대부분 여기서 갈린다.

```bash
CONFLUENCE_URL=https://wiki.example.com \
CONFLUENCE_PERSONAL_TOKEN=토큰 \
READ_ONLY_MODE=true \
uvx mcp-atlassian --verbose
```

`Starting MCP server 'Atlassian MCP' with transport 'stdio'` 가 나오면 서버는 정상이다. 그다음은 Hermes 쪽 설정 문제다.

### 도구 목록을 직접 찔러 본다

MCP 는 결국 표준입출력으로 주고받는 JSON-RPC 다. 손으로도 물어볼 수 있다.

```bash
{
  echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"0.1"}}}'
  echo '{"jsonrpc":"2.0","method":"notifications/initialized"}'
  echo '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
  sleep 5
} | uvx mcp-atlassian
```

이 글의 도구 목록이 전부 이 방법으로 뽑은 것이다. **에이전트를 거치지 않고 서버만 따로 확인할 수 있다는 점**에서 막혔을 때 가장 먼저 쓸 만하다.

## 막히는 자리

| 증상 | 볼 곳 |
|---|---|
| Confluence 인증 실패 | Server/DC 인데 `CONFLUENCE_USERNAME` 을 쓰고 있지 않은지 |
| `SSLError` / 인증서 오류 | `ssl_verify` 에 사내 CA 번들 경로를 줬는지 |
| 브라우저를 못 찾음 | `npx playwright install chromium` |
| 창을 띄우려다 실패 | `--headless` 가 빠졌는지 |
| 도구가 너무 많이 붙음 | `TOOLSETS`, `tools.include/exclude` 로 줄인다 |
| 설정을 고쳤는데 그대로 | `/reload-mcp` 를 안 했거나 `enabled: false` |
| 엉뚱한 부서 문서가 딸려 옴 | `CONFLUENCE_SPACES_FILTER` |

## 정리

- **사내 Confluence 는 공식 원격 MCP 로 안 붙는다.** Cloud 전용이다. Server/DC 는 커뮤니티 서버를 직접 띄우고 `CONFLUENCE_PERSONAL_TOKEN` 을 쓴다.
- **`READ_ONLY_MODE=true` 를 빼면 쓰기 도구 15개가 그대로 열린다.** 그 안에 `confluence_delete_page` 가 있다.
- **여러 사람이 쓰는 곳에서 읽어 오는 서버는 `trust: untrusted`.** 문서에 심어 둔 문장이 지시로 읽힐 수 있다.
- **토큰은 `.env` 에, config.yaml 에는 `${env:이름}` 만.**
- **막히면 서버만 따로 띄워 본다.** `tools/list` 를 손으로 찔러 보면 에이전트 문제인지 서버 문제인지 그 자리에서 갈린다.

> 📌 도구까지 붙였으면 그다음은 **이 에이전트가 무엇을 기억하고 어떻게 배우는가**다. [Hermes 에이전트는 무엇을 기억하나](https://autops.run/hermes-memory-and-growth/)에서 MEMORY.md · 스킬 · `session_search` 와 그걸 들여다보는 관리 명령어를 정리했다. 같은 `mcp_servers` 블록으로 쿠버네티스 클러스터를 붙이는 법은 [mcp-server-kubernetes 로 Hermes·Claude 에 kind 클러스터 붙이기](https://autops.run/kubernetes-mcp-server/)에 있다.

## 참고

- [Hermes Agent — MCP 문서](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/mcp.md) · [MCP 설정 레퍼런스](https://hermes-agent.nousresearch.com/docs/reference/mcp-config-reference)
- [Playwright MCP](https://github.com/microsoft/playwright-mcp)
- [sooperset/mcp-atlassian](https://github.com/sooperset/mcp-atlassian) — Cloud 와 Server/DC 를 모두 다루는 커뮤니티 서버
- [Atlassian 공식 원격 MCP](https://github.com/atlassian/atlassian-mcp-server) — Cloud 용
