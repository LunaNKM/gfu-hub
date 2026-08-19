"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  CopyPlus,
  Eye,
  EyeOff,
  FileText,
  GripVertical,
  History,
  Image as ImageIcon,
  LayoutGrid,
  Link as LinkIcon,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Copy,
  Pencil,
  Plus,
  Search,
  Settings2,
  Share2,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query as firestoreQuery,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { firebaseDb, isFirebaseConfigured } from "@/lib/firebase/client";
import { useAuth } from "@/hooks/useAuth";
import "./brands.css";

const EXCHANGE_RATE = 10;
const DEFAULT_PARTNERS = ["RL", "CP", "DN", "Bit"];
/** 나중에 추가된 기본 협력사 — 예전에 저장된 브랜드에도 목록 끝에 채워 넣는다. */
const BACKFILL_PARTNERS = ["Bit"];
const DEFAULT_GROUPS = [
  "매크로",
  "미들",
  "리뷰전문 (피드)",
  "리뷰전문 (릴스)",
  "마이크로 (설명계)",
  "마이크로 (동경계)",
];
const UNASSIGNED_GROUP_ID = "group-unassigned";

/** 상위 분류 — 그룹(하위 분류)들을 하나의 그리드로 묶는다. 지정 전에는 전부 '기본'. */
const DEFAULT_SECTION_ID = "section-default";
const DEFAULT_SECTION_NAME = "기본";
const DEFAULT_SECTION_COLOR = "#8b8e93";
const DEFAULT_SECTION_ALPHA = 0.1;
/** 상위 분류 배경 프리셋 — 컬러 피커로 이 밖의 색도 고를 수 있다. */
const SECTION_COLOR_PRESETS = [
  "#8b8e93",
  "#2f6df6",
  "#12a150",
  "#e8a33d",
  "#e05252",
  "#8b5cf6",
  "#0ea5b7",
  "#d9548f",
];

const PERIOD_IDS = [
  "25Q1",
  "25Q2",
  "25Q3",
  "25Q4",
  "26Q1",
  "26Q2",
  "26Q3",
  "26Q4",
];
const CURRENT_PERIOD_ID = "26Q3";
const ALL_PERIODS = "all";
const SYNC_DELAY = 600;

type InfluencerStatus = "확정" | "미진행";
type BrandVisibility = "visible" | "hidden";
type Platform = "IG" | "TT" | "X" | "YT" | "기타";
type MainView = "brands" | "crm" | "hidden";

type Section = {
  id: string;
  name: string;
  /** 그리드 배경 색상(hex). 실제 배경은 alpha 를 섞은 반투명이다. */
  color: string;
  /** 배경 불투명도 0~1. */
  alpha: number;
};

type Group = {
  id: string;
  name: string;
  target: number;
  active: boolean;
  /** 소속 상위 분류. 모르는 값이면 '기본'으로 되돌린다. */
  sectionId: string;
};

type Influencer = {
  id: string;
  handle: string;
  displayName: string;
  followers: number | null;
  profileUrl: string;
  platform: Platform;
  /** 기본 단가 (JPY) — 광고 2차사용 제외 */
  rateJpy: number | null;
  /** 광고 2차사용까지 포함한 단가 (JPY) — 예산 소진 기준 */
  adRateJpy: number | null;
  partner: string;
  status: InfluencerStatus;
  /** 브랜드 설정에서 관리하는 콘셉트 목록 중 하나. 미지정이면 빈 문자열. */
  concept: string;
  /** 브랜드·CRM 어디서 편집해도 동일 인물(crmKey)의 모든 항목에 동기화된다. */
  comment: string;
  /** 공유 링크로 브랜드 측이 남기는 코멘트. 이 브랜드 안에서만 보이며 동기화되지 않는다. */
  brandComment: string;
  groupId: string;
};

type Period = {
  id: string;
  totalBudgetKrw: number;
  marginRate: number;
  sections: Section[];
  groups: Group[];
  influencers: Influencer[];
};

type Brand = {
  id: string;
  name: string;
  visibility: BrandVisibility;
  partners: string[];
  /** 브랜드 로고 이미지 URL. 없으면 이름 앞 두 글자로 대신한다. */
  logoUrl?: string;
  /** 인플루언서 콘셉트 드롭다운에 들어갈 후보 목록. 브랜드 설정에서 관리한다. */
  concepts: string[];
  /** 콘셉트별 표시 색상(hex). 공유 링크의 콘셉트 설정에서 관리한다. 없으면 무채색. */
  conceptColors?: Record<string, string>;
  periods: Period[];
  updatedAt: string;
};

type ParsedInfluencer = {
  handle: string;
  displayName: string;
  followers: number | null;
  profileUrl: string;
  platform: Platform;
  rateJpy: number | null;
  adRateJpy: number | null;
};

type BulkRow = ParsedInfluencer & {
  brandName: string;
  periodId: string;
  status: InfluencerStatus;
};

type ModalState =
  | { type: "create" }
  | { type: "bulk" }
  | { type: "settings"; brandId: string; periodId: string }
  | { type: "delete"; brandId: string }
  | { type: "import"; brandId: string; periodId: string; groupId: string }
  | { type: "crm"; key: string }
  | null;

type DataStatus = "demo" | "connecting" | "connected" | "saving" | "error";

type ShareLink = {
  token: string;
  brandId: string;
  periodId: string;
  revoked: boolean;
  createdAt: string;
  label: string;
};

const periodLabel = (id: string) =>
  id === ALL_PERIODS ? "전체" : `${id.slice(0, 2)} ${id.slice(2)}`;

const newGroups = (): Group[] =>
  DEFAULT_GROUPS.map((name, index) => ({
    id: `group-${index + 1}`,
    name,
    target: [2, 4, 3, 3, 8, 5][index] ?? 1,
    active: true,
    sectionId: DEFAULT_SECTION_ID,
  }));

const defaultSection = (): Section => ({
  id: DEFAULT_SECTION_ID,
  name: DEFAULT_SECTION_NAME,
  color: DEFAULT_SECTION_COLOR,
  alpha: DEFAULT_SECTION_ALPHA,
});

/** hex + alpha 를 CSS 색으로. 잘못된 hex 는 기본 무채색으로 떨어진다. */
function sectionBackground(section: Section) {
  const hex = /^#[0-9a-f]{6}$/i.test(section.color)
    ? section.color
    : DEFAULT_SECTION_COLOR;
  const alpha = Math.min(1, Math.max(0, section.alpha));
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function newPeriod(
  id: string,
  totalBudgetKrw = 50_000_000,
  marginRate = 20,
): Period {
  return {
    id,
    totalBudgetKrw,
    marginRate,
    sections: [defaultSection()],
    groups: newGroups(),
    influencers: [],
  };
}

/** 일괄 등록으로 만드는 기간 — 목표 인원은 사용자가 설정하기 전까지 0으로 둔다. */
function importedPeriod(id: string): Period {
  return {
    id,
    totalBudgetKrw: 0,
    marginRate: 20,
    sections: [defaultSection()],
    groups: newGroups().map((group) => ({ ...group, target: 0 })),
    influencers: [],
  };
}

const seedBrands: Brand[] = [
  {
    id: "youandi",
    name: "YOU&I",
    visibility: "visible",
    partners: DEFAULT_PARTNERS,
    concepts: ["신뢰 후기", "비교 리뷰", "일상 브이로그"],
    updatedAt: "2026-07-31T04:00:00.000Z",
    periods: [
      {
        id: "26Q3",
        totalBudgetKrw: 50_000_000,
        marginRate: 20,
        sections: [defaultSection()],
        groups: newGroups(),
        influencers: [
          {
            id: "inf-1",
            handle: "miki_beauty",
            displayName: "miki_beauty",
            followers: 128000,
            profileUrl: "https://instagram.com/miki_beauty",
            platform: "IG",
            rateJpy: 420000,
            adRateJpy: 480000,
            partner: "RL",
            status: "확정",
            concept: "신뢰 후기",
            comment: "",
            brandComment: "",
            groupId: "group-1",
          },
          {
            id: "inf-2",
            handle: "tokyo_skinlog",
            displayName: "tokyo_skinlog",
            followers: 46800,
            profileUrl: "https://instagram.com/tokyo_skinlog",
            platform: "IG",
            rateJpy: 180000,
            adRateJpy: 210000,
            partner: "CP",
            status: "확정",
            concept: "비교 리뷰",
            comment: "",
            brandComment: "",
            groupId: "group-2",
          },
          {
            id: "inf-3",
            handle: "haru_cosme",
            displayName: "haru_cosme",
            followers: 9400,
            profileUrl: "https://instagram.com/haru_cosme",
            platform: "IG",
            rateJpy: 72000,
            adRateJpy: 88000,
            partner: "DN",
            status: "확정",
            concept: "일상 브이로그",
            comment: "",
            brandComment: "",
            groupId: "group-3",
          },
          {
            id: "inf-4",
            handle: "rina.review",
            displayName: "rina.review",
            followers: 13600,
            profileUrl: "https://instagram.com/rina.review",
            platform: "IG",
            rateJpy: 90000,
            adRateJpy: null,
            partner: "RL",
            status: "미진행",
            concept: "",
            comment: "일정 조율 중",
            brandComment: "",
            groupId: "group-4",
          },
          {
            id: "inf-5",
            handle: "minami_daily",
            displayName: "minami_daily",
            followers: 6800,
            profileUrl: "https://instagram.com/minami_daily",
            platform: "IG",
            rateJpy: 55000,
            adRateJpy: 65000,
            partner: "CP",
            status: "확정",
            concept: "신뢰 후기",
            comment: "",
            brandComment: "",
            groupId: "group-5",
          },
          {
            id: "inf-6",
            handle: "kei_tokyolife",
            displayName: "kei_tokyolife",
            followers: 11200,
            profileUrl: "https://instagram.com/kei_tokyolife",
            platform: "IG",
            rateJpy: 70000,
            adRateJpy: 82000,
            partner: "DN",
            status: "확정",
            concept: "비교 리뷰",
            comment: "",
            brandComment: "",
            groupId: "group-6",
          },
        ],
      },
    ],
  },
  {
    id: "lcdc",
    name: "LCDC SEOUL",
    visibility: "visible",
    partners: DEFAULT_PARTNERS,
    concepts: [],
    updatedAt: "2026-07-30T08:30:00.000Z",
    periods: [
      {
        id: "26Q3",
        totalBudgetKrw: 36_000_000,
        marginRate: 15,
        sections: [defaultSection()],
        groups: newGroups().map((group, index) => ({
          ...group,
          target: [1, 3, 4, 2, 6, 4][index] ?? 1,
        })),
        influencers: [],
      },
    ],
  },
  {
    id: "hdex",
    name: "HDEX",
    visibility: "visible",
    partners: DEFAULT_PARTNERS,
    concepts: [],
    updatedAt: "2026-07-29T10:00:00.000Z",
    periods: [
      {
        id: "26Q3",
        totalBudgetKrw: 80_000_000,
        marginRate: 18,
        sections: [defaultSection()],
        groups: newGroups().map((group, index) => ({
          ...group,
          active: index < 4,
          target: [3, 6, 5, 5, 0, 0][index] ?? 0,
        })),
        influencers: [],
      },
    ],
  },
  {
    id: "rieti",
    name: "RIETI",
    visibility: "hidden",
    partners: DEFAULT_PARTNERS,
    concepts: [],
    updatedAt: "2026-07-24T09:00:00.000Z",
    periods: [
      {
        id: "26Q3",
        totalBudgetKrw: 42_000_000,
        marginRate: 20,
        sections: [defaultSection()],
        groups: newGroups(),
        influencers: [],
      },
    ],
  },
];

const won = (value: number) =>
  `${Math.round(value).toLocaleString("ko-KR")}원`;
const yen = (value: number) =>
  `¥${Math.round(value).toLocaleString("ja-JP")}`;
const yenOr = (value: number | null) => (value === null ? "-" : yen(value));
const compactOr = (value: number | null) =>
  value === null
    ? "-"
    : new Intl.NumberFormat("ko-KR", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value);
const percent = (value: number, total: number) =>
  total > 0 ? Math.min(Math.round((value / total) * 100), 100) : 0;
const numFmt = (value: number) => Math.round(value).toLocaleString("ko-KR");

/** 예산 소진 기준가 — 광고 2차사용 포함 단가가 있으면 그 값, 없으면 기본 단가. */
const billableRate = (influencer: Influencer) =>
  influencer.adRateJpy ?? influencer.rateJpy ?? 0;

function detectPlatform(url: string): Platform {
  const value = url.toLowerCase();
  if (value.includes("instagram.com")) return "IG";
  if (value.includes("tiktok.com")) return "TT";
  if (value.includes("x.com/") || value.includes("twitter.com")) return "X";
  if (value.includes("youtube.com") || value.includes("youtu.be")) return "YT";
  return "기타";
}

/** 프로필 URL에서 계정명을 뽑아낸다. 게시물 URL(/p/, /reel/)은 계정명을 알 수 없어 빈 값. */
function handleFromUrl(url: string) {
  if (!url) return "";
  const cleaned = url.trim().split(/[?#]/)[0].replace(/\/+$/, "");
  const parts = cleaned.split("/").filter(Boolean);
  const domainIndex = parts.findIndex((part) => part.includes("."));
  const segments = parts.slice(domainIndex + 1);
  if (!segments.length) return "";
  const first = segments[0].replace(/^@/, "");
  if (["p", "reel", "reels", "status", "video", "shorts"].includes(first)) {
    return "";
  }
  return first;
}

/** CRM 동일인 판정 키 — 계정명을 소문자로 정규화한 값. */
function crmKey(influencer: { handle: string; profileUrl: string; displayName?: string }) {
  const fromHandle = influencer.handle.trim().replace(/^@/, "").toLowerCase();
  if (fromHandle) return fromHandle;
  const fromUrl = handleFromUrl(influencer.profileUrl).toLowerCase();
  if (fromUrl) return fromUrl;
  return (influencer.displayName ?? "").trim().toLowerCase();
}

function findPeriod(brand: Brand, periodId: string) {
  return brand.periods.find((period) => period.id === periodId) ?? null;
}

/**
 * 공유 링크(shareLinks/{token})에 저장하는 리다렉트된 스냅샷.
 * 예산·마진·협력사·단가 등은 절대 포함하지 않는다 — 이 객체에 존재하지
 * 않는 값은 공유 페이지에서 원천적으로 볼 방법이 없다.
 * status/concept/brandComment는 링크를 처음 열었을 때 보일 초기값일 뿐이고,
 * 그 이후로는 edits/{influencerId} 문서가 있으면 그 값이 항상 우선한다.
 */
function buildShareSnapshot(brand: Brand, period: Period) {
  // "0명인 카테고리"는 목표 인원(target)이 아니라 실제 배정된 인원 기준으로 판단한다 —
  // 일괄 등록으로 만든 기간은 목표 인원이 전부 0으로 시작하는데, 그걸 기준으로 하면
  // 실제로는 사람이 배정돼 있는데도 공유 페이지가 통째로 텅 비어 보인다.
  const groupIdsWithInfluencers = new Set(period.influencers.map((influencer) => influencer.groupId));
  const visibleGroups = period.groups.filter(
    (group) => group.active && groupIdsWithInfluencers.has(group.id),
  );
  const visibleGroupIds = new Set(visibleGroups.map((group) => group.id));
  return {
    brandName: brand.name,
    concepts: brand.concepts,
    conceptColors: brand.conceptColors ?? {},
    groups: visibleGroups.map((group) => ({ id: group.id, name: group.name, target: group.target })),
    influencers: period.influencers
      .filter((influencer) => visibleGroupIds.has(influencer.groupId))
      .map((influencer) => ({
        id: influencer.id,
        handle: influencer.handle,
        displayName: influencer.displayName,
        followers: influencer.followers,
        profileUrl: influencer.profileUrl,
        platform: influencer.platform,
        groupId: influencer.groupId,
        status: influencer.status,
        concept: influencer.concept,
        brandComment: influencer.brandComment,
      })),
  };
}

function sortPeriods(periods: Period[]) {
  return [...periods].sort((a, b) => PERIOD_IDS.indexOf(a.id) - PERIOD_IDS.indexOf(b.id));
}

/** 활성 그룹만 드래그로 순서를 바꾼다. 비활성 그룹은 뒤에 그대로 붙여둔다. */
/** 나중에 늘어난 기본 협력사를 예전 브랜드 목록 끝에 채운다. */
function withBackfilledPartners(partners: string[]) {
  const missing = BACKFILL_PARTNERS.filter((name) => !partners.includes(name));
  return missing.length ? [...partners, ...missing] : partners;
}

/** 그룹을 다른 그룹 자리로. 상위 분류가 다르면 그 분류로 옮겨간다. */
type DragKind = "group" | "section" | "influencer";
type DragItem = { kind: DragKind; id: string; label: string };
type DropTarget = { kind: "group" | "section"; id: string };

function moveGroup(period: Period, fromId: string, toId: string): Period {
  if (fromId === toId) return period;
  const active = period.groups.filter((group) => group.active);
  const inactive = period.groups.filter((group) => !group.active);
  const fromIndex = active.findIndex((group) => group.id === fromId);
  const toIndex = active.findIndex((group) => group.id === toId);
  if (fromIndex === -1 || toIndex === -1) return period;
  const reordered = [...active];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, { ...moved, sectionId: active[toIndex].sectionId });
  return { ...period, groups: [...reordered, ...inactive] };
}

/** 그룹을 상위 분류의 맨 끝으로. 비어 있는 분류에 떨어뜨릴 때 쓴다. */
function moveGroupToSection(period: Period, groupId: string, sectionId: string): Period {
  const target = period.groups.find((group) => group.id === groupId);
  if (!target || target.sectionId === sectionId) return period;
  const rest = period.groups.filter((group) => group.id !== groupId);
  const lastIndex = rest.reduce(
    (found, group, index) => (group.active && group.sectionId === sectionId ? index : found),
    -1,
  );
  const next = [...rest];
  next.splice(lastIndex + 1, 0, { ...target, sectionId });
  return { ...period, groups: next };
}

function moveSection(period: Period, fromId: string, toId: string): Period {
  if (fromId === toId) return period;
  const fromIndex = period.sections.findIndex((section) => section.id === fromId);
  const toIndex = period.sections.findIndex((section) => section.id === toId);
  if (fromIndex === -1 || toIndex === -1) return period;
  const reordered = [...period.sections];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);
  return { ...period, sections: reordered };
}

function latestPeriodId(brand: Brand) {
  const sorted = sortPeriods(brand.periods);
  return sorted[sorted.length - 1]?.id ?? CURRENT_PERIOD_ID;
}

/** Firestore에 저장된 문서를 현재 스키마로 맞춘다. 구버전(기간 없는) 문서도 읽을 수 있게 한다. */
function normalizeBrand(raw: unknown): Brand | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.id !== "string" || typeof value.name !== "string") return null;

  const normalizeInfluencer = (item: unknown, index: number): Influencer => {
    const inf = (item ?? {}) as Record<string, unknown>;
    const profileUrl = typeof inf.profileUrl === "string" ? inf.profileUrl : "";
    const handle = typeof inf.handle === "string" ? inf.handle : "";
    const numberOrNull = (input: unknown) =>
      typeof input === "number" && Number.isFinite(input) ? input : null;
    return {
      id: typeof inf.id === "string" ? inf.id : `inf-${index}`,
      handle,
      displayName:
        typeof inf.displayName === "string" && inf.displayName
          ? inf.displayName
          : handle,
      followers: numberOrNull(inf.followers),
      profileUrl,
      platform:
        typeof inf.platform === "string" &&
        ["IG", "TT", "X", "YT", "기타"].includes(inf.platform)
          ? (inf.platform as Platform)
          : detectPlatform(profileUrl),
      rateJpy: numberOrNull(inf.rateJpy),
      adRateJpy: numberOrNull(inf.adRateJpy),
      partner: typeof inf.partner === "string" ? inf.partner : "",
      // 예전 "확인중"/"취소" 상태는 취소 개념이 없어지면서 전부 미진행으로 합친다.
      status: inf.status === "확정" ? "확정" : "미진행",
      concept: typeof inf.concept === "string" ? inf.concept : "",
      comment: typeof inf.comment === "string" ? inf.comment : "",
      brandComment: typeof inf.brandComment === "string" ? inf.brandComment : "",
      groupId:
        typeof inf.groupId === "string" ? inf.groupId : UNASSIGNED_GROUP_ID,
    };
  };

  /** 상위 분류 — 없던 문서에는 '기본' 하나만 만들어 준다. '기본'은 항상 존재한다. */
  const normalizeSections = (input: unknown): Section[] => {
    const parsed: Section[] = Array.isArray(input)
      ? input.map((item, index) => {
          const section = (item ?? {}) as Record<string, unknown>;
          return {
            id: typeof section.id === "string" ? section.id : `section-${index + 1}`,
            name:
              typeof section.name === "string" && section.name
                ? section.name
                : `분류 ${index + 1}`,
            color:
              typeof section.color === "string" && /^#[0-9a-f]{6}$/i.test(section.color)
                ? section.color
                : DEFAULT_SECTION_COLOR,
            alpha:
              typeof section.alpha === "number" && section.alpha >= 0 && section.alpha <= 1
                ? section.alpha
                : DEFAULT_SECTION_ALPHA,
          };
        })
      : [];
    return parsed.some((section) => section.id === DEFAULT_SECTION_ID)
      ? parsed
      : [defaultSection(), ...parsed];
  };

  const normalizeGroups = (input: unknown, sections: Section[]): Group[] => {
    const known = new Set(sections.map((section) => section.id));
    return Array.isArray(input) && input.length
      ? input.map((item, index) => {
          const group = (item ?? {}) as Record<string, unknown>;
          const sectionId =
            typeof group.sectionId === "string" && known.has(group.sectionId)
              ? group.sectionId
              : DEFAULT_SECTION_ID;
          return {
            id: typeof group.id === "string" ? group.id : `group-${index + 1}`,
            name: typeof group.name === "string" ? group.name : `그룹 ${index + 1}`,
            target: typeof group.target === "number" ? group.target : 0,
            active: group.active !== false,
            sectionId,
          };
        })
      : newGroups();
  };

  const periods: Period[] = Array.isArray(value.periods)
    ? value.periods.map((item, index) => {
        const period = (item ?? {}) as Record<string, unknown>;
        const sections = normalizeSections(period.sections);
        return {
          id:
            typeof period.id === "string" && PERIOD_IDS.includes(period.id)
              ? period.id
              : PERIOD_IDS[index] ?? CURRENT_PERIOD_ID,
          totalBudgetKrw:
            typeof period.totalBudgetKrw === "number" ? period.totalBudgetKrw : 0,
          marginRate:
            typeof period.marginRate === "number" ? period.marginRate : 20,
          sections,
          groups: normalizeGroups(period.groups, sections),
          influencers: Array.isArray(period.influencers)
            ? period.influencers.map(normalizeInfluencer)
            : [],
        };
      })
    : [
        // 구버전 문서: 브랜드 자체가 하나의 기간이었다.
        {
          id: CURRENT_PERIOD_ID,
          totalBudgetKrw:
            typeof value.totalBudgetKrw === "number" ? value.totalBudgetKrw : 0,
          marginRate: typeof value.marginRate === "number" ? value.marginRate : 20,
          sections: [defaultSection()],
          groups: normalizeGroups(value.groups, [defaultSection()]),
          influencers: Array.isArray(value.influencers)
            ? value.influencers.map(normalizeInfluencer)
            : [],
        },
      ];

  return {
    id: value.id,
    name: value.name,
    visibility: value.visibility === "hidden" ? "hidden" : "visible",
    logoUrl: typeof value.logoUrl === "string" ? value.logoUrl : undefined,
    partners: Array.isArray(value.partners)
      ? withBackfilledPartners(
          value.partners.filter((item): item is string => typeof item === "string"),
        )
      : DEFAULT_PARTNERS,
    concepts: Array.isArray(value.concepts)
      ? value.concepts.filter((item): item is string => typeof item === "string")
      : [],
    conceptColors:
      value.conceptColors && typeof value.conceptColors === "object"
        ? (value.conceptColors as Record<string, string>)
        : undefined,
    periods: sortPeriods(periods.length ? periods : [newPeriod(CURRENT_PERIOD_ID)]),
    updatedAt:
      typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
  };
}

