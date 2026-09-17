<p align="center">
  <a href="README.md">English</a> · <strong>한국어</strong>
</p>

<h1 align="center">Mocha AE → Nuke</h1>

<p align="center">After Effects에서 트래킹을 복사하고, Nuke에 노드 하나로 붙여넣으세요.</p>

<p align="center">
  <a href="https://github.com/tardis7732/mocha-ae-to-nuke/tree/v1.0"><img src="https://img.shields.io/badge/version-1.0-526DDB" alt="버전 1.0"></a>
  <img src="https://img.shields.io/badge/platform-Windows-555555" alt="Windows">
</p>

<p align="center">
  <a href="https://github.com/tardis7732/mocha-ae-to-nuke/archive/refs/heads/main.zip"><strong>ZIP 다운로드</strong></a> ·
  <a href="#빠른-시작">빠른 시작</a> · <a href="#설정">설정</a>
</p>

<p align="center">
  <img src="images/korean.jpg" alt="한국어 화면 — Mocha AE to Nuke v1.0" width="607">
</p>

AE에 적용한 Mocha 트래킹을 **CornerPin2D** 또는 **Transform**으로 내보냅니다. 레퍼런스 프레임 보정을 노드 하나에 담고, **클립보드로 복사** 버튼으로 전달합니다. `.nk` 저장 단계는 없습니다.

## 빠른 시작

1. **ZIP을 내려받아 압축을 풉니다.** `MochaClipboard.exe`는 JSX 스크립트와 같은 폴더에 두세요.
2. AE **환경 설정 → 스크립팅 및 표현식 → 스크립트를 통한 파일 쓰기 및 네트워크 액세스 허용**을 켭니다.
3. Mocha AE에서 트래킹을 저장하고 AE로 돌아옵니다. **Create Track Data**에서 추적한 레이어를 선택한 뒤, **Corner Pin** 또는 **Transform**으로 **Apply Export**합니다.
4. 키프레임을 받은 레이어를 선택합니다. **파일 → 스크립트 → 스크립트 파일 실행…**에서 [`Mocha_AE_to_Nuke_KO.jsx`](Mocha_AE_to_Nuke_KO.jsx)를 실행합니다.
5. 노드 종류, 프레임 범위, 레퍼런스 프레임을 확인합니다. **클립보드로 복사** 후 Nuke 노드 그래프에서 **Ctrl+V**합니다.

## 설정

| 항목 | 설명 |
| --- | --- |
| **AE 시작 / 끝 프레임** | 끝 프레임을 포함한 내보내기 범위입니다. AE 컴포지션 시작을 **0**으로 셉니다. |
| **Nuke 시작 프레임** | 첫 번째로 내보낸 키의 Nuke 프레임 번호입니다. 기본값: **1**. |
| **레퍼런스 프레임** | 움직임의 기준이 되는 AE 프레임입니다. 기본값: **0**. 내보내기 범위 안에서 지정합니다. |
| **Mocha 좌표 그대로** | 내보낸 코너 좌표를 그대로 사용합니다. Null에 받은 트래킹에 적합합니다. |
| **레이어 변환 포함** | 코너 좌표에 해당 AE 레이어의 위치·회전·크기를 추가로 적용합니다. |

복사 전에 레퍼런스 프레임이 원하는 기준 시점인지 확인하세요. Nuke 입력 해상도와 픽셀 종횡비를 AE 컴포지션에 맞추고, 입력 이미지를 레퍼런스 프레임에 맞춰 배치한 뒤 생성된 노드를 적용합니다.

## 파일 구성

| 파일 | 용도 |
| --- | --- |
| [`Mocha_AE_to_Nuke_EN.jsx`](Mocha_AE_to_Nuke_EN.jsx) | 영어 인터페이스 |
| [`Mocha_AE_to_Nuke_KO.jsx`](Mocha_AE_to_Nuke_KO.jsx) | 한국어 인터페이스 |
| [`MochaClipboard.exe`](MochaClipboard.exe) | 실행에 필요: Windows 클립보드에 노드 텍스트를 복사하고 확인 |
| [`MochaClipboard.cs`](MochaClipboard.cs) | 도우미의 C# 소스 코드. 실행할 때는 없어도 됩니다. |

<details>
<summary><strong>지원 범위 및 문제 해결</strong></summary>

- 부모가 없는 2D 레이어, 표준 Corner Pin, 레이어 Transform을 지원합니다. CC Power Pin, 모션블러용 Corner Pin, 3D, 로토 내보내기는 지원하지 않습니다.
- 정수 프레임마다 샘플링하며 프레임 사이는 선형 보간합니다. AE의 서브프레임 움직임과 모션블러 렌더를 그대로 재현하지는 않습니다.
- 복사에 실패하면 팝업의 오류 문구, AE 스크립팅 권한, `MochaClipboard.exe`의 위치를 확인하세요.
- 도우미는 Windows 클립보드에 텍스트를 복사하고 확인합니다. 설치와 외부 통신 없이 동작합니다.
- 캡처는 임시 샘플 레이어로 실행한 실제 AE 팝업입니다. 수치 테스트를 통과했으며 실제 Nuke 렌더까지 검증한 상태는 아닙니다.

</details>
