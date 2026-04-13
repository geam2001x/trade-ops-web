type KpiCardProps = {
  label: string;
  value: string;
  tone?: 'default' | 'accent' | 'success';
  detail?: string;
};

export function KpiCard({
  label,
  value,
  tone = 'default',
  detail,
}: KpiCardProps) {
  return (
    <article className={`kpi-card kpi-${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      {detail ? <span>{detail}</span> : null}
    </article>
  );
}
