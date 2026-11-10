![iTerm2 개발 환경 설정 — oh-my-zsh, 테마, 폰트, 색상](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/72-cover-iterm2.jpg)

맥을 새로 받거나 초기화할 때마다 똑같은 터미널 설정을 반복한다. 순서를 한 번 정리해 두면 다음에 그대로 따라 하면 된다.

터미널 말고 Java 설치나 `xcrun` 오류처럼 자잘하게 걸리는 것들은 [맥 개발 환경에서 자주 만나는 문제들](https://autops.run/mac-dev-troubles/)에 모아 두었다.

결과는 이렇다.

| 항목 | 무엇 |
|---|---|
| 터미널 | iTerm2 |
| 셸 확장 | oh-my-zsh |
| 테마 | agnoster — **현재 git 브랜치가 보인다** |
| 폰트 | D2Coding Nerd Font |
| 색상 | 취향대로 |

## 1. iTerm2 설치

```bash
brew install --cask iterm2
```

> 📌 **`--cask` 가 필요하다.** iTerm2 는 명령줄 도구가 아니라 앱이라 일반 `brew install iterm2` 로는 안 깔린다. [iterm2.com](https://iterm2.com/) 에서 직접 받아도 된다.

## 2. oh-my-zsh 설치

macOS Catalina 부터 기본 셸이 `zsh` 다. oh-my-zsh 은 그 위에 **테마와 플러그인을 얹어 관리하기 쉽게** 해 준다.

```bash
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
```

설치가 끝나면 이런 문구가 나온다.

```
Looking for an existing zsh config...
Found ~/.zshrc. Backing up to ~/.zshrc.pre-oh-my-zsh
Using the Oh My Zsh template file and adding it to ~/.zshrc.

         __                                     __
  ____  / /_     ____ ___  __  __   ____  _____/ /_
 / __ \/ __ \   / __ `__ \/ / / /  /_  / / ___/ __ \
/ /_/ / / / /  / / / / / / /_/ /    / /_(__  ) / / /
\____/_/ /_/  /_/ /_/ /_/\__, /    /___/____/_/ /_/
                        /____/                       ....is now installed!
```

> 📌 **기존 `.zshrc` 는 `~/.zshrc.pre-oh-my-zsh` 로 백업된다.** 쓰던 별칭이나 PATH 설정이 있었다면 사라진 게 아니라 그 파일에 있다. 새 `.zshrc` 맨 아래에 옮겨 붙이면 된다.

## 3. 테마 — agnoster

`~/.zshrc` 를 열어 `ZSH_THEME` 값을 바꾼다.

```bash
open ~/.zshrc
```

```bash
ZSH_THEME="agnoster"
```

```bash
source ~/.zshrc
```

**agnoster 를 쓰는 이유는 git 브랜치가 프롬프트에 보이기 때문이다.** 저장소를 여러 개 오갈 때 `git branch` 를 칠 필요가 없다.

## 4. 글씨가 깨진다 — 폰트 문제다

테마를 바꾸고 iTerm2 를 재시작하면 **프롬프트가 깨져 보인다.** 화살표나 브랜치 아이콘 자리에 네모나 물음표가 뜬다.

> 📌 **고장이 아니다.** agnoster 같은 테마는 일반 폰트에 없는 특수 기호(powerline 글리프)를 쓴다. 그 기호가 든 폰트로 바꾸면 해결된다.

D2Coding 은 네이버가 만든 코딩용 한글 폰트다. **Nerd Font 버전**을 받아야 powerline 기호가 들어 있다.

```bash
brew install --cask font-d2coding-nerd-font
```

또는 [github.com/naver/d2codingfont](https://github.com/naver/d2codingfont) 에서 받아 `.ttf` 파일을 더블클릭해 설치한다.

깔았으면 iTerm2 에서 지정한다.

> **iTerm2 → Preferences → Profiles → Text → Font**

> ⚠️ **그냥 D2Coding 을 고르면 여전히 깨진다.** 목록에서 **"D2Coding Nerd Font"** 처럼 Nerd Font 가 붙은 이름을 골라야 한다. 이름이 비슷해 놓치기 쉽다.

## 5. 색상

취향이라 정답이 없다. [iterm2colorschemes.com](https://iterm2colorschemes.com/) 에서 마음에 드는 것을 고른다.

1. 사이트에서 `.zip` 을 받아 푼다
2. **Preferences → Profiles → Colors → Color Presets… → Import…**
3. 푼 폴더에서 원하는 `.itermcolors` 를 고른다
4. 다시 **Color Presets…** 를 열어 방금 넣은 이름을 선택한다

![iTerm2 Preferences 의 Profiles → Colors 탭. 오른쪽 아래에 Color Presets 버튼이 있다](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/71-iterm2-colors.png)

> 💡 **Import 만 하면 적용되지 않는다.** 가져온 뒤 같은 메뉴에서 한 번 더 골라야 바뀐다. "분명 넣었는데 그대로" 라면 이 단계를 빠뜨린 것이다.

## 6. 플러그인 두 개

oh-my-zsh 을 깔았으면 이 둘은 넣어 두는 편이 좋다.

```bash
git clone https://github.com/zsh-users/zsh-autosuggestions \
  ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-autosuggestions

git clone https://github.com/zsh-users/zsh-syntax-highlighting \
  ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-syntax-highlighting
```

`~/.zshrc` 의 `plugins` 줄에 추가한다.

```bash
plugins=(git zsh-autosuggestions zsh-syntax-highlighting)
```

| 플러그인 | 하는 일 |
|---|---|
| `zsh-autosuggestions` | 예전에 친 명령을 흐리게 미리 보여 준다. → 키로 채택 |
| `zsh-syntax-highlighting` | 명령이 유효하면 초록, 오타면 빨강으로 표시 |

> ⚠️ **`zsh-syntax-highlighting` 은 `plugins` 목록의 맨 마지막에 둔다.** 다른 플러그인보다 먼저 오면 제대로 동작하지 않는다.

## 확인

```bash
source ~/.zshrc
```

- 프롬프트에 **깨진 글자가 없다**
- git 저장소 디렉터리로 들어가면 **브랜치 이름이 보인다**
- 예전에 친 명령의 앞부분을 치면 **뒷부분이 흐리게 따라온다**

셋 다 되면 끝이다.

## 정리

- **`brew install --cask`** — iTerm2 는 앱이라 cask 다.
- **기존 `.zshrc` 는 `~/.zshrc.pre-oh-my-zsh` 에 남는다.** 사라진 게 아니다.
- **글씨 깨짐은 폰트 문제다.** 테마가 쓰는 특수 기호가 없어서 생긴다.
- **Nerd Font 버전을 골라야 한다.** 일반 D2Coding 으로는 안 풀린다.
- **색상은 Import 후 한 번 더 선택해야 적용된다.**
- **`zsh-syntax-highlighting` 은 맨 마지막에.**
