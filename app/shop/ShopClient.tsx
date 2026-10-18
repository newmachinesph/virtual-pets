'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import type { Accessory, Pet } from '@/lib/types'
import { buyAccessory, equipAccessory } from './actions'

const PetStage = dynamic(() => import('@/components/PetStage'), {
  ssr: false,
  loading: () => <div className="h-[300px]" />,
})

type Props = {
  pet: Pet
  coins: number
  accessories: Accessory[]
  owned: string[]
  equipped: Record<string, string>
}

export default function ShopClient({ pet, coins: initialCoins, accessories, owned: initialOwned, equipped: initialEquipped }: Props) {
  const [coins, setCoins] = useState(initialCoins)
  const [owned, setOwned] = useState(initialOwned)
  const [equipped, setEquipped] = useState(initialEquipped)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const worn = accessories.filter((a) => equipped[a.slot] === a.id)

  const buy = (item: Accessory) => {
    startTransition(async () => {
      const res = await buyAccessory(item.id)
      if (!res.ok) return setError(res.error)
      setError(null)
      setOwned((prev) => [...prev, item.id])
      if (res.coins !== undefined) setCoins(res.coins)
    })
  }

  const toggle = (item: Accessory) => {
    const next = equipped[item.slot] === item.id ? null : item.id
    startTransition(async () => {
      const res = await equipAccessory(pet.id, item.slot, next)
      if (!res.ok) return setError(res.error)
      setError(null)
      setEquipped((prev) => {
        const copy = { ...prev }
        if (next) copy[item.slot] = next
        else delete copy[item.slot]
        return copy
      })
    })
  }

  return (
    <main className="px-4 py-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Link href="/" className="text-ink-soft underline underline-offset-4 hover:text-accent">
            Back to {pet.name}
          </Link>
          <h1 className="font-display mt-1 text-2xl">Shop</h1>
        </div>
        <span className="pixel-chip tabular-nums">{coins} coins</span>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-alarm">
          {error}
        </p>
      )}

      <div className="pixel-card mt-4 p-2">
        <div className="aspect-[16/15]">
          <PetStage
            species={pet.species}
            breed={pet.breed}
            color={pet.color}
            pattern={String(pet.appearance?.pattern ?? 'solid')}
            mood="happy"
            accessories={worn.map((a) => ({ slot: a.slot, asset: a.asset }))}
          />
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {accessories.map((item) => {
          const isOwned = owned.includes(item.id)
          const isWorn = equipped[item.slot] === item.id

          return (
            <li key={item.id} className="pixel-card flex items-center justify-between gap-3 p-3">
              <div>
                <p className="font-display text-[0.7rem] uppercase">{item.name}</p>
                <p className="text-ink-soft capitalize">
                  {item.slot}
                  {item.species ? ` · ${item.species} only` : ''}
                </p>
              </div>

              {isOwned ? (
                <button
                  type="button"
                  onClick={() => toggle(item)}
                  disabled={pending}
                  className={`pixel-btn shrink-0 ${isWorn ? 'pixel-btn-primary' : ''}`}
                >
                  {isWorn ? 'Worn' : 'Wear'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => buy(item)}
                  disabled={pending || coins < item.price_coins}
                  className="pixel-btn shrink-0"
                >
                  {item.price_coins} coins
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </main>
  )
}
