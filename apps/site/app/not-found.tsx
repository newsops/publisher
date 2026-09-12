import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="container post-body">
      <h1>404</h1>
      <p>There&apos;s nothing here.</p>
      <Link href="/">Return home</Link>
    </main>
  )
}
