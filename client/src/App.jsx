import { NavLink, Route, Routes } from 'react-router-dom'
import { Bot, Coins, PiggyBank, Wallet } from 'lucide-react'
import Portfolio from './pages/Portfolio.jsx'
import TaxGuide from './pages/TaxGuide.jsx'
import Trading from './pages/Trading.jsx'
import UpbitAssets from './pages/UpbitAssets.jsx'

function Tab({ to, icon, children }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition ${
          isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'
        }`
      }
    >
      {icon}
      {children}
    </NavLink>
  )
}

export default function App() {
  return (
    <div className="min-h-full text-slate-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0b0f17]/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-sm font-black">
              ₩
            </div>
            <span className="text-lg font-bold tracking-tight">내 자산</span>
          </div>
          <nav className="flex gap-1">
            <Tab to="/" icon={<PiggyBank size={16} />}>
              절세 가이드
            </Tab>
            <Tab to="/portfolio" icon={<Wallet size={16} />}>
              포트폴리오
            </Tab>
            <Tab to="/trading" icon={<Bot size={16} />}>
              자동매매
            </Tab>
            <Tab to="/upbit" icon={<Coins size={16} />}>
              업비트
            </Tab>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5 pb-24">
        <Routes>
          <Route path="/" element={<TaxGuide />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/trading" element={<Trading />} />
          <Route path="/upbit" element={<UpbitAssets />} />
        </Routes>
      </main>
    </div>
  )
}
