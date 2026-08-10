"use client"

export function Pagination({ page, total, pageSize, onChange }: {
  page: number
  total: number
  pageSize: number
  onChange: (page: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="pagination">
      <span className="pagination-info">
        {total} result{total === 1 ? "" : "s"} · page {page}/{totalPages}
      </span>
      <div className="pagination-btns">
        <button onClick={() => onChange(page - 1)} disabled={page <= 1}>← Prev</button>
        <button onClick={() => onChange(page + 1)} disabled={page >= totalPages}>Next →</button>
      </div>
    </div>
  )
}