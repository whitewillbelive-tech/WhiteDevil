# CI 수정 및 GitHub Pages 배포

## setup-python 실패 점검

실행 `42200562155`의 원본 로그를 가져오려 했지만, 클라우드 프록시가 `api.github.com` 연결을 HTTP 403으로 차단했다. 따라서 해당 실행의 정확한 오류 문구와 아래 원인의 직접 대조는 미완료다.

현재 워크플로에서 재현 가능한 설정 결함을 공식 `actions/setup-python@v5` 소스로 확인했다. `cache: pip`의 기본 파일은 `**/requirements.txt`이며 대체 파일은 `**/pyproject.toml`이다. 이 저장소에는 두 파일이 없고 `requirements-dev.txt`만 있어 캐시 해시 대상이 없다. 공식 구현은 이 경우 `No file ... matched ...` 오류를 발생시킨다.

수정은 `cache-dependency-path: requirements-dev.txt`를 지정하는 것이다. Playwright 고정 버전 1.62.0도 PyPI의 공식 버전 API에서 HTTP 200으로 존재를 확인했다.

공식 구현:

- https://github.com/actions/setup-python/blob/v5/src/cache-distributions/pip-cache.ts
- https://github.com/actions/setup-python/blob/v5/src/cache-distributions/cache-distributor.ts

## 검증을 통과한 파일만 배포

`Archive checks` 워크플로는 데이터 테스트와 브라우저 테스트를 실행한다. 배포 대상으로 `index.html`, `app.js`, `data.js`, `plan.js`, `styles.css`, `plan.css`, `favicon.svg`, `.nojekyll`만 `_site`에 모은다. 소설 설정 데이터, 테스트 fixture, Git 이력, 문서 및 인증 파일은 배포하지 않는다.

브라우저 테스트는 `ARCHIVE_SITE_DIR=_site`로 실제 정적 산출물을 실행한다. `main`의 push 또는 수동 실행에서만 테스트 통과 후 Pages 아티팩트를 업로드한다. 배포 작업은 `needs: validate`로 검증에 종속되며 Pages·OIDC 쓰기 권한은 그 작업에만 부여한다. 개발 브랜치와 PR에서는 공개 배포하지 않는다.

수정한 설정은 원격 CI 통과, main 병합, 공개 배포 완료를 의미하지 않는다. 각각 GitHub와 실제 주소에서 추가 검증이 필요하다.

## 현재 외부 차단과 적용 순서

클라우드의 실제 네트워크 허용 목록에 `api.github.com`, `whitewillbelive-tech.github.io`가 없다. 두 도메인은 환경 설정 초안에 저장되어 있으나 실행 환경에는 아직 적용되지 않았다. 환경 설정에서 초안을 검토·저장하고 환경을 게시한 뒤 API·공개 주소 요청을 다시 확인해야 한다. GitHub API 인증이나 Pages 권한의 실제 부족 여부는 API 연결 복구 후 판단할 수 있다. 토큰 부재로 단정하거나 값을 채팅에 입력하지 않는다.

연결 복구 후 진행할 순서:

1. GitHub 저장소의 **Actions → Archive checks → 최신 `feat/white-devil-archive` 실행**에서 `validate` 성공을 확인하고 실행 `42200562155`의 setup-python 오류를 대조한다.
2. **Pull requests → New pull request → base: `main`, compare: `feat/white-devil-archive` → Create pull request**. 통과한 최신 커밋과 변경 내용을 확인한 뒤 병합한다. 필수 검사·승인 규칙이 있으면 우회하지 않는다.
3. 저장소 **Settings → Pages → Build and deployment → Source → GitHub Actions**를 선택한다. 설정 주소는 https://github.com/whitewillbelive-tech/WhiteDevil/settings/pages 이다. 이 메뉴가 보이지 않으면 저장소 관리자가 Pages 설정을 수행해야 한다.
4. `main` 병합의 **Actions → Archive checks**에서 `validate`, `deploy` 성공과 `github-pages` 환경의 URL을 확인한다. 설정을 병합 뒤에 바꾼 경우 **Actions → Archive checks → Run workflow → Branch: main → Run workflow**로 다시 실행한다.
5. 환경 승인 대기인 경우 해당 실행의 **Review deployments → github-pages → Approve and deploy**를 승인 권한자가 실행한다. 이 승인이 필요한지는 실제 환경 규칙과 실행 결과로 확인한다.
6. 출력된 공개 URL에서 HTML·JS·CSS 응답과 브라우저 초기 화면, 처리되지 않은 JavaScript 오류 유무를 확인한다. 이 검증 전에는 배포 완료로 보고하지 않는다.

예상 프로젝트 주소는 `https://whitewillbelive-tech.github.io/WhiteDevil/`이지만 아직 접근·배포를 검증하지 않았다. 맞춤 도메인이나 기존 Pages 설정이 있을 수 있으므로 최종 주소는 실제 `deploy-pages` 출력과 Pages 설정을 기준으로 확정한다.

공개 배포 주소의 localStorage는 기존 로컬 주소의 저장소와 별개다. 기존 데이터는 로컬 앱에서 JSON 백업을 내려받고 새 주소에서 가져와야 한다.