function getMetrics(period: Period) {
  const activeGroups = period.groups.filter((group) => group.active);
  const activeGroupIds = new Set(activeGroups.map((group) => group.id));
  const confirmed = period.influencers.filter(
    (influencer) =>
      influencer.status === "확정" && activeGroupIds.has(influencer.groupId),
  );
  const usableBudget = period.totalBudgetKrw * (1 - period.marginRate / 100);
  const spentJpy = confirmed.reduce(
    (sum, influencer) => sum + billableRate(influencer),
    0,
  );
  const baseJpy = confirmed.reduce(
    (sum, influencer) => sum + (influencer.rateJpy ?? 0),
    0,
  );
  const spentKrw = spentJpy * EXCHANGE_RATE;
  const target = activeGroups.reduce((sum, group) => sum + group.target, 0);
  const filled = confirmed.length;

  return {
    activeGroups,
    confirmed,
    usableBudget,
    spentJpy,
    baseJpy,
    adOnlyJpy: spentJpy - baseJpy,
    spentKrw,
    remainingBudget: usableBudget - spentKrw,
    target,
    filled,
    shortage: Math.max(target - filled, 0),
  };
}

const EMPTY_TOKENS = new Set(["", "-", "—", "ー", "ng", "n/a", "na", "미정", "없음"]);

function parseAmount(value: string): number | null {
  const raw = value.trim();
  if (EMPTY_TOKENS.has(raw.toLowerCase())) return null;
  const normalized = raw.replace(/[¥￥,、\s円원]/g, "");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount) : null;
}

function parseFollower(value: string): number | null {
  const raw = value.trim();
  if (EMPTY_TOKENS.has(raw.toLowerCase())) return null;
  const normalized = raw.replace(/[,명\s]/g, "").toLowerCase();
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*([km만천]?)$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const multiplier =
    match[2] === "k" || match[2] === "천"
      ? 1_000
      : match[2] === "m"
        ? 1_000_000
        : match[2] === "만"
          ? 10_000
          : 1;
  return Math.round(amount * multiplier);
}

function parseStatus(value: string): InfluencerStatus {
  const raw = value.trim();
  if (raw === "확정" || /^(ok|confirmed|確定)$/i.test(raw)) return "확정";
  return "미진행";
}

/** "26 Q3", "26Q3", "2026 Q3", "Q3" 를 모두 "26Q3" 로 맞춘다. */
function parsePeriodId(value: string): string | null {
  const raw = value.trim().toUpperCase().replace(/\s+/g, "");
  const full = raw.match(/^(?:20)?(\d{2})Q([1-4])$/);
  if (full) {
    const id = `${full[1]}Q${full[2]}`;
    return PERIOD_IDS.includes(id) ? id : null;
  }
  const quarterOnly = raw.match(/^Q([1-4])$/);
  if (quarterOnly) return `26Q${quarterOnly[1]}`;
  return null;
}

function splitCells(line: string) {
  return (line.includes("\t") ? line.split("\t") : line.split(/[,;]\s*|\s{2,}/)).map(
    (cell) => cell.trim(),
  );
}

const isHeaderLine = (line: string) => {
  const lower = line.toLowerCase();
  return (
    (lower.includes("계정") || lower.includes("handle") || lower.includes("id")) &&
    (lower.includes("팔로워") ||
      lower.includes("follow") ||
      lower.includes("단가") ||
      lower.includes("기간"))
  );
};

/** 그룹 붙여넣기 — 계정명/팔로워/링크/단가/광고 포함 단가 순서를 자유롭게 인식한다. */
function parsePaste(text: string): ParsedInfluencer[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isHeaderLine(line))
    .map((line) => {
      const values = splitCells(line).filter(Boolean);
      const profileUrl = values.find((value) => /^https?:\/\/\S+$/i.test(value)) ?? "";
      const rest = values.filter((value) => value !== profileUrl);
      const followerValue = rest.find((value) => parseFollower(value) !== null);
      const amounts = rest
        .filter((value) => value !== followerValue)
        .filter((value) => parseAmount(value) !== null)
        .map((value) => parseAmount(value) as number);
      const displayValue =
        rest.find(
          (value) =>
            value !== followerValue &&
            parseAmount(value) === null &&
            /[a-zA-Z0-9_.@가-힣ぁ-んァ-ン一-龯]/.test(value),
        ) ?? "";
      const handle = displayValue.replace(/^@/, "") || handleFromUrl(profileUrl);
      return {
        handle,
        displayName: displayValue || handle,
        followers: followerValue ? parseFollower(followerValue) : null,
        profileUrl,
        platform: detectPlatform(profileUrl),
        rateJpy: amounts[0] ?? null,
        adRateJpy: amounts[1] ?? amounts[0] ?? null,
      };
    })
    .filter((item) => item.handle || item.profileUrl);
}

/**
 * 일괄 붙여넣기 — 브랜드 / 기간 / 계정명 / 팔로워 / 링크 / 단가 / 광고 포함 단가 / 상태.
 * 상태 칸은 생략할 수 있고, 생략하면 "미진행"으로 들어간다.
 */
function parseBulkPaste(text: string): { rows: BulkRow[]; skipped: number } {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim());
  let skipped = 0;
  const rows: BulkRow[] = [];

  for (const line of lines) {
    if (isHeaderLine(line) && line.includes("브랜드")) continue;
    const cells = splitCells(line);
    if (cells.length < 3) {
      skipped += 1;
      continue;
    }
    const [brandName = "", periodRaw = "", handleRaw = "", followerRaw = "", urlRaw = "", rateRaw = "", adRateRaw = "", statusRaw = ""] =
      cells;
    const periodId = parsePeriodId(periodRaw);
    const profileUrl = /^https?:\/\/\S+$/i.test(urlRaw.trim()) ? urlRaw.trim() : "";
    const handle = handleRaw.trim().replace(/^@/, "") || handleFromUrl(profileUrl);
    if (!brandName.trim() || !periodId || (!handle && !profileUrl)) {
      skipped += 1;
      continue;
    }
    rows.push({
      brandName: brandName.trim(),
      periodId,
      handle,
      displayName: handleRaw.trim() || handle,
      followers: parseFollower(followerRaw),
      profileUrl,
      platform: detectPlatform(profileUrl),
      rateJpy: parseAmount(rateRaw),
      adRateJpy: parseAmount(adRateRaw),
      status: statusRaw.trim() ? parseStatus(statusRaw) : "미진행",
    });
  }

  return { rows, skipped };
}

function isDuplicate(period: Period, influencer: Influencer) {
  const key = crmKey(influencer);
  const url = influencer.profileUrl.toLowerCase().replace(/\/$/, "");
  return period.influencers.some(
    (candidate) =>
      candidate.id !== influencer.id &&
      ((key && crmKey(candidate) === key) ||
        (url && candidate.profileUrl.toLowerCase().replace(/\/$/, "") === url)),
  );
}

type CrmEntry = {
  brandId: string;
  brandName: string;
  periodId: string;
  groupName: string;
  partner: string;
  status: InfluencerStatus;
  platform: Platform;
  followers: number | null;
  profileUrl: string;
  rateJpy: number | null;
  adRateJpy: number | null;
};

type CrmRecord = {
  key: string;
  handle: string;
  displayName: string;
  platforms: Platform[];
  followers: number | null;
  profileUrl: string;
  partners: string[];
  brandNames: string[];
  entries: CrmEntry[];
  latestRate: number | null;
  latestAdRate: number | null;
  confirmedCount: number;
  /** 동일 인물의 모든 항목에 동기화된 코멘트. */
  comment: string;
};

function buildCrmRecords(brands: Brand[]): CrmRecord[] {
  const map = new Map<string, CrmRecord>();

  for (const brand of brands) {
    for (const period of brand.periods) {
      const groupName = (groupId: string) =>
        period.groups.find((group) => group.id === groupId)?.name ?? "미분류";
      for (const influencer of period.influencers) {
        const key = crmKey(influencer);
        if (!key) continue;
        const entry: CrmEntry = {
          brandId: brand.id,
          brandName: brand.name,
          periodId: period.id,
          groupName: groupName(influencer.groupId),
          partner: influencer.partner,
          status: influencer.status,
          platform: influencer.platform,
          followers: influencer.followers,
          profileUrl: influencer.profileUrl,
          rateJpy: influencer.rateJpy,
          adRateJpy: influencer.adRateJpy,
        };
        const existing = map.get(key);
        if (existing) {
          existing.entries.push(entry);
          if (!existing.platforms.includes(entry.platform)) {
            existing.platforms.push(entry.platform);
          }
          if (entry.partner && !existing.partners.includes(entry.partner)) {
            existing.partners.push(entry.partner);
          }
          if (!existing.brandNames.includes(entry.brandName)) {
            existing.brandNames.push(entry.brandName);
          }
          if (!existing.profileUrl && entry.profileUrl) {
            existing.profileUrl = entry.profileUrl;
          }
          if (!existing.comment && influencer.comment) {
            existing.comment = influencer.comment;
          }
        } else {
          map.set(key, {
            key,
            handle: influencer.handle || key,
            displayName: influencer.displayName || influencer.handle || key,
            platforms: [entry.platform],
            followers: entry.followers,
            profileUrl: entry.profileUrl,
            partners: entry.partner ? [entry.partner] : [],
            brandNames: [entry.brandName],
            entries: [entry],
            latestRate: null,
            latestAdRate: null,
            confirmedCount: 0,
            comment: influencer.comment,
          });
        }
      }
    }
  }

  return [...map.values()]
    .map((record) => {
      const ordered = [...record.entries].sort(
        (a, b) => PERIOD_IDS.indexOf(b.periodId) - PERIOD_IDS.indexOf(a.periodId),
      );
      const withFollowers = ordered.find((entry) => entry.followers !== null);
      return {
        ...record,
        entries: ordered,
        followers: withFollowers?.followers ?? null,
        latestRate: ordered.find((entry) => entry.rateJpy !== null)?.rateJpy ?? null,
        latestAdRate:
          ordered.find((entry) => entry.adRateJpy !== null)?.adRateJpy ?? null,
        confirmedCount: ordered.filter((entry) => entry.status === "확정").length,
      };
    })
    .sort(
      (a, b) =>
        b.confirmedCount - a.confirmedCount ||
        b.entries.length - a.entries.length ||
        (b.followers ?? 0) - (a.followers ?? 0),
    );
}

function InstagramLogo({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17.3" cy="6.7" r="1.15" fill="currentColor" />
    </svg>
  );
}

function TikTokLogo({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.6 5.82c-.9-.6-1.55-1.5-1.77-2.55h-3v13.06c0 1.28-1.04 2.32-2.32 2.32a2.32 2.32 0 1 1 0-4.64c.24 0 .47.03.69.1V10.9a5.53 5.53 0 0 0-.69-.04A5.53 5.53 0 1 0 15 16.33V9.4c1.1.79 2.45 1.25 3.9 1.25v-3.02c-.83 0-1.6-.27-2.3-.81z" />
    </svg>
  );
}

function XLogo({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.9 3H21l-6.4 7.3L21.6 21h-5.9l-4.6-6-5.3 6H3l6.8-7.8L2.6 3h6l4.2 5.5L18.9 3z" />
    </svg>
  );
}

function YouTubeLogo({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M23.5 6.2c-.3-1.1-1.1-1.9-2.2-2.2C19.4 3.5 12 3.5 12 3.5s-7.4 0-9.3.5c-1.1.3-1.9 1.1-2.2 2.2C0 8.1 0 12 0 12s0 3.9.5 5.8c.3 1.1 1.1 1.9 2.2 2.2 1.9.5 9.3.5 9.3.5s7.4 0 9.3-.5c1.1-.3 1.9-1.1 2.2-2.2.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z" />
    </svg>
  );
}

const PLATFORM_ICON: Record<Platform, React.ComponentType<{ size?: number }>> = {
  IG: InstagramLogo,
  TT: TikTokLogo,
  X: XLogo,
  YT: YouTubeLogo,
  기타: LinkIcon,
};

/** 프로필 사진 자리에 들어가는, 플랫폼 코드를 보여주는 동그란 배지. */
function PlatformAvatar({ platform, large }: { platform: Platform; large?: boolean }) {
  return (
    <span
      className={`mini-avatar platform-avatar platform-${platform}${large ? " large" : ""}`}
    >
      {platform}
    </span>
  );
}

