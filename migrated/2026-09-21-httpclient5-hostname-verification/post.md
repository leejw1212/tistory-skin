![NoopHostnameVerifier 가 안 먹는다 — httpclient5 5.4 부터 달라진 TLS 호스트명 검증](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/116-cover-httpclient5-tls.jpg)

보안 스캔 결과를 받아 라이브러리 버전을 올리는 일은 보통 조용히 끝난다. 그런데 이번 `httpclient5` 업그레이드는 그렇지 않았다. **코드는 한 줄도 안 고쳤는데 사설 인증서를 쓰는 내부 시스템에 붙지 않는다.**

```
javax.net.ssl.SSLHandshakeException:
  (certificate_unknown) No subject alternative DNS name matching localhost found.
```

분명히 인증서 검증을 꺼 두었는데도 이 오류가 난다. 껐다고 믿은 코드는 이것이다.

```java
TlsSocketStrategy tls = new DefaultClientTlsStrategy(sslContext, NoopHostnameVerifier.INSTANCE);
```

**이 코드는 5.3 까지는 검증을 껐고, 5.4 부터는 끄지 않는다.** 컴파일 경고도 없고 런타임 경고도 없다. 그냥 조용히 검증이 켜져 있다.

결론부터 표로 둔다. 아래는 모두 **실제로 돌려 본 결과**다 — 자기 서명 인증서 (`CN=wrong.example.com`)를 `localhost` 로 서비스하는 서버에 붙여 봤다.

| 코드 | 5.3.1 | 5.6.4 |
|---|---|---|
| `SSLConnectionSocketFactoryBuilder` + `NoopHostnameVerifier` | **통과** | (deprecated) |
| `new DefaultClientTlsStrategy(ctx, NoopHostnameVerifier.INSTANCE)` | 통과 | **실패** |
| `ClientTlsStrategyBuilder` + `setHostnameVerifier(NOOP)` 만 | — | **실패** |
| `ClientTlsStrategyBuilder` + `setHostVerificationPolicy(CLIENT)` + `NOOP` | — | **통과** |
| `new DefaultClientTlsStrategy(ctx, CLIENT, NOOP)` | — | **통과** |

핵심은 빌더로 바꾸는 것 자체가 아니라 **`HostnameVerificationPolicy` 를 명시하는 것**이다. 빌더를 써도 정책을 안 주면 똑같이 실패한다.

## 1. 5.4 에서 무엇이 바뀌었나

5.4 에 `HostnameVerificationPolicy` 라는 열거형이 새로 생겼다. 호스트명 검증을 **누가** 하느냐를 정하는 값이다.

| 값 | 누가 검증하나 |
|---|---|
| `BUILTIN` | JSSE(자바 TLS 구현)가 **핸드셰이크 도중에** 한다 |
| `CLIENT` | HttpClient 가 **핸드셰이크 끝난 뒤에** 한다 |
| `BOTH` | 둘 다 한다 |

5.3 까지는 `CLIENT` 하나뿐이었다. 그래서 `HostnameVerifier` 를 `NoopHostnameVerifier` 로 갈아 끼우면 검증하는 주체가 사라져 검증이 꺼졌다.

5.4 부터는 `BUILTIN` 쪽이 기본으로 끼어든다. 그리고 `BUILTIN` 은 이 한 줄로 동작한다 — `AbstractClientTlsStrategy` 안이다.

```java
if (hostnameVerificationPolicy == HostnameVerificationPolicy.BUILTIN
        || hostnameVerificationPolicy == HostnameVerificationPolicy.BOTH) {
    sslParameters.setEndpointIdentificationAlgorithm(URIScheme.HTTPS.id);
}
```

`setEndpointIdentificationAlgorithm("HTTPS")` 는 **자바 표준 TLS 스택에게 직접** "핸드셰이크 중에 인증서의 이름이 접속 대상과 맞는지 확인하라"고 지시하는 설정이다. 여기서 어긋나면 `SSLHandshakeException` 이 나며 연결이 끊어진다.

> 📌 **그래서 `NoopHostnameVerifier` 는 호출될 기회조차 없다.** `HostnameVerifier` 는 핸드셰이크가 **성공한 뒤에** HttpClient 가 부르는 물건이다. 핸드셰이크가 먼저 깨지면 그 코드까지 흐름이 오지 않는다. "검증을 껐는데 왜 안 되나" 의 답이 이것이다.

