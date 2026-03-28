'use client'

import { useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { formatCZK, formatDate, incomeStatusConfig } from '@/lib/utils'
import type { Income, IncomeStatus } from '@/types'
import { GripVertical } from 'lucide-react'

const COLUMNS: { id: IncomeStatus; label: string; colColor: string; cardBorder: string; cardBg: string; headerText: string; dot: string }[] = [
  {
    id: 'cekame',
    label: 'Čekáme',
    colColor: 'bg-yellow-50 border-yellow-200',
    cardBorder: 'border-l-yellow-400',
    cardBg: 'bg-yellow-50/40',
    headerText: 'text-yellow-800',
    dot: 'bg-yellow-400',
  },
  {
    id: 'potvrzeno',
    label: 'Potvrzeno',
    colColor: 'bg-blue-50 border-blue-200',
    cardBorder: 'border-l-blue-400',
    cardBg: 'bg-blue-50/40',
    headerText: 'text-blue-800',
    dot: 'bg-blue-400',
  },
  {
    id: 'vystaveno',
    label: 'Vystaveno',
    colColor: 'bg-purple-50 border-purple-200',
    cardBorder: 'border-l-purple-400',
    cardBg: 'bg-purple-50/40',
    headerText: 'text-purple-800',
    dot: 'bg-purple-400',
  },
  {
    id: 'zaplaceno',
    label: 'Zaplaceno',
    colColor: 'bg-green-50 border-green-200',
    cardBorder: 'border-l-green-400',
    cardBg: 'bg-green-50/40',
    headerText: 'text-green-800',
    dot: 'bg-green-500',
  },
]

const COLUMN_MAP = Object.fromEntries(COLUMNS.map(c => [c.id, c])) as Record<IncomeStatus, typeof COLUMNS[number]>

function IncomeCard({ income, isDragging }: { income: Income; isDragging?: boolean }) {
  const col = COLUMN_MAP[income.status]
  return (
    <div
      className={`rounded-lg border border-l-4 p-3 text-sm shadow-sm transition-shadow
        ${col.cardBorder} ${col.cardBg}
        ${isDragging ? 'opacity-40 shadow-lg rotate-1' : 'hover:shadow-md'}
      `}
    >
      <p className="font-semibold truncate text-gray-900">{income.project_name}</p>
      <p className="text-muted-foreground text-xs mt-0.5">{income.client}</p>
      {income.amount != null && (
        <p className="mt-2 font-bold text-green-700 text-sm">{formatCZK(income.amount)}</p>
      )}
      {income.date && (
        <p className="text-xs text-muted-foreground mt-1">{formatDate(income.date)}</p>
      )}
    </div>
  )
}

function SortableCard({ income }: { income: Income }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: income.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-start gap-1 group"
    >
      <button
        {...attributes}
        {...listeners}
        className="mt-3 opacity-0 group-hover:opacity-60 text-muted-foreground cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="flex-1">
        <IncomeCard income={income} isDragging={isDragging} />
      </div>
    </div>
  )
}

function KanbanColumn({
  id, label, colColor, cardBorder, headerText, dot, items,
}: {
  id: IncomeStatus; label: string; colColor: string; cardBorder: string; headerText: string; dot: string; items: Income[]
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  const total = items.reduce((s, i) => s + (i.amount ?? 0), 0)

  return (
    <div className={`rounded-xl border-2 ${colColor} p-3 min-h-[420px] flex flex-col transition-colors ${isOver ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${dot}`} />
          <h3 className={`font-semibold text-sm ${headerText}`}>{label}</h3>
        </div>
        <span className="text-xs bg-white/80 rounded-full px-2 py-0.5 border font-medium text-gray-600">
          {items.length}
        </span>
      </div>
      {total > 0 && (
        <p className="text-xs text-muted-foreground mb-3 ml-4">{formatCZK(total)}</p>
      )}
      <div ref={setNodeRef} className="flex-1 space-y-2">
        <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <SortableCard key={item.id} income={item} />
          ))}
          {items.length === 0 && (
            <div className={`h-20 rounded-lg border-2 border-dashed ${cardBorder} opacity-30 flex items-center justify-center text-xs text-gray-400`}>
              Přetáhni sem
            </div>
          )}
        </SortableContext>
      </div>
    </div>
  )
}

interface IncomeKanbanProps {
  incomes: Income[]
  onStatusChange: (id: string, status: IncomeStatus) => void
}

export function IncomeKanban({ incomes, onStatusChange }: IncomeKanbanProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const activeIncome = activeId ? incomes.find(i => i.id === activeId) : null

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    if (!over) return

    const overId = over.id as string
    const income = incomes.find(i => i.id === active.id)
    if (!income) return

    // Přetaženo přímo na sloupec
    const columnMatch = COLUMNS.find(c => c.id === overId)
    if (columnMatch) {
      if (income.status !== columnMatch.id) {
        onStatusChange(income.id, columnMatch.id)
      }
      return
    }

    // Přetaženo na kartu v jiném sloupci
    const targetIncome = incomes.find(i => i.id === overId)
    if (targetIncome && income.status !== targetIncome.status) {
      onStatusChange(income.id, targetIncome.status)
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {COLUMNS.map(col => (
          <KanbanColumn
            key={col.id}
            id={col.id}
            label={col.label}
            colColor={col.colColor}
            cardBorder={col.cardBorder}
            headerText={col.headerText}
            dot={col.dot}
            items={incomes.filter(i => i.status === col.id)}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
        {activeIncome && <IncomeCard income={activeIncome} />}
      </DragOverlay>
    </DndContext>
  )
}
