'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { BottomNav } from '@/components/BottomNav';
import { useToast } from '@/components/Toast';
import { MOCK_PENALTIES, CURRENT_PENALTY_SCORE, MAX_PENALTY, getAuthUnit, PenaltyEntry } from '@/lib/store';

type DisputeReason = '오인 신고' | '긴급 상황' | '기타';

export default function PenaltiesPage() {
  const router = useRouter();
  const [score, setScore] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<PenaltyEntry | null>(null);
  const [disputeReason, setDisputeReason] = useState<DisputeReason>('오인 신고');
  const [disputeDetail, setDisputeDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);
  const { show, toastEl } = useToast();

  useEffect(() => {
    if (!getAuthUnit()) { router.replace('/'); return; }
    setScore(Math.max(0, CURRENT_PENALTY_SCORE));
  }, [router]);

  const circumference = 2 * Math.PI * 70;
  const fillRatio = score / MAX_PENALTY;
  const dashOffset = circumference * (1 - Math.min(fillRatio, 1));

  const gaugeColor = score === 0 ? '#388e3c' : score < 5 ? '#f59e0b' : '#ba1a1a';
  const statusLabel = score === 0 ? '정상' : score < 5 ? '주의' : '위험';
  const statusBg = score === 0 ? 'bg-[var(--color-success-light)] text-[var(--color-success)]'
    : score < 5 ? 'bg-yellow-50 text-yellow-700'
    : 'bg-[var(--color-error-container)] text-[var(--color-error)]';

  const totalPenalty = MOCK_PENALTIES.filter((p) => p.points > 0).reduce((s, p) => s + p.points, 0);
  const nextRestriction = score >= 5 ? `벌점 ${MAX_PENALTY - score}점 더 받으면 이용 제한` : null;

  function openDispute(entry: PenaltyEntry) {
    setSelectedEntry(entry);
    setDisputeDetail('');
    setDisputeReason('오인 신고');
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setSelectedEntry(null);
  }

  function submitDispute() {
    if (disputeDetail.length < 10) {
      show('사유를 10자 이상 입력해주세요.', 'error');
      return;
    }
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      closeSheet();
      show('이의제기가 접수되었습니다. 영업일 1-2일 내 결과를 알려드립니다.', 'success');
    }, 800);
  }

  const reasons: DisputeReason[] = ['오인 신고', '긴급 상황', '기타'];

  return (
    <div className="min-h-dvh bg-[var(--color-background)]">
      {toastEl}
      <AppHeader showBack onBack={() => router.back()} />

      <main className="pt-16 pb-28 px-5 space-y-6">
        {/* Status card */}
        <section className="bg-[var(--color-surface-container-lowest)] rounded-3xl p-6 shadow-sm border border-[var(--color-outline-variant)]/20">
          <div className="flex flex-col items-center">
            {/* Gauge */}
            <div className="relative w-44 h-44 flex items-center justify-center mb-5">
              <svg className="w-full h-full" viewBox="0 0 160 160">
                <circle cx="80" cy="80" r="70" fill="none"
                  stroke="var(--color-surface-container)" strokeWidth="10" />
                <circle cx="80" cy="80" r="70" fill="none"
                  stroke={gaugeColor} strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={score === 0 ? 0 : dashOffset}
                  transform="rotate(-90 80 80)"
                  style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                />
              </svg>
              <div className="absolute flex flex-col items-center text-center">
                <span className="text-xs text-[var(--color-on-surface-variant)]">현재 벌점</span>
                <div className="flex items-baseline gap-0.5">
                  <span className="text-[38px] font-bold text-[var(--color-on-surface)] leading-none">{score}</span>
                  <span className="text-lg font-bold text-[var(--color-on-surface)]">점</span>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full mt-1.5 flex items-center gap-1 ${statusBg}`}>
                  <span className="material-symbols-outlined text-[13px]"
                    style={{ fontVariationSettings: "'FILL' 1" }}>
                    {score === 0 ? 'check_circle' : score < 5 ? 'warning' : 'error'}
                  </span>
                  {statusLabel}
                </span>
              </div>
            </div>

            <h2 className="text-[17px] font-semibold text-[var(--color-on-surface)] text-center mb-1">
              {score === 0 ? '나의 주차 매너가 훌륭합니다!' : `벌점 주의 — ${MAX_PENALTY}점 시 이용 제한`}
            </h2>
            {nextRestriction && (
              <p className="text-xs text-[var(--color-error)] text-center">{nextRestriction}</p>
            )}
          </div>

          {/* Stats */}
          <div className="mt-5 pt-5 border-t border-[var(--color-outline-variant)]/30 grid grid-cols-2">
            <div className="text-center border-r border-[var(--color-outline-variant)]/30">
              <p className="text-xs text-[var(--color-on-surface-variant)] mb-1">누적 부과 벌점</p>
              <p className="text-[18px] font-bold text-[var(--color-on-surface)]">{totalPenalty}점</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-[var(--color-on-surface-variant)] mb-1">이용 제한까지</p>
              <p className="text-[18px] font-bold text-[var(--color-primary)]">
                {Math.max(0, MAX_PENALTY - score)}점
              </p>
            </div>
          </div>

          {/* Restriction notice if applicable */}
          {score >= MAX_PENALTY && (
            <div className="mt-4 bg-[var(--color-error-container)] rounded-2xl p-4 flex items-center gap-3">
              <span className="material-symbols-outlined text-[var(--color-error)] text-[24px]"
                style={{ fontVariationSettings: "'FILL' 1" }}>block</span>
              <div>
                <p className="text-sm font-bold text-[var(--color-error)]">방문차량 등록이 제한됩니다</p>
                <p className="text-xs text-[var(--color-on-error-container)] mt-0.5">
                  관리사무소에 문의하여 이의제기하세요.
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Timeline */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-[18px] font-bold text-[var(--color-on-surface)]">벌점 변동 내역</h3>
              <span className="bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]
                text-[11px] px-2 py-0.5 rounded-full font-bold">
                {MOCK_PENALTIES.length}건
              </span>
            </div>
          </div>

          <div className="relative space-y-4">
            {/* Timeline connector */}
            <div className="absolute left-[19px] top-5 bottom-5 w-px bg-[var(--color-outline-variant)]/40" />

            {MOCK_PENALTIES.map((entry) => {
              const isPenalty = entry.points > 0;
              const iconColor = isPenalty
                ? 'text-[var(--color-error)]'
                : entry.type === 'reduction' ? 'text-[var(--color-success)]'
                : 'text-[var(--color-on-surface-variant)]';
              const iconBg = isPenalty
                ? 'bg-[var(--color-error-container)]'
                : entry.type === 'reduction' ? 'bg-[var(--color-success-light)]'
                : 'bg-[var(--color-surface-container-high)]';

              return (
                <div key={entry.id} className="relative z-10 flex gap-4 pl-1">
                  <div className="shrink-0 pt-2">
                    <div className={`w-9 h-9 rounded-full ${iconBg} ${iconColor}
                      flex items-center justify-center border-2 border-[var(--color-background)] shadow-sm`}>
                      <span className="material-symbols-outlined text-[18px]"
                        style={{ fontVariationSettings: isPenalty ? "'FILL' 1" : "'FILL' 0" }}>
                        {isPenalty ? 'warning' : entry.type === 'reduction' ? 'verified' : 'history'}
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 bg-[var(--color-surface-container-lowest)] rounded-2xl p-4 shadow-sm
                    border border-[var(--color-outline-variant)]/20">
                    <div className="flex justify-between items-start mb-1.5">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md
                            ${isPenalty ? 'bg-[var(--color-error-container)] text-[var(--color-error)]'
                              : 'bg-[var(--color-success-light)] text-[var(--color-success)]'}`}>
                            {isPenalty ? '벌점 부과' : '벌점 감면'}
                          </span>
                          <span className="text-[11px] text-[var(--color-on-surface-variant)]">{entry.date}</span>
                        </div>
                        <p className="font-semibold text-[var(--color-on-surface)]">{entry.reason}</p>
                      </div>
                      <span className={`font-bold text-[18px] ${isPenalty ? 'text-[var(--color-error)]' : 'text-[var(--color-success)]'}`}>
                        {entry.points > 0 ? '+' : ''}{entry.points}점
                      </span>
                    </div>

                    {entry.detail && (
                      <p className="text-xs text-[var(--color-on-surface-variant)] leading-relaxed mb-3 mt-2
                        bg-[var(--color-surface-container-low)] p-2.5 rounded-xl">
                        {entry.detail}
                      </p>
                    )}

                    {/* Dispute button or status */}
                    {isPenalty && entry.disputeStatus === 'none' && (
                      <button
                        onClick={() => openDispute(entry)}
                        className="w-full text-[var(--color-primary)] font-semibold text-sm
                          bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/15
                          rounded-xl py-2.5 active:bg-[var(--color-primary)]/10 transition-colors"
                      >
                        이의제기 신청하기
                      </button>
                    )}
                    {entry.disputeStatus === 'pending' && (
                      <div className="bg-[var(--color-surface-container-low)] rounded-xl p-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-[var(--color-primary)] text-[16px]">pending</span>
                        <span className="text-xs text-[var(--color-on-surface-variant)] font-medium">이의제기 검토중</span>
                      </div>
                    )}
                    {entry.disputeStatus === 'rejected' && (
                      <div className="bg-[var(--color-surface-container-low)] rounded-xl p-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-[var(--color-outline)] text-[16px]">info</span>
                        <span className="text-xs text-[var(--color-on-surface-variant)]">이의제기 처리완료 (기각됨)</span>
                      </div>
                    )}
                    {entry.disputeStatus === 'approved' && (
                      <div className="bg-[var(--color-success-light)] rounded-xl p-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-[var(--color-success)] text-[16px]"
                          style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                        <span className="text-xs text-[var(--color-success)] font-medium">이의제기 승인 — 벌점 취소됨</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {/* Dispute bottom sheet */}
      {sheetOpen && (
        <>
          <div
            ref={backdropRef}
            onClick={closeSheet}
            className="fixed inset-0 bg-black/60 z-[60] transition-opacity"
          />
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[600px] z-[70]
            bg-[var(--color-surface)] rounded-t-[32px] shadow-2xl sheet-enter max-h-[90dvh] overflow-y-auto">
            <div className="w-12 h-1.5 bg-[var(--color-outline-variant)]/40 rounded-full mx-auto mt-4 mb-5" />
            <div className="px-5 pb-10 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[var(--color-primary)]/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[var(--color-primary)] text-[26px]">gavel</span>
                </div>
                <div>
                  <h4 className="text-[20px] font-bold text-[var(--color-on-surface)]">이의제기 신청</h4>
                  <p className="text-xs text-[var(--color-on-surface-variant)]">
                    정당한 사유를 검토해 벌점을 조정해드립니다.
                  </p>
                </div>
              </div>

              {selectedEntry && (
                <div className="bg-[var(--color-surface-container-low)] rounded-xl p-3 flex items-center justify-between">
                  <span className="text-sm text-[var(--color-on-surface-variant)]">{selectedEntry.reason}</span>
                  <span className="font-bold text-[var(--color-error)]">+{selectedEntry.points}점</span>
                </div>
              )}

              {/* Reason select */}
              <div>
                <label className="text-sm font-bold text-[var(--color-on-surface)] mb-3 block">사유 선택</label>
                <div className="grid grid-cols-3 gap-2">
                  {reasons.map((r) => (
                    <button
                      key={r}
                      onClick={() => setDisputeReason(r)}
                      className={`py-3 px-2 rounded-2xl border-2 text-sm font-semibold transition-all
                        ${disputeReason === r
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 text-[var(--color-primary)]'
                          : 'border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)]'}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Detail */}
              <div>
                <label className="text-sm font-bold text-[var(--color-on-surface)] mb-2 block">
                  상세 내용 <span className="font-normal text-[var(--color-outline)]">(10자 이상)</span>
                </label>
                <textarea
                  rows={4}
                  placeholder="사실 관계를 확인할 수 있도록 자세히 적어주세요."
                  value={disputeDetail}
                  onChange={(e) => setDisputeDetail(e.target.value)}
                  className="w-full p-4 rounded-2xl border-2 border-[var(--color-outline-variant)]
                    bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] text-sm
                    placeholder:text-[var(--color-on-surface-variant)]/40 resize-none
                    focus:border-[var(--color-primary)] focus:outline-none transition-colors"
                />
                <p className={`text-xs mt-1 text-right ${disputeDetail.length >= 10 ? 'text-[var(--color-success)]' : 'text-[var(--color-outline)]'}`}>
                  {disputeDetail.length}자
                </p>
              </div>

              {/* Photo upload */}
              <div>
                <label className="text-sm font-bold text-[var(--color-on-surface)] mb-2 block">증빙 자료 업로드</label>
                <button className="group w-full py-6 border-2 border-dashed border-[var(--color-outline-variant)]/60
                  rounded-2xl flex flex-col items-center justify-center gap-2
                  hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-primary)]/3 transition-all">
                  <div className="w-12 h-12 rounded-full bg-[var(--color-surface-container-high)]
                    flex items-center justify-center group-hover:bg-[var(--color-primary)]/10">
                    <span className="material-symbols-outlined text-[var(--color-on-surface-variant)] text-[28px]
                      group-hover:text-[var(--color-primary)]">add_a_photo</span>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-[var(--color-on-surface)]">사진 첨부하기</p>
                    <p className="text-xs text-[var(--color-on-surface-variant)]/60">블랙박스, 현장 사진 등 (최대 3장)</p>
                  </div>
                </button>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={closeSheet}
                  className="flex-1 h-14 rounded-2xl bg-[var(--color-surface-container-high)]
                    text-[var(--color-on-surface-variant)] font-semibold active:scale-95 transition-transform"
                >
                  취소
                </button>
                <button
                  onClick={submitDispute}
                  disabled={submitting}
                  className="flex-[2] h-14 rounded-2xl bg-[var(--color-primary)] text-white font-semibold
                    shadow-lg shadow-[var(--color-primary)]/20 active:scale-95 transition-transform
                    disabled:opacity-70 flex items-center justify-center gap-2"
                >
                  {submitting
                    ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : '신청서 제출'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <BottomNav />
    </div>
  );
}
