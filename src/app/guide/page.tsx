'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { BottomNav } from '@/components/BottomNav';

interface Section {
  icon: string;
  title: string;
  color: string;
  items: { q: string; a: string }[];
}

const SECTIONS: Section[] = [
  {
    icon: 'add_circle',
    title: '방문차량 등록',
    color: 'text-[var(--color-primary)]',
    items: [
      {
        q: '언제 등록할 수 있나요?',
        a: '오전 6시부터 오후 6시 사이에만 등록할 수 있습니다.',
      },
      {
        q: '하루에 몇 대까지 등록되나요?',
        a: '하루 최대 3대까지 등록 가능합니다.',
      },
      {
        q: '등록 시간(입차 허용 시간)을 설정할 수 있나요?',
        a: '등록 시 오전 6시~오후 6시 범위 내에서 30분 단위로 방문 시간을 설정할 수 있습니다.',
      },
      {
        q: '즐겨찾기는 어떻게 사용하나요?',
        a: '자주 오는 차량을 즐겨찾기에 저장해두면, 다음 등록 시 차량번호를 다시 입력하지 않고 바로 선택할 수 있습니다.',
      },
      {
        q: '방문이 끝나면 어떻게 하나요?',
        a: '홈 화면의 오늘 방문 목록에서 "출차" 버튼을 누르면 등록이 해제됩니다. 방문 예정인 차량을 취소하려면 방문 이력 탭에서 "취소"를 누르세요.',
      },
    ],
  },
  {
    icon: 'manage_search',
    title: '차량 조회 · 신고',
    color: 'text-[var(--color-secondary)]',
    items: [
      {
        q: '차량 조회는 언제 가능한가요?',
        a: '오후 6시부터 오전 6시(야간)에만 사용할 수 있습니다.',
      },
      {
        q: '신고하면 어떻게 되나요?',
        a: '해당 차량이 입주민이 등록한 방문차량인 경우, 등록한 세대에 벌점 1점이 부과됩니다. 등록되지 않은 차량은 관리자에게 알림이 전송됩니다.',
      },
      {
        q: '같은 차량을 연속으로 신고할 수 있나요?',
        a: '동일 차량은 60분 내 중복 신고가 불가합니다.',
      },
      {
        q: '신고한 내역은 어디서 확인하나요?',
        a: '내 정보 탭 → 신고 내역에서 확인할 수 있습니다. 관리자는 모든 신고를, 일반 입주민은 본인이 신고한 내역만 볼 수 있습니다.',
      },
    ],
  },
  {
    icon: 'warning',
    title: '벌점 · 이의제기',
    color: 'text-[var(--color-error)]',
    items: [
      {
        q: '벌점은 어떻게 쌓이나요?',
        a: '등록한 방문차량이 야간 주차로 신고되면 세대당 1점이 부과됩니다.',
      },
      {
        q: '벌점이 쌓이면 어떻게 되나요?',
        a: '10점 이상 누적되면 30일간 방문차량 등록이 제한됩니다.',
      },
      {
        q: '벌점이 부당하게 부과됐다면?',
        a: '내 정보 탭 → 벌점 / 이의제기에서 항목별로 이의를 제기할 수 있습니다. 관리자가 검토 후 처리합니다.',
      },
    ],
  },
  {
    icon: 'newspaper',
    title: '소식',
    color: 'text-[var(--color-tertiary)]',
    items: [
      {
        q: '소식 탭에는 무엇이 표시되나요?',
        a: '관리자가 작성한 공지사항과 매일 오후 6시에 자동 게시되는 당일 방문차량 통계를 확인할 수 있습니다.',
      },
      {
        q: '게시글 내용이 사라지는 경우가 있나요?',
        a: '게시글 본문은 작성 후 3일이 지나면 표시되지 않습니다. 단, 통계 수치(등록·취소·합계)는 영구적으로 보존됩니다.',
      },
    ],
  },
  {
    icon: 'schedule',
    title: '시간 제한 요약',
    color: 'text-[var(--color-on-surface-variant)]',
    items: [
      {
        q: '오전 6시 ~ 오후 6시 (주간)',
        a: '방문차량 등록 가능 / 신고·조회 불가',
      },
      {
        q: '오후 6시 ~ 오전 6시 (야간)',
        a: '신고·차량 조회 가능 / 방문차량 등록 불가',
      },
    ],
  },
];

function SectionCard({ section }: { section: Section }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-[var(--color-surface-container-lowest)] rounded-2xl border
      border-[var(--color-outline-variant)]/30 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-4 active:bg-[var(--color-surface-container-low)] transition-colors text-left">
        <div className="w-10 h-10 rounded-xl bg-[var(--color-surface-container-high)] flex items-center justify-center shrink-0">
          <span className={`material-symbols-outlined text-[22px] ${section.color}`}
            style={{ fontVariationSettings: "'FILL' 1" }}>
            {section.icon}
          </span>
        </div>
        <span className="flex-1 font-bold text-[var(--color-on-surface)]">{section.title}</span>
        <span className={`material-symbols-outlined text-[var(--color-outline-variant)] text-[20px] transition-transform ${open ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>

      {open && (
        <div className="border-t border-[var(--color-outline-variant)]/20 divide-y divide-[var(--color-outline-variant)]/10">
          {section.items.map((item, i) => (
            <div key={i} className="px-4 py-3.5 space-y-1.5">
              <p className="text-sm font-semibold text-[var(--color-on-surface)] flex items-start gap-2">
                <span className={`mt-0.5 text-[13px] shrink-0 ${section.color}`}>Q.</span>
                {item.q}
              </p>
              <p className="text-sm text-[var(--color-on-surface-variant)] leading-relaxed pl-5">
                {item.a}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GuidePage() {
  const router = useRouter();

  return (
    <div className="min-h-dvh bg-[var(--color-background)]">
      <AppHeader title="사용자 가이드" showBack onBack={() => router.back()} showNotification={false} />

      <main className="pt-20 pb-28 px-5 space-y-4">
        {/* 상단 안내 */}
        <div className="bg-[var(--color-primary)]/8 rounded-2xl p-4 flex items-start gap-3">
          <span className="material-symbols-outlined text-[var(--color-primary)] text-[22px] shrink-0 mt-0.5"
            style={{ fontVariationSettings: "'FILL' 1" }}>info</span>
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-[var(--color-primary)]">OO오피스텔 주차 앱 안내</p>
            <p className="text-xs text-[var(--color-on-surface-variant)] leading-relaxed">
              방문차량 등록부터 신고, 벌점 관리까지 주요 기능을 설명합니다.<br />
              항목을 눌러 내용을 확인하세요.
            </p>
          </div>
        </div>

        {SECTIONS.map((s) => (
          <SectionCard key={s.title} section={s} />
        ))}

        <p className="text-center text-xs text-[var(--color-outline)] py-2">
          OO오피스텔 주차 v1.0.0
        </p>
      </main>

      <BottomNav />
    </div>
  );
}