/** 클릭하면 프로필 링크로 이동하는 플랫폼 로고. 링크가 없으면 비활성 표시만 한다. */
function PlatformLink({
  platform,
  url,
  size = 13,
}: {
  platform: Platform;
  url: string;
  size?: number;
}) {
  const Icon = PLATFORM_ICON[platform];
  if (!url) {
    return (
      <span className="platform-link disabled" aria-hidden="true">
        <Icon size={size} />
      </span>
    );
  }
  return (
    <a
      className="platform-link"
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label={`${platform} 프로필 열기`}
    >
      <Icon size={size} />
    </a>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span>{icon}</span>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

function getErrorCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return "";
}

function getFirestoreErrorMessage(error: unknown) {
  switch (getErrorCode(error)) {
    case "permission-denied":
    case "firestore/permission-denied":
      return "Firestore 저장 권한이 없습니다. firestore.rules 배포 상태와 로그인 계정을 확인해주세요.";
    case "unavailable":
    case "firestore/unavailable":
      return "Firestore에 연결할 수 없습니다. 네트워크 상태를 확인해주세요.";
    case "not-found":
    case "firestore/not-found":
      return "Firestore 데이터베이스를 찾을 수 없습니다.";
    default:
      return "데이터를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.";
  }
}

export default function BrandManagementPage() {
  // 로그인은 (dashboard) 레이아웃이 이미 막아주므로 여기서는 사용자만 읽어 온다.
  const { user } = useAuth();
  const [brands, setBrands] = useState<Brand[]>(seedBrands);
  const [view, setView] = useState<MainView>("brands");
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [overviewPeriodId, setOverviewPeriodId] = useState(ALL_PERIODS);
  const [detailPeriodId, setDetailPeriodId] = useState(CURRENT_PERIOD_ID);
  const [modal, setModal] = useState<ModalState>(null);
  const [query, setQuery] = useState("");
  const [dataStatus, setDataStatus] = useState<DataStatus>(
    isFirebaseConfigured ? "connecting" : "demo",
  );
  const [dataError, setDataError] = useState("");

  const brandsRef = useRef<Brand[]>(seedBrands);
  const pendingSync = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  function applyBrands(next: Brand[]) {
    brandsRef.current = next;
    setBrands(next);
  }

  useEffect(() => {
    if (user) setDataStatus("connecting");
  }, [user]);

  useEffect(() => {
    if (!firebaseDb || !user) return;
    return onSnapshot(
      collection(firebaseDb, "brands"),
      (snapshot) => {
        const remote = snapshot.docs
          .map((item) => normalizeBrand(item.data()))
          .filter((item): item is Brand => item !== null);
        // 저장 대기 중인 브랜드는 로컬 편집 내용을 지키고, 나머지는 원격 값을 따른다.
        const merged = remote.map((brand) =>
          pendingSync.current.has(brand.id)
            ? brandsRef.current.find((local) => local.id === brand.id) ?? brand
            : brand,
        );
        const remoteIds = new Set(remote.map((brand) => brand.id));
        const localOnly = brandsRef.current.filter(
          (brand) => !remoteIds.has(brand.id) && pendingSync.current.has(brand.id),
        );
        applyBrands([...merged, ...localOnly]);
        setDataStatus(pendingSync.current.size ? "saving" : "connected");
        setDataError("");
      },
      (error) => {
        setDataStatus("error");
        setDataError(getFirestoreErrorMessage(error));
      },
    );
  }, [user]);

  // 저장 대기 중에 창을 닫으면 경고한다.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!pendingSync.current.size) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  async function writeBrand(brand: Brand) {
    if (!firebaseDb || !user) return true;
    setDataError("");
    try {
      // setDoc은 값이 undefined인 필드가 있으면 그대로 에러를 던진다 — 로고처럼
      // 선택 필드를 비워뒀을 때 brand.logoUrl이 undefined로 들어오는 경우가
      // 흔하므로, 쓰기 직전에 undefined 필드를 통째로 제거한다.
      const sanitized = JSON.parse(JSON.stringify(brand)) as Brand;
      await setDoc(doc(firebaseDb, "brands", brand.id), sanitized);
      if (!pendingSync.current.size) setDataStatus("connected");
      return true;
    } catch (error) {
      setDataStatus("error");
      setDataError(getFirestoreErrorMessage(error));
      return false;
    }
  }

  /** 타이핑 중 매 글자마다 쓰지 않도록 브랜드 단위로 저장을 모아 보낸다. */
  function queueSync(brand: Brand) {
    if (!firebaseDb || !user) return;
    const timers = pendingSync.current;
    const existing = timers.get(brand.id);
    if (existing) clearTimeout(existing);
    setDataStatus("saving");
    timers.set(
      brand.id,
      setTimeout(() => {
        timers.delete(brand.id);
        void writeBrand(brand);
      }, SYNC_DELAY),
    );
  }

  function updateBrand(brandId: string, updater: (brand: Brand) => Brand) {
    const current = brandsRef.current;
    const target = current.find((brand) => brand.id === brandId);
    if (!target) return;
    const updated: Brand = {
      ...updater(target),
      updatedAt: new Date().toISOString(),
    };
    applyBrands(current.map((brand) => (brand.id === brandId ? updated : brand)));
    queueSync(updated);
  }

  function updatePeriod(
    brandId: string,
    periodId: string,
    updater: (period: Period) => Period,
  ) {
    updateBrand(brandId, (brand) => ({
      ...brand,
      periods: brand.periods.map((period) =>
        period.id === periodId ? updater(period) : period,
      ),
    }));
  }

  /** 동일 인물(crmKey)의 모든 항목에 코멘트를 동기화한다 — 브랜드·기간을 가로질러. */
  function syncComment(key: string, comment: string) {
    if (!key) return;
    const current = brandsRef.current;
    const touched: Brand[] = [];
    const updated = current.map((brand) => {
      let brandChanged = false;
      const periods = brand.periods.map((period) => {
        let periodChanged = false;
        const influencers = period.influencers.map((influencer) => {
          if (crmKey(influencer) === key && influencer.comment !== comment) {
            periodChanged = true;
            return { ...influencer, comment };
          }
          return influencer;
        });
        if (periodChanged) brandChanged = true;
        return periodChanged ? { ...period, influencers } : period;
      });
      if (!brandChanged) return brand;
      const next = { ...brand, periods, updatedAt: new Date().toISOString() };
      touched.push(next);
      return next;
    });
    applyBrands(updated);
    touched.forEach(queueSync);
  }

  const [activeShareLinks, setActiveShareLinks] = useState<
    { token: string; brandId: string; periodId: string }[]
  >([]);
  const pendingLinkSync = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    if (!firebaseDb || !user) return;
    return onSnapshot(
      firestoreQuery(collection(firebaseDb, "shareLinks"), where("revoked", "==", false)),
      (snapshot) => {
        setActiveShareLinks(
          snapshot.docs.map((item) => ({
            token: item.id,
            brandId: item.data().brandId as string,
            periodId: item.data().periodId as string,
          })),
        );
      },
    );
  }, [user]);

  // 브랜드 쪽 데이터(그룹명·목표 인원·인플루언서 목록 등)가 바뀔 때마다
  // 공유 링크에 저장된 리다렉트 스냅샷도 최신 상태로 맞춘다.
  useEffect(() => {
    if (!firebaseDb) return;
    const db = firebaseDb;
    const timers = pendingLinkSync.current;
    for (const link of activeShareLinks) {
      const brand = brands.find((item) => item.id === link.brandId);
      const period = brand && findPeriod(brand, link.periodId);
      if (!brand || !period) continue;
      const existing = timers.get(link.token);
      if (existing) clearTimeout(existing);
      timers.set(
        link.token,
        setTimeout(() => {
          timers.delete(link.token);
          void setDoc(doc(db, "shareLinks", link.token), buildShareSnapshot(brand, period), {
            merge: true,
          });
        }, SYNC_DELAY),
      );
    }
  }, [brands, activeShareLinks]);

  // 공유 페이지에서 브랜드가 남긴 확정 여부·콘셉트·코멘트를 실제 브랜드 데이터에 반영한다.
  useEffect(() => {
    if (!firebaseDb) return;
    const db = firebaseDb;
    const unsubscribers = activeShareLinks.map((link) =>
      onSnapshot(collection(db, "shareLinks", link.token, "edits"), (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "removed") return;
          const influencerId = change.doc.id;
          const value = change.doc.data() as Partial<
            Pick<Influencer, "status" | "concept" | "brandComment">
          >;
          updatePeriod(link.brandId, link.periodId, (period) => ({
            ...period,
            influencers: period.influencers.map((influencer) =>
              influencer.id === influencerId ? { ...influencer, ...value } : influencer,
            ),
          }));
        });
      }),
    );
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
    // updatePeriod는 항상 최신 brandsRef를 대상으로 동작해 재구독이 필요 없다 —
    // 매 렌더마다 정체성이 바뀌므로 deps에 넣으면 리스너가 계속 재구독된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeShareLinks]);

  // 공유 페이지의 "콘셉트 설정"에서 브랜드가 정한 콘셉트 목록·색상을
  // brand.concepts/conceptColors에 그대로 반영한다(추가·삭제·색상 변경 전부).
  useEffect(() => {
    if (!firebaseDb) return;
    const db = firebaseDb;
    const unsubscribers = activeShareLinks.map((link) =>
      onSnapshot(doc(db, "shareLinks", link.token, "settings", "concepts"), (snapshot) => {
        const value = snapshot.data() as { concepts?: unknown; colors?: unknown } | undefined;
        if (!value) return;
        const concepts = Array.isArray(value.concepts)
          ? value.concepts.filter((item): item is string => typeof item === "string")
          : null;
        const colors =
          value.colors && typeof value.colors === "object"
            ? (value.colors as Record<string, string>)
            : null;
        if (!concepts && !colors) return;
        updateBrand(link.brandId, (brand) => ({
          ...brand,
          concepts: concepts ?? brand.concepts,
          conceptColors: colors ?? brand.conceptColors,
        }));
      }),
    );
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
    // updateBrand도 위와 같은 이유로 deps에서 제외한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeShareLinks]);

  function addBrands(created: Brand[]) {
    if (!created.length) return;
    applyBrands([...brandsRef.current, ...created]);
    created.forEach(queueSync);
  }

  async function removeBrand(brandId: string) {
    const current = brandsRef.current;
    const removedBrand = current.find((brand) => brand.id === brandId);
    applyBrands(current.filter((brand) => brand.id !== brandId));
    setSelectedBrandId(null);
    setModal(null);
    const timer = pendingSync.current.get(brandId);
    if (timer) {
      clearTimeout(timer);
      pendingSync.current.delete(brandId);
    }
    if (firebaseDb && user) {
      setDataStatus("saving");
      try {
        await deleteDoc(doc(firebaseDb, "brands", brandId));
        setDataStatus("connected");
      } catch (error) {
        if (removedBrand) {
          applyBrands([...brandsRef.current, removedBrand]);
        }
        setDataStatus("error");
        setDataError(getFirestoreErrorMessage(error));
      }
    }
  }

  const selectedBrand =
    brands.find((brand) => brand.id === selectedBrandId) ?? null;
  const visibleBrands = brands.filter(
    (brand) =>
      brand.visibility === "visible" &&
      brand.name.toLowerCase().includes(query.toLowerCase()),
  );
  const hiddenBrands = brands.filter((brand) => brand.visibility === "hidden");
  const crmRecords = useMemo(() => buildCrmRecords(brands), [brands]);

  function openBrand(brandId: string) {
    const brand = brands.find((candidate) => candidate.id === brandId);
    if (!brand) return;
    setSelectedBrandId(brandId);
    setDetailPeriodId(
      findPeriod(brand, overviewPeriodId) ? overviewPeriodId : latestPeriodId(brand),
    );
  }

  const detailPeriod = selectedBrand ? findPeriod(selectedBrand, detailPeriodId) : null;
  const modalBrand =
    modal?.type === "settings" || modal?.type === "import"
      ? brands.find((item) => item.id === modal.brandId) ?? null
      : null;
  const modalPeriod =
    modalBrand && (modal?.type === "settings" || modal?.type === "import")
      ? findPeriod(modalBrand, modal.periodId)
      : null;

  const subTabs = [
    { id: "brands" as const, label: "브랜드", icon: LayoutGrid, count: 0 },
    {
      id: "crm" as const,
      label: "인플루언서 CRM",
      icon: Users,
      count: crmRecords.length,
    },
    {
      id: "hidden" as const,
      label: "숨긴 브랜드",
      icon: EyeOff,
      count: hiddenBrands.length,
    },
  ];

  return (
    <div className="brand-mgmt">
      {/* 원본 앱의 좌측 사이드바를 대신하는 하위 탭. 허브 사이드바가 상위 내비게이션을 맡는다. */}
      <div className="sub-tabs">
        <nav>
          {subTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive =
              tab.id === "brands"
                ? view === "brands" && !selectedBrand
                : view === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                className={isActive ? "active" : ""}
                onClick={() => {
                  setView(tab.id);
                  setSelectedBrandId(null);
                }}
              >
                <Icon size={16} />
                {tab.label}
                {!!tab.count && <span>{tab.count}</span>}
              </button>
            );
          })}
        </nav>
        {!isFirebaseConfigured && (
          <div className="demo-badge">
            <span />
            데모 데이터
          </div>
        )}
        {isFirebaseConfigured && user && (
          <div className={`data-badge ${dataStatus}`}>
            <span />
            {dataStatus === "connecting" && "데이터 연결 중"}
            {dataStatus === "connected" && "Firestore 연결됨"}
            {dataStatus === "saving" && "저장 중"}
            {dataStatus === "error" && "저장 오류"}
          </div>
        )}
      </div>

      <main className="main-area">
        {dataError && (
          <div className="sync-banner" role="alert">
            <AlertTriangle size={17} />
            <span>{dataError}</span>
            <button onClick={() => window.location.reload()}>다시 연결</button>
          </div>
        )}
        {view === "crm" ? (
          <CrmPage
            records={crmRecords}
            onOpen={(key) => setModal({ type: "crm", key })}
            onBulk={() => setModal({ type: "bulk" })}
          />
        ) : view === "hidden" ? (
          <HiddenBrandsPage
            brands={hiddenBrands}
            onRestore={(brandId) =>
              updateBrand(brandId, (brand) => ({
                ...brand,
                visibility: "visible",
              }))
            }
            onDelete={(brandId) => setModal({ type: "delete", brandId })}
          />
        ) : selectedBrand && detailPeriod ? (
          <CampaignDetail
            brand={selectedBrand}
            period={detailPeriod}
            onBack={() => setSelectedBrandId(null)}
            onPeriodChange={setDetailPeriodId}
            onAddPeriod={(periodId) => {
              updateBrand(selectedBrand.id, (brand) => ({
                ...brand,
                periods: sortPeriods([
                  ...brand.periods,
                  newPeriod(
                    periodId,
                    detailPeriod.totalBudgetKrw,
                    detailPeriod.marginRate,
                  ),
                ]),
              }));
              setDetailPeriodId(periodId);
            }}
            onSettings={() =>
              setModal({
                type: "settings",
                brandId: selectedBrand.id,
                periodId: detailPeriod.id,
              })
            }
            onImport={(groupId) =>
              setModal({
                type: "import",
                brandId: selectedBrand.id,
                periodId: detailPeriod.id,
                groupId,
              })
            }
            onUpdate={(updater) =>
              updatePeriod(selectedBrand.id, detailPeriod.id, updater)
            }
            onSyncComment={syncComment}
          />
        ) : (
          <BrandOverview
            brands={visibleBrands}
            periodId={overviewPeriodId}
            query={query}
            onPeriod={setOverviewPeriodId}
            onQuery={setQuery}
            onCreate={() => setModal({ type: "create" })}
            onBulk={() => setModal({ type: "bulk" })}
            onOpen={openBrand}
            onSettings={(brandId) => {
              const target = brands.find((item) => item.id === brandId);
              const periodId =
                overviewPeriodId === ALL_PERIODS
                  ? (target && latestPeriodId(target)) || CURRENT_PERIOD_ID
                  : overviewPeriodId;
              setModal({ type: "settings", brandId, periodId });
            }}
            onHide={(brandId) =>
              updateBrand(brandId, (brand) => ({
                ...brand,
                visibility: "hidden",
              }))
            }
          />
        )}
      </main>

      {modal?.type === "create" && (
        <CreateBrandModal
          onClose={() => setModal(null)}
          onCreate={(brand) => {
            addBrands([brand]);
            setModal({
              type: "settings",
              brandId: brand.id,
              periodId: brand.periods[0].id,
            });
          }}
        />
      )}
      {modal?.type === "bulk" && (
        <BulkImportModal
          brands={brands}
          onClose={() => setModal(null)}
          onApply={({ createdBrands, updates }) => {
            addBrands(createdBrands);
            updates.forEach(({ brandId, apply }) => updateBrand(brandId, apply));
            setModal(null);
          }}
        />
      )}
      {modal?.type === "crm" && (
        <CrmDetailModal
          record={crmRecords.find((item) => item.key === modal.key) ?? null}
          onClose={() => setModal(null)}
          onSyncComment={syncComment}
        />
      )}
      {modal?.type === "settings" && modalBrand && modalPeriod && (
        <SettingsModal
          brand={modalBrand}
          period={modalPeriod}
          onClose={() => setModal(null)}
          onSave={({ brand: nextBrand, period: nextPeriod }) => {
            updateBrand(modalBrand.id, (current) => ({
              ...current,
              name: nextBrand.name,
              logoUrl: nextBrand.logoUrl,
              partners: nextBrand.partners,
              concepts: nextBrand.concepts,
              visibility: nextBrand.visibility,
              periods: current.periods.map((item) =>
                item.id === nextPeriod.id ? nextPeriod : item,
              ),
            }));
            setModal(null);
          }}
          onAddPeriod={(periodId) =>
            updateBrand(modalBrand.id, (current) => ({
              ...current,
              periods: sortPeriods([
                ...current.periods,
                newPeriod(
                  periodId,
                  modalPeriod.totalBudgetKrw,
                  modalPeriod.marginRate,
                ),
              ]),
            }))
          }
          onRemovePeriod={(periodId) => {
            updateBrand(modalBrand.id, (current) => ({
              ...current,
              periods: current.periods.filter((item) => item.id !== periodId),
            }));
            if (detailPeriodId === periodId) {
              setDetailPeriodId(latestPeriodId(modalBrand));
            }
            if (modalPeriod.id === periodId) setModal(null);
          }}
          onDelete={() => setModal({ type: "delete", brandId: modalBrand.id })}
        />
      )}
      {modal?.type === "delete" &&
        brands.find((brand) => brand.id === modal.brandId) && (
          <DeleteModal
            brand={brands.find((brand) => brand.id === modal.brandId)!}
            onClose={() => setModal(null)}
            onDelete={() => void removeBrand(modal.brandId)}
          />
        )}
      {modal?.type === "import" && modalBrand && modalPeriod && (
        <ImportModal
          brand={modalBrand}
          period={modalPeriod}
          groupId={modal.groupId}
          onClose={() => setModal(null)}
          onAdd={(items) => {
            updatePeriod(modalBrand.id, modalPeriod.id, (current) => ({
              ...current,
              influencers: [...current.influencers, ...items],
            }));
            setModal(null);
          }}
        />
      )}
    </div>
  );
}

