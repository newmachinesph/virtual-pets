'use client'

import dynamic from 'next/dynamic'
import { useActionState, useState } from 'react'
import { breedLook } from '@/lib/breed-looks'
import type { Breed } from '@/lib/types'
import { createPet, type CreateState } from './actions'

// WebGL is browser-only, so the stage never server-renders.
const PetStage = dynamic(() => import('@/components/PetStage'), {
  ssr: false,
  loading: () => <div className="h-[300px]" />,
})

const COLORS = ['#c9863f', '#8c5a33', '#2f2b28', '#e0d5c3', '#a8a29c', '#d99a5b']
const PATTERNS = [
  { key: 'solid', label: 'Solid' },
  { key: 'patch', label: 'Patched' },
  { key: 'spots', label: 'Spotted' },
]
const TRAITS = ['playful', 'calm', 'curious', 'stubborn', 'clingy', 'independent']

export default function CreatePetForm({ breeds }: { breeds: Breed[] }) {
  const [state, formAction, pending] = useActionState<CreateState, FormData>(createPet, null)
  const [species, setSpecies] = useState<'dog' | 'cat'>('dog')
  const [color, setColor] = useState(COLORS[0])
  const [pattern, setPattern] = useState('solid')
  const [breed, setBreed] = useState('')

  const speciesBreeds = breeds.filter((b) => b.species === species)
  const selected = speciesBreeds.find((b) => b.name === breed) ?? speciesBreeds[0]

  // Picking a breed pre-selects its typical coat so the preview immediately
  // looks like that breed; the user can still override with the swatches.
  const chooseBreed = (next: 'dog' | 'cat', name: string) => {
    setBreed(name)
    if (name) setColor(breedLook(next, name).typicalColor)
  }

  const chooseSpecies = (next: 'dog' | 'cat') => {
    setSpecies(next)
    const first = breeds.find((b) => b.species === next)
    chooseBreed(next, first?.name ?? '')
  }

  return (
    <main className="px-4 py-6">
      <p className="font-display text-[0.6rem] tracking-[0.25em] text-accent uppercase">
        New companion
      </p>
      <h1 className="font-display mt-1 text-2xl">Who are you bringing home?</h1>

      <form action={formAction} className="mt-4 space-y-5">
        <div className="pixel-card p-2">
          <div className="aspect-[16/15]">
            <PetStage
              species={species}
              breed={selected?.name}
              color={color}
              pattern={pattern}
              mood="happy"
            />
          </div>
          <p className="mt-2 text-center text-ink-soft">{selected?.name ?? 'Pick a breed'}</p>
        </div>

        <fieldset>
          <legend className="font-display text-[0.65rem] uppercase tracking-wide">Species</legend>
          <div className="mt-2 flex gap-2">
            {(['dog', 'cat'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => chooseSpecies(s)}
                aria-pressed={species === s}
                className={`pixel-btn flex-1 capitalize ${species === s ? 'pixel-btn-primary' : ''}`}
              >
                {s}
              </button>
            ))}
          </div>
          <input type="hidden" name="species" value={species} />
        </fieldset>

        <label className="block">
          <span className="font-display text-[0.65rem] uppercase tracking-wide">Breed</span>
          <select
            name="breed"
            value={selected?.name ?? ''}
            onChange={(e) => chooseBreed(species, e.target.value)}
            className="pixel-input mt-1"
          >
            {speciesBreeds.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
          {selected && (
            <p className="mt-2 border-[3px] border-ink bg-paper-deep px-3 py-2 text-ink-soft">
              {selected.care_notes}
            </p>
          )}
        </label>

        <label className="block">
          <span className="font-display text-[0.65rem] uppercase tracking-wide">Name</span>
          <input name="name" required maxLength={24} placeholder="Charlie" className="pixel-input mt-1" />
        </label>

        <fieldset>
          <legend className="font-display text-[0.65rem] uppercase tracking-wide">Coat</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Coat colour ${c}`}
                aria-pressed={color === c}
                style={{ background: c }}
                className={`size-11 border-[3px] transition ${
                  color === c ? 'border-accent shadow-[3px_3px_0_var(--color-ink)]' : 'border-ink'
                }`}
              />
            ))}
          </div>
          <input type="hidden" name="color" value={color} />

          <div className="mt-3 flex gap-2">
            {PATTERNS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPattern(p.key)}
                aria-pressed={pattern === p.key}
                className={`pixel-btn flex-1 ${pattern === p.key ? 'pixel-btn-primary' : ''}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input type="hidden" name="pattern" value={pattern} />
        </fieldset>

        <fieldset>
          <legend className="font-display text-[0.65rem] uppercase tracking-wide">
            Personality (up to three)
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {TRAITS.map((t) => (
              <label
                key={t}
                className="pixel-chip cursor-pointer font-sans text-base capitalize has-checked:bg-accent has-checked:text-paper"
              >
                <input type="checkbox" name="personality" value={t} className="sr-only" />
                {t}
              </label>
            ))}
          </div>
        </fieldset>

        {state?.error && (
          <p role="alert" className="text-alarm">
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending} className="pixel-btn pixel-btn-primary w-full py-3">
          {pending ? 'Settling in…' : 'Bring them home'}
        </button>
      </form>
    </main>
  )
}