## 2. 왜 verifier 를 넣었는데 정책이 BOTH 가 되나

생성자 안의 기본값 한 줄 때문이다. 5.4 · 5.4.1 · 5.5 는 이렇게 생겼다.

```java
this.hostnameVerificationPolicy = hostnameVerificationPolicy != null
        ? hostnameVerificationPolicy
        : HostnameVerificationPolicy.BOTH;
```

**정책을 안 주면 무조건 `BOTH`** 다. `BOTH` 는 JSSE 검증을 켜고, JSSE 검증은 Noop verifier 를 신경 쓰지 않는다.

5.6 에서는 이 줄이 조금 부드러워졌지만 결론은 같다.

```java
this.hostnameVerificationPolicy = hostnameVerificationPolicy != null ? hostnameVerificationPolicy :
        (hostnameVerifier != null ? HostnameVerificationPolicy.BOTH : HostnameVerificationPolicy.BUILTIN);
```

verifier 를 넘기지 않으면 `BUILTIN`, **넘기면 `BOTH`**. 즉 검증을 끄려고 Noop 을 넣는 바로 그 행동이 `BOTH` 를 고르게 만든다. 얄궂지만 의도된 동작이다 — 라이브러리 입장에서는 "verifier 를 신경 써서 넣은 사람이면 검증도 원하겠지"인 셈이다.

### deprecated 생성자만 옛날처럼 동작한다

더 헷갈리는 대목이 있다. `DefaultClientTlsStrategy` 의 **deprecated 로 표시된** 6-인자 생성자는 정책을 `CLIENT` 로 못 박는다.

```java
@Deprecated
public DefaultClientTlsStrategy(
        final SSLContext sslContext, final String[] supportedProtocols,
        final String[] supportedCipherSuites, final SSLBufferMode sslBufferManagement,
        final HostnameVerifier hostnameVerifier,
        final Factory<SSLEngine, TlsDetails> tlsDetailsFactory) {
    super(sslContext, supportedProtocols, supportedCipherSuites, sslBufferManagement,
          HostnameVerificationPolicy.CLIENT, hostnameVerifier);   // ← 여기
}
```

**경고 없는 최신 생성자는 검증이 켜지고, 경고가 뜨는 옛 생성자는 검증이 꺼진다.** 업그레이드하면서 IDE 가 시키는 대로 deprecated 를 걷어낸 팀이 정확히 여기서 깨진다. "Deprecated 때문에 설정이 활성화되지 않는다"는 첫인상은 그래서 자연스럽다. 실제 원인은 조금 다르다 — **deprecated 라서 안 먹는 게 아니라, 옛 생성자에만 남아 있던 `CLIENT` 고정값이 새 생성자에는 없기 때문**이다.

## 3. 재현해 보기

이름이 안 맞는 인증서를 준비한다. `CN` 과 SAN 은 `wrong.example.com` 인데 서버는 `localhost` 로 연다.

```bash
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes \
  -subj "/CN=wrong.example.com" -addext "subjectAltName=DNS:wrong.example.com"
cat key.pem cert.pem > server.pem
```

```bash
echo | openssl s_client -connect localhost:18443 -servername localhost 2>/dev/null \
  | openssl x509 -noout -subject -ext subjectAltName
```

```
subject=CN = wrong.example.com
X509v3 Subject Alternative Name:
    DNS:wrong.example.com
```

접속 대상(`localhost`)과 인증서에 적힌 이름(`wrong.example.com`)이 다르다. 호스트명 검증이 살아 있으면 반드시 막혀야 하는 상황이다.

클라이언트는 네 가지를 차례로 시도한다. 신뢰 검증은 네 경우 모두 `TrustAllStrategy` 로 통과시켜 두었다 — **호스트명 검증만 따로 떼어 보기 위해서다.**

```java
static void call(String label, TlsSocketStrategy tls) {
    System.out.println("### " + label);
    try (CloseableHttpClient client = HttpClients.custom()
            .setConnectionManager(PoolingHttpClientConnectionManagerBuilder.create()
                    .setTlsSocketStrategy(tls)
                    .build())
            .build()) {
        client.execute(new HttpGet("https://localhost:18443/"), rsp -> {
            System.out.println("  OK  " + rsp.getCode());
            return null;
        });
    } catch (Exception ex) {
        System.out.println("  FAIL  " + ex.getClass().getName());
        System.out.println("        " + ex.getMessage());
    }
}
```

