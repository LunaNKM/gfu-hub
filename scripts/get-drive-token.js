/**
 * Google Drive OAuth2 Refresh Token 발급 스크립트
 *
 * 사용법:
 *   1. 이 스크립트를 실행하기 전에 CLIENT_ID, CLIENT_SECRET을 아래에 입력
 *   2. node scripts/get-drive-token.js
 *   3. 출력된 URL을 브라우저에서 열어 Google 계정으로 승인
 *   4. 리다이렉트된 URL에서 code= 값을 복사해서 터미널에 붙여넣기
 *   5. 출력된 Refresh Token을 Vercel 환경변수에 저장
 */

const { google } = require('googleapis')
const readline = require('readline')

// ⚠️ 아래 두 값을 Google Cloud Console에서 복사해서 입력하세요
const CLIENT_ID = 'YOUR_CLIENT_ID'       // .apps.googleusercontent.com
const CLIENT_SECRET = 'YOUR_CLIENT_SECRET'

const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob'
const SCOPES = ['https://www.googleapis.com/auth/drive.readonly']

async function main() {
  if (CLIENT_ID === 'YOUR_CLIENT_ID') {
    console.error('❌ CLIENT_ID와 CLIENT_SECRET을 먼저 입력하세요.')
    process.exit(1)
  }

  const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)

  const authUrl = auth.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // 항상 refresh token 발급
  })

  console.log('\n✅ 아래 URL을 브라우저에서 열어 Google 계정으로 승인하세요:\n')
  console.log(authUrl)
  console.log('\n승인 후 표시된 코드를 아래에 붙여넣으세요:')

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl.question('코드 입력: ', async (code) => {
    rl.close()
    try {
      const { tokens } = await auth.getToken(code.trim())
      console.log('\n✅ 성공! 아래 값을 Vercel 환경변수에 저장하세요:\n')
      console.log(`GOOGLE_OAUTH_CLIENT_ID=${CLIENT_ID}`)
      console.log(`GOOGLE_OAUTH_CLIENT_SECRET=${CLIENT_SECRET}`)
      console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`)
    } catch (err) {
      console.error('❌ 토큰 발급 실패:', err.message)
    }
  })
}

main()
