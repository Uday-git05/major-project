export interface CountDefinition { label: string; value: number; definition: string }

export function CountSummary({ label, items }: { label: string; items: CountDefinition[] }) {
  return <dl className="semantic-counts" aria-label={label}>{items.map((item) => <div key={item.label} title={item.definition}><dt>{item.label}</dt><dd>{item.value}</dd><small>{item.definition}</small></div>)}</dl>;
}