```java
SSLContext ctx = SSLContexts.custom().loadTrustMaterial(TrustAllStrategy.INSTANCE).build();

call("A. new DefaultClientTlsStrategy(ctx, NOOP)",
        new DefaultClientTlsStrategy(ctx, NoopHostnameVerifier.INSTANCE));

call("B. 빌더 + setHostVerificationPolicy(CLIENT) + NOOP",
        ClientTlsStrategyBuilder.create()
                .setSslContext(ctx)
                .setHostVerificationPolicy(HostnameVerificationPolicy.CLIENT)
                .setHostnameVerifier(NoopHostnameVerifier.INSTANCE)
                .buildClassic());

call("C. new DefaultClientTlsStrategy(ctx, CLIENT, NOOP)",
        new DefaultClientTlsStrategy(ctx, HostnameVerificationPolicy.CLIENT,
                NoopHostnameVerifier.INSTANCE));

call("D. 빌더 + NOOP, 정책은 안 줌",
        ClientTlsStrategyBuilder.create()
                .setSslContext(ctx)
                .setHostnameVerifier(NoopHostnameVerifier.INSTANCE)
                .buildClassic());
```

httpclient5 **5.6.4** 로 돌린 결과다.

```
### A. new DefaultClientTlsStrategy(ctx, NOOP)
  FAIL  javax.net.ssl.SSLHandshakeException
        (certificate_unknown) No subject alternative DNS name matching localhost found.
### B. 빌더 + setHostVerificationPolicy(CLIENT) + NOOP
  OK  200
### C. new DefaultClientTlsStrategy(ctx, CLIENT, NOOP)
  OK  200
### D. 빌더 + NOOP, 정책은 안 줌
  FAIL  javax.net.ssl.SSLHandshakeException
        (certificate_unknown) No subject alternative DNS name matching localhost found.
```

같은 코드를 **5.3.1** 에서 옛 API 로 짜면 통과한다.

```java
LayeredConnectionSocketFactory sf = SSLConnectionSocketFactoryBuilder.create()
        .setSslContext(ctx)
        .setHostnameVerifier(NoopHostnameVerifier.INSTANCE)
        .build();
```

```
### 5.3.1: SSLConnectionSocketFactoryBuilder + NoopHostnameVerifier
  OK  200
```

> ⚠️ **D 를 눈여겨본다.** `ClientTlsStrategyBuilder` 로 바꾸는 것만으로는 안 풀린다. 빌더 역시 정책을 안 주면 `BOTH` 를 고르기 때문이다. 빌더로 고쳐서 해결됐다면, 그건 빌더 덕이 아니라 그때 같이 넣은 **정책 지정 덕**이다.

## 4. 조치 — 정책을 명시한다

빌더 쪽이 읽기 쉽고 의도가 드러나서 권할 만하다.

```java
TlsSocketStrategy tlsStrategy = ClientTlsStrategyBuilder.create()
        .setSslContext(SSLContexts.custom()
                .loadTrustMaterial(TrustAllStrategy.INSTANCE)   // ① 신뢰 검증 끄기
                .build())
        .setHostVerificationPolicy(HostnameVerificationPolicy.CLIENT)  // ② JSSE 검증 끄기
        .setHostnameVerifier(NoopHostnameVerifier.INSTANCE)            // ③ 클라이언트 검증 끄기
        .buildClassic();

CloseableHttpClient client = HttpClients.custom()
        .setConnectionManager(PoolingHttpClientConnectionManagerBuilder.create()
                .setTlsSocketStrategy(tlsStrategy)
                .build())
        .build();
```

**세 줄이 모두 필요하다.** 하나라도 빠지면 그 층에서 막힌다.

| 메서드 | 버전 | 비고 |
|---|---|---|
| `buildClassic()` | 5.5+ | 동기(classic) 클라이언트용. `TlsSocketStrategy` 를 준다 |
| `buildAsync()` | 5.5+ | 비동기 클라이언트용. `TlsStrategy` 를 준다 |
| `build()` | ~ | **deprecated.** 위 둘로 대체됐다 |
| `setHostVerificationPolicy(…)` | 5.5+ | 지금 쓸 이름 |
| `setHostnameVerificationPolicy(…)` | 5.4 | **deprecated.** 게다가 `this` 를 반환하지 않아 체이닝이 끊긴다 |
| `setTlsDetailsFactory(…)` | ~ | **deprecated. 호출해도 아무 일도 하지 않는다** |

