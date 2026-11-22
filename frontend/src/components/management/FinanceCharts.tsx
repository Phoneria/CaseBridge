import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CARD, money, type ManagementRecord } from "@/lib/management";

export function FinanceCharts({records}: {records: ManagementRecord[]}) {
  const currencies = new Map<string, Map<string, {month: string; income: number; expense: number}>>();
  for (const record of records) {
    if (record.kind !== "finance" || record.deleted_at) continue;
    const {entry_type, currency, entry_date, amount} = record.data;
    if (entry_type !== "payment" && entry_type !== "reimbursement" && entry_type !== "expense") continue;
    if (typeof currency !== "string" || typeof entry_date !== "string" || !Number.isFinite(Number(amount))) continue;
    const month = entry_date.slice(0, 7);
    const series = currencies.get(currency) ?? new Map();
    const row = series.get(month) ?? {month, income: 0, expense: 0};
    row[entry_type === "expense" ? "expense" : "income"] += Number(amount);
    series.set(month, row);
    currencies.set(currency, series);
  }
  return <>{Array.from(currencies, ([currency, series]) => {
    const rows = Array.from(series.values()).sort((a,b) => a.month.localeCompare(b.month));
    return <section key={currency} className={CARD}>
      <h2 className="font-semibold">Aylık tahsilat ve büro masrafı · {currency}</h2>
      <p className="my-2 text-sm text-navy-600">Toplam tahsilat {money(rows.reduce((v,r) => v+r.income, 0),currency)} · Masraf {money(rows.reduce((v,r) => v+r.expense, 0),currency)}</p>
      <ResponsiveContainer width="100%" height={240}><BarChart data={rows}>
        <CartesianGrid vertical={false} strokeDasharray="3 3"/><XAxis dataKey="month"/><YAxis/><Tooltip/><Legend/>
        <Bar dataKey="income" name="Tahsilat" fill="#007eac" radius={[4,4,0,0]}/>
        <Bar dataKey="expense" name="Büro masrafı" fill="#ae570f" radius={[4,4,0,0]}/>
      </BarChart></ResponsiveContainer>
    </section>;
  })}</>;
}
