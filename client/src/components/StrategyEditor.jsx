import { Field, Input, Select } from './ui.jsx'

export default function StrategyEditor({ value, onChange }) {
  const set = (patch) => onChange({ ...value, ...patch })
  return (
    <div className="space-y-3">
      <Field label="전략">
        <Select value={value.type} onChange={(e) => set({ type: e.target.value })}>
          <option value="rsi">RSI 과매수/과매도</option>
          <option value="ma_cross">이동평균 교차 (골든/데드크로스)</option>
        </Select>
      </Field>

      {value.type === 'rsi' ? (
        <div className="grid grid-cols-3 gap-2">
          <Field label="기간">
            <Input type="number" value={value.period ?? 14} onChange={(e) => set({ period: Number(e.target.value) })} />
          </Field>
          <Field label="과매도≤(매수)">
            <Input type="number" value={value.oversold ?? 30} onChange={(e) => set({ oversold: Number(e.target.value) })} />
          </Field>
          <Field label="과매수≥(매도)">
            <Input type="number" value={value.overbought ?? 70} onChange={(e) => set({ overbought: Number(e.target.value) })} />
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Field label="단기 이동평균">
            <Input type="number" value={value.fast ?? 10} onChange={(e) => set({ fast: Number(e.target.value) })} />
          </Field>
          <Field label="장기 이동평균">
            <Input type="number" value={value.slow ?? 30} onChange={(e) => set({ slow: Number(e.target.value) })} />
          </Field>
        </div>
      )}
    </div>
  )
}
