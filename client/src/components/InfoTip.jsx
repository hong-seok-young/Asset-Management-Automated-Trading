import { useEffect, useRef, useState } from 'react'
import { HelpCircle, X } from 'lucide-react'

// 누르면 설명이 펼쳐지는 (?) 버튼. title/body 를 받아 작은 팝오버로 보여준다.
export default function InfoTip({ title, body, className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span ref={ref} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        title="설명 보기"
        aria-label={title || '설명 보기'}
        className="inline-grid h-4 w-4 place-items-center rounded-full text-slate-500 transition hover:text-indigo-300"
      >
        <HelpCircle size={14} />
      </button>
      {open && (
        <span
          role="dialog"
          className="absolute left-1/2 top-6 z-30 w-64 -translate-x-1/2 rounded-xl border border-white/15 bg-[#0b0f17] p-3 text-left text-[11px] leading-relaxed text-slate-300 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {title && (
            <span className="mb-1 flex items-start justify-between gap-2">
              <b className="text-xs text-slate-100">{title}</b>
              <button type="button" onClick={() => setOpen(false)} className="shrink-0 text-slate-500 hover:text-slate-300" aria-label="닫기">
                <X size={13} />
              </button>
            </span>
          )}
          <span className="block">{body}</span>
        </span>
      )}
    </span>
  )
}
