import { api } from '@/lib/api'

// Expands a (possibly shortened) map URL by asking the backend to follow
// redirects, then returns the final URL so coordinates can be parsed from it.
export async function expandMapUrl({ data: url }: { data: string }): Promise<{ finalUrl: string | null }> {
  if (typeof url !== 'string') throw new Error('URL must be a string')
  return api.get<{ finalUrl: string | null }>('/api/util/expand-url', { url })
}