비동기(`CloseableHttpAsyncClient`) 쪽은 붙이는 자리만 다르다.

```java
PoolingAsyncClientConnectionManagerBuilder.create()
        .setTlsStrategy(ClientTlsStrategyBuilder.create()
                .setSslContext(ctx)
                .setHostVerificationPolicy(HostnameVerificationPolicy.CLIENT)
                .setHostnameVerifier(NoopHostnameVerifier.INSTANCE)
                .buildAsync())
        .build();
```

### 호스트명 검증과 신뢰 검증은 다른 층이다

"인증서 검증 끄기" 한마디에 사실 두 가지가 섞여 있다. 둘은 서로를 대신하지 못한다.

| 층 | 무엇을 보나 | 끄는 방법 | 실패하면 |
|---|---|---|---|
| **신뢰(trust)** | 이 인증서를 믿을 만한 CA 가 서명했나 | `SSLContext` 에 `TrustAllStrategy` · `TrustSelfSignedStrategy` | `PKIX path building failed` |
| **호스트명** | 인증서에 적힌 이름이 접속 대상과 같은가 | 정책 `CLIENT` + `NoopHostnameVerifier` | `No subject alternative DNS name matching …` |

호스트명 검증만 끄고 신뢰 검증을 그대로 두면 이렇게 막힌다.

```
### 호스트명 검증만 끄고 신뢰 검증은 그대로 둔 경우
  FAIL  javax.net.ssl.SSLHandshakeException
        (certificate_unknown) PKIX path building failed:
        sun.security.provider.certpath.SunCertPathBuilderException:
        unable to find valid certification path to requested target
```

**오류 문구로 어느 층에서 막혔는지 바로 구분된다.** `PKIX` 가 보이면 신뢰 문제, `matching … found` 가 보이면 호스트명 문제다.

## 5. 5.6 에서 조심할 것 — 검증이 조용히 꺼지는 경우

반대 방향의 함정이 하나 더 있다. 5.6 에서 **정책만 `CLIENT` 로 주고 verifier 를 안 주면 호스트명 검증이 통째로 사라진다.**

```java
ClientTlsStrategyBuilder.create()
        .setSslContext(ctx)
        .setHostVerificationPolicy(HostnameVerificationPolicy.CLIENT)
        .buildClassic();   // setHostnameVerifier 를 부르지 않았다
```

```
### F. policy=CLIENT, HostnameVerifier not set
  OK  200
```

이름이 안 맞는 인증서인데 통과했다. 5.6 의 `AbstractClientTlsStrategy` 는 verifier 를 받은 그대로(`null` 이면 `null` 로) 들고 있다가, 검증 단계에서 `null` 이면 건너뛴다. JSSE 검증은 `CLIENT` 정책이라 꺼져 있으니 **아무도 검증하지 않는 상태**가 된다.

5.4 · 5.5 는 달랐다. verifier 가 `null` 이면 `DefaultHostnameVerifier` 를 채워 넣었다.

```java
// 5.5
this.hostnameVerifier = hostnameVerifier != null ? hostnameVerifier :
        (this.hostnameVerificationPolicy == HostnameVerificationPolicy.BUILTIN
                ? NoopHostnameVerifier.INSTANCE : HttpsSupport.getDefaultHostnameVerifier());
```

즉 **같은 코드가 5.5 에서는 검증하고 5.6 에서는 검증하지 않는다.** 검증을 켜 둔 채로 정책만 만지는 코드가 있다면 이 조합을 한 번 확인한다.

## 6. 우회 방안 — 검증을 끄지 않고 푸는 쪽

여기까지는 "끄는 법"이었다. 원래 문제는 대개 **사설 CA 나 자기 서명 인증서를 쓰는 내부 시스템**이고, 그 경우 검증을 끄는 것 말고도 길이 있다. 운영 환경이면 아래쪽이 맞는 답이다.

**① 인증서를 신뢰 저장소에 넣는다.** 가장 정석이다. 호스트명만 맞으면 코드에 손댈 것이 없다.

```bash
keytool -importcert -alias internal-ca -file internal-ca.crt \
  -keystore truststore.p12 -storetype PKCS12 -storepass changeit
```

