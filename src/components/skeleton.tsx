// Lightweight dark skeletons for route `loading.tsx` files (server components, no JS).
export function FeedSkeleton() {
  return (
    <main className="feed-page" aria-busy="true" aria-label="Loading feed">
      <div className="skeleton-feed">
        <div className="skeleton-page">
          <div className="sk sk-title" />
          <div className="sk sk-line" />
        </div>
      </div>
    </main>
  );
}

export function ListSkeleton({ rows = 4, grid = false }: { rows?: number; grid?: boolean }) {
  return (
    <main className="content-page skeleton-page" aria-busy="true" aria-label="Loading">
      <div className="sk sk-title" />
      <div className="sk sk-line" />
      {grid ? (
        <div className="sk-grid">
          {Array.from({ length: rows }, (_, i) => (
            <div className="sk sk-tile" key={i} />
          ))}
        </div>
      ) : (
        Array.from({ length: rows }, (_, i) => <div className="sk sk-row" key={i} />)
      )}
    </main>
  );
}
