"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Check, Link as LinkIcon, MessageCircle, Plus, Settings2, X } from "lucide-react";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { firebaseDb } from "@/lib/firebase/client";
import "../../(dashboard)/brands/brands.css";

type ReadonlyInfluencer = {
  id: string;
  handle: string;
  displayName: string;
  followers: number | null;
  profileUrl: string;
  platform: string;
  groupId: string;
  // 링크를 처음 열었을 때의 초기값 — edits/{id} 문서가 있으면 그 값이 우선한다.
  status: "확정" | "미진행";
  concept: string;
  brandComment: string;
};

type Group = {
  id: string;
  name: string;
  target: number;
};

type LinkSnapshot = {
  revoked: boolean;
  brandName: string;
  concepts: string[];
  conceptColors: Record<string, string>;
  groups: Group[];
  influencers: ReadonlyInfluencer[];
};

type Edit = {
  status: "확정" | "미진행";
  concept: string;
  brandComment: string;
  uploadDate: string;
  uploadUrl: string;
};

function detectPlatform(url: string) {
  const value = url.toLowerCase();
  if (value.includes("instagram.com")) return "IG";
  if (value.includes("tiktok.com")) return "TT";
  if (value.includes("x.com/") || value.includes("twitter.com")) return "X";
  if (value.includes("youtube.com") || value.includes("youtu.be")) return "YT";
  return "기타";
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

const PLATFORM_ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  IG: InstagramLogo,
  TT: TikTokLogo,
  X: XLogo,
  YT: YouTubeLogo,
  기타: LinkIcon,
};

function PlatformLink({ platform, url, size = 14 }: { platform: string; url: string; size?: number }) {
  const Icon = PLATFORM_ICON[platform] ?? LinkIcon;
  if (!url) {
    return (
      <span className="platform-link disabled" aria-hidden="true">
        <Icon size={size} />
      </span>
    );
  }
  return (
    <a className="platform-link" href={url} target="_blank" rel="noreferrer" aria-label={`${platform} 열기`}>
      <Icon size={size} />
    </a>
  );
}

const DEFAULT_EDIT: Edit = {
  status: "미진행",
  concept: "",
  brandComment: "",
  uploadDate: "",
  uploadUrl: "",
};

function resolveEdit(inf: ReadonlyInfluencer, stored: Edit | undefined): Edit {
  return {
    status: stored?.status ?? inf.status,
    concept: stored?.concept ?? inf.concept,
    brandComment: stored?.brandComment ?? inf.brandComment,
    uploadDate: stored?.uploadDate ?? DEFAULT_EDIT.uploadDate,
    uploadUrl: stored?.uploadUrl ?? DEFAULT_EDIT.uploadUrl,
  };
}

const compact = (value: number | null) =>
  value === null
    ? "-"
    : new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 }).format(
        value,
      );

const CONCEPT_PALETTE = [
  "#4263eb",
  "#19a974",
  "#f27935",
  "#dc4b4b",
  "#7c5cff",
  "#0ea5b5",
  "#c2410c",
  "#0f766e",
];

type ConceptRow = { name: string; color: string };

