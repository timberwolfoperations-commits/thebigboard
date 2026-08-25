'use client'

import { useState } from 'react'

interface PoolInviteCardProps {
  groupName: string
  inviteCode: string
}

export default function PoolInviteCard({ groupName, inviteCode }: PoolInviteCardProps) {
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const invitePath = `/join/${inviteCode}`

  async function copyText(value: string, type: 'link' | 'code') {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return

    await navigator.clipboard.writeText(value)

    if (type === 'link') {
      setCopiedLink(true)
      window.setTimeout(() => setCopiedLink(false), 1800)
      return
    }

    setCopiedCode(true)
    window.setTimeout(() => setCopiedCode(false), 1800)
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
            Invite Players
          </p>
          <p className="text-sm text-zinc-200 mt-1">
            Share <span className="font-semibold">{groupName}</span> with a direct link or invite code.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <div className="rounded-xl bg-zinc-950/60 border border-zinc-800 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
            Invite Code
          </p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <code className="text-sm font-bold tracking-[0.25em] text-amber-400">{inviteCode}</code>
            <button
              type="button"
              onClick={() => void copyText(inviteCode, 'code')}
              className="shrink-0 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold px-3 py-1.5 transition-colors"
            >
              {copiedCode ? 'Copied' : 'Copy Code'}
            </button>
          </div>
        </div>

        <div className="rounded-xl bg-zinc-950/60 border border-zinc-800 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
            Invite Link
          </p>
          <p className="mt-1 text-xs text-zinc-400 break-all">{invitePath}</p>
          <button
            type="button"
            onClick={() => void copyText(`${window.location.origin}${invitePath}`, 'link')}
            className="mt-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-semibold px-3 py-1.5 transition-colors"
          >
            {copiedLink ? 'Copied Link' : 'Copy Invite Link'}
          </button>
        </div>
      </div>
    </div>
  )
}
