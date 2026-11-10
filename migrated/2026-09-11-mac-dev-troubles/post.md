![맥 개발 환경에서 자주 만나는 문제 — Java 설치와 xcrun 오류](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/73-cover-mac-troubles.jpg)

맥에서 개발 환경을 잡다 보면 거의 매번 만나는 문제가 있다. 짧아서 따로 글이 되지 않는 것들을 한자리에 모았다.

터미널 자체를 처음부터 꾸미는 순서는 [iTerm2 개발 환경 설정](https://autops.run/iterm2-setup/)에, M1 맥의 안드로이드 에뮬레이터 문제는 [M1 맥에서 안드로이드 앱 돌리기](https://autops.run/m1-android-emulator/)에 따로 있다.

## 1. Java 설치 — 지금은 Homebrew 로

맥에는 Java 가 기본으로 깔려 있지 않다. 없는 상태에서 실행하면 안내 팝업이 뜨고, 거기서 오라클 사이트로 이동해 설치 파일을 받는 방법이 오래 쓰였다.

**지금은 Homebrew 쪽이 낫다.**

```bash
# Temurin (권장) — 무료로 쓸 수 있는 OpenJDK 배포판
brew install --cask temurin

# 특정 버전이 필요하면
brew install --cask temurin@17
```

> ⚠️ **오라클 JDK 는 라이선스를 확인하고 쓴다.** 2019년 이후 오라클 JDK 는 상용 환경에서 유료인 구간이 생겼다. 회사 장비라면 특히 Temurin 이나 Corretto 같은 **OpenJDK 배포판**을 쓰는 편이 안전하다. 기능 차이는 사실상 없다.

### 확인

```bash
java -version
javac -version
```

둘 다 버전이 나오면 된다. **`javac` 가 없다면 JRE 만 깔린 것**이므로 JDK 를 다시 깐다.

### 어디에 깔렸나

```bash
which java          # 실행 파일 위치
/usr/libexec/java_home -V     # 설치된 JDK 목록
```

JDK 실체는 여기 있다.

```
/Library/Java/JavaVirtualMachines/
```

> 💡 **여러 버전을 오가야 한다면** `JAVA_HOME` 을 바꿔 쓴다.
>
> ```bash export JAVA_HOME=$(/usr/libexec/java_home -v 17)
> ```
>
> `~/.zshrc` 에 별칭으로 넣어 두면 프로젝트마다 갈아 끼우기 쉽다.

## 2. `xcrun: error: invalid active developer path`

macOS 를 업데이트하고 나면 갑자기 이런 것이 뜬다.

```
xcrun: error: invalid active developer path
(/Library/Developer/CommandLineTools), missing xcrun at: ...
```

그러고는 **`git`, `gcc`, `make` 가 전부 안 된다.**

### 왜 그런가

맥의 `git` 이나 `gcc` 는 독립 프로그램이 아니라 **Xcode Command Line Tools 를 거쳐 실행되는 껍데기**다. OS 를 크게 업데이트하면 그 도구 모음의 경로가 무효가 되고, 껍데기만 남아 위 오류가 난다.

**개발 도구가 사라진 게 아니라 연결이 끊긴 것이다.**

### 해결

```bash
xcode-select --install
```

창이 뜨면 설치를 누르고 기다린다. 끝나면 `git` 도 `gcc` 도 그대로 돌아온다.

> 📌 Xcode 전체(수십 GB)를 까는 게 아니다. **Command Line Tools 만** 받는 것이라 몇 분이면 된다.

### 그래도 안 되면

이미 깔려 있다며 거부당하는 경우가 있다. 그럴 때는 경로를 다시 잡아 준다.

```bash
sudo xcode-select --reset
```

Xcode 앱을 따로 깔아 쓰고 있다면 그쪽을 가리키게 한다.

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

확인은 이렇게 한다.

```bash
xcode-select -p
```

```
/Library/Developer/CommandLineTools
```

경로가 나오고 `git --version` 이 동작하면 해결이다.

## 정리

- **Java 는 Homebrew + OpenJDK 배포판으로.** 오라클 JDK 는 라이선스를 확인한다.
- **`javac` 가 없으면 JRE 만 깔린 것이다.**
- **`xcrun: error` 는 도구가 사라진 게 아니라 경로가 끊긴 것이다.** `xcode-select --install` 한 줄로 대부분 해결된다.
- **안 되면 `--reset`.** 그래도 안 되면 `-s` 로 경로를 직접 지정한다.
