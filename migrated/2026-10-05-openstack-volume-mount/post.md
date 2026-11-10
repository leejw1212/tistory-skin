OpenStack 인스턴스에 추가 디스크가 필요해서 볼륨을 하나 만들어 붙였다. 순서는 크게 둘로 나뉜다. **OpenStack 쪽에서 볼륨을 만들어 인스턴스에 연결**하는 것과, **인스턴스 내부에서 그 디스크를 실제로 쓸 수 있게 만드는 것**이다. 뒤쪽을 빼먹으면 볼륨을 붙여도 인스턴스에서는 빈 블록 디바이스로만 보이고 아무 데도 마운트되지 않는다.

## 준비물

- OpenStack 프로젝트에 볼륨을 만들고 인스턴스에 연결할 수 있는 권한
- 대상 인스턴스에 SSH로 접속할 수 있는 계정 (root 또는 sudo)
- 소요 시간은 볼륨 생성·연결 몇 분, 인스턴스 안에서의 작업은 5분 안팎

## 1. OpenStack에서 볼륨 생성

대시보드(Horizon)나 CLI에서 원하는 크기로 볼륨을 하나 만든다. 여기서는 20G로 만들었다.

```bash
openstack volume create --size 20 my-data-volume
```

## 2. 볼륨을 인스턴스에 연결

만든 볼륨을 대상 인스턴스에 붙인다(attach). 이 시점까지는 인스턴스 쪽에서 아무것도 하지 않아도 된다 — 디스크만 물리적으로 연결된 상태다.

```bash
openstack server add volume <인스턴스 이름 또는 ID> my-data-volume
```

> 📌 여기까지는 OpenStack 쪽 작업이라 화면을 옮기지 못했다. 볼륨 생성 화면과 인스턴스에 연결하는 화면은 각자의 OpenStack 대시보드에서 확인하면 된다.

## 3. 인스턴스 안에서 새 디스크 확인

인스턴스에 SSH로 접속해서 `lsblk`로 디스크 목록을 본다. 기존 `vda`(루트 디스크) 옆에 방금 붙인 `vdb`가 새로 보이면 연결이 제대로 된 것이다.

```bash
lsblk
```

![lsblk 명령 출력. 기존 vda 디스크 옆에 파티션이 없는 새 디스크 vdb 20G가 보인다](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/120-lsblk.png)

`vdb`는 아직 파티션도 파일시스템도 없는 빈 디스크다. 이 상태로는 마운트할 수 없다.

## 4. mkfs.ext4로 포맷

새 디스크에 파일시스템을 만든다. **한 번 포맷하면 그 디스크의 기존 데이터는 전부 사라지므로, 이미 데이터가 있는 볼륨이라면 이 단계를 건너뛴다.**

```bash
sudo mkfs.ext4 /dev/vdb
```

![mkfs.ext4 /dev/vdb 실행 결과. 파일시스템 생성 완료와 UUID가 출력된다](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/121-mkfsext4.png)

출력에 나온 `Filesystem UUID`를 기억해 둔다. 뒤에서 fstab에 등록할 때 이 값을 쓴다.

## 5. 마운트 포인트를 만들고 마운트

마운트할 디렉터리를 만들고 그 자리에 마운트한다.

```bash
sudo mkdir -p /mnt/vdb
sudo mount /dev/vdb /mnt/vdb
```

![마운트 포인트 생성과 mount 명령, 이어서 df -h로 확인한 화면. /dev/vdb가 20G 크기로 /mnt/vdb에 마운트돼 있다](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/122-mount-vdb.png)

`df -h`로 확인하면 `/dev/vdb`가 `/mnt/vdb`에 20G 크기로 잡힌 것이 보인다. 다만 이 상태로 끝내면 **인스턴스를 재부팅하는 순간 마운트가 풀린다.** 재부팅 때마다 손으로 다시 마운트할 게 아니라면 다음 단계가 필요하다.

## 6. fstab에 등록해 재부팅해도 유지되게

`/etc/fstab`에 한 줄을 추가한다. 디바이스 이름(`/dev/vdb`) 대신 4단계에서 확인한 UUID를 쓰는 게 안전하다 — 디스크가 여러 개 붙은 인스턴스에서는 재부팅 때 `/dev/vdb`, `/dev/vdc` 순서가 바뀔 수 있는데, UUID는 바뀌지 않는다.

```
UUID=617a55ed-d249-4d7b-ac34-7e2dd42381bd /mnt/vdb ext4 defaults 0 0
```

![/etc/fstab 파일. 기존 루트·부트 항목 아래에 UUID로 지정한 /mnt/vdb 항목이 추가돼 있다](https://cdn.jsdelivr.net/gh/leejw1212/tistory-skin@main/migrated/images/123-fstab.png)

> ⚠️ fstab을 잘못 쓰면 다음 부팅이 아예 안 될 수 있다. 저장한 뒤 바로 `sudo mount -a`로 문법 오류가 없는지 확인하고, 가능하면 재부팅 전에 콘솔 접속 수단을 확보해 둔다.

```bash
sudo mount -a
```

에러 없이 끝나면 fstab 문법에 문제가 없다는 뜻이다.

## 확인

```bash
df -h | grep vdb
```

```
/dev/vdb        20G   24K   19G   1% /mnt/vdb
```

인스턴스를 재부팅한 뒤에도 같은 명령으로 `/mnt/vdb`가 그대로 마운트돼 있는지 확인하면 끝이다.

## 정리

- OpenStack에서 볼륨을 붙이는 것과 인스턴스 안에서 마운트하는 것은 **별개의 두 단계**다. 볼륨 연결만으로는 아무것도 쓸 수 없다.
- 새 디스크는 `mkfs`로 파일시스템을 만들어야 마운트할 수 있고, 이 과정은 기존 데이터를 지운다.
- `mount`만 하고 끝내면 재부팅 때 풀린다. **fstab에 UUID로 등록**해야 재부팅 후에도 유지된다.
