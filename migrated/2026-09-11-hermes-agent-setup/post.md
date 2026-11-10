![Hermes 에이전트 리눅스에 올리기 — 설치부터 Claude API·로컬 LLM 연동까지](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/76-cover-hermes.jpg)

Hermes 에이전트는 Nous Research 가 만든 **오픈소스 AI 에이전트**다. 터미널에서 돌면서 세션이 끝나도 기억을 유지하고, 어려운 문제를 풀면 그 과정을 **재사용 가능한 스킬로 적어 둔다.** 터미널·웹 검색·브라우저·파일·코드 같은 도구 40여 개와 MCP 서버를 쓴다.

이 글은 리눅스에 올리고 **모델을 붙이는 두 갈래**를 다룬다.

> 📌 에이전트를 돌릴 리눅스 서버에 아직 키로 접속하지 않고 있다면 [SSH 키로 비밀번호 없이 서버 접속하기](https://autops.run/ssh-key-login/)를 먼저 해 두면 편하다.

모델을 붙인 다음에 할 일은 **도구를 쥐여 주는 것**이다. 그쪽은 [Hermes 에이전트에 MCP 붙이기](https://autops.run/hermes-mcp-playwright-confluence/)에서 이어서 다룬다.

| 방식 | 언제 |
|---|---|
| **Claude API** | 성능이 중요할 때. 토큰만큼 비용이 든다 |
| **로컬 LLM** (Ollama·vLLM·LM Studio) | 비용이 0. 데이터가 장비 밖으로 안 나간다 |

> ⚠️ **이 글은 공식 문서를 근거로 정리한 것이고, 다른 글들과 달리 직접 돌려 확인하지 못했다.** 글을 쓴 환경에서 `hermes-agent.nousresearch.com` 과 `ollama.com` 으로 나가는 통신이 막혀 있어 설치 자체가 불가능했다.
>
> ``` $ curl https://hermes-agent.nousresearch.com/install.sh curl: (56) CONNECT tunnel failed, response 403
> ```
>
> 명령과 설정값은 공식 저장소·문서에서 그대로 옮긴 것이지만, **각자 환경에서 한 번 확인하고 쓰기 바란다.** 버전이 오르면서 달라졌을 수 있다.

## 준비물

| 항목 | 비고 |
|---|---|
| 리눅스 · macOS · WSL2 | Termux 도 지원한다 |
| Python 3.11 | 설치 스크립트가 `uv` 로 잡아 준다 |
| Node.js, Git, ripgrep, ffmpeg | 설치 스크립트가 함께 처리한다 |

## 1. 설치

공식 설치 스크립트 한 줄이다.

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

스크립트가 `uv` 로 Python 3.11 을 잡고, Node.js 와 의존성을 깔고, `hermes` 명령을 만들어 준다.

> ⚠️ **`curl | bash` 는 받은 스크립트를 바로 실행한다.** 회사 장비나 운영 서버라면 내려받아 한 번 읽고 돌리는 편이 맞다.
>
> ```bash curl -fsSL https://hermes-agent.nousresearch.com/install.sh -o hermes-install.sh less hermes-install.sh          # 무엇을 하는지 본다 bash hermes-install.sh
> ```
>
> 운영에서 쓸 거라면 **Docker 로 격리해 올리는 쪽**이 더 낫다. 에이전트는 터미널과 파일에 접근하는 도구를 갖고 있어서, 무엇을 만질 수 있는지 경계를 정해 두는 것이 안전하다.

설정과 상태는 여기 쌓인다.

```
~/.hermes/
```

## 2. 첫 설정

설치가 끝나면 설정 마법사를 돌린다.

```bash
hermes setup
```

모델을 나중에 붙여도 된다. **일단 깔아 두고 `hermes model` 로 연결해도 동작한다.**

자주 쓰는 명령은 이 정도다.

| 명령 | 하는 일 |
|---|---|
| `hermes` | 대화형 CLI 시작 |
| `hermes model` | **LLM 프로바이더와 모델 선택** |
| `hermes tools` | 켤 도구 고르기 |
| `hermes config set` / `get` | 설정값 직접 넣고 빼기 |
| `hermes doctor` | 설정이 제대로 됐는지 점검 |
| `hermes gateway` | 메신저 게이트웨이 (Telegram·Discord·Slack) |
| `hermes update` | 최신 버전으로 갱신 |

## 3. Claude API 연동

### 방법 A — API 키 (권장)

가장 단순하다. [console.anthropic.com](https://console.anthropic.com/) 에서 키를 받아 환경변수로 넣는다.

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

`~/.hermes/.env` 에 넣어 두면 매번 export 하지 않아도 된다.

그다음 `hermes model` 로 Anthropic 을 고르거나, 설정 파일에 직접 적는다.

```yaml
model:
  provider: "anthropic"
  default: "claude-opus-5"
```

명령줄에서 한 번만 다른 모델로 돌릴 수도 있다.

```bash
hermes chat --provider anthropic --model claude-opus-5
```

**모델 ID 는 이 중에서 고른다.**

| 모델 ID | 성격 |
|---|---|
| `claude-opus-5` | 가장 똑똑하다. 에이전트 작업의 기본값으로 삼을 만하다 |
| `claude-sonnet-5` | 대량 작업에 쓰기 좋은 균형 |
| `claude-haiku-4-5` | 가볍고 빠른 작업 |

> ⚠️ **모델 ID 뒤에 날짜를 붙이지 않는다.** `claude-opus-5-20260401` 같은 형태는 없다. 위 문자열 그대로가 완성된 ID 다.
>
> Hermes 공식 문서의 예시에는 `claude-sonnet-4-6` 처럼 이전 세대 ID 가 적혀 있는데, 문서가 쓰인 시점 때문이다. **동작은 하지만 새로 잡는다면 현행 모델을 쓰는 편이 낫다.**

### 방법 B — OAuth (조건이 까다롭다)

구독 계정을 그대로 쓰는 방법도 있다.

```bash
hermes auth add anthropic --type oauth
```

또는 `hermes model` 에서 **Anthropic OAuth** 를 고른다.

> ⚠️ **여기가 함정이다.** OAuth 경로는 **Claude Max 플랜 + 별도로 구매한 추가 사용량 크레딧**이 있어야 동작한다. **Pro 구독자는 이 방법을 쓸 수 없고** `ANTHROPIC_API_KEY` 로 가야 한다.
>
> "구독하고 있으니 무료로 되겠지" 하고 접근하면 막힌다. 잘 모르겠으면 **API 키 방식이 확실하다.**

## 4. 로컬 LLM 연동

비용이 0 이고 **데이터가 장비 밖으로 나가지 않는다.** 사내 코드처럼 밖으로 보내면 안 되는 것을 다룰 때 값을 한다.

### Ollama

```yaml
model:
  default: qwen2.5-coder:32b
  provider: custom
  base_url: http://localhost:11434/v1
  context_length: 64000
```

**서버를 띄울 때 컨텍스트 길이를 같이 준다.**

```bash
OLLAMA_CONTEXT_LENGTH=64000 ollama serve
```

확인은 이렇게 한다.

```bash
ollama ps        # CONTEXT 칸을 본다
```

> ⚠️ **컨텍스트 길이가 이 절의 핵심이다.** Hermes 는 Ollama 의 컨텍스트를 스스로 알아낼 수 없어서, **서버 쪽에서 잡아 주지 않으면 기본값(작다)으로 돈다.** 그러면 에이전트가 대화 중간을 잃어버리고 엉뚱한 소리를 하기 시작한다.
>
> 에이전트 용도로는 **최소 64k** 를 권한다. 도구 출력과 파일 내용이 컨텍스트를 빠르게 먹기 때문이다.

### vLLM

```bash
vllm serve meta-llama/Llama-3.1-70B-Instruct \
  --port 8000 \
  --max-model-len 65536 \
  --enable-auto-tool-choice \
  --tool-call-parser hermes
```

```yaml
model:
  default: meta-llama/Llama-3.1-70B-Instruct
  provider: custom
  base_url: http://localhost:8000/v1
```

> 📌 `--enable-auto-tool-choice` 와 `--tool-call-parser hermes` 를 빠뜨리면 **모델이 도구를 호출하지 못한다.** 대화는 되는데 아무 일도 안 하는 상태가 되니, 에이전트로 쓸 거라면 필수다.

### LM Studio

```yaml
model:
  default: qwen2.5-coder-32b
  provider: lmstudio
```

기본 주소는 `http://localhost:1234/v1` 이고, `hermes model` 에서 **LM Studio** 를 고르면 대화형으로 잡힌다. **컨텍스트 길이는 LM Studio GUI 에서** 설정한다 (톱니바퀴 → Context Length, 최소 64000).

## 5. 확인

설정이 끝나면 점검부터 한다.

```bash
hermes doctor
```

그다음 실제로 한 번 대화해 본다.

```bash
hermes
```

간단한 것을 시켜 보고 **도구가 실제로 도는지** 본다. "지금 디렉터리에 뭐가 있어?" 처럼 터미널 도구를 쓰게 만드는 질문이 좋다. 대답만 하고 도구를 안 쓰면 설정이 덜 된 것이다.

| 증상 | 볼 곳 |
|---|---|
| 인증 오류 | `ANTHROPIC_API_KEY` 가 셸에 실려 있나. `~/.hermes/.env` 확인 |
| OAuth 가 거부됨 | Max 플랜 + 추가 크레딧 조건 (3장) |
| 로컬 모델이 도구를 안 씀 | vLLM 의 tool-choice 옵션, 또는 모델이 도구 호출을 지원하나 |
| 대화 중간을 잊음 | **컨텍스트 길이.** `ollama ps` 로 실제 값 확인 |
| 로컬 모델이 너무 느림 | 모델 크기가 장비에 비해 크다. 작은 것으로 내린다 |

## 어느 쪽을 쓸까

| | Claude API | 로컬 LLM |
|---|---|---|
| 비용 | 토큰만큼 | **0** (전기값 빼고) |
| 성능 | 높다 | 모델과 장비에 달렸다 |
| 데이터 | 외부로 나간다 | **장비 밖으로 안 나간다** |
| 준비 | 키 하나 | GPU·모델 내려받기·컨텍스트 설정 |
| 도구 사용 | 안정적 | **모델에 따라 들쭉날쭉** |

> 💡 **둘을 섞는 것도 방법이다.** 사내 코드를 다루는 작업은 로컬 모델로 돌리고, 어려운 판단이 필요한 작업만 Claude 로 넘기는 식이다. `hermes model` 로 그때그때 바꿀 수 있고, `hermes chat --provider ... --model ...` 로 한 번만 다르게 돌릴 수도 있다.

## 정리

- **설치는 한 줄이지만 `curl | bash` 다.** 회사 장비라면 내려받아 읽고 돌린다. 운영이라면 Docker 로 격리하는 쪽이 낫다.
- **Claude 는 API 키가 가장 확실하다.** OAuth 는 **Max 플랜 + 추가 크레딧**이 필요하고 Pro 로는 안 된다.
- **모델 ID 에 날짜를 붙이지 않는다.** 문서 예시가 이전 세대일 수 있으니 현행 ID 를 쓴다.
- **로컬 LLM 은 컨텍스트 길이가 전부다.** 서버 쪽에서 안 잡아 주면 기본값으로 돌고, 에이전트가 대화를 잃어버린다. 최소 64k.
- **vLLM 은 tool-choice 옵션을 빠뜨리면 도구를 못 쓴다.** 대화만 되고 일은 안 한다.
- **막히면 `hermes doctor` 부터.**

## 참고

- [Hermes Agent 저장소](https://github.com/NousResearch/hermes-agent)
- [프로바이더 설정 문서](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/integrations/providers.md)
- [Anthropic Console — API 키 발급](https://console.anthropic.com/)