```java
SSLContext ctx = SSLContexts.custom()
        .loadTrustMaterial(new File("truststore.p12"), "changeit".toCharArray())
        .build();
```

**② 자기 서명 인증서만 예외로 둔다.** `TrustAllStrategy` 는 아무거나 다 믿지만, `TrustSelfSignedStrategy` 는 **자기 서명 인증서에 한해서만** 통과시킨다. 그만큼 사고 범위가 좁다.

```java
SSLContexts.custom().loadTrustMaterial(TrustSelfSignedStrategy.INSTANCE).build();
```

**③ 인증서 이름을 맞춘다.** 실패 원인이 IP 로 접속하는 것이라면, 인증서 SAN 에 `IP:10.0.0.5` 를 넣거나 접속 주소를 도메인으로 바꾼다. 이러면 검증을 끌 일이 없다.

**④ 급할 때의 임시 우회.** `SSLConnectionSocketFactory` 경로는 deprecated 지만 5.6 에서도 여전히 동작한다. 정식 조치까지 시간이 필요할 때만 쓰고, 기한을 적어 둔다. 언젠가 제거될 API다.

> ⚠️ `TrustAllStrategy` + `NoopHostnameVerifier` 조합은 **중간자 공격을 그대로 허용한다.** 상대가 누구든 TLS 를 맺어 주기 때문이다. 테스트 코드나 내부 검증 용도로만 쓰고, 운영 설정에 들어가지 않도록 프로파일을 분리한다. SCA 도구가 이 패턴을 잡아 주지는 않는다 — 취약한 버전을 쓰는 게 아니라 안전한 버전을 안전하지 않게 쓰는 것이라, **버전 목록으로는 안 보인다.**

## 7. 버전별 정리

| 버전 | 호스트명 검증 기본 | `Noop` 만 넣으면 |
|---|---|---|
| ~ 5.3.x | 클라이언트 쪽에서만 (`HostnameVerifier`) | 꺼진다 |
| 5.4 · 5.4.x · 5.5 | 정책 도입. 기본 `BOTH` | **안 꺼진다** (JSSE 가 검증) |
| 5.6.x | verifier 없으면 `BUILTIN`, 있으면 `BOTH` | **안 꺼진다** (JSSE 가 검증) |

`SSLConnectionSocketFactory` 의 deprecated 안내문은 `DefaultClientTlsStrategy` 를 가리킨다. 그 안내를 그대로 따라가면 정책 인자가 없는 생성자에 닿고, 거기서 이 문제가 생긴다. **안내가 틀린 것은 아니지만, 정책 한 줄이 빠진 안내다.**

## 8. 확인

고친 뒤에는 세 가지를 본다.

```bash
# ① 상대 인증서에 어떤 이름이 들어 있나
echo | openssl s_client -connect <호스트>:<포트> -servername <호스트> 2>/dev/null \
  | openssl x509 -noout -subject -ext subjectAltName -dates
```

② 실제로 한 번 호출해 본다. 200 이 떨어지면 된 것이고, 막히면 **오류 문구로 층을 가린다** — `PKIX` 면 신뢰, `matching … found` 면 호스트명이다.

③ 핸드셰이크 속을 봐야 하면 JVM 옵션을 켠다. 출력이 아주 길어지니 문제를 좁힌 뒤에 쓴다.

```bash
java -Djavax.net.debug=ssl:handshake -jar app.jar
```

## 정리

- **`NoopHostnameVerifier` 는 5.4 부터 그것만으로 호스트명 검증을 끄지 못한다.** JSSE 가 핸드셰이크 중에 먼저 검증하고, verifier 는 거기까지 가지도 못한다.
- 진짜 스위치는 **`HostnameVerificationPolicy`** 다. 끄려면 `CLIENT` 를 명시하고 `NoopHostnameVerifier` 를 함께 준다. 빌더로 바꾸는 것만으로는 안 풀린다.
- **검증은 신뢰와 호스트명, 두 층이다.** 한쪽만 꺼도 다른 쪽에서 막히고, 오류 문구가 어느 쪽인지 알려 준다.
- 취약점 조치로 올린 버전이 **보안 동작의 기본값을 바꾸기도 한다.** 버전만 올리고 기능 테스트를 건너뛰면 이런 변화는 운영에서 처음 드러난다.