function PeriodPicker({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: string[];
  onChange: (periodId: string) => void;
  label: string;
}) {
  return (
    <label className="period-picker">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((id) => (
          <option key={id} value={id}>
            {periodLabel(id)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** 체크박스 복수 선택 드롭다운. 컨테이너가 포커스를 잃으면 CSS로 자동 닫힌다. */
function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    );
  }

  return (
    <div className="multi-filter">
      <button type="button" className="multi-filter-toggle">
        <span>{label}</span>
        {!!selected.length && <b>{selected.length}</b>}
        <ChevronDown size={13} />
      </button>
      <div className="multi-filter-menu">
        {options.map((option) => (
          <label className="multi-filter-option" key={option.value}>
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              onChange={() => toggle(option.value)}
            />
            <span className="custom-check">
              {selected.includes(option.value) && <Check size={11} />}
            </span>
            {option.label}
          </label>
        ))}
        {!options.length && <p className="multi-filter-empty">옵션 없음</p>}
        {!!selected.length && (
          <button
            type="button"
            className="multi-filter-clear"
            onClick={() => onChange([])}
          >
            초기화
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * 최소·최대를 직접 입력하는 구간 필터. 팝오버는 MultiSelectFilter 와 같은
 * :focus-within 방식으로 열린다 — 입력칸이 메뉴 안에 있으니 타이핑 중에도 열려 있다.
 */
function RangeInputFilter({
  label,
  unit,
  value,
  onChange,
  format,
  footer,
}: {
  label: string;
  unit: string;
  value: RangeValue | null;
  onChange: (next: RangeValue | null) => void;
  format: (value: number) => string;
  footer?: ReactNode;
}) {
  const min = value?.min ?? null;
  const max = value?.max ?? null;
  const active = rangeActive(value);
  const inverted = min !== null && max !== null && min > max;

  function setBound(key: "min" | "max", raw: string) {
    const digits = raw.replace(/[^0-9]/g, "");
    const next: RangeValue = { min, max, [key]: digits ? Number(digits) : null };
    onChange(next.min === null && next.max === null ? null : next);
  }

  const badge =
    min !== null && max !== null
      ? `${format(min)} – ${format(max)}`
      : min !== null
        ? `${format(min)} 이상`
        : max !== null
          ? `${format(max)} 이하`
          : "";

  return (
    <div className="multi-filter range-filter">
      <button type="button" className="multi-filter-toggle">
        <span>{label}</span>
        {active && <b>{badge}</b>}
        <ChevronDown size={13} />
      </button>
      <div className="multi-filter-menu range-menu">
        <div className="range-inputs">
          <label>
            <span>최소</span>
            <input
              inputMode="numeric"
              placeholder="제한 없음"
              value={min === null ? "" : withThousands(String(min))}
              onChange={(event) => setBound("min", event.target.value)}
            />
          </label>
          <em>–</em>
          <label>
            <span>최대</span>
            <input
              inputMode="numeric"
              placeholder="제한 없음"
              value={max === null ? "" : withThousands(String(max))}
              onChange={(event) => setBound("max", event.target.value)}
            />
          </label>
        </div>
        <p className="range-unit">단위: {unit}</p>
        {inverted && <p className="range-warn">최소가 최대보다 큽니다</p>}
        {footer}
        {active && (
          <button
            type="button"
            className="multi-filter-clear"
            onClick={() => onChange(null)}
          >
            초기화
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * 코멘트 아이콘 + 팝오버 텍스트영역. 브랜드 페이지·CRM 어디서 편집해도
 * 동일 인물(crmKey)의 모든 항목에 즉시 동기화된다 (onChange가 그 동기화 함수다).
 */
function CommentButton({
  value,
  onChange,
  variant = "internal",
  placeholder = "코멘트를 입력하세요",
}: {
  value: string;
  onChange: (next: string) => void;
  variant?: "internal" | "brand";
  placeholder?: string;
}) {
  const isBrand = variant === "brand";
  const label = isBrand ? "브랜드 코멘트" : "코멘트";
  return (
    <div className={isBrand ? "comment-popover brand" : "comment-popover"}>
      <button
        type="button"
        className={value ? "comment-toggle has-comment" : "comment-toggle"}
        aria-label={value ? `${label} 보기/수정` : `${label} 추가`}
        title={value || `${label} 추가`}
      >
        {isBrand ? <MessageCircle size={14} /> : <MessageSquare size={14} />}
      </button>
      <div className="comment-menu">
        <textarea
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </div>
  );
}

/**
 * 그룹명 옆 연필 버튼 — 이름/목표 인원 수정과 그룹 삭제를 한 곳에서 처리한다.
 * 부모(group-toggle)가 클릭·엔터/스페이스로 펼치기/접기를 하므로, 이 안에서
 * 일어나는 클릭·키다운은 전부 막아서 그룹이 엉뚱하게 열리고 닫히지 않게 한다.
 */
function GroupEditPopover({
  group,
  onRename,
  onTarget,
  onDelete,
}: {
  group: Group;
  onRename: (name: string) => void;
  onTarget: (target: number) => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="group-edit-popover"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button type="button" className="group-edit-toggle" aria-label={`${group.name} 편집`}>
        <Pencil size={12} />
      </button>
      <div className="group-edit-menu">
        <label>
          <span>그룹명</span>
          <input value={group.name} onChange={(event) => onRename(event.target.value)} />
        </label>
        <label>
          <span>목표 인원</span>
          <input
            type="number"
            min="0"
            value={group.target}
            onChange={(event) => onTarget(Number(event.target.value))}
          />
        </label>
        <button type="button" className="group-edit-delete" onClick={onDelete}>
          <Trash2 size={13} /> 그룹 삭제
        </button>
      </div>
    </div>
  );
}

/** 헤더의 "공유 링크" 버튼 — 발급/복사/해지를 팝오버 안에서 처리한다. */
function ShareLinkButton({ brand, period }: { brand: Brand; period: Period }) {
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [copiedToken, setCopiedToken] = useState("");

  useEffect(() => {
    if (!firebaseDb) return;
    return onSnapshot(
      firestoreQuery(collection(firebaseDb, "shareLinks"), where("brandId", "==", brand.id)),
      (snapshot) => {
        setShareLinks(
          snapshot.docs
            .map((item) => ({ token: item.id, ...item.data() }) as ShareLink)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        );
      },
    );
  }, [brand.id]);

  function generateShareLink() {
    if (!firebaseDb) return;
    const token =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().replace(/-/g, "")
        : `${Date.now()}${Math.random().toString(36).slice(2)}`;
    void setDoc(doc(firebaseDb, "shareLinks", token), {
      brandId: brand.id,
      periodId: period.id,
      revoked: false,
      createdAt: new Date().toISOString(),
      label: periodLabel(period.id),
      ...buildShareSnapshot(brand, period),
    });
  }

  function revokeShareLink(token: string) {
    if (!firebaseDb) return;
    void updateDoc(doc(firebaseDb, "shareLinks", token), { revoked: true });
  }

  function copyShareLink(token: string) {
    const url = `${window.location.origin}/share/${token}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(""), 1500);
    });
  }

  return (
    <div className="share-link-popover">
      <button type="button" className="secondary-button" aria-label="공유 링크">
        <Share2 size={16} /> 공유 링크
      </button>
      <div className="share-link-menu">
        <div className="share-link-menu-heading">
          <div>
            <strong>공유 링크</strong>
            <p>
              로그인 없이 볼 수 있는 링크입니다. {periodLabel(period.id)} 기간의 확정
              여부·콘셉트·코멘트만 브랜드가 직접 수정할 수 있어요.
            </p>
          </div>
          <button type="button" className="secondary-button small" onClick={generateShareLink}>
            <Plus size={13} /> 발급
          </button>
        </div>
        {!!shareLinks.length && (
          <div className="share-link-list">
            {shareLinks.map((link) => (
              <div
                key={link.token}
                className={link.revoked ? "share-link-row revoked" : "share-link-row"}
              >
                <div>
                  <strong>{link.label}</strong>
                  <small>{link.revoked ? "해지됨" : "사용 중"}</small>
                </div>
                {!link.revoked && (
                  <button
                    type="button"
                    aria-label="링크 복사"
                    onClick={() => copyShareLink(link.token)}
                  >
                    <Copy size={13} /> {copiedToken === link.token ? "복사됨" : "복사"}
                  </button>
                )}
                {!link.revoked && (
                  <button
                    type="button"
                    className="danger-link"
                    aria-label="링크 해지"
                    onClick={() => revokeShareLink(link.token)}
                  >
                    해지
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** 브랜드 로고 — logoUrl이 있으면 이미지, 없으면 이름 앞 두 글자로 대신한다. */
function BrandLogo({ brand }: { brand: Brand }) {
  if (brand.logoUrl) {
    return (
      <span className="brand-monogram has-image">
        {/* eslint-disable-next-line @next/next/no-img-element -- 임의의 외부 로고 URL이라 next/image 도메인 허용목록에 담을 수 없다 */}
        <img src={brand.logoUrl} alt="" />
      </span>
    );
  }
  return <span className="brand-monogram">{brand.name.slice(0, 2)}</span>;
}

type LogoCandidate = { name: string; domain: string; logoUrl: string };

/**
 * 브랜드명을 입력하면 추천 로고 후보를 띄워준다. 검색은 최선일 뿐이라 —
 * 못 찾으면 조용히 빈 상태로 두고, URL을 직접 입력할 수 있게 한다.
 */
function LogoPicker({
  brandName,
  value,
  onChange,
}: {
  brandName: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const [candidates, setCandidates] = useState<LogoCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const query = brandName.trim();

  useEffect(() => {
    if (query.length < 2) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/logo-suggestions?q=${encodeURIComponent(query)}`)
        .then((res) => (res.ok ? res.json() : { candidates: [] }))
        .then((data: { candidates?: LogoCandidate[] }) => {
          if (!cancelled) setCandidates(data.candidates ?? []);
        })
        .catch(() => {
          if (!cancelled) setCandidates([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const shownCandidates = query.length < 2 ? [] : candidates;

  return (
    <div className="logo-picker">
      <div className="logo-picker-row">
        <span className="logo-picker-preview">
          {/* eslint-disable-next-line @next/next/no-img-element -- 임의의 외부 로고 URL이라 next/image 도메인 허용목록에 담을 수 없다 */}
          {value ? <img src={value} alt="" /> : <ImageIcon size={16} />}
        </span>
        <input
          value={value}
          placeholder="로고 이미지 URL을 붙여넣거나 아래에서 선택하세요"
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      {loading && <p className="logo-picker-hint">추천 로고를 찾는 중…</p>}
      {!loading && !!shownCandidates.length && (
        <div className="logo-picker-candidates">
          {shownCandidates.map((candidate) => (
            <button
              type="button"
              key={candidate.domain}
              className={value === candidate.logoUrl ? "logo-candidate active" : "logo-candidate"}
              title={`${candidate.name} (${candidate.domain})`}
              onClick={() => onChange(candidate.logoUrl)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- 임의의 외부 로고 URL이라 next/image 도메인 허용목록에 담을 수 없다 */}
              <img src={candidate.logoUrl} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BrandOverview({
  brands,
  periodId,
  query,
  onPeriod,
  onQuery,
  onCreate,
  onBulk,
  onOpen,
  onSettings,
  onHide,
}: {
  brands: Brand[];
  periodId: string;
  query: string;
  onPeriod: (periodId: string) => void;
  onQuery: (value: string) => void;
  onCreate: () => void;
  onBulk: () => void;
  onOpen: (brandId: string) => void;
  onSettings: (brandId: string) => void;
  onHide: (brandId: string) => void;
}) {
  const running = brands
    .map((brand) => ({
      brand,
      period:
        periodId === ALL_PERIODS
          ? findPeriod(brand, latestPeriodId(brand))
          : findPeriod(brand, periodId),
    }))
    .filter(
      (item): item is { brand: Brand; period: Period } => item.period !== null,
    );

  const totals = running.reduce(
    (result, { period }) => {
      const metrics = getMetrics(period);
      return {
        budget: result.budget + metrics.usableBudget,
        target: result.target + metrics.target,
        filled: result.filled + metrics.filled,
      };
    },
    { budget: 0, target: 0, filled: 0 },
  );

  return (
    <div className="page-wrap">
      <header className="page-header">
        <div>
          <p className="eyebrow">CAMPAIGN WORKSPACE</p>
          <h1>브랜드 캠페인</h1>
          <p>기간별 예산과 인플루언서 공급 현황을 한곳에서 관리하세요.</p>
        </div>
        <div className="header-actions">
          <button className="secondary-button" onClick={onBulk}>
            <CopyPlus size={16} />
            일괄 등록
          </button>
          <button className="primary-button" onClick={onCreate}>
            <Plus size={17} />
            브랜드 추가
          </button>
        </div>
      </header>

      <div className="period-bar">
        <PeriodPicker
          label="운영 기간"
          value={periodId}
          options={[ALL_PERIODS, ...PERIOD_IDS]}
          onChange={onPeriod}
        />
        <span className="period-note">
          {periodId === ALL_PERIODS
            ? `전체 기간 · 브랜드별 최신 기간 기준 · ${running.length}개 브랜드`
            : `${periodLabel(periodId)} 기준 · 운영 중 ${running.length}개 / 전체 ${brands.length}개 브랜드`}
        </span>
      </div>

      <section className="overview-strip">
        <div>
          <span>운영 중 브랜드</span>
          <strong>{running.length}<small>개</small></strong>
        </div>
        <div>
          <span>총 운영 예산</span>
          <strong>{won(totals.budget)}</strong>
        </div>
        <div>
          <span>전체 확보 현황</span>
          <strong>{totals.filled}<small> / {totals.target}명</small></strong>
        </div>
        <div>
          <span>전체 달성률</span>
          <strong>{percent(totals.filled, totals.target)}<small>%</small></strong>
        </div>
      </section>

      <div className="list-toolbar">
        <div>
          <h2>전체 브랜드</h2>
          <span>{running.length}개의 캠페인</span>
        </div>
        <label className="search-field">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="브랜드 검색"
          />
        </label>
      </div>

      {running.length ? (
        <section className="brand-grid">
          {running.map(({ brand, period }, index) => {
            const metrics = getMetrics(period);
            const progress = percent(metrics.filled, metrics.target);
            const chipPeriodId = periodId === ALL_PERIODS ? period.id : periodId;
            return (
              <article
                className="brand-card"
                key={brand.id}
                style={{ animationDelay: `${index * 50}ms` }}
                onClick={() => onOpen(brand.id)}
              >
                <div className="brand-card-top">
                  <div className="brand-identity">
                    <BrandLogo brand={brand} />
                    <div>
                      <h3>{brand.name}</h3>
                      <p>{metrics.activeGroups.length}개 그룹 운영 중</p>
                    </div>
                  </div>
                  <div className="card-menu">
                    <button
                      aria-label={`${brand.name} 메뉴`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <MoreHorizontal size={18} />
                    </button>
                    <div>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          onSettings(brand.id);
                        }}
                      >
                        <Settings2 size={14} /> 설정
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          onHide(brand.id);
                        }}
                      >
                        <EyeOff size={14} /> 숨기기
                      </button>
                    </div>
                  </div>
                </div>
                <div className="period-chips">
                  {sortPeriods(brand.periods).map((item) => (
                    <span
                      key={item.id}
                      className={item.id === chipPeriodId ? "period-chip on" : "period-chip"}
                    >
                      {periodLabel(item.id)}
                    </span>
                  ))}
                </div>
                <div className="card-budget">
                  <span>잔여 예산</span>
                  <strong>{won(metrics.remainingBudget)}</strong>
                  <p>
                    총 {won(metrics.usableBudget)}
                    <span>
                      마진 {period.marginRate}% 제외 · 광고 포함 단가 기준
                    </span>
                  </p>
                </div>
                <div className="card-progress">
                  <div>
                    <span>인원 달성</span>
                    <b>{metrics.filled} / {metrics.target}명</b>
                  </div>
                  <i><b style={{ width: `${progress}%` }} /></i>
                </div>
                <div className="card-footer">
                  <span
                    className={
                      metrics.target === 0
                        ? "unset"
                        : metrics.shortage
                          ? "shortage"
                          : "complete"
                    }
                  >
                    {metrics.target === 0
                      ? "목표 미설정"
                      : metrics.shortage
                        ? `${metrics.shortage}명 부족`
                        : "목표 달성"}
                  </span>
                  <button>
                    캠페인 열기 <ArrowUpRight size={15} />
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <EmptyState
          icon={<Search size={22} />}
          title={
            query
              ? "검색 결과가 없습니다"
              : brands.length
                ? "이 기간에 운영 중인 브랜드가 없습니다"
                : "아직 브랜드가 없습니다"
          }
          description={
            query
              ? "다른 검색어를 입력해보세요."
              : brands.length
                ? "다른 기간을 선택하거나 캠페인을 열어 이 기간을 추가하세요."
                : "첫 브랜드를 추가해 캠페인 운영을 시작하세요."
          }
          action={
            !query && !brands.length ? (
              <button className="primary-button" onClick={onCreate}>
                <Plus size={16} /> 브랜드 추가
              </button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}

/** 천단위 콤마를 보여주면서 편집하는 숫자 입력. 내부 값은 항상 순수 숫자다. */
function NumberInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [text, setText] = useState(() => (value === null ? "" : numFmt(value)));
  // 바깥에서 값이 바뀌면(예: 그룹 이동, 원격 동기화) 표시도 맞춘다.
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    setText(value === null ? "" : numFmt(value));
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      className={className}
      value={text}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(event) => {
        const digits = event.target.value.replace(/[^0-9]/g, "");
        if (!digits) {
          setText("");
          onChange(null);
          return;
        }
        const next = Number(digits);
        setText(numFmt(next));
        onChange(next);
      }}
    />
  );
}

function CampaignDetail({
  brand,
  period,
  onBack,
  onPeriodChange,
  onAddPeriod,
  onSettings,
  onImport,
  onUpdate,
  onSyncComment,
}: {
  brand: Brand;
  period: Period;
  onBack: () => void;
  onPeriodChange: (periodId: string) => void;
  onAddPeriod: (periodId: string) => void;
  onSettings: () => void;
  onImport: (groupId: string) => void;
  onUpdate: (updater: (period: Period) => Period) => void;
  onSyncComment: (key: string, comment: string) => void;
}) {
  const [openGroups, setOpenGroups] = useState(
    () =>
      new Set(
        period.groups.filter((group) => group.active).map((group) => group.id),
      ),
  );
  const [drag, setDrag] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const groupCardRefs = useRef(new Map<string, HTMLElement>());
  const sectionCardRefs = useRef(new Map<string, HTMLElement>());
  const dragKindRef = useRef<DragKind | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const scrollHostRef = useRef<HTMLElement | null>(null);

  function hitTest(refs: Map<string, HTMLElement>, clientY: number): string | null {
    for (const [id, el] of refs) {
      const rect = el.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) return id;
    }
    return null;
  }

  /**
   * 끌고 있는 대상마다 받아주는 곳이 다르다. 그룹 카드는 상위 분류 안에 들어
   * 있으므로 항상 그룹을 먼저 맞혀 보고, 빈 분류일 때만 분류가 받는다.
   */
  function findDropTarget(kind: DragKind, clientY: number): DropTarget | null {
    if (kind === "section") {
      const id = hitTest(sectionCardRefs.current, clientY);
      return id ? { kind: "section", id } : null;
    }
    const groupId = hitTest(groupCardRefs.current, clientY);
    if (groupId) return { kind: "group", id: groupId };
    if (kind === "group") {
      const sectionId = hitTest(sectionCardRefs.current, clientY);
      if (sectionId) return { kind: "section", id: sectionId };
    }
    return null;
  }

  /**
   * 실제로 스크롤되는 조상을 찾는다. 허브 레이아웃은 창을 고정해 두고 본문
   * <main> 안에서만 스크롤하므로 window.scrollBy 로는 아무 일도 일어나지 않는다.
   * 문서 전체가 스크롤되는 환경이면 null 을 돌려주고 window 를 쓴다.
   */
  function findScrollHost(from: HTMLElement | null): HTMLElement | null {
    let node = from?.parentElement ?? null;
    while (node) {
      const overflowY = getComputedStyle(node).overflowY;
      if (
        (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
        node.scrollHeight > node.clientHeight
      ) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  function stopAutoScroll() {
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
  }

  function updateAutoScroll(clientY: number) {
    const margin = 72;
    const maxSpeed = 16;
    const host = scrollHostRef.current;
    // 경계는 창이 아니라 실제 스크롤 영역 기준이어야 한다. 허브에서는 위쪽에
    // 사이드바 헤더가, 아래쪽에 화면 끝이 있어 두 값이 서로 다르다.
    const hostRect = host?.getBoundingClientRect();
    const top = hostRect ? hostRect.top : 0;
    const bottom = hostRect ? hostRect.bottom : window.innerHeight;

    const ratio = (value: number) => Math.min(1, Math.max(0, value));
    let speed = 0;
    if (clientY < top + margin) {
      speed = -maxSpeed * ratio(1 - (clientY - top) / margin);
    } else if (clientY > bottom - margin) {
      speed = maxSpeed * ratio(1 - (bottom - clientY) / margin);
    }

    stopAutoScroll();
    if (speed === 0) return;
    const step = () => {
      if (host) host.scrollTop += speed;
      else window.scrollBy(0, speed);
      if (dragKindRef.current) {
        setDropTarget(findDropTarget(dragKindRef.current, clientY));
      }
      scrollRafRef.current = requestAnimationFrame(step);
    };
    scrollRafRef.current = requestAnimationFrame(step);
  }

  /** 놓았을 때 실제로 데이터를 옮긴다. */
  function applyDrop(item: DragItem, target: DropTarget) {
    if (item.kind === "section") {
      if (target.kind === "section" && target.id !== item.id) {
        onUpdate((current) => moveSection(current, item.id, target.id));
      }
      return;
    }
    if (item.kind === "group") {
      if (target.kind === "group") {
        if (target.id !== item.id) {
          onUpdate((current) => moveGroup(current, item.id, target.id));
        }
      } else {
        onUpdate((current) => moveGroupToSection(current, item.id, target.id));
      }
      return;
    }
    if (target.kind === "group") {
      onUpdate((current) => ({
        ...current,
        influencers: current.influencers.map((influencer) =>
          influencer.id === item.id
            ? { ...influencer, groupId: target.id }
            : influencer,
        ),
      }));
    }
  }

  /**
   * 커서를 따라오는 커스텀 드래그. 상위 분류·그룹은 잡기 아이콘에서, 인플루언서는
   * 행을 꾹 누르고 있으면 시작한다.
   */
  function beginDrag(item: DragItem, x: number, y: number, anchor: HTMLElement | null) {
    dragKindRef.current = item.kind;
    setDrag(item);
    setDragPos({ x, y });
    scrollHostRef.current = findScrollHost(anchor);

    let over: DropTarget | null = null;

    function handleMove(moveEvent: PointerEvent) {
      setDragPos({ x: moveEvent.clientX, y: moveEvent.clientY });
      over = findDropTarget(item.kind, moveEvent.clientY);
      setDropTarget(over);
      updateAutoScroll(moveEvent.clientY);
    }

    function handleUp() {
      if (over) applyDrop(item, over);
      cleanup();
    }

    function cleanup() {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
      stopAutoScroll();
      scrollHostRef.current = null;
      dragKindRef.current = null;
      setDrag(null);
      setDropTarget(null);
      setDragPos(null);
    }

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
  }

  function startDrag(
    kind: "group" | "section",
    id: string,
    label: string,
    event: React.PointerEvent,
  ) {
    event.preventDefault();
    const refs = kind === "group" ? groupCardRefs : sectionCardRefs;
    beginDrag(
      { kind, id, label },
      event.clientX,
      event.clientY,
      refs.current.get(id) ?? (event.currentTarget as HTMLElement),
    );
  }

  // 인플루언서 행은 입력칸투성이라 바로 끌면 값 편집과 부딪힌다. 그래서 빈 곳을
  // 꾹 누르고 있을 때만 드래그로 넘어간다 — 누르는 동안 조금이라도 움직이면 취소.
  const pressRef = useRef<{ timer: number; x: number; y: number } | null>(null);

  function endPress() {
    if (!pressRef.current) return;
    window.clearTimeout(pressRef.current.timer);
    pressRef.current = null;
  }

  function startInfluencerPress(
    influencer: Influencer,
    event: React.PointerEvent<HTMLDivElement>,
  ) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("input, select, textarea, button, a, label")) {
      return;
    }
    const row = event.currentTarget;
    const { clientX, clientY } = event;
    const label = influencer.handle ? `@${influencer.handle}` : "인플루언서";
    endPress();
    pressRef.current = {
      x: clientX,
      y: clientY,
      timer: window.setTimeout(() => {
        pressRef.current = null;
        beginDrag({ kind: "influencer", id: influencer.id, label }, clientX, clientY, row);
      }, 260),
    };
  }

  function movePress(event: React.PointerEvent<HTMLDivElement>) {
    const press = pressRef.current;
    if (!press) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) endPress();
  }

  function renderGroupCard(group: Group) {
    const items = period.influencers.filter(
      (influencer) => influencer.groupId === group.id,
    );
    const confirmed = items.filter(
      (influencer) => influencer.status === "확정",
    ).length;
    const isOpen = openGroups.has(group.id);
    return (
      <article
        className={[
          "group-card",
          drag?.kind === "group" && drag.id === group.id ? "dragging" : "",
          dropTarget?.kind === "group" &&
          dropTarget.id === group.id &&
          drag?.id !== group.id
            ? "drag-over"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
        key={group.id}
        ref={(el) => {
          if (el) groupCardRefs.current.set(group.id, el);
          else groupCardRefs.current.delete(group.id);
        }}
      >
        <div className="group-card-header">
          <button
            type="button"
            className="group-drag-handle"
            aria-label={`${group.name} 순서 변경`}
            onPointerDown={(event) =>
              startDrag("group", group.id, group.name, event)
            }
          >
            <GripVertical size={14} />
          </button>
          <div
            role="button"
            tabIndex={0}
            className="group-toggle"
            onClick={() =>
              setOpenGroups((current) => {
                const next = new Set(current);
                if (next.has(group.id)) next.delete(group.id);
                else next.add(group.id);
                return next;
              })
            }
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              setOpenGroups((current) => {
                const next = new Set(current);
                if (next.has(group.id)) next.delete(group.id);
                else next.add(group.id);
                return next;
              });
            }}
          >
            <span className="group-chevron">
              {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </span>
            <div>
              <strong>{group.name}</strong>
              <span className={confirmed >= group.target ? "met" : ""}>
                {numFmt(confirmed)} / {numFmt(group.target)}명
              </span>
            </div>
            <GroupEditPopover
              group={group}
              onRename={(name) => renameGroup(group.id, name)}
              onTarget={(target) => retargetGroup(group.id, target)}
              onDelete={() => deleteGroup(group.id)}
            />
            <i>
              <b style={{ width: `${percent(confirmed, group.target)}%` }} />
            </i>
            <span
              className={
                group.target === 0
                  ? "status-unset"
                  : confirmed >= group.target
                    ? "status-done"
                    : "status-open"
              }
            >
              {group.target === 0
                ? "미설정"
                : confirmed >= group.target
                  ? "달성"
                  : `${numFmt(Math.max(group.target - confirmed, 0))}명 부족`}
            </span>
          </div>
        </div>
        {isOpen && (
          <div className="group-body">
            {!!items.length && (
              <div className="influencer-table">
                <div className="table-head">
                  <span>계정</span>
                  <span>팔로워</span>
                  <span>단가 (JPY)</span>
                  <span>광고 포함 (JPY)</span>
                  <span>그룹</span>
                  <span>협력사</span>
                  <span>콘셉트</span>
                  <span />
                  <span />
                  <span />
                </div>
                {items.map((influencer) => {
                  const duplicate = isDuplicate(period, influencer);
                  const key = crmKey(influencer);
                  return (
                    <div
                      className={[
                        "table-row",
                        duplicate ? "duplicate" : "",
                        drag?.kind === "influencer" && drag.id === influencer.id
                          ? "dragging"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      key={influencer.id}
                      onPointerDown={(event) =>
                        startInfluencerPress(influencer, event)
                      }
                      onPointerMove={movePress}
                      onPointerUp={endPress}
                      onPointerLeave={endPress}
                    >
                      <div className="account-cell">
                        <label
                          className="confirm-check"
                          title={influencer.status === "확정" ? "확정" : "미진행"}
                        >
                          <input
                            type="checkbox"
                            checked={influencer.status === "확정"}
                            aria-label={`${influencer.handle} 확정 여부`}
                            onChange={(event) =>
                              updateInfluencer(influencer.id, {
                                status: event.target.checked ? "확정" : "미진행",
                              })
                            }
                          />
                          <span className="custom-check">
                            {influencer.status === "확정" && <Check size={11} />}
                          </span>
                        </label>
                        <label>
                          <span>@</span>
                          <input
                            value={influencer.handle}
                            placeholder="account"
                            onChange={(event) =>
                              updateInfluencer(influencer.id, {
                                handle: event.target.value.replace(/^@/, ""),
                              })
                            }
                          />
                        </label>
                        <PlatformLink
                          platform={influencer.platform}
                          url={influencer.profileUrl}
                        />
                        {duplicate && (
                          <span className="duplicate-tag">
                            <AlertTriangle size={11} /> 중복
                          </span>
                        )}
                      </div>
                      <NumberInput
                        className="cell-input"
                        value={influencer.followers}
                        placeholder="-"
                        ariaLabel={`${influencer.handle} 팔로워`}
                        onChange={(value) =>
                          updateInfluencer(influencer.id, { followers: value })
                        }
                      />
                      <div className="rate-input">
                        <span>¥</span>
                        <NumberInput
                          value={influencer.rateJpy}
                          placeholder="-"
                          ariaLabel={`${influencer.handle} 기본 단가`}
                          onChange={(value) =>
                            updateInfluencer(influencer.id, { rateJpy: value })
                          }
                        />
                      </div>
                      <div className="rate-input accent">
                        <span>¥</span>
                        <NumberInput
                          value={influencer.adRateJpy}
                          placeholder="-"
                          ariaLabel={`${influencer.handle} 광고 포함 단가`}
                          onChange={(value) =>
                            updateInfluencer(influencer.id, { adRateJpy: value })
                          }
                        />
                      </div>
                      <select
                        value={influencer.groupId}
                        aria-label={`${influencer.handle} 그룹`}
                        onChange={(event) =>
                          updateInfluencer(influencer.id, {
                            groupId: event.target.value,
                          })
                        }
                      >
                        {period.groups.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={influencer.partner}
                        aria-label={`${influencer.handle} 협력사`}
                        onChange={(event) =>
                          updateInfluencer(influencer.id, {
                            partner: event.target.value,
                          })
                        }
                      >
                        {brand.partners.map((partner) => (
                          <option key={partner}>{partner}</option>
                        ))}
                      </select>
                      <select
                        className="concept-select"
                        value={influencer.concept}
                        aria-label={`${influencer.handle} 콘셉트`}
                        onChange={(event) =>
                          updateInfluencer(influencer.id, {
                            concept: event.target.value,
                          })
                        }
                      >
                        <option value="">미지정</option>
                        {brand.concepts.map((concept) => (
                          <option key={concept} value={concept}>
                            {concept}
                          </option>
                        ))}
                      </select>
                      <CommentButton
                        value={influencer.comment}
                        onChange={(value) => onSyncComment(key, value)}
                      />
                      <CommentButton
                        variant="brand"
                        value={influencer.brandComment}
                        placeholder="공유 링크로 브랜드가 남긴 코멘트입니다"
                        onChange={(value) =>
                          updateInfluencer(influencer.id, { brandComment: value })
                        }
                      />
                      <button
                        className="row-delete"
                        aria-label="인플루언서 삭제"
                        onClick={() =>
                          onUpdate((current) => ({
                            ...current,
                            influencers: current.influencers.filter(
                              (item) => item.id !== influencer.id,
                            ),
                          }))
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {!items.length && (
              <div className="group-empty">
                <Users size={18} />
                아직 등록된 인플루언서가 없습니다.
              </div>
            )}
            <div className="group-actions">
              <button onClick={() => addBlank(group.id)}>
                <Plus size={15} /> 한 명 추가
              </button>
              <button onClick={() => onImport(group.id)}>
                <CopyPlus size={15} /> 엑셀에서 붙여넣기
              </button>
            </div>
          </div>
        )}
      </article>
    );
  }

  // --- 되돌리기 (Ctrl+Z) ---------------------------------------------
  // period prop 자체가 바뀔 때마다(어떤 버튼으로 바꿨든) 이전 값을 스택에 쌓는다.
  // 그래서 개별 변경 지점마다 따로 손댈 필요가 없다 — 붙여넣기 모달처럼
  // Home 쪽에서 직접 period를 갈아치우는 경로도 똑같이 잡힌다.
  const undoStackRef = useRef<Period[]>([]);
  const lastPeriodRef = useRef(period);
  const scopeKeyRef = useRef(`${brand.id}:${period.id}`);
  const isUndoingRef = useRef(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);

  useEffect(() => {
    const key = `${brand.id}:${period.id}`;
    if (scopeKeyRef.current !== key) {
      // 브랜드나 기간 탭을 바꾼 것 — 편집이 아니므로 되돌리기 기록을 새로 시작한다.
      scopeKeyRef.current = key;
      undoStackRef.current = [];
      lastPeriodRef.current = period;
      isUndoingRef.current = false;
      return;
    }
    if (lastPeriodRef.current !== period) {
      if (!isUndoingRef.current) {
        undoStackRef.current.push(lastPeriodRef.current);
        if (undoStackRef.current.length > 30) undoStackRef.current.shift();
      }
      isUndoingRef.current = false;
      lastPeriodRef.current = period;
    }
  }, [brand.id, period]);

  function undo() {
    const stack = undoStackRef.current;
    const previous = stack.pop();
    if (!previous) return;
    isUndoingRef.current = true;
    onUpdate(() => previous);
  }

  // 키보드 리스너는 마운트 시 한 번만 등록하므로, onUpdate/period가 최신 값을
  // 가리키도록 undo 자체는 매 렌더 최신 버전을 ref에 담아 호출한다.
  const undoRef = useRef(undo);
  useEffect(() => {
    undoRef.current = undo;
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.key.toLowerCase() !== "z") {
        return;
      }
      // 입력창·textarea 안에서는 브라우저 기본 되돌리기(타이핑 취소)를 우선한다.
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      event.preventDefault();
      undoRef.current();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function renameGroup(groupId: string, name: string) {
    onUpdate((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === groupId ? { ...group, name } : group,
      ),
    }));
  }

  function retargetGroup(groupId: string, target: number) {
    onUpdate((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === groupId ? { ...group, target } : group,
      ),
    }));
  }

  function deleteGroup(groupId: string) {
    onUpdate((current) => {
      const remaining = current.groups.filter((group) => group.id !== groupId);
      const groups = remaining.some((group) => group.id === UNASSIGNED_GROUP_ID)
        ? remaining
        : [
            ...remaining,
            {
              id: UNASSIGNED_GROUP_ID,
              name: "미분류",
              target: 0,
              active: true,
              sectionId: DEFAULT_SECTION_ID,
            },
          ];
      return {
        ...current,
        groups,
        influencers: current.influencers.map((influencer) =>
          influencer.groupId === groupId
            ? { ...influencer, groupId: UNASSIGNED_GROUP_ID }
            : influencer,
        ),
      };
    });
  }

  const metrics = getMetrics(period);
  const missingPeriods = PERIOD_IDS.filter(
    (id) => !brand.periods.some((item) => item.id === id),
  );

  function updateInfluencer(id: string, patch: Partial<Influencer>) {
    onUpdate((current) => ({
      ...current,
      influencers: current.influencers.map((influencer) =>
        influencer.id === id ? { ...influencer, ...patch } : influencer,
      ),
    }));
  }

  function addBlank(groupId: string) {
    onUpdate((current) => ({
      ...current,
      influencers: [
        ...current.influencers,
        {
          id: `inf-${Date.now()}`,
          handle: "",
          displayName: "",
          followers: null,
          profileUrl: "",
          platform: "IG",
          rateJpy: null,
          adRateJpy: null,
          partner: brand.partners[0] ?? "",
          status: "확정",
          concept: "",
          comment: "",
          brandComment: "",
          groupId,
        },
      ],
    }));
  }

  return (
    <div className="campaign-page">
      <header className="campaign-header">
        <div className="campaign-heading">
          <button className="back-button" onClick={onBack}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1>{brand.name}</h1>
          </div>
        </div>
        <div className="campaign-actions">
          <span className="live-pill"><i /> 운영 중</span>
          <button className="secondary-button" onClick={() => setShowInvoiceModal(true)}>
            <FileText size={16} /> 인보이스 생성
          </button>
          <ShareLinkButton brand={brand} period={period} />
          <button className="secondary-button" onClick={onSettings}>
            <Settings2 size={16} /> 브랜드 설정
          </button>
        </div>
      </header>

      <div className="period-tabs" role="tablist" aria-label="운영 기간">
        {sortPeriods(brand.periods).map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={item.id === period.id}
            className={item.id === period.id ? "period-tab on" : "period-tab"}
            onClick={() => onPeriodChange(item.id)}
          >
            {periodLabel(item.id)}
            <small>{numFmt(item.influencers.length)}명</small>
          </button>
        ))}
        {!!missingPeriods.length && (
          <label className="period-add">
            <Plus size={14} />
            <span>기간 추가</span>
            <select
              value=""
              aria-label="기간 추가"
              onChange={(event) =>
                event.target.value && onAddPeriod(event.target.value)
              }
            >
              <option value="">선택</option>
              {missingPeriods.map((id) => (
                <option key={id} value={id}>
                  {periodLabel(id)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="campaign-layout">
        <section className="management-panel">
          <div className="section-heading">
            <div>
              <span className="section-icon"><Users size={17} /></span>
              <div>
                <h2>인플루언서 관리</h2>
                <p>
                  {periodLabel(period.id)} · 그룹별 계정, 단가, 협력사와 상태를
                  관리합니다.
                </p>
              </div>
            </div>
            <span className="count-pill">{numFmt(period.influencers.length)}명 등록</span>
          </div>

          <div className="group-stack">
            {period.sections.length <= 1
              ? metrics.activeGroups.map(renderGroupCard)
              : period.sections.map((section) => {
                  const sectionGroups = metrics.activeGroups.filter(
                    (group) => group.sectionId === section.id,
                  );
                  return (
                    <section
                      className={[
                        "section-card",
                        drag?.kind === "section" && drag.id === section.id ? "dragging" : "",
                        dropTarget?.kind === "section" && dropTarget.id === section.id
                          ? "drag-over"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      key={section.id}
                      style={{ background: sectionBackground(section) }}
                      ref={(el) => {
                        if (el) sectionCardRefs.current.set(section.id, el);
                        else sectionCardRefs.current.delete(section.id);
                      }}
                    >
                      <header className="section-card-header">
                        <button
                          type="button"
                          className="group-drag-handle"
                          aria-label={`${section.name} 순서 변경`}
                          onPointerDown={(event) =>
                            startDrag("section", section.id, section.name, event)
                          }
                        >
                          <GripVertical size={14} />
                        </button>
                        <strong>{section.name}</strong>
                        <span>{numFmt(sectionGroups.length)}개 그룹</span>
                      </header>
                      <div className="section-body">
                        {sectionGroups.length ? (
                          sectionGroups.map(renderGroupCard)
                        ) : (
                          <p className="section-empty">그룹을 여기로 끌어다 놓으세요</p>
                        )}
                      </div>
                    </section>
                  );
                })}
          </div>
        </section>

        <Dashboard brand={brand} period={period} />
      </div>

      {drag && dragPos && (
        <div
          className="group-drag-ghost"
          style={{ left: dragPos.x, top: dragPos.y }}
        >
          <GripVertical size={13} />
          {drag.label}
        </div>
      )}

      {showInvoiceModal && <InvoiceModal onClose={() => setShowInvoiceModal(false)} />}
    </div>
  );
}

function Dashboard({ brand, period }: { brand: Brand; period: Period }) {
  const metrics = getMetrics(period);
  const budgetRate = percent(metrics.spentKrw, metrics.usableBudget);
  const usableBudgetJpy = metrics.usableBudget / EXCHANGE_RATE;
  const remainingBudgetJpy = metrics.remainingBudget / EXCHANGE_RATE;

  return (
    <aside className="dashboard-panel">
      <div className="section-heading dashboard-heading">
        <div>
          <span className="section-icon"><BarChart3 size={17} /></span>
          <div>
            <h2>현황 대시보드</h2>
            <p>{periodLabel(period.id)} · 확정 상태 기준 실시간 집계</p>
          </div>
        </div>
      </div>

      <div className="budget-card">
        <div className="budget-total">
          <span>총 예산</span>
          <strong>{won(period.totalBudgetKrw)}</strong>
        </div>
        <div className="budget-card-top">
          <div>
            <span>운영 가능 예산</span>
            <strong>{yen(usableBudgetJpy)}</strong>
            <p>
              총 예산에서 마진 {period.marginRate}% 제외 · 환율 ¥1 = ₩
              {EXCHANGE_RATE} 기준
            </p>
          </div>
          <span className="metric-icon"><CircleDollarSign size={20} /></span>
        </div>
        <div className="budget-bar">
          <i><b style={{ width: `${budgetRate}%` }} /></i>
          <span>{budgetRate}% 소진</span>
        </div>
        <div className="budget-stats">
          <div>
            <span>소진 금액</span>
            <strong>{yen(metrics.spentJpy)}</strong>
          </div>
          <div>
            <span>잔여 예산</span>
            <strong>{yen(remainingBudgetJpy)}</strong>
          </div>
        </div>
        <div className="budget-split">
          <div>
            <span>기본 단가 합계</span>
            <strong>{yen(metrics.baseJpy)}</strong>
          </div>
          <div>
            <span>광고 2차사용분</span>
            <strong>{yen(metrics.adOnlyJpy)}</strong>
          </div>
        </div>
      </div>

      <div className="people-summary">
        <div className="people-ring" style={{ "--progress": `${percent(metrics.filled, metrics.target) * 3.6}deg` } as React.CSSProperties}>
          <span><strong>{numFmt(metrics.filled)}</strong>/{numFmt(metrics.target)}</span>
        </div>
        <div>
          <span>전체 인원 달성률</span>
          <strong>{percent(metrics.filled, metrics.target)}%</strong>
          <p>
            {metrics.shortage ? (
              <><b>{numFmt(metrics.shortage)}명</b> 더 확보하면 목표 달성</>
            ) : (
              <b>전체 목표를 달성했습니다</b>
            )}
          </p>
        </div>
      </div>

      <section className="dashboard-section">
        <div className="dashboard-title">
          <h3>그룹별 달성 현황</h3>
          <span>{numFmt(metrics.activeGroups.length)}개 그룹</span>
        </div>
        <div className="progress-list">
          {metrics.activeGroups.map((group) => {
            const items = metrics.confirmed.filter(
              (influencer) => influencer.groupId === group.id,
            );
            const amount = items.reduce((sum, item) => sum + billableRate(item), 0);
            return (
              <div key={group.id}>
                <div>
                  <span>{group.name}</span>
                  <strong>{numFmt(items.length)} <small>/ {numFmt(group.target)}명</small></strong>
                </div>
                <i><b style={{ width: `${percent(items.length, group.target)}%` }} /></i>
                <p className="progress-amount">{yen(amount)}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="dashboard-section">
        <div className="dashboard-title">
          <h3>협력사별 공급 현황</h3>
          <span>확정 인원 기준</span>
        </div>
        <div className="partner-list">
          {brand.partners.map((partner) => {
            const supplied = metrics.confirmed.filter(
              (influencer) => influencer.partner === partner,
            );
            const total = supplied.reduce((sum, item) => sum + billableRate(item), 0);
            return (
              <details key={partner}>
                <summary>
                  <span className="partner-logo">{partner.slice(0, 2)}</span>
                  <strong>{partner}</strong>
                  <span>
                    {numFmt(supplied.length)}명 · {yen(total)}
                  </span>
                  <ChevronDown size={14} />
                </summary>
                <div>
                  {metrics.activeGroups.map((group) => {
                    const items = supplied.filter((item) => item.groupId === group.id);
                    const amount = items.reduce((sum, item) => sum + billableRate(item), 0);
                    return (
                      <p key={group.id}>
                        <span>{group.name}</span>
                        <b>
                          {numFmt(items.length)}명 · {yen(amount)}
                        </b>
                      </p>
                    );
                  })}
                  <p className="partner-total-row">
                    <span>합계</span>
                    <b>{yen(total)}</b>
                  </p>
                </div>
              </details>
            );
          })}
        </div>
      </section>
    </aside>
  );
}

const PLATFORM_OPTIONS: { value: Platform; label: string }[] = [
  { value: "IG", label: "IG" },
  { value: "TT", label: "TT" },
  { value: "X", label: "X" },
  { value: "YT", label: "YT" },
  { value: "기타", label: "기타" },
];

/** 최소·최대를 직접 입력하는 구간. 한쪽만 채우면 그쪽만 제한한다. */
type RangeValue = { min: number | null; max: number | null };

const rangeActive = (range: RangeValue | null) =>
  !!range && (range.min !== null || range.max !== null);

/** 값이 입력한 구간 안인가. 구간 미설정이면 전부 통과, 값이 없으면(null) 제외된다. */
function inRange(value: number | null, range: RangeValue | null) {
  if (!rangeActive(range)) return true;
  if (value === null) return false;
  return (
    (range!.min === null || value >= range!.min) &&
    (range!.max === null || value <= range!.max)
  );
}

/**
 * 단가 구간 필터의 기준가. 광고 포함을 켜면 광고 2차사용 포함 단가를 쓰되,
 * 그 값이 없는 인플루언서는 기본 단가로 대신 본다 (billableRate 와 같은 규칙).
 */
const filterRate = (record: CrmRecord, useAdRate: boolean) =>
  useAdRate ? record.latestAdRate ?? record.latestRate : record.latestRate;

function CrmPage({
  records,
  onOpen,
  onBulk,
}: {
  records: CrmRecord[];
  onOpen: (key: string) => void;
  onBulk: () => void;
}) {
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState<string[]>([]);
  const [periodFilter, setPeriodFilter] = useState<string[]>([]);
  const [platformFilter, setPlatformFilter] = useState<string[]>([]);
  const [partnerFilter, setPartnerFilter] = useState<string[]>([]);
  const [followerRange, setFollowerRange] = useState<RangeValue | null>(null);
  const [rateRange, setRateRange] = useState<RangeValue | null>(null);
  /** 단가 구간의 기준가 — 켜면 광고 2차사용 포함 단가로 거른다. */
  const [useAdRate, setUseAdRate] = useState(false);

  const brandOptions = useMemo(
    () =>
      [...new Set(records.flatMap((record) => record.brandNames))]
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ value: name, label: name })),
    [records],
  );
  const periodOptions = useMemo(
    () =>
      PERIOD_IDS.filter((id) =>
        records.some((record) => record.entries.some((entry) => entry.periodId === id)),
      ).map((id) => ({ value: id, label: periodLabel(id) })),
    [records],
  );
  const partnerOptions = useMemo(
    () =>
      [...new Set(records.flatMap((record) => record.partners))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ value: name, label: name })),
    [records],
  );

  const filtered = records.filter((record) => {
    const term = search.trim().toLowerCase();
    const matchesTerm =
      !term ||
      record.handle.toLowerCase().includes(term) ||
      record.displayName.toLowerCase().includes(term) ||
      record.brandNames.some((name) => name.toLowerCase().includes(term)) ||
      record.partners.some((name) => name.toLowerCase().includes(term));
    const matchesBrand =
      !brandFilter.length || record.brandNames.some((name) => brandFilter.includes(name));
    const matchesPeriod =
      !periodFilter.length ||
      record.entries.some((entry) => periodFilter.includes(entry.periodId));
    const matchesPlatform =
      !platformFilter.length ||
      record.platforms.some((item) => platformFilter.includes(item));
    const matchesPartner =
      !partnerFilter.length || record.partners.some((name) => partnerFilter.includes(name));
    return (
      matchesTerm &&
      matchesBrand &&
      matchesPeriod &&
      matchesPlatform &&
      matchesPartner &&
      inRange(record.followers, followerRange) &&
      inRange(filterRate(record, useAdRate), rateRange)
    );
  });

  const totalRuns = records.reduce((sum, record) => sum + record.entries.length, 0);
  const repeatCount = records.filter((record) => record.brandNames.length > 1).length;
  const filtersActive = !!(
    brandFilter.length ||
    periodFilter.length ||
    platformFilter.length ||
    partnerFilter.length ||
    rangeActive(followerRange) ||
    rangeActive(rateRange)
  );

  return (
    <div className="page-wrap">
      <header className="page-header">
        <div>
          <p className="eyebrow">INFLUENCER CRM</p>
          <h1>인플루언서 CRM</h1>
          <p>브랜드·기간을 넘나드는 인플루언서 단가와 진행 이력을 모아봅니다.</p>
        </div>
        <div className="header-actions">
          <button className="secondary-button" onClick={onBulk}>
            <CopyPlus size={16} />
            일괄 등록
          </button>
        </div>
      </header>

      <section className="overview-strip">
        <div>
          <span>등록 인플루언서</span>
          <strong>{records.length}<small>명</small></strong>
        </div>
        <div>
          <span>누적 진행 건수</span>
          <strong>{totalRuns}<small>건</small></strong>
        </div>
        <div>
          <span>복수 브랜드 참여</span>
          <strong>{repeatCount}<small>명</small></strong>
        </div>
        <div>
          <span>재참여 비율</span>
          <strong>
            {percent(repeatCount, records.length)}<small>%</small>
          </strong>
        </div>
      </section>

      <div className="list-toolbar">
        <div>
          <h2>인플루언서 목록</h2>
          <span>
            {filtered.length}명 표시 중
            {filtersActive && (
              <button
                type="button"
                className="filter-reset"
                onClick={() => {
                  setBrandFilter([]);
                  setPeriodFilter([]);
                  setPlatformFilter([]);
                  setPartnerFilter([]);
                  setFollowerRange(null);
                  setRateRange(null);
                }}
              >
                필터 초기화
              </button>
            )}
          </span>
        </div>
        <div className="crm-filters">
          <MultiSelectFilter
            label="브랜드"
            options={brandOptions}
            selected={brandFilter}
            onChange={setBrandFilter}
          />
          <MultiSelectFilter
            label="기간"
            options={periodOptions}
            selected={periodFilter}
            onChange={setPeriodFilter}
          />
          <MultiSelectFilter
            label="플랫폼"
            options={PLATFORM_OPTIONS}
            selected={platformFilter}
            onChange={setPlatformFilter}
          />
          <MultiSelectFilter
            label="협력사"
            options={partnerOptions}
            selected={partnerFilter}
            onChange={setPartnerFilter}
          />
          <RangeInputFilter
            label="팔로워"
            unit="명"
            value={followerRange}
            onChange={setFollowerRange}
            format={(value) => compactOr(value)}
          />
          <RangeInputFilter
            label={useAdRate ? "단가 (광고 포함)" : "단가"}
            unit="JPY"
            value={rateRange}
            onChange={setRateRange}
            format={(value) => yen(value)}
            footer={
              <label className="filter-check">
                <input
                  type="checkbox"
                  checked={useAdRate}
                  onChange={(event) => setUseAdRate(event.target.checked)}
                />
                <span className="custom-check">{useAdRate && <Check size={11} />}</span>
                광고 포함 단가 기준
              </label>
            }
          />
          <label className="search-field">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="계정명, 브랜드, 협력사 검색"
            />
          </label>
        </div>
      </div>

      {filtered.length ? (
        <div className="crm-table">
          <div className="crm-head">
            <span>계정</span>
            <span>플랫폼</span>
            <span>팔로워</span>
            <span>진행</span>
            <span>참여 브랜드</span>
            <span>협력사</span>
            <span>최근 단가</span>
            <span>광고 포함</span>
          </div>
          {filtered.map((record) => (
            <button
              className="crm-row"
              key={record.key}
              onClick={() => onOpen(record.key)}
            >
              <span className="account-cell">
                <span className="crm-identity">
                  <strong>
                    {record.handle}
                    {!!record.comment && (
                      <MessageSquare size={11} className="comment-dot" aria-label="코멘트 있음" />
                    )}
                  </strong>
                  {record.displayName !== record.handle && (
                    <small>{record.displayName}</small>
                  )}
                </span>
              </span>
              <span className="crm-platforms">
                {record.platforms.map((item) => (
                  <PlatformLink key={item} platform={item} url={record.profileUrl} />
                ))}
              </span>
              <span className="crm-num">{compactOr(record.followers)}</span>
              <span className="crm-num">
                <b>{record.confirmedCount}</b>/{record.entries.length}건
              </span>
              <span className="crm-brands">
                {record.brandNames.slice(0, 3).map((name) => (
                  <em key={name}>{name}</em>
                ))}
                {record.brandNames.length > 3 && (
                  <em className="more">+{record.brandNames.length - 3}</em>
                )}
              </span>
              <span className="crm-partners">
                {record.partners.length
                  ? record.partners.join(", ")
                  : "-"}
              </span>
              <span className="crm-num">{yenOr(record.latestRate)}</span>
              <span className="crm-num accent">{yenOr(record.latestAdRate)}</span>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Users size={22} />}
          title={
            records.length ? "조건에 맞는 인플루언서가 없습니다" : "아직 등록된 인플루언서가 없습니다"
          }
          description={
            records.length
              ? "검색어나 필터를 조정해보세요."
              : "일괄 등록으로 엑셀 리스트를 붙여넣으면 CRM이 채워집니다."
          }
          action={
            records.length ? undefined : (
              <button className="primary-button" onClick={onBulk}>
                <CopyPlus size={16} /> 일괄 등록
              </button>
            )
          }
        />
      )}
    </div>
  );
}

function CrmDetailModal({
  record,
  onClose,
  onSyncComment,
}: {
  record: CrmRecord | null;
  onClose: () => void;
  onSyncComment: (key: string, comment: string) => void;
}) {
  if (!record) return null;
  const confirmed = record.entries.filter((entry) => entry.status === "확정");
  const rates = record.entries
    .map((entry) => entry.adRateJpy ?? entry.rateJpy)
    .filter((value): value is number => value !== null);
  const average = rates.length
    ? Math.round(rates.reduce((sum, value) => sum + value, 0) / rates.length)
    : null;

  return (
    <Modal
      title={record.handle}
      description={
        record.displayName !== record.handle ? record.displayName : undefined
      }
      onClose={onClose}
      wide
    >
      <div className="crm-detail">
        <div className="crm-detail-top">
          <div>
            <div className="crm-platforms">
              {record.platforms.map((item) => (
                <PlatformLink key={item} platform={item} url={record.profileUrl} size={15} />
              ))}
            </div>
            <p>팔로워 {compactOr(record.followers)}</p>
          </div>
        </div>

        <label className="crm-comment-field">
          <span>코멘트</span>
          <textarea
            value={record.comment}
            placeholder="이 인플루언서에 대한 코멘트를 입력하세요"
            onChange={(event) => onSyncComment(record.key, event.target.value)}
          />
        </label>

        <div className="crm-stat-grid">
          <div>
            <span>참여 브랜드</span>
            <strong>{record.brandNames.length}<small>개</small></strong>
          </div>
          <div>
            <span>총 진행 건수</span>
            <strong>{record.entries.length}<small>건</small></strong>
          </div>
          <div>
            <span>확정 건수</span>
            <strong>{confirmed.length}<small>건</small></strong>
          </div>
          <div>
            <span>평균 단가 (광고 포함)</span>
            <strong>{yenOr(average)}</strong>
          </div>
        </div>

        <div className="crm-partner-row">
          <span>협력사</span>
          <div className="partner-tags readonly">
            {record.partners.length ? (
              record.partners.map((partner) => <span key={partner}>{partner}</span>)
            ) : (
              <span className="muted">-</span>
            )}
          </div>
        </div>

        <div className="section-heading">
          <div>
            <span className="section-icon"><History size={16} /></span>
            <div>
              <h2>진행 이력</h2>
              <p>최근 기간 순으로 표시됩니다.</p>
            </div>
          </div>
          <span className="count-pill">{record.entries.length}건</span>
        </div>

        <div className="history-table">
          <div className="history-head">
            <span>기간</span>
            <span>브랜드</span>
            <span>그룹</span>
            <span>협력사</span>
            <span>플랫폼</span>
            <span>상태</span>
            <span>단가</span>
            <span>광고 포함</span>
          </div>
          {record.entries.map((entry, index) => (
            <div className="history-row" key={`${entry.brandId}-${entry.periodId}-${index}`}>
              <span><b>{periodLabel(entry.periodId)}</b></span>
              <span>{entry.brandName}</span>
              <span>{entry.groupName}</span>
              <span>{entry.partner || "-"}</span>
              <span>
                <PlatformLink platform={entry.platform} url={entry.profileUrl} />
              </span>
              <span>
                <em className={`status-tag status-${entry.status}`}>{entry.status}</em>
              </span>
              <span className="crm-num">{yenOr(entry.rateJpy)}</span>
              <span className="crm-num accent">{yenOr(entry.adRateJpy)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="modal-actions">
        <button className="secondary-button" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  );
}

function Modal({
  title,
  description,
  onClose,
  children,
  wide,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className={wide ? "modal wide" : "modal"}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button aria-label="닫기" onClick={onClose}><X size={18} /></button>
        </header>
        {children}
      </section>
    </div>
  );
}

type InvoiceRow = { name: string; unitPrice: string; quantity: string; amount: string };

/** 숫자만 담긴 문자열을 입력창에 보여줄 때 3자리마다 콤마를 찍어준다. */
const withThousands = (digits: string) => (digits ? Number(digits).toLocaleString("ko-KR") : "");

function InvoiceModal({ onClose }: { onClose: () => void }) {
  const [buyerName, setBuyerName] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [campaignTitle, setCampaignTitle] = useState("");
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [generating, setGenerating] = useState(false);

  // 인보이스 생성 버튼을 누른 시점의 날짜로 한 번만 고정한다.
  const meta = useMemo(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return { no: `${yyyy}-${mm}${dd}`, code: `G-${yyyy}${mm}${dd}` };
  }, []);

  const totals = useMemo(() => {
    const subtotal = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    const vat = subtotal * 0.1;
    return { subtotal, vat, total: subtotal + vat };
  }, [rows]);

  function updateRow(index: number, patch: Partial<InvoiceRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((current) => [...current, { name: "", unitPrice: "", quantity: "", amount: "" }]);
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index));
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      // PDF 렌더러는 300KB가 넘어 브랜드 관리 화면 전체를 무겁게 만든다.
      // 거래명세서를 실제로 뽑을 때만 받아 온다.
      const { downloadInvoicePdf } = await import("@/lib/invoice-pdf");
      await downloadInvoicePdf({
        no: meta.no,
        code: meta.code,
        buyerName,
        buyerAddress,
        campaignTitle,
        items: rows.map((row) => ({
          name: row.name,
          unitPrice: Number(row.unitPrice) || 0,
          quantity: row.quantity,
          amount: Number(row.amount) || 0,
        })),
      });
      onClose();
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Modal
      title="인보이스 생성"
      description={`No. ${meta.no} · ${meta.code}`}
      onClose={onClose}
      wide
    >
      <div className="invoice-form">
        <div className="form-grid">
          <label>
            <span>회사명</span>
            <input
              value={buyerName}
              placeholder="예: 주식회사 OOO 귀중"
              onChange={(event) => setBuyerName(event.target.value)}
            />
          </label>
          <label>
            <span>주소</span>
            <input
              value={buyerAddress}
              placeholder="회사 주소"
              onChange={(event) => setBuyerAddress(event.target.value)}
            />
          </label>
        </div>
        <label className="invoice-title-field">
          <span>캠페인 문구</span>
          <input
            value={campaignTitle}
            placeholder="예: 7월 마케팅 캠페인"
            onChange={(event) => setCampaignTitle(event.target.value)}
          />
        </label>

        <div className="invoice-items">
          <div className="invoice-items-head">
            <span>항목</span>
            <span>단가</span>
            <span>수량</span>
            <span>금액</span>
            <span />
          </div>
          {rows.map((row, index) => (
            <div className="invoice-items-row" key={index}>
              <input
                value={row.name}
                placeholder="항목명"
                onChange={(event) => updateRow(index, { name: event.target.value })}
              />
              <input
                value={withThousands(row.unitPrice)}
                placeholder="0"
                inputMode="numeric"
                onChange={(event) =>
                  updateRow(index, { unitPrice: event.target.value.replace(/[^0-9]/g, "") })
                }
              />
              <input
                value={row.quantity}
                placeholder="예: 1개월"
                onChange={(event) => updateRow(index, { quantity: event.target.value })}
              />
              <input
                value={withThousands(row.amount)}
                placeholder="0"
                inputMode="numeric"
                onChange={(event) =>
                  updateRow(index, { amount: event.target.value.replace(/[^0-9]/g, "") })
                }
              />
              <button type="button" aria-label="행 삭제" onClick={() => removeRow(index)}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {!rows.length && <p className="invoice-empty">아직 추가된 항목이 없습니다.</p>}
        </div>
        <button type="button" className="secondary-button small" onClick={addRow}>
          <Plus size={13} /> 내용 추가
        </button>

        <div className="invoice-totals">
          <div>
            <span>소계</span>
            <strong>{won(totals.subtotal)}</strong>
          </div>
          <div>
            <span>부가세</span>
            <strong>{won(totals.vat)}</strong>
          </div>
          <div className="grand">
            <span>합계</span>
            <strong>{won(totals.total)}</strong>
          </div>
        </div>
      </div>
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose}>
          취소
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={!rows.length || generating}
          onClick={handleGenerate}
        >
          {generating ? "생성 중…" : "생성"}
        </button>
      </div>
    </Modal>
  );
}

function SettingsModal({
  brand,
  period,
  onClose,
  onSave,
  onAddPeriod,
  onRemovePeriod,
  onDelete,
}: {
  brand: Brand;
  period: Period;
  onClose: () => void;
  onSave: (value: { brand: Brand; period: Period }) => void;
  onAddPeriod: (periodId: string) => void;
  onRemovePeriod: (periodId: string) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(brand.name);
  const [logoUrl, setLogoUrl] = useState(brand.logoUrl ?? "");
  const [partners, setPartners] = useState(brand.partners);
  const [concepts, setConcepts] = useState(brand.concepts);
  const [visibility, setVisibility] = useState(brand.visibility);
  const [draft, setDraft] = useState<Period>(() => structuredClone(period));
  const [customGroup, setCustomGroup] = useState("");
  const [newGroupSectionId, setNewGroupSectionId] = useState(DEFAULT_SECTION_ID);
  const [customSection, setCustomSection] = useState("");
  const [partner, setPartner] = useState("");
  const [concept, setConcept] = useState("");
  const usable = draft.totalBudgetKrw * (1 - draft.marginRate / 100);
  const missingPeriods = PERIOD_IDS.filter(
    (id) => !brand.periods.some((item) => item.id === id),
  );

  return (
    <Modal
      title={`${brand.name} 설정`}
      description={`${periodLabel(period.id)} 기간의 예산·그룹과 브랜드 공통 설정을 관리합니다.`}
      onClose={onClose}
      wide
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            brand: { ...brand, name, logoUrl: logoUrl.trim() || undefined, partners, concepts, visibility },
            period: draft,
          });
        }}
      >
        <div className="settings-layout">
          <div className="settings-main">
            <div className="form-section">
              <div className="form-section-heading">
                <div>
                  <h3>기본 정보 및 예산</h3>
                  <p>
                    예산과 마진은 {periodLabel(period.id)} 기간에만 적용됩니다.
                    마진을 제외한 금액이 대시보드의 운영 예산으로 표시됩니다.
                  </p>
                </div>
              </div>
              <div className="form-grid">
                <label>
                  <span>브랜드명</span>
                  <input
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <label>
                  <span>로고</span>
                  <LogoPicker brandName={name} value={logoUrl} onChange={setLogoUrl} />
                </label>
                <label>
                  <span>총 예산 (KRW) · {periodLabel(period.id)}</span>
                  <input
                    type="number"
                    min="0"
                    value={draft.totalBudgetKrw}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        totalBudgetKrw: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  <span>마진율 (%)</span>
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={draft.marginRate}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        marginRate: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <div className="calculated-field">
                  <span>마진 제외 운영 예산</span>
                  <strong>{won(usable)}</strong>
                </div>
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-heading">
                <div>
                  <h3>상위 분류</h3>
                  <p>
                    그룹을 묶는 큰 분류입니다. 분류마다 그리드 배경색과 투명도를
                    정할 수 있고, 기본 분류는 지울 수 없습니다.
                  </p>
                </div>
              </div>
              <div className="section-settings">
                {draft.sections.map((section) => (
                  <div className="section-setting" key={section.id}>
                    <span
                      className="section-swatch"
                      style={{ background: sectionBackground(section) }}
                      aria-hidden
                    />
                    <input
                      className="section-name"
                      value={section.name}
                      aria-label={`${section.name} 이름`}
                      disabled={section.id === DEFAULT_SECTION_ID}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          sections: draft.sections.map((candidate) =>
                            candidate.id === section.id
                              ? { ...candidate, name: event.target.value }
                              : candidate,
                          ),
                        })
                      }
                    />
                    <div className="section-palette">
                      {SECTION_COLOR_PRESETS.map((preset) => (
                        <button
                          type="button"
                          key={preset}
                          className={
                            section.color.toLowerCase() === preset
                              ? "section-chip active"
                              : "section-chip"
                          }
                          style={{ background: preset }}
                          aria-label={`${section.name} 색상 ${preset}`}
                          onClick={() =>
                            setDraft({
                              ...draft,
                              sections: draft.sections.map((candidate) =>
                                candidate.id === section.id
                                  ? { ...candidate, color: preset }
                                  : candidate,
                              ),
                            })
                          }
                        />
                      ))}
                      <input
                        type="color"
                        className="section-picker"
                        value={section.color}
                        aria-label={`${section.name} 사용자 색상`}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            sections: draft.sections.map((candidate) =>
                              candidate.id === section.id
                                ? { ...candidate, color: event.target.value }
                                : candidate,
                            ),
                          })
                        }
                      />
                    </div>
                    <label className="section-alpha">
                      <input
                        type="range"
                        min="0"
                        max="60"
                        value={Math.round(section.alpha * 100)}
                        aria-label={`${section.name} 투명도`}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            sections: draft.sections.map((candidate) =>
                              candidate.id === section.id
                                ? { ...candidate, alpha: Number(event.target.value) / 100 }
                                : candidate,
                            ),
                          })
                        }
                      />
                      <span>{Math.round(section.alpha * 100)}%</span>
                    </label>
                    {section.id !== DEFAULT_SECTION_ID && (
                      <button
                        type="button"
                        className="icon-button danger"
                        aria-label={`${section.name} 삭제`}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            sections: draft.sections.filter(
                              (candidate) => candidate.id !== section.id,
                            ),
                            groups: draft.groups.map((group) =>
                              group.sectionId === section.id
                                ? { ...group, sectionId: DEFAULT_SECTION_ID }
                                : group,
                            ),
                          })
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="inline-add">
                <input
                  placeholder="새 상위 분류 이름"
                  value={customSection}
                  onChange={(event) => setCustomSection(event.target.value)}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!customSection.trim()) return;
                    setDraft({
                      ...draft,
                      sections: [
                        ...draft.sections,
                        {
                          id: `section-${Date.now()}`,
                          name: customSection.trim(),
                          color:
                            SECTION_COLOR_PRESETS[
                              draft.sections.length % SECTION_COLOR_PRESETS.length
                            ],
                          alpha: DEFAULT_SECTION_ALPHA,
                        },
                      ],
                    });
                    setCustomSection("");
                  }}
                >
                  <Plus size={15} /> 분류 추가
                </button>
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-heading">
                <div>
                  <h3>그룹 및 목표 인원</h3>
                  <p>
                    {periodLabel(period.id)} 기간에서 사용할 그룹을 활성화하고
                    목표 인원을 설정하세요.
                  </p>
                </div>
              </div>
              <div className="group-settings">
                {draft.groups.map((group) => (
                  <div
                    className={group.active ? "group-setting active" : "group-setting"}
                    key={group.id}
                  >
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={group.active}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            groups: draft.groups.map((candidate) =>
                              candidate.id === group.id
                                ? { ...candidate, active: event.target.checked }
                                : candidate,
                            ),
                          })
                        }
                      />
                      <span className="custom-check">
                        {group.active && <Check size={13} />}
                      </span>
                      <strong>{group.name}</strong>
                    </label>
                    <select
                      className="group-section-select"
                      value={group.sectionId}
                      disabled={!group.active}
                      aria-label={`${group.name} 상위 분류`}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          groups: draft.groups.map((candidate) =>
                            candidate.id === group.id
                              ? { ...candidate, sectionId: event.target.value }
                              : candidate,
                          ),
                        })
                      }
                    >
                      {draft.sections.map((section) => (
                        <option key={section.id} value={section.id}>
                          {section.name}
                        </option>
                      ))}
                    </select>
                    <label className="target-input">
                      <input
                        type="number"
                        min="0"
                        disabled={!group.active}
                        value={group.target}
                        aria-label={`${group.name} 목표 인원`}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            groups: draft.groups.map((candidate) =>
                              candidate.id === group.id
                                ? { ...candidate, target: Number(event.target.value) }
                                : candidate,
                            ),
                          })
                        }
                      />
                      <span>명</span>
                    </label>
                  </div>
                ))}
              </div>
              <div className="inline-add">
                <input
                  placeholder="새 그룹 이름"
                  value={customGroup}
                  onChange={(event) => setCustomGroup(event.target.value)}
                />
                <select
                  className="group-section-select"
                  value={newGroupSectionId}
                  aria-label="새 그룹의 상위 분류"
                  onChange={(event) => setNewGroupSectionId(event.target.value)}
                >
                  {draft.sections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (!customGroup.trim()) return;
                    setDraft({
                      ...draft,
                      groups: [
                        ...draft.groups,
                        {
                          id: `group-${Date.now()}`,
                          name: customGroup.trim(),
                          target: 1,
                          active: true,
                          sectionId: newGroupSectionId,
                        },
                      ],
                    });
                    setCustomGroup("");
                  }}
                >
                  <Plus size={15} /> 그룹 추가
                </button>
              </div>
            </div>
          </div>

          <aside className="settings-aside">
            <div className="form-section">
              <h3>운영 기간</h3>
              <p>기간마다 예산·그룹·인플루언서가 따로 관리됩니다.</p>
              <div className="period-manage">
                {sortPeriods(brand.periods).map((item) => (
                  <div
                    key={item.id}
                    className={item.id === period.id ? "period-manage-row on" : "period-manage-row"}
                  >
                    <strong>{periodLabel(item.id)}</strong>
                    <small>{item.influencers.length}명</small>
                    {brand.periods.length > 1 && (
                      <button
                        type="button"
                        aria-label={`${periodLabel(item.id)} 기간 삭제`}
                        onClick={() => onRemovePeriod(item.id)}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {!!missingPeriods.length && (
                <div className="inline-add compact">
                  <select
                    value=""
                    aria-label="기간 추가"
                    onChange={(event) =>
                      event.target.value && onAddPeriod(event.target.value)
                    }
                  >
                    <option value="">기간 추가</option>
                    {missingPeriods.map((id) => (
                      <option key={id} value={id}>
                        {periodLabel(id)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="form-section">
              <h3>협력사 관리</h3>
              <p>인플루언서 등록 시 선택할 협력사입니다. 브랜드 공통 설정입니다.</p>
              <div className="partner-tags">
                {partners.map((item) => (
                  <span key={item}>
                    {item}
                    <button
                      type="button"
                      aria-label={`${item} 삭제`}
                      onClick={() =>
                        setPartners(partners.filter((candidate) => candidate !== item))
                      }
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="inline-add compact">
                <input
                  placeholder="협력사명"
                  value={partner}
                  onChange={(event) => setPartner(event.target.value)}
                />
                <button
                  type="button"
                  aria-label="협력사 추가"
                  onClick={() => {
                    const value = partner.trim().toUpperCase();
                    if (!value || partners.includes(value)) return;
                    setPartners([...partners, value]);
                    setPartner("");
                  }}
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>

            <div className="form-section">
              <h3>콘셉트 관리</h3>
              <p>인플루언서 콘텐츠 콘셉트 드롭다운에 들어갈 목록입니다. 브랜드 공통 설정입니다.</p>
              <div className="partner-tags">
                {concepts.map((item) => (
                  <span key={item}>
                    {item}
                    <button
                      type="button"
                      aria-label={`${item} 삭제`}
                      onClick={() =>
                        setConcepts(concepts.filter((candidate) => candidate !== item))
                      }
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="inline-add compact">
                <input
                  placeholder="콘셉트명"
                  value={concept}
                  onChange={(event) => setConcept(event.target.value)}
                />
                <button
                  type="button"
                  aria-label="콘셉트 추가"
                  onClick={() => {
                    const value = concept.trim();
                    if (!value || concepts.includes(value)) return;
                    setConcepts([...concepts, value]);
                    setConcept("");
                  }}
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>
            <div className="visibility-card">
              <Eye size={17} />
              <div>
                <strong>브랜드 표시 상태</strong>
                <p>숨기면 메인 화면에서 제외됩니다.</p>
              </div>
              <select
                value={visibility}
                onChange={(event) =>
                  setVisibility(event.target.value as BrandVisibility)
                }
              >
                <option value="visible">표시</option>
                <option value="hidden">숨김</option>
              </select>
            </div>
            <button type="button" className="danger-link" onClick={onDelete}>
              <Trash2 size={15} /> 브랜드 영구 삭제
            </button>
          </aside>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="primary-button">
            변경사항 저장
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ImportModal({
  brand,
  period,
  groupId,
  onClose,
  onAdd,
}: {
  brand: Brand;
  period: Period;
  groupId: string;
  onClose: () => void;
  onAdd: (items: Influencer[]) => void;
}) {
  const [text, setText] = useState("");
  const [partner, setPartner] = useState(brand.partners[0] ?? "");
  const parsed = useMemo(() => parsePaste(text), [text]);
  const group = period.groups.find((candidate) => candidate.id === groupId);

  return (
    <Modal
      title={`${group?.name ?? "그룹"} 인플루언서 추가`}
      description={`${periodLabel(period.id)} · 엑셀에서 행을 복사해 아래 영역에 바로 붙여넣으세요.`}
      onClose={onClose}
      wide
    >
      <div className="import-layout">
        <div>
          <div className="paste-guide">
            <span>1</span>
            <div>
              <strong>엑셀 내용을 붙여넣기</strong>
              <p>
                열 순서와 관계없이 계정명, 팔로워, 링크, 단가를 자동 구분합니다.
                금액이 두 개면 앞이 기본 단가, 뒤가 광고 포함 단가입니다.
              </p>
            </div>
          </div>
          <textarea
            className="paste-area"
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={"miki_beauty\t128,000\thttps://instagram.com/miki_beauty\t420000\t480000\nharu_cosme\t9.4k\thttps://instagram.com/haru_cosme\t72000\t88000"}
          />
          <label className="partner-pick">
            <span>기본 협력사</span>
            <select value={partner} onChange={(event) => setPartner(event.target.value)}>
              {brand.partners.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>
        <div className="parse-preview">
          <div className="paste-guide">
            <span>2</span>
            <div>
              <strong>자동 인식 결과</strong>
              <p>{parsed.length ? `${parsed.length}개의 행을 찾았습니다.` : "붙여넣으면 결과가 표시됩니다."}</p>
            </div>
          </div>
          <div className="preview-table">
            {parsed.slice(0, 5).map((item, index) => {
              const duplicate = period.influencers.some(
                (candidate) => crmKey(candidate) === crmKey(item),
              );
              return (
                <div key={`${item.handle}-${index}`}>
                  <PlatformAvatar platform={item.platform} />
                  <div>
                    <strong>{item.handle || "계정명 없음"}</strong>
                    <small>
                      {compactOr(item.followers)} followers · {yenOr(item.rateJpy)} /{" "}
                      {yenOr(item.adRateJpy)}
                    </small>
                  </div>
                  {duplicate ? (
                    <span className="duplicate-tag">
                      <AlertTriangle size={11} /> 중복
                    </span>
                  ) : (
                    <Check size={15} className="valid-icon" />
                  )}
                </div>
              );
            })}
            {parsed.length > 5 && <p className="more-preview">외 {parsed.length - 5}개 계정</p>}
            {!parsed.length && (
              <EmptyState
                icon={<Upload size={20} />}
                title="아직 붙여넣은 내용이 없습니다"
                description="탭, 쉼표 또는 공백으로 나뉜 데이터를 인식합니다."
              />
            )}
          </div>
        </div>
      </div>
      <div className="modal-actions">
        <button className="secondary-button" onClick={onClose}>취소</button>
        <button
          className="primary-button"
          disabled={!parsed.length}
          onClick={() =>
            onAdd(
              parsed.map((item, index) => ({
                ...item,
                id: `inf-${Date.now()}-${index}`,
                partner,
                status: "확정" as InfluencerStatus,
                concept: "",
                comment: "",
                brandComment: "",
                groupId,
              })),
            )
          }
        >
          {parsed.length}명 추가
        </button>
      </div>
    </Modal>
  );
}

type BulkApply = {
  createdBrands: Brand[];
  updates: { brandId: string; apply: (brand: Brand) => Brand }[];
};

function BulkImportModal({
  brands,
  onClose,
  onApply,
}: {
  brands: Brand[];
  onClose: () => void;
  onApply: (value: BulkApply) => void;
}) {
  const [text, setText] = useState("");
  const [partner, setPartner] = useState("RL");
  const { rows, skipped } = useMemo(() => parseBulkPaste(text), [text]);

  const brandKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, "");
  const summary = useMemo(() => {
    const byBrand = new Map<string, Set<string>>();
    for (const row of rows) {
      const key = brandKey(row.brandName);
      if (!byBrand.has(key)) byBrand.set(key, new Set());
      byBrand.get(key)!.add(row.periodId);
    }
    const newBrands = [...byBrand.keys()].filter(
      (key) => !brands.some((brand) => brandKey(brand.name) === key),
    );
    return {
      brandCount: byBrand.size,
      newBrandCount: newBrands.length,
      periodCount: new Set(rows.map((row) => `${brandKey(row.brandName)}|${row.periodId}`))
        .size,
    };
  }, [rows, brands]);

  function build(): BulkApply {
    const existing = new Map(brands.map((brand) => [brandKey(brand.name), brand]));
    const created = new Map<string, Brand>();
    // 브랜드 → 기간 → 추가할 인플루언서
    const grouped = new Map<string, Map<string, BulkRow[]>>();

    for (const row of rows) {
      const key = brandKey(row.brandName);
      if (!grouped.has(key)) grouped.set(key, new Map());
      const periods = grouped.get(key)!;
      if (!periods.has(row.periodId)) periods.set(row.periodId, []);
      periods.get(row.periodId)!.push(row);
    }

    const stamp = Date.now();
    let counter = 0;
    const toInfluencer = (row: BulkRow): Influencer => ({
      id: `inf-${stamp}-${counter++}`,
      handle: row.handle,
      displayName: row.displayName || row.handle,
      followers: row.followers,
      profileUrl: row.profileUrl,
      platform: row.platform,
      rateJpy: row.rateJpy,
      adRateJpy: row.adRateJpy,
      partner,
      status: row.status,
      concept: "",
      comment: "",
      brandComment: "",
      groupId: UNASSIGNED_GROUP_ID,
    });

    const mergeIntoPeriod = (period: Period, incoming: BulkRow[]): Period => {
      const groups = period.groups.some((group) => group.id === UNASSIGNED_GROUP_ID)
        ? period.groups
        : [
            ...period.groups,
            {
              id: UNASSIGNED_GROUP_ID,
              name: "미분류",
              target: 0,
              active: true,
              sectionId: DEFAULT_SECTION_ID,
            },
          ];
      const influencers = [...period.influencers];
      for (const row of incoming) {
        const next = toInfluencer(row);
        // 플랫폼까지 같아야 "같은 계정"이다 — 같은 사람이라도 IG/TT/YT 핸들이
        // 텍스트로 우연히 같으면 서로 다른 계정이므로 덮어써서는 안 된다.
        const key = crmKey(next) && `${crmKey(next)}|${next.platform}`;
        const index = influencers.findIndex(
          (candidate) => key && `${crmKey(candidate)}|${candidate.platform}` === key,
        );
        if (index >= 0) {
          // 이미 있는 계정이면 값을 갱신하고 그룹은 유지한다.
          influencers[index] = {
            ...influencers[index],
            displayName: next.displayName || influencers[index].displayName,
            followers: next.followers ?? influencers[index].followers,
            profileUrl: next.profileUrl || influencers[index].profileUrl,
            platform: next.profileUrl ? next.platform : influencers[index].platform,
            rateJpy: next.rateJpy ?? influencers[index].rateJpy,
            adRateJpy: next.adRateJpy ?? influencers[index].adRateJpy,
            partner: next.partner,
            status: next.status,
          };
        } else {
          influencers.push(next);
        }
      }
      return { ...period, groups, influencers };
    };

    for (const [key, periodMap] of grouped) {
      const target = existing.get(key);
      if (target) continue;
      const sampleName = rows.find((row) => brandKey(row.brandName) === key)!.brandName;
      let brand: Brand = {
        id: `${sampleName
          .toLowerCase()
          .replace(/[^a-z0-9가-힣]+/g, "-")
          .replace(/^-|-$/g, "")}-${stamp}`,
        name: sampleName,
        visibility: "visible",
        partners: [...new Set([partner, ...DEFAULT_PARTNERS])],
        concepts: [],
        periods: [],
        updatedAt: new Date().toISOString(),
      };
      for (const [periodId, incoming] of periodMap) {
        brand = {
          ...brand,
          periods: sortPeriods([
            ...brand.periods,
            mergeIntoPeriod(importedPeriod(periodId), incoming),
          ]),
        };
      }
      created.set(key, brand);
    }

    const updates: BulkApply["updates"] = [];
    for (const [key, periodMap] of grouped) {
      const target = existing.get(key);
      if (!target) continue;
      updates.push({
        brandId: target.id,
        apply: (brand) => {
          let periods = brand.periods;
          for (const [periodId, incoming] of periodMap) {
            const found = periods.find((item) => item.id === periodId);
            periods = found
              ? periods.map((item) =>
                  item.id === periodId ? mergeIntoPeriod(item, incoming) : item,
                )
              : [...periods, mergeIntoPeriod(importedPeriod(periodId), incoming)];
          }
          return {
            ...brand,
            partners: brand.partners.includes(partner)
              ? brand.partners
              : [...brand.partners, partner],
            periods: sortPeriods(periods),
          };
        },
      });
    }

    return { createdBrands: [...created.values()], updates };
  }

  const partnerOptions = [
    ...new Set([...DEFAULT_PARTNERS, ...brands.flatMap((brand) => brand.partners)]),
  ];

  return (
    <Modal
      title="인플루언서 일괄 등록"
      description="브랜드 · 기간 · 계정명 · 팔로워 · 링크 · 단가 · 광고 포함 단가 · 상태 순서로 붙여넣으세요."
      onClose={onClose}
      wide
    >
      <div className="import-layout">
        <div>
          <div className="paste-guide">
            <span>1</span>
            <div>
              <strong>엑셀에서 그대로 붙여넣기</strong>
              <p>
                없는 브랜드와 기간은 자동으로 만들어지고, 이미 있는 계정은 값이
                갱신됩니다. 단가가 없는 칸은 <code>-</code> 로 두면 됩니다. 상태
                칸을 비우면 미진행으로 들어갑니다.
              </p>
            </div>
          </div>
          <textarea
            className="paste-area tall"
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={
              "스킨앤랩\t26 Q3\tminamikato_0115\t204000\thttps://www.instagram.com/minamikato_0115/\t-\t514000\t확정\n" +
              "투슬래시포\t26 Q3\tunn_nel\t16000\thttps://www.instagram.com/unn_nel/\t70000\t80000\t확정"
            }
          />
          <label className="partner-pick">
            <span>협력사 (전체 적용)</span>
            <select value={partner} onChange={(event) => setPartner(event.target.value)}>
              {partnerOptions.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>
        <div className="parse-preview">
          <div className="paste-guide">
            <span>2</span>
            <div>
              <strong>자동 인식 결과</strong>
              <p>
                {rows.length
                  ? `${rows.length}개 행 · 브랜드 ${summary.brandCount}개(신규 ${summary.newBrandCount}) · 기간 ${summary.periodCount}개`
                  : "붙여넣으면 결과가 표시됩니다."}
                {!!skipped && ` · 건너뜀 ${skipped}행`}
              </p>
            </div>
          </div>
          <div className="preview-table">
            {rows.slice(0, 7).map((row, index) => (
              <div key={`${row.brandName}-${row.handle}-${index}`}>
                <PlatformAvatar platform={row.platform} />
                <div>
                  <strong>{row.handle || "계정명 없음"}</strong>
                  <small>
                    {row.brandName} · {periodLabel(row.periodId)} ·{" "}
                    {compactOr(row.followers)} · {yenOr(row.rateJpy)} /{" "}
                    {yenOr(row.adRateJpy)}
                  </small>
                </div>
                <em className={`status-tag status-${row.status}`}>{row.status}</em>
              </div>
            ))}
            {rows.length > 7 && (
              <p className="more-preview">외 {rows.length - 7}개 행</p>
            )}
            {!rows.length && (
              <EmptyState
                icon={<Upload size={20} />}
                title="아직 붙여넣은 내용이 없습니다"
                description="브랜드와 기간 칸이 채워진 행만 등록됩니다."
              />
            )}
          </div>
        </div>
      </div>
      <div className="modal-actions">
        <button className="secondary-button" onClick={onClose}>취소</button>
        <button
          className="primary-button"
          disabled={!rows.length}
          onClick={() => onApply(build())}
        >
          {rows.length}건 등록
        </button>
      </div>
    </Modal>
  );
}

function CreateBrandModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (brand: Brand) => void;
}) {
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [budget, setBudget] = useState(50_000_000);
  const [margin, setMargin] = useState(20);
  const [periodId, setPeriodId] = useState(CURRENT_PERIOD_ID);

  function submit(event: FormEvent) {
    event.preventDefault();
    const id = `${name
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/^-|-$/g, "")}-${Date.now()}`;
    onCreate({
      id,
      name: name.trim(),
      visibility: "visible",
      logoUrl: logoUrl.trim() || undefined,
      partners: DEFAULT_PARTNERS,
      concepts: [],
      periods: [newPeriod(periodId, budget, margin)],
      updatedAt: new Date().toISOString(),
    });
  }

  return (
    <Modal
      title="새 브랜드 캠페인"
      description="기본 정보를 입력한 뒤 그룹과 목표 인원을 설정할 수 있습니다."
      onClose={onClose}
    >
      <form className="simple-form" onSubmit={submit}>
        <label>
          <span>브랜드명</span>
          <input
            autoFocus
            required
            placeholder="예: YOU&I"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          <span>로고</span>
          <LogoPicker brandName={name} value={logoUrl} onChange={setLogoUrl} />
        </label>
        <label>
          <span>시작 기간</span>
          <select
            value={periodId}
            onChange={(event) => setPeriodId(event.target.value)}
          >
            {PERIOD_IDS.map((id) => (
              <option key={id} value={id}>
                {periodLabel(id)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>총 예산 (KRW)</span>
          <input
            required
            type="number"
            min="0"
            value={budget}
            onChange={(event) => setBudget(Number(event.target.value))}
          />
        </label>
        <label>
          <span>마진율 (%)</span>
          <input
            required
            type="number"
            min="0"
            max="99"
            value={margin}
            onChange={(event) => setMargin(Number(event.target.value))}
          />
          <small>운영 가능 예산: {won(budget * (1 - margin / 100))}</small>
        </label>
        <div className="modal-actions inset">
          <button type="button" className="secondary-button" onClick={onClose}>취소</button>
          <button type="submit" className="primary-button">캠페인 만들기</button>
        </div>
      </form>
    </Modal>
  );
}

function HiddenBrandsPage({
  brands,
  onRestore,
  onDelete,
}: {
  brands: Brand[];
  onRestore: (brandId: string) => void;
  onDelete: (brandId: string) => void;
}) {
  return (
    <div className="page-wrap">
      <header className="page-header">
        <div>
          <p className="eyebrow">HIDDEN BRANDS</p>
          <h1>숨긴 브랜드</h1>
          <p>메인 화면에서 숨긴 캠페인을 복원하거나 영구 삭제할 수 있습니다.</p>
        </div>
      </header>
      <div className="hidden-list">
        {brands.map((brand) => {
          const period = findPeriod(brand, latestPeriodId(brand));
          return (
            <div key={brand.id}>
              <BrandLogo brand={brand} />
              <div>
                <strong>{brand.name}</strong>
                <small>
                  {period
                    ? `${periodLabel(period.id)} · 운영 예산 ${won(getMetrics(period).usableBudget)}`
                    : "기간 없음"}
                </small>
              </div>
              <button className="secondary-button small" onClick={() => onRestore(brand.id)}>
                <Eye size={14} /> 복원
              </button>
              <button
                className="icon-button danger"
                aria-label={`${brand.name} 삭제`}
                onClick={() => onDelete(brand.id)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
        {!brands.length && (
          <EmptyState
            icon={<EyeOff size={20} />}
            title="숨긴 브랜드가 없습니다"
            description="브랜드 카드 메뉴에서 숨기기를 선택하면 이곳에서 관리할 수 있습니다."
          />
        )}
      </div>
    </div>
  );
}

function DeleteModal({
  brand,
  onClose,
  onDelete,
}: {
  brand: Brand;
  onClose: () => void;
  onDelete: () => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  return (
    <Modal title="브랜드 영구 삭제" onClose={onClose}>
      <div className="delete-content">
        <span className="danger-icon"><Trash2 size={21} /></span>
        <p>
          <strong>{brand.name}</strong>의 모든 기간({brand.periods.length}개)에 걸친
          인플루언서, 예산, 그룹 데이터가 삭제되며 복구할 수 없습니다.
        </p>
        <label>
          <span>계속하려면 <b>{brand.name}</b>을 입력하세요.</span>
          <input
            autoFocus
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={brand.name}
          />
        </label>
      </div>
      <div className="modal-actions">
        <button className="secondary-button" onClick={onClose}>취소</button>
        <button
          className="danger-button"
          disabled={confirmation !== brand.name}
          onClick={onDelete}
        >
          영구 삭제
        </button>
      </div>
    </Modal>
  );
}