function ConceptSettingsModal({
  concepts,
  colors,
  onClose,
  onSave,
}: {
  concepts: string[];
  colors: Record<string, string>;
  onClose: () => void;
  onSave: (concepts: string[], colors: Record<string, string>) => void;
}) {
  const [rows, setRows] = useState<ConceptRow[]>(() =>
    concepts.length
      ? concepts.map((name, index) => ({
          name,
          color: colors[name] ?? CONCEPT_PALETTE[index % CONCEPT_PALETTE.length],
        }))
      : [{ name: "", color: CONCEPT_PALETTE[0] }],
  );

  function updateRow(index: number, patch: Partial<ConceptRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index));
  }

  function addRow() {
    setRows((current) => [
      ...current,
      { name: "", color: CONCEPT_PALETTE[current.length % CONCEPT_PALETTE.length] },
    ]);
  }

  function handleSave() {
    const seen = new Set<string>();
    const nextConcepts: string[] = [];
    const nextColors: Record<string, string> = {};
    for (const row of rows) {
      const name = row.name.trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      nextConcepts.push(name);
      nextColors[name] = row.color;
    }
    onSave(nextConcepts, nextColors);
  }

  return (
    <div className="share-modal-overlay" onClick={onClose}>
      <div className="share-modal" onClick={(event) => event.stopPropagation()}>
        <h2>콘셉트 설정</h2>
        <p>콘셉트를 한 번에 여러 개 추가·삭제하고, 색상도 지정할 수 있어요.</p>
        <div className="share-concept-rows">
          {rows.map((row, index) => (
            <div className="share-concept-row" key={index}>
              <input
                type="color"
                value={row.color}
                aria-label="콘셉트 색상"
                onChange={(event) => updateRow(index, { color: event.target.value })}
              />
              <input
                type="text"
                value={row.name}
                placeholder="콘셉트명"
                aria-label="콘셉트명"
                onChange={(event) => updateRow(index, { name: event.target.value })}
              />
              <button type="button" aria-label="콘셉트 삭제" onClick={() => removeRow(index)}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="share-concept-add-row" onClick={addRow}>
          <Plus size={13} /> 콘셉트 추가
        </button>
        <div className="share-modal-actions">
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button type="button" className="primary" onClick={handleSave}>
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SharePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [link, setLink] = useState<LinkSnapshot | null>(null);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [status, setStatus] = useState<"loading" | "ready" | "invalid">(() =>
    firebaseDb ? "loading" : "invalid",
  );
  const [showConceptModal, setShowConceptModal] = useState(false);
  const commentTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!firebaseDb) return;
    const unsubscribeLink = onSnapshot(
      doc(firebaseDb, "shareLinks", token),
      (snapshot) => {
        const value = snapshot.data() as LinkSnapshot | undefined;
        if (!snapshot.exists() || !value || value.revoked) {
          setStatus("invalid");
          return;
        }
        setLink(value);
        setStatus("ready");
      },
      () => setStatus("invalid"),
    );
    const unsubscribeEdits = onSnapshot(
      collection(firebaseDb, "shareLinks", token, "edits"),
      (snapshot) => {
        const next: Record<string, Edit> = {};
        snapshot.forEach((item) => {
          next[item.id] = item.data() as Edit;
        });
        setEdits(next);
      },
      () => {},
    );
    return () => {
      unsubscribeLink();
      unsubscribeEdits();
    };
  }, [token]);

  const groups = useMemo(() => link?.groups ?? [], [link]);
  const concepts = link?.concepts ?? [];
  const conceptColors = link?.conceptColors ?? {};

  const totals = useMemo(() => {
    let confirmed = 0;
    let target = 0;
    for (const group of groups) {
      target += group.target;
      confirmed += (link?.influencers ?? []).filter(
        (inf) => inf.groupId === group.id && resolveEdit(inf, edits[inf.id]).status === "확정",
      ).length;
    }
    return { confirmed, target };
  }, [groups, link, edits]);

  function writeEdit(influencerId: string, field: keyof Edit, value: string) {
    if (!firebaseDb) return;
    void setDoc(
      doc(firebaseDb, "shareLinks", token, "edits", influencerId),
      { [field]: value },
      { merge: true },
    );
  }

  function writeEditDebounced(influencerId: string, field: keyof Edit, value: string) {
    const timers = commentTimers.current;
    const existing = timers.get(influencerId);
    if (existing) clearTimeout(existing);
    timers.set(
      influencerId,
      setTimeout(() => writeEdit(influencerId, field, value), 600),
    );
  }

  function setLocalEdit(inf: ReadonlyInfluencer, field: keyof Edit, value: string) {
    setEdits((current) => ({
      ...current,
      [inf.id]: { ...resolveEdit(inf, current[inf.id]), [field]: value },
    }));
  }

  async function saveConcepts(nextConcepts: string[], nextColors: Record<string, string>) {
    if (!firebaseDb) return;
    await setDoc(doc(firebaseDb, "shareLinks", token, "settings", "concepts"), {
      concepts: nextConcepts,
      colors: nextColors,
    });
    setShowConceptModal(false);
  }

  if (status === "loading") {
    return (
      <div className="brand-mgmt">
        <div className="share-notice">불러오는 중…</div>
      </div>
    );
  }
  if (status === "invalid" || !link) {
    return (
      <div className="brand-mgmt">
        <div className="share-notice">
          <strong>링크를 찾을 수 없습니다</strong>
          <p>유효하지 않거나 만료된 링크입니다. 담당자에게 새 링크를 요청해주세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="brand-mgmt">
    <div className="share-page">
      <header className="share-header">
        <div>
          <h1>{link.brandName}</h1>
          <p>확정 여부와 콘셉트, 업로드 정보, 코멘트를 직접 남길 수 있어요.</p>
        </div>
        <div className="share-header-side">
          <button type="button" onClick={() => setShowConceptModal(true)}>
            <Settings2 size={14} /> 콘셉트 설정
          </button>
          <span className="share-total-pill">
            확정 {totals.confirmed}/{totals.target}명
          </span>
        </div>
      </header>
      <div className="share-groups">
        {groups.map((group) => {
          const rows = link.influencers.filter((inf) => inf.groupId === group.id);
          const confirmed = rows.filter(
            (inf) => resolveEdit(inf, edits[inf.id]).status === "확정",
          ).length;
          return (
            <section className="share-group" key={group.id}>
              <div className="share-group-head">
                <strong>{group.name}</strong>
                <span>
                  {confirmed}/{group.target}명
                </span>
              </div>
              <div className="share-row share-row-head">
                <span />
                <span>계정</span>
                <span>팔로워</span>
                <span>업로드 날짜</span>
                <span>업로드 링크</span>
                <span>콘셉트</span>
                <span />
              </div>
              {rows.map((inf) => {
                const edit = resolveEdit(inf, edits[inf.id]);
                const uploadPlatform = edit.uploadUrl ? detectPlatform(edit.uploadUrl) : null;
                const conceptColor = edit.concept ? conceptColors[edit.concept] : undefined;
                return (
                  <div className="share-row" key={inf.id}>
                    <label className="confirm-check" title={edit.status === "확정" ? "확정" : "미진행"}>
                      <input
                        type="checkbox"
                        checked={edit.status === "확정"}
                        aria-label={`${inf.handle} 확정 여부`}
                        onChange={(event) => {
                          const value = event.target.checked ? "확정" : "미진행";
                          setLocalEdit(inf, "status", value);
                          writeEdit(inf.id, "status", value);
                        }}
                      />
                      <span className="custom-check">
                        {edit.status === "확정" && <Check size={11} />}
                      </span>
                    </label>
                    <div className="share-account">
                      <span>@{inf.handle || inf.displayName}</span>
                      <PlatformLink platform={inf.platform} url={inf.profileUrl} />
                    </div>
                    <span className="share-cell">{compact(inf.followers)} followers</span>
                    <input
                      type="date"
                      className="share-date-input"
                      value={edit.uploadDate}
                      aria-label={`${inf.handle} 업로드 날짜`}
                      onChange={(event) => {
                        setLocalEdit(inf, "uploadDate", event.target.value);
                        writeEdit(inf.id, "uploadDate", event.target.value);
                      }}
                    />
                    <div className="share-upload-url">
                      <input
                        type="url"
                        placeholder="https://..."
                        value={edit.uploadUrl}
                        aria-label={`${inf.handle} 업로드 링크`}
                        onChange={(event) => {
                          setLocalEdit(inf, "uploadUrl", event.target.value);
                          writeEditDebounced(inf.id, "uploadUrl", event.target.value);
                        }}
                      />
                      {uploadPlatform && <PlatformLink platform={uploadPlatform} url={edit.uploadUrl} />}
                    </div>
                    <select
                      className="concept-select"
                      style={
                        conceptColor
                          ? { borderColor: conceptColor, backgroundColor: `${conceptColor}1a` }
                          : undefined
                      }
                      value={edit.concept}
                      aria-label={`${inf.handle} 콘셉트`}
                      onChange={(event) => {
                        setLocalEdit(inf, "concept", event.target.value);
                        writeEdit(inf.id, "concept", event.target.value);
                      }}
                    >
                      <option value="">미지정</option>
                      {concepts.map((concept) => (
                        <option key={concept} value={concept}>
                          {concept}
                        </option>
                      ))}
                    </select>
                    <div className="comment-popover brand">
                      <button
                        type="button"
                        className={edit.brandComment ? "comment-toggle has-comment" : "comment-toggle"}
                        aria-label={edit.brandComment ? "코멘트 보기/수정" : "코멘트 추가"}
                        title={edit.brandComment || "코멘트 추가"}
                      >
                        <MessageCircle size={14} />
                      </button>
                      <div className="comment-menu">
                        <textarea
                          value={edit.brandComment}
                          placeholder="코멘트를 입력하세요"
                          onChange={(event) => {
                            setLocalEdit(inf, "brandComment", event.target.value);
                            writeEditDebounced(inf.id, "brandComment", event.target.value);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
              {!rows.length && <p className="share-empty">아직 등록된 인플루언서가 없습니다.</p>}
            </section>
          );
        })}
      </div>
      {showConceptModal && (
        <ConceptSettingsModal
          concepts={concepts}
          colors={conceptColors}
          onClose={() => setShowConceptModal(false)}
          onSave={saveConcepts}
        />
      )}
    </div>
    </div>
  );
}
