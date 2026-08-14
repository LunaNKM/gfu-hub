import { NextRequest, NextResponse } from "next/server";

type ClearbitCompany = { name?: unknown; domain?: unknown };

/**
 * 브랜드명으로 로고 후보를 찾아준다. Clearbit의 공개 자동완성 API로 회사명 →
 * 도메인을 찾고, 그 도메인의 파비콘(Google 파비콘 서비스)을 로고 후보로 쓴다.
 * 둘 다 별도 인증이 필요 없는 공개 엔드포인트이며, 실패해도 빈 배열만 반환한다 —
 * 로고 추천은 있으면 좋은 기능일 뿐, 브랜드 생성/설정 자체를 막으면 안 된다.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ candidates: [] });
  }

  try {
    const response = await fetch(
      `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(q)}`,
      { signal: AbortSignal.timeout(4000) },
    );
    if (!response.ok) {
      return NextResponse.json({ candidates: [] });
    }
    const data = (await response.json()) as ClearbitCompany[];
    const candidates = data
      .filter((item): item is { name: string; domain: string } =>
        typeof item.name === "string" && typeof item.domain === "string",
      )
      .slice(0, 6)
      .map((item) => ({
        name: item.name,
        domain: item.domain,
        logoUrl: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(item.domain)}&sz=128`,
      }));
    return NextResponse.json({ candidates });
  } catch {
    return NextResponse.json({ candidates: [] });
  }
}
