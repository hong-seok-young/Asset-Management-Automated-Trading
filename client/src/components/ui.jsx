export function Card({ className = '', children, ...props }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.03] ${className}`} {...props}>
      {children}
    </div>
  )
}

export function Button({ variant = 'default', className = '', ...props }) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed'
  const variants = {
    default: 'bg-white/10 hover:bg-white/15 text-slate-100',
    primary: 'bg-indigo-500 hover:bg-indigo-400 text-white',
    danger: 'bg-rose-500/90 hover:bg-rose-500 text-white',
    success: 'bg-emerald-500 hover:bg-emerald-400 text-white',
    ghost: 'hover:bg-white/10 text-slate-300',
  }
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />
}

export function Pill({ tone = 'slate', className = '', children }) {
  const tones = {
    slate: 'bg-slate-500/20 text-slate-300',
    green: 'bg-emerald-500/20 text-emerald-300',
    red: 'bg-rose-500/20 text-rose-300',
    amber: 'bg-amber-500/20 text-amber-300',
    indigo: 'bg-indigo-500/20 text-indigo-300',
    blue: 'bg-sky-500/20 text-sky-300',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  )
}

export function Input({ className = '', ...props }) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-indigo-400 ${className}`}
    />
  )
}

export function Select({ className = '', children, ...props }) {
  return (
    <select
      {...props}
      className={`w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400 ${className}`}
    >
      {children}
    </select>
  )
}

export function Empty({ children }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-slate-500">
      {children}
    </div>
  )
}
