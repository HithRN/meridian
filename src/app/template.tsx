/** Re-created on every navigation, so each page settles in with a short fade. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
